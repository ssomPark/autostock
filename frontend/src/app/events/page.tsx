"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  fetchEvents,
  createEvent,
  deleteEvent,
  addEventStock,
  removeEventStock,
  searchStocks,
  type MarketEvent,
  type EventStock,
} from "@/lib/api";

// --- Constants ---

const CATEGORIES: Record<string, { label: string; color: string }> = {
  policy: { label: "정책/법안", color: "#3b82f6" },
  earnings: { label: "실적발표", color: "#f59e0b" },
  product: { label: "제품출시", color: "#8b5cf6" },
  conference: { label: "컨퍼런스", color: "#06b6d4" },
  ipo: { label: "IPO/상장", color: "#ec4899" },
  dividend: { label: "배당", color: "#10b981" },
  global: { label: "글로벌", color: "#ef4444" },
};

const IMPACT_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  high: { label: "높음", bg: "rgba(239,68,68,0.15)", text: "#f87171" },
  medium: { label: "보통", bg: "rgba(234,179,8,0.15)", text: "#facc15" },
  low: { label: "낮음", bg: "rgba(107,114,128,0.15)", text: "#9ca3af" },
};

const IMPACT_MAP: Record<string, { label: string; color: string }> = {
  positive: { label: "수혜", color: "#4ade80" },
  negative: { label: "피해", color: "#f87171" },
  neutral: { label: "중립", color: "#9ca3af" },
};

// --- Helpers ---

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysUntilText(days: number | null) {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}일 전`;
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `D-${days}`;
}

// --- Components ---

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORIES[category] || { label: category, color: "#6b7280" };
  return (
    <span
      className="text-[11px] px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
    >
      {cat.label}
    </span>
  );
}

function ImpactBadge({ level }: { level: string }) {
  const s = IMPACT_STYLES[level] || IMPACT_STYLES.medium;
  return (
    <span
      className="text-[11px] px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const text = daysUntilText(days);
  const isPast = days < 0;
  const isToday = days === 0;
  const isImminent = days >= 1 && days <= 3;

  let color = "var(--muted)";
  if (isToday) color = "#f59e0b";
  else if (isImminent) color = "#f87171";
  else if (!isPast) color = "#4ade80";

  return (
    <span className="text-xs font-bold" style={{ color }}>
      {text}
    </span>
  );
}

// --- Add Event Modal ---

function AddEventModal({ isOpen, onClose, onCreated }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [category, setCategory] = useState("global");
  const [impactLevel, setImpactLevel] = useState("medium");
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !eventDate) return;
    setSubmitting(true);
    try {
      await createEvent({
        title: title.trim(),
        description: description.trim(),
        event_date: new Date(eventDate).toISOString(),
        category,
        impact_level: impactLevel,
        source_url: sourceUrl.trim() || undefined,
      });
      onCreated();
      onClose();
      setTitle("");
      setDescription("");
      setEventDate("");
      setCategory("global");
      setImpactLevel("medium");
      setSourceUrl("");
    } catch {
      // error
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <h2 className="text-lg font-bold">새 이벤트 등록</h2>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">제목 *</label>
          <input
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 엔비디아 GTC 2026"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">날짜 *</label>
            <input
              type="date"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">카테고리</label>
            <select
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">영향도</label>
          <div className="flex gap-2">
            {(["high", "medium", "low"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setImpactLevel(level)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  impactLevel === level
                    ? "border-blue-500 bg-blue-600/20 text-blue-400"
                    : "border-[var(--card-border)] text-[var(--muted)]"
                }`}
              >
                {IMPACT_STYLES[level].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">설명</label>
          <textarea
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="이벤트 상세 설명..."
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">출처 URL</label>
          <input
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-white/5 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !eventDate || submitting}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Add Stock to Event Modal ---

function AddStockModal({ isOpen, onClose, eventId, onAdded }: {
  isOpen: boolean;
  onClose: () => void;
  eventId: number;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ ticker: string; name: string; market: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState<{ ticker: string; name: string; market: string } | null>(null);
  const [impact, setImpact] = useState("positive");
  const [relationType, setRelationType] = useState("direct");
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchStocks(query.trim());
      setSearchResults(res.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedStock) return;
    setSubmitting(true);
    try {
      await addEventStock(eventId, {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        market: selectedStock.market,
        relation_type: relationType,
        expected_impact: impact,
        reasoning,
      });
      onAdded();
      onClose();
      setQuery("");
      setSearchResults([]);
      setSelectedStock(null);
      setReasoning("");
    } catch {
      // error
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <h2 className="text-lg font-bold">수혜종목 추가</h2>

        {/* Search */}
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1">종목 검색</label>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="종목명 또는 티커..."
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {searching ? "..." : "검색"}
            </button>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && !selectedStock && (
          <div className="max-h-40 overflow-y-auto border border-[var(--card-border)] rounded-lg">
            {searchResults.map((s) => (
              <button
                key={s.ticker}
                onClick={() => setSelectedStock(s)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between border-b border-[var(--card-border)] last:border-0"
              >
                <span>
                  {s.name} <span className="text-[var(--muted)]">({s.ticker})</span>
                </span>
                <span className="text-xs text-[var(--muted)]">{s.market}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected Stock */}
        {selectedStock && (
          <div className="p-3 bg-blue-600/10 border border-blue-600/30 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedStock.name} ({selectedStock.ticker})
              <span className="text-xs text-[var(--muted)] ml-1">{selectedStock.market}</span>
            </span>
            <button
              onClick={() => setSelectedStock(null)}
              className="text-xs text-[var(--muted)] hover:text-red-400"
            >
              변경
            </button>
          </div>
        )}

        {/* Impact & Relation */}
        {selectedStock && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">영향</label>
                <select
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
                  value={impact}
                  onChange={(e) => setImpact(e.target.value)}
                >
                  <option value="positive">수혜 (긍정)</option>
                  <option value="negative">피해 (부정)</option>
                  <option value="neutral">중립</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">관계</label>
                <select
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value)}
                >
                  <option value="direct">직접 수혜</option>
                  <option value="indirect">간접 수혜</option>
                  <option value="sector">섹터 수혜</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">수혜 사유</label>
              <input
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder="예: HBM 공급 파트너"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-white/5 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedStock || submitting}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Event Detail Panel ---

function EventDetailPanel({ event, onClose, onRefresh, isAdmin }: {
  event: MarketEvent;
  onClose: () => void;
  onRefresh: () => void;
  isAdmin?: boolean;
}) {
  const [showAddStock, setShowAddStock] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingStockId, setRemovingStockId] = useState<number | null>(null);

  const handleDeleteEvent = async () => {
    if (!confirm("이벤트를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      onRefresh();
      onClose();
    } catch {
      // error
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveStock = async (stockId: number) => {
    setRemovingStockId(stockId);
    try {
      await removeEventStock(event.id, stockId);
      onRefresh();
    } catch {
      // error
    } finally {
      setRemovingStockId(null);
    }
  };

  return (
    <>
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">{event.title}</h2>
              <CategoryBadge category={event.category} />
              <ImpactBadge level={event.impact_level} />
              <DaysBadge days={event.days_until} />
            </div>
            <p className="text-sm text-[var(--muted)]">
              {new Date(event.event_date).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                onClick={handleDeleteEvent}
                disabled={deleting}
                className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-400 transition-colors"
                title="이벤트 삭제"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10 text-[var(--muted)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {event.description && (
          <p className="text-sm leading-relaxed">{event.description}</p>
        )}

        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline"
          >
            출처 링크
          </a>
        )}

        {/* Stocks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">관련 종목 ({event.stocks.length})</h3>
            {isAdmin && (
              <button
                onClick={() => setShowAddStock(true)}
                className="text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
              >
                + 종목 추가
              </button>
            )}
          </div>

          {event.stocks.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-3 text-center">
              아직 등록된 관련 종목이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {event.stocks.map((s) => {
                const impactInfo = IMPACT_MAP[s.expected_impact] || IMPACT_MAP.neutral;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--background)] border border-[var(--card-border)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: `${impactInfo.color}20`, color: impactInfo.color }}
                      >
                        {impactInfo.label}
                      </span>
                      <Link
                        href={`/analysis/${s.ticker}?market=${s.market}`}
                        className="text-sm font-medium hover:text-blue-400 transition-colors truncate"
                      >
                        {s.name}
                        <span className="text-[var(--muted)] ml-1">({s.ticker})</span>
                      </Link>
                      {s.relation_type !== "direct" && (
                        <span className="text-[10px] text-[var(--muted)]">
                          {s.relation_type === "indirect" ? "간접" : "섹터"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.reasoning && (
                        <span className="text-xs text-[var(--muted)] hidden sm:inline max-w-[200px] truncate" title={s.reasoning}>
                          {s.reasoning}
                        </span>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveStock(s.id)}
                          disabled={removingStockId === s.id}
                          className="p-1 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-400 transition-colors"
                          title="제거"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AddStockModal
        isOpen={showAddStock}
        onClose={() => setShowAddStock(false)}
        eventId={event.id}
        onAdded={onRefresh}
      />
    </>
  );
}

// --- Calendar Grid ---

function CalendarGrid({
  year,
  month,
  events,
  selectedEventId,
  onSelectEvent,
}: {
  year: number;
  month: number;
  events: MarketEvent[];
  selectedEventId: number | null;
  onSelectEvent: (event: MarketEvent) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = today.getDate();

  const eventsByDay = useMemo(() => {
    const map = new Map<number, MarketEvent[]>();
    events.forEach((e) => {
      const d = new Date(e.event_date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(e);
      }
    });
    return map;
  }, [events, year, month]);

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-[var(--card-border)]">
        {weekDays.map((w, i) => (
          <div
            key={w}
            className="py-2 text-center text-xs font-medium"
            style={{ color: i === 0 ? "#f87171" : i === 6 ? "#60a5fa" : "var(--muted)" }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const dayEvents = day ? eventsByDay.get(day) || [] : [];
          const isToday = isCurrentMonth && day === todayDate;
          const dayOfWeek = i % 7;

          return (
            <div
              key={i}
              className={`min-h-[90px] border-b border-r border-[var(--card-border)] p-1 ${
                day ? "hover:bg-white/[0.02]" : "bg-white/[0.01]"
              }`}
            >
              {day && (
                <>
                  <div className="flex items-center justify-between px-1">
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center"
                          : dayOfWeek === 0
                            ? "text-red-400"
                            : dayOfWeek === 6
                              ? "text-blue-400"
                              : "text-[var(--muted)]"
                      }`}
                    >
                      {day}
                    </span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const cat = CATEGORIES[ev.category] || { color: "#6b7280" };
                      const isSelected = ev.id === selectedEventId;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelectEvent(ev)}
                          className={`w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate transition-colors ${
                            isSelected ? "ring-1 ring-blue-500" : ""
                          }`}
                          style={{
                            backgroundColor: `${cat.color}${isSelected ? "40" : "15"}`,
                            color: cat.color,
                          }}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-[var(--muted)] px-1">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Upcoming Events List ---

function UpcomingEventsList({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: MarketEvent[];
  selectedEventId: number | null;
  onSelectEvent: (event: MarketEvent) => void;
}) {
  const upcoming = events
    .filter((e) => e.days_until !== null && e.days_until >= 0)
    .sort((a, b) => (a.days_until ?? 999) - (b.days_until ?? 999))
    .slice(0, 10);

  if (upcoming.length === 0) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 text-center text-[var(--muted)] text-sm">
        다가오는 이벤트가 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)]">
        <h3 className="text-sm font-semibold">다가오는 이벤트</h3>
      </div>
      <div className="divide-y divide-[var(--card-border)]">
        {upcoming.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${
              ev.id === selectedEventId ? "bg-blue-600/10 border-l-2 border-l-blue-500" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <CategoryBadge category={ev.category} />
                <ImpactBadge level={ev.impact_level} />
              </div>
              <DaysBadge days={ev.days_until} />
            </div>
            <p className="text-sm font-medium truncate">{ev.title}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-[var(--muted)]">{formatDate(ev.event_date)}</span>
              {ev.stocks.length > 0 && (
                <span className="text-xs text-[var(--muted)]">
                  관련종목 {ev.stocks.length}개
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function EventsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdmin = !!user?.is_admin;
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["events", year, month],
    queryFn: () => fetchEvents({ year, month, include_past: true }),
  });

  const events = data?.data ?? [];
  const filteredEvents = categoryFilter === "all"
    ? events
    : events.filter((e) => e.category === categoryFilter);

  const refreshEvents = () => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
    // Re-select the event if it's still there
    if (selectedEvent) {
      setTimeout(() => {
        const updated = queryClient.getQueryData<{ data: MarketEvent[] }>(["events", year, month]);
        const found = updated?.data?.find((e) => e.id === selectedEvent.id);
        if (found) setSelectedEvent(found);
      }, 500);
    }
  };

  const handleSelectEvent = (event: MarketEvent) => {
    setSelectedEvent(selectedEvent?.id === event.id ? null : event);
  };

  const goMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    setSelectedEvent(null);
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // Count events by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      counts[e.category] = (counts[e.category] || 0) + 1;
    });
    return counts;
  }, [events]);

  if (authLoading) {
    return <div className="min-h-[40vh]" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">이벤트 캘린더</h1>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <div className="text-6xl">&#x1F512;</div>
          <h2 className="text-xl font-bold">로그인이 필요합니다</h2>
          <p className="text-[var(--muted)] text-center">이벤트 캘린더를 이용하려면 로그인하세요.</p>
          <a
            href="/auth/login"
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            로그인하기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">이벤트 캘린더</h1>
          <span className="text-sm text-[var(--muted)]">
            이벤트 기반 사전 투자 전략
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 text-xs ${
                viewMode === "calendar"
                  ? "bg-blue-600 text-white"
                  : "text-[var(--muted)] hover:bg-white/5"
              }`}
            >
              캘린더
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "text-[var(--muted)] hover:bg-white/5"
              }`}
            >
              목록
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              + 이벤트 등록
            </button>
          )}
        </div>
      </div>

      {/* Month Navigation + Category Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goMonth(-1)}
            className="p-1.5 rounded hover:bg-white/10 text-[var(--muted)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-lg font-semibold min-w-[120px] text-center">
            {year}년 {month}월
          </span>
          <button
            onClick={() => goMonth(1)}
            className="p-1.5 rounded hover:bg-white/10 text-[var(--muted)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className="px-2 py-1 rounded text-xs text-[var(--muted)] border border-[var(--card-border)] hover:bg-white/5 ml-1"
          >
            오늘
          </button>
          <span className="text-xs text-[var(--muted)] ml-2">
            {events.length}개 이벤트
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              categoryFilter === "all"
                ? "bg-blue-600 text-white"
                : "text-[var(--muted)] border border-[var(--card-border)] hover:bg-white/5"
            }`}
          >
            전체
          </button>
          {Object.entries(CATEGORIES).map(([key, val]) => {
            const count = categoryCounts[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  categoryFilter === key
                    ? "text-white"
                    : "border border-[var(--card-border)] hover:bg-white/5"
                }`}
                style={
                  categoryFilter === key
                    ? { backgroundColor: val.color }
                    : { color: count > 0 ? val.color : "var(--muted)" }
                }
              >
                {val.label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="text-[var(--muted)] text-center py-12">로딩 중...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr,350px] gap-4">
          {/* Main view */}
          <div>
            {viewMode === "calendar" ? (
              <CalendarGrid
                year={year}
                month={month}
                events={filteredEvents}
                selectedEventId={selectedEvent?.id ?? null}
                onSelectEvent={handleSelectEvent}
              />
            ) : (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                      <th className="p-3">날짜</th>
                      <th className="p-3">이벤트</th>
                      <th className="p-3">카테고리</th>
                      <th className="p-3">영향도</th>
                      <th className="p-3">관련종목</th>
                      <th className="p-3">D-Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[var(--muted)]">
                          이번 달 이벤트가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((ev) => (
                        <tr
                          key={ev.id}
                          onClick={() => handleSelectEvent(ev)}
                          className={`border-b border-[var(--card-border)] cursor-pointer transition-colors ${
                            ev.id === selectedEvent?.id
                              ? "bg-blue-600/10"
                              : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <td className="p-3 text-sm">{formatDate(ev.event_date)}</td>
                          <td className="p-3 text-sm font-medium">{ev.title}</td>
                          <td className="p-3"><CategoryBadge category={ev.category} /></td>
                          <td className="p-3"><ImpactBadge level={ev.impact_level} /></td>
                          <td className="p-3 text-sm text-[var(--muted)]">{ev.stocks.length}개</td>
                          <td className="p-3"><DaysBadge days={ev.days_until} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {selectedEvent ? (
              <EventDetailPanel
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onRefresh={refreshEvents}
                isAdmin={isAdmin}
              />
            ) : (
              <UpcomingEventsList
                events={events}
                selectedEventId={null}
                onSelectEvent={handleSelectEvent}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddEventModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={refreshEvents}
      />
    </div>
  );
}

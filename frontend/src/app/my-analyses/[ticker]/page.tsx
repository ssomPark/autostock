"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchAnalysisHistory, updateAnalysisMemo } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/lib/format";

const gradeColor: Record<string, string> = {
  "A+": "#4ade80", A: "#4ade80",
  "B+": "#60a5fa", B: "#60a5fa",
  C: "#facc15", D: "#fb923c", F: "#f87171",
};

function formatValue(val: unknown): string {
  if (val == null) return "-";
  if (typeof val === "number") {
    if (Number.isInteger(val) && Math.abs(val) >= 1000) return val.toLocaleString();
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string") return val;
  return "-";
}

function SignalBreakdownBar({ label, contribution, weight }: { label: string; contribution: number; weight: number; strength: number }) {
  const pct = Math.abs(contribution) * 100;
  const color = contribution > 0 ? "#4ade80" : contribution < 0 ? "#f87171" : "#6b7280";
  const labelMap: Record<string, string> = {
    candlestick: "캔들스틱", chart_pattern: "차트 패턴",
    support_resistance: "지지/저항", volume: "거래량", trend: "추세", rsi: "RSI",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-[var(--muted)] shrink-0">{labelMap[label] || label}</span>
      <div className="flex-1 h-2 bg-[var(--surface-hover)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 4, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 text-right font-medium" style={{ color }}>
        {contribution > 0 ? "+" : ""}{(contribution * 100).toFixed(1)}%
      </span>
      <span className="w-10 text-right text-[var(--muted)]">({(weight * 100).toFixed(0)}%)</span>
    </div>
  );
}

function AnalysisDetail({ item }: { item: any }) {
  const sc = item.score_data || {};
  const fin = item.financials_data || {};
  const breakdown = sc.signal_breakdown || {};
  const indicators = sc.indicators || {};
  const target = sc.target || {};
  const stopLoss = sc.stop_loss || {};
  const entry = sc.entry_price || {};
  const summaryArr = Array.isArray(sc.summary) ? sc.summary : sc.summary ? [sc.summary] : [];

  const flatIndicators: [string, string][] = [];
  if (indicators.rsi != null) flatIndicators.push(["RSI", formatValue(indicators.rsi)]);
  if (indicators.atr != null) flatIndicators.push(["ATR", formatValue(indicators.atr)]);
  if (indicators.atr_pct != null) flatIndicators.push(["ATR %", formatValue(indicators.atr_pct) + "%"]);
  if (indicators.trend) {
    const t = indicators.trend;
    if (t.direction) flatIndicators.push(["추세", t.direction === "uptrend" ? "상승" : t.direction === "downtrend" ? "하락" : "횡보"]);
    if (t.strength != null) flatIndicators.push(["추세 강도", (t.strength * 100).toFixed(0) + "%"]);
    if (t.ema_20 != null) flatIndicators.push(["EMA 20", formatValue(t.ema_20)]);
    if (t.ema_50 != null) flatIndicators.push(["EMA 50", formatValue(t.ema_50)]);
    if (t.price_vs_ema20_pct != null) flatIndicators.push(["vs EMA20", (t.price_vs_ema20_pct > 0 ? "+" : "") + t.price_vs_ema20_pct.toFixed(2) + "%"]);
  }

  const finEntries: [string, string][] = [];
  const finLabelMap: Record<string, string> = {
    sector: "섹터", industry: "산업", pe_ratio: "PER", pb_ratio: "PBR",
    roe: "ROE", "52w_high": "52주 고가", "52w_low": "52주 저가",
    market_cap: "시가총액", dividend_yield: "배당수익률",
  };
  for (const [k, v] of Object.entries(fin)) {
    if (k === "name" || k === "ticker") continue;
    if (v == null || typeof v === "object") continue;
    const label = finLabelMap[k] || k;
    if (k === "roe" && typeof v === "number") {
      finEntries.push([label, (v * 100).toFixed(2) + "%"]);
    } else {
      finEntries.push([label, formatValue(v)]);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-4">
      {Object.keys(breakdown).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Signal Breakdown</h4>
          <div className="space-y-1.5">
            {Object.entries(breakdown).map(([key, val]: [string, any]) => (
              <SignalBreakdownBar key={key} label={key} contribution={val?.contribution ?? 0} weight={val?.weight ?? 0} strength={val?.strength ?? 0} />
            ))}
          </div>
        </div>
      )}

      {(target.consensus || stopLoss.final || entry.consensus) && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Price Targets</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {entry.consensus != null && (<div><span className="text-[var(--muted)]">진입가</span><p className="font-medium text-blue-400">{formatValue(entry.consensus)}</p></div>)}
            {target.consensus != null && (<div><span className="text-[var(--muted)]">목표가</span><p className="font-medium text-green-400">{formatValue(target.consensus)}</p></div>)}
            {stopLoss.final != null && (<div><span className="text-[var(--muted)]">손절가</span><p className="font-medium text-red-400">{formatValue(stopLoss.final)}</p></div>)}
            {target.methods && (<div><span className="text-[var(--muted)]">산출 방법</span><p className="font-medium">{target.methods.map((m: any) => m.method).join(", ")}</p></div>)}
          </div>
        </div>
      )}

      {flatIndicators.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Indicators</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            {flatIndicators.map(([label, val]) => (
              <div key={label} className="flex justify-between"><span className="text-[var(--muted)]">{label}</span><span className="font-medium">{val}</span></div>
            ))}
          </div>
        </div>
      )}

      {finEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Financials</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            {finEntries.map(([label, val]) => (
              <div key={label} className="flex justify-between"><span className="text-[var(--muted)]">{label}</span><span className="font-medium">{val}</span></div>
            ))}
          </div>
        </div>
      )}

      {summaryArr.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-1 uppercase tracking-wider">Summary</h4>
          <div className="space-y-1">
            {summaryArr.map((text: string, i: number) => (
              <p key={i} className="text-sm text-[var(--foreground)] leading-relaxed">{text}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Link href={`/search?q=${item.ticker}`} className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          재분석
        </Link>
      </div>
    </div>
  );
}

const GRADE_ORDER = ["F", "D", "C", "B", "B+", "A", "A+"];
function gradeToNum(g: string | null): number {
  if (!g) return 0;
  const idx = GRADE_ORDER.indexOf(g);
  return idx >= 0 ? idx : 0;
}

function ConfidenceTrendChart({ history }: { history: any[] }) {
  if (history.length < 2) return null;

  const items = [...history].reverse(); // oldest first
  const W = 600, H = 160, PX = 40, PY = 20;
  const plotW = W - PX * 2, plotH = H - PY * 2;

  const confidences = items.map((d) => d.confidence ?? 50);
  const maxC = Math.max(...confidences, 80);
  const minC = Math.min(...confidences, 20);
  const range = maxC - minC || 1;

  const pts = items.map((d, i) => ({
    x: PX + (items.length === 1 ? plotW / 2 : (i / (items.length - 1)) * plotW),
    y: PY + plotH - ((d.confidence ?? 50) - minC) / range * plotH,
    signal: d.signal,
    grade: d.grade,
    confidence: d.confidence,
    date: d.analyzed_at ? new Date(d.analyzed_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "",
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = pathD + ` L ${pts[pts.length - 1].x} ${PY + plotH} L ${pts[0].x} ${PY + plotH} Z`;

  // Y axis labels
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = minC + (range * i) / ySteps;
    return { val: Math.round(val), y: PY + plotH - (i / ySteps) * plotH };
  });

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        신뢰도 추이
      </h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {yLabels.map((yl) => (
          <g key={yl.val}>
            <line x1={PX} y1={yl.y} x2={W - PX} y2={yl.y} stroke="var(--card-border)" strokeWidth="0.5" strokeDasharray="4 4" />
            <text x={PX - 6} y={yl.y + 4} textAnchor="end" fontSize="9" fill="var(--muted)">{yl.val}%</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#confidenceGradient)" />
        <defs>
          <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Points */}
        {pts.map((p, i) => {
          const dotColor = p.signal === "BUY" ? "#4ade80" : p.signal === "SELL" ? "#f87171" : "#facc15";
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill={dotColor} stroke="var(--card)" strokeWidth="2" />
              {/* Grade label */}
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fontWeight="600" fill={gradeColor[p.grade] || "#9ca3af"}>
                {p.grade}
              </text>
              {/* Date label - show for first, last, and sampled points */}
              {(i === 0 || i === pts.length - 1 || pts.length <= 6 || i % Math.ceil(pts.length / 5) === 0) && (
                <text x={p.x} y={H - 2} textAnchor="middle" fontSize="8" fill="var(--muted)">{p.date}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-400" />매수</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />관망</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />매도</span>
      </div>
    </div>
  );
}

function getChangeTag(item: any, prevItem: any | null, index: number, total: number): { label: string; color: string } | null {
  if (index === total - 1) return { label: "첫 분석", color: "#60a5fa" };
  if (!prevItem) return null;
  if (item.signal !== prevItem.signal) return { label: "신호 변경", color: "#f59e0b" };
  if (item.grade !== prevItem.grade) return { label: "등급 변경", color: "#a78bfa" };
  return null;
}

export default function AnalysisHistoryPage() {
  const params = useParams();
  const ticker = params.ticker as string;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState("");

  const { data: history, isLoading } = useQuery({
    queryKey: ["saved-analyses-history", ticker],
    queryFn: () => fetchAnalysisHistory(ticker),
    enabled: isAuthenticated && !!ticker,
  });

  const memoMutation = useMutation({
    mutationFn: ({ id, memo }: { id: number; memo: string | null }) => updateAnalysisMemo(id, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-analyses-history", ticker] });
      setEditingMemoId(null);
    },
  });

  const saveMemo = () => {
    if (editingMemoId != null) {
      memoMutation.mutate({ id: editingMemoId, memo: memoText || null });
    }
  };

  if (authLoading) return <div className="text-center py-20 text-[var(--muted)]">로딩 중...</div>;
  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-[var(--muted)]">
        <p className="text-lg mb-2">로그인이 필요합니다</p>
        <Link href="/auth/login" className="text-blue-400 hover:underline">로그인하기</Link>
      </div>
    );
  }

  const latest = history?.[0];
  const signalChanges = history
    ? history.filter((item: any, i: number) => i > 0 && item.signal !== history[i - 1]?.signal).length
    : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/my-analyses" className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {latest?.name || ticker} <span className="text-[var(--muted)] text-base font-normal">({ticker})</span>
          </h1>
          <p className="text-sm text-[var(--muted)]">분석 히스토리</p>
        </div>
      </div>

      {/* 요약 카드 */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">최신 신호</p>
            <p className="text-xl font-bold" style={{
              color: latest.signal === "BUY" ? "#4ade80" : latest.signal === "SELL" ? "#f87171" : "#facc15",
            }}>
              {latest.signal === "BUY" ? "매수" : latest.signal === "SELL" ? "매도" : "관망"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-0.5">등급 {latest.grade || "-"}</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">최근 분석가</p>
            <p className="text-xl font-bold">{formatPrice(latest.current_price, latest.market)}</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">분석 횟수</p>
            <p className="text-xl font-bold">{history?.length || 0}회</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">신호 변경</p>
            <p className="text-xl font-bold">{signalChanges}회</p>
          </div>
        </div>
      )}

      {/* 신뢰도 트렌드 차트 */}
      {!isLoading && history && history.length >= 2 && (
        <ConfidenceTrendChart history={history} />
      )}

      {/* 로딩 */}
      {isLoading && <div className="text-center py-10 text-[var(--muted)]">로딩 중...</div>}

      {/* 빈 상태 */}
      {!isLoading && (!history || history.length === 0) && (
        <div className="text-center py-20 text-[var(--muted)]">
          <p>{ticker}에 대한 분석 기록이 없습니다</p>
        </div>
      )}

      {/* 타임라인 */}
      {!isLoading && history && history.length > 0 && (
        <div className="relative">
          {/* 세로선 */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--card-border)]" />

          <div className="space-y-0">
            {history.map((item: any, index: number) => {
              const actionColor = item.signal === "BUY" ? "#4ade80" : item.signal === "SELL" ? "#f87171" : "#facc15";
              const actionLabel = item.signal === "BUY" ? "매수" : item.signal === "SELL" ? "매도" : "관망";
              const date = item.analyzed_at
                ? new Date(item.analyzed_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                : "";
              const isExpanded = expandedId === item.id;
              const prevItem = index < history.length - 1 ? history[index + 1] : null;
              const changeTag = getChangeTag(item, prevItem, index, history.length);

              return (
                <div key={item.id} className="relative pl-10 pb-6">
                  {/* 타임라인 점 */}
                  <div
                    className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-[var(--background)]"
                    style={{ backgroundColor: actionColor }}
                  />

                  <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="flex items-center gap-1.5 hover:opacity-80"
                        >
                          <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`text-[var(--muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <span className="text-sm text-[var(--muted)]">{date}</span>
                        </button>
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                          backgroundColor: item.signal === "BUY" ? "rgba(34,197,94,0.2)" : item.signal === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
                          color: actionColor,
                        }}>
                          {actionLabel}
                        </span>
                        <span className="text-xs font-bold" style={{ color: gradeColor[item.grade] || "#9ca3af" }}>
                          {item.grade || "-"}
                        </span>
                        <span className="text-xs text-[var(--muted)]">({item.confidence?.toFixed(0) ?? "-"}%)</span>
                        {changeTag && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: `${changeTag.color}20`, color: changeTag.color }}
                          >
                            {changeTag.label}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium">{formatPrice(item.current_price, item.market)}</span>
                    </div>

                    {/* 메모 */}
                    <div className="mt-1">
                      {editingMemoId === item.id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={memoText}
                            onChange={(e) => setMemoText(e.target.value)}
                            placeholder="메모 입력..."
                            className="flex-1 px-2 py-1 text-xs rounded bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none focus:border-blue-500"
                            onKeyDown={(e) => { if (e.key === "Enter") saveMemo(); if (e.key === "Escape") setEditingMemoId(null); }}
                            autoFocus
                          />
                          <button onClick={saveMemo} className="text-xs text-blue-400 hover:text-blue-300">저장</button>
                          <button onClick={() => setEditingMemoId(null)} className="text-xs text-[var(--muted)]">취소</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingMemoId(item.id); setMemoText(item.memo || ""); }}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          {item.memo || "메모 추가"}
                        </button>
                      )}
                    </div>

                    {/* 확장 상세 */}
                    {isExpanded && <AnalysisDetail item={item} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

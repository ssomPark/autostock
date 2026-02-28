"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  fetchSavedAnalyses,
  deleteSavedAnalysisAPI,
  bulkDeleteSavedAnalyses,
  fetchSavedAnalysesStats,
  fetchAnalysisPerformance,
  updateAnalysisMemo,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/lib/format";

/* ─── 상수 ──────────────────────────────── */

const gradeColor: Record<string, string> = {
  "A+": "#4ade80", A: "#4ade80",
  "B+": "#60a5fa", B: "#60a5fa",
  C: "#facc15", D: "#fb923c", F: "#f87171",
};

const SIGNAL_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "BUY", label: "매수" },
  { value: "SELL", label: "매도" },
  { value: "HOLD", label: "관망" },
];

const MARKET_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "KOSPI", label: "KOSPI" },
  { value: "KOSDAQ", label: "KOSDAQ" },
  { value: "NYSE", label: "NYSE" },
  { value: "NASDAQ", label: "NASDAQ" },
];

const GRADE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "A+", label: "A+" },
  { value: "A", label: "A" },
  { value: "B+", label: "B+" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "F", label: "F" },
];

const SORT_OPTIONS = [
  { value: "analyzed_at", label: "분석일" },
  { value: "confidence", label: "신뢰도" },
  { value: "total_score", label: "종합점수" },
  { value: "name", label: "이름" },
];

/* ─── 서브 컴포넌트: Signal Breakdown ───── */

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
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 4, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 text-right font-medium" style={{ color }}>
        {contribution > 0 ? "+" : ""}{(contribution * 100).toFixed(1)}%
      </span>
      <span className="w-10 text-right text-[var(--muted)]">({(weight * 100).toFixed(0)}%)</span>
    </div>
  );
}

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

/* ─── 서브 컴포넌트: 분석 상세 ─────────── */

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

/* ─── 서브 컴포넌트: 통계 카드 ─────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-xs text-[var(--muted)] mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color || "var(--foreground)" }}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── 서브 컴포넌트: 삭제 확인 모달 ────── */

function DeleteModal({
  count, onConfirm, onCancel,
}: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2">분석 기록 삭제</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          {count}건의 분석 기록을 삭제하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--card-border)] hover:bg-white/5">
            취소
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white">
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 필터 버튼 그룹 ──────────────────── */

function FilterGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-[var(--muted)] mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded text-xs transition-colors ${
            value === o.value
              ? "bg-blue-600 text-white"
              : "bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)] hover:border-blue-500/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── 메인 페이지 ────────────────────── */

export default function MyAnalysesPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("analyzed_at");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // 다중 선택
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // 삭제 모달
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"single" | "bulk">("bulk");
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);

  // 메모
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [memoText, setMemoText] = useState("");

  // 성과 추적 토글
  const [showPerformance, setShowPerformance] = useState(false);

  // 확장
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 데이터 쿼리
  const { data: analyses, isLoading } = useQuery({
    queryKey: ["saved-analyses"],
    queryFn: () => fetchSavedAnalyses(),
    enabled: isAuthenticated,
  });

  const { data: stats } = useQuery({
    queryKey: ["saved-analyses-stats"],
    queryFn: fetchSavedAnalysesStats,
    enabled: isAuthenticated,
  });

  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["saved-analyses-performance"],
    queryFn: fetchAnalysisPerformance,
    enabled: isAuthenticated && showPerformance,
    staleTime: 5 * 60 * 1000,
  });

  // performance 맵 (ticker → return/hit)
  const perfMap = useMemo(() => {
    if (!perfData?.items) return new Map();
    const m = new Map<number, { live_price: number; return_pct: number | null; hit: boolean | null }>();
    for (const p of perfData.items) {
      m.set(p.id, { live_price: p.live_price, return_pct: p.return_pct, hit: p.hit });
    }
    return m;
  }, [perfData]);

  // 클라이언트 사이드 필터/정렬
  const filteredAnalyses = useMemo(() => {
    if (!analyses) return [];
    let items = [...analyses];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((a: any) =>
        a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      );
    }
    if (signalFilter !== "all") items = items.filter((a: any) => a.signal === signalFilter);
    if (marketFilter !== "all") items = items.filter((a: any) => a.market === marketFilter);
    if (gradeFilter !== "all") items = items.filter((a: any) => a.grade === gradeFilter);

    items.sort((a: any, b: any) => {
      let va = a[sortBy], vb = b[sortBy];
      if (sortBy === "analyzed_at" || sortBy === "created_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [analyses, searchQuery, signalFilter, marketFilter, gradeFilter, sortBy, sortOrder]);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSavedAnalysisAPI(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["saved-analyses-stats"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => bulkDeleteSavedAnalyses(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["saved-analyses-stats"] });
      setSelectedIds(new Set());
      setSelectMode(false);
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ id, memo }: { id: number; memo: string | null }) => updateAnalysisMemo(id, memo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-analyses"] });
      setEditingMemoId(null);
    },
  });

  // 핸들러
  const handleSingleDelete = (id: number) => {
    setSingleDeleteId(id);
    setDeleteTarget("single");
    setShowDeleteModal(true);
  };

  const handleBulkDelete = () => {
    setDeleteTarget("bulk");
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (deleteTarget === "single" && singleDeleteId) {
      deleteMutation.mutate(singleDeleteId);
    } else {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
    setShowDeleteModal(false);
    setSingleDeleteId(null);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAnalyses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAnalyses.map((a: any) => a.id)));
    }
  };

  const startMemoEdit = (id: number, currentMemo: string | null) => {
    setEditingMemoId(id);
    setMemoText(currentMemo || "");
  };

  const saveMemo = () => {
    if (editingMemoId != null) {
      memoMutation.mutate({ id: editingMemoId, memo: memoText || null });
    }
  };

  // Auth guards
  if (authLoading) return <div className="text-center py-20 text-[var(--muted)]">로딩 중...</div>;
  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-[var(--muted)]">
        <p className="text-lg mb-2">로그인이 필요합니다</p>
        <Link href="/auth/login" className="text-blue-400 hover:underline">로그인하기</Link>
      </div>
    );
  }

  const buyCount = stats?.signal_counts?.BUY ?? 0;
  const sellCount = stats?.signal_counts?.SELL ?? 0;
  const holdCount = stats?.signal_counts?.HOLD ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ─── 헤더 ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">내 분석 기록</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPerformance(!showPerformance)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showPerformance
                ? "bg-blue-600 text-white"
                : "bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)] hover:border-blue-500/50"
            }`}
          >
            {perfLoading ? "로딩..." : showPerformance ? "성과 추적 ON" : "성과 추적"}
          </button>
          <button
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectMode
                ? "bg-orange-600 text-white"
                : "bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)] hover:border-orange-500/50"
            }`}
          >
            {selectMode ? "선택 해제" : "선택 모드"}
          </button>
        </div>
      </div>

      {/* ─── 통계 카드 ─── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="총 분석" value={stats.total_analyses} sub={`${stats.unique_tickers}개 종목`} />
          <StatCard
            label="신호 분포"
            value={`${buyCount}/${sellCount}/${holdCount}`}
            sub="매수/매도/관망"
          />
          <StatCard label="평균 신뢰도" value={`${stats.avg_confidence}%`} color={stats.avg_confidence >= 70 ? "#4ade80" : stats.avg_confidence >= 50 ? "#facc15" : "#f87171"} />
          <StatCard
            label="최다 분석"
            value={stats.top_tickers?.[0]?.name || "-"}
            sub={stats.top_tickers?.[0] ? `${stats.top_tickers[0].count}회` : undefined}
          />
          {showPerformance && perfData && (
            <StatCard
              label="적중률"
              value={perfData.hit_rate != null ? `${perfData.hit_rate}%` : "-"}
              sub={perfData.avg_return != null ? `평균 ${perfData.avg_return > 0 ? "+" : ""}${perfData.avg_return}%` : undefined}
              color={perfData.hit_rate != null && perfData.hit_rate >= 50 ? "#4ade80" : "#f87171"}
            />
          )}
        </div>
      )}

      {/* ─── 검색/필터/정렬 ─── */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="종목명 또는 티커 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 rounded text-xs bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="px-2 py-1.5 rounded text-xs bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              title={sortOrder === "desc" ? "내림차순" : "오름차순"}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <FilterGroup label="신호" options={SIGNAL_OPTIONS} value={signalFilter} onChange={setSignalFilter} />
          <FilterGroup label="시장" options={MARKET_OPTIONS} value={marketFilter} onChange={setMarketFilter} />
          <FilterGroup label="등급" options={GRADE_OPTIONS} value={gradeFilter} onChange={setGradeFilter} />
        </div>
      </div>

      {/* ─── 선택 모드 액션바 ─── */}
      {selectMode && (
        <div className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
          <button onClick={toggleSelectAll} className="text-xs text-blue-400 hover:text-blue-300">
            {selectedIds.size === filteredAnalyses.length ? "전체 해제" : "전체 선택"}
          </button>
          <span className="text-xs text-[var(--muted)]">{selectedIds.size}건 선택됨</span>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="ml-auto px-3 py-1 rounded text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              선택 삭제
            </button>
          )}
        </div>
      )}

      {/* ─── 카드 리스트 ─── */}
      {isLoading && <div className="text-center py-10 text-[var(--muted)]">로딩 중...</div>}

      {!isLoading && filteredAnalyses.length === 0 && (
        <div className="text-center py-20 text-[var(--muted)]">
          {analyses && analyses.length > 0
            ? <p>필터 조건에 맞는 기록이 없습니다</p>
            : (
              <>
                <p>저장된 분석 기록이 없습니다</p>
                <p className="text-sm mt-1">종목 분석 페이지에서 분석하면 자동으로 저장됩니다</p>
              </>
            )}
        </div>
      )}

      {!isLoading && filteredAnalyses.length > 0 && (
        <div className="space-y-3">
          {filteredAnalyses.map((item: any) => {
            const actionColor = item.signal === "BUY" ? "#4ade80" : item.signal === "SELL" ? "#f87171" : "#facc15";
            const actionBg = item.signal === "BUY" ? "rgba(34,197,94,0.2)" : item.signal === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)";
            const actionLabel = item.signal === "BUY" ? "매수" : item.signal === "SELL" ? "매도" : "관망";
            const sc = item.score_data || {};
            const date = item.analyzed_at ? new Date(item.analyzed_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
            const isExpanded = expandedId === item.id;
            const isSelected = selectedIds.has(item.id);
            const perf = perfMap.get(item.id);

            return (
              <div
                key={item.id}
                className={`bg-[var(--card)] border rounded-lg p-4 transition-colors ${
                  isSelected ? "border-blue-500" : "border-[var(--card-border)]"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-gray-600 accent-blue-600"
                      />
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex items-center gap-2 hover:opacity-80 text-left"
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[var(--muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="font-medium text-lg">{item.name}</span>
                      <span className="text-[var(--muted)] text-sm">{item.ticker}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--muted)]">{date}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ color: gradeColor[item.grade] || "#9ca3af" }}>
                      {item.grade || "-"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: actionBg, color: actionColor }}>
                      {actionLabel}
                    </span>
                    <Link
                      href={`/my-analyses/${item.ticker}`}
                      className="text-xs text-[var(--muted)] hover:text-blue-400 transition-colors"
                      title="히스토리"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleSingleDelete(item.id)}
                      className="text-[var(--muted)] hover:text-red-400 text-xs transition-colors"
                      title="삭제"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted)] text-xs">분석 시 가격</span>
                    <p className="font-medium">{formatPrice(item.current_price, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">신뢰도</span>
                    <p className="font-medium">{item.confidence?.toFixed(0) ?? "-"}%</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">종합 점수</span>
                    <p className="font-medium" style={{ color: item.total_score > 0 ? "#4ade80" : item.total_score < 0 ? "#f87171" : "var(--foreground)" }}>
                      {item.total_score > 0 ? "+" : ""}{(item.total_score * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">목표가</span>
                    <p className="font-medium" style={{ color: "#4ade80" }}>{formatPrice(sc.target?.consensus, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">손절가</span>
                    <p className="font-medium" style={{ color: "#f87171" }}>{formatPrice(sc.stop_loss?.final, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">R:R</span>
                    <p className="font-medium" style={{
                      color: (sc.risk_reward_ratio ?? 0) >= 1.5 ? "#4ade80" : (sc.risk_reward_ratio ?? 0) >= 1.0 ? "#facc15" : "#f87171",
                    }}>
                      {sc.risk_reward_ratio != null ? `${sc.risk_reward_ratio}:1` : "-"}
                    </p>
                  </div>
                  {showPerformance && perf && (
                    <div>
                      <span className="text-[var(--muted)] text-xs">수익률</span>
                      <p className="font-medium" style={{
                        color: perf.return_pct != null ? (perf.return_pct > 0 ? "#4ade80" : perf.return_pct < 0 ? "#f87171" : "var(--foreground)") : "var(--muted)",
                      }}>
                        {perf.return_pct != null ? `${perf.return_pct > 0 ? "+" : ""}${perf.return_pct}%` : "-"}
                        {perf.hit === true && " ✓"}
                        {perf.hit === false && " ✗"}
                      </p>
                    </div>
                  )}
                </div>

                {/* 메모 영역 */}
                <div className="mt-2">
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
                      onClick={() => startMemoEdit(item.id, item.memo)}
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

                {isExpanded && <AnalysisDetail item={item} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 삭제 확인 모달 ─── */}
      {showDeleteModal && (
        <DeleteModal
          count={deleteTarget === "single" ? 1 : selectedIds.size}
          onConfirm={confirmDelete}
          onCancel={() => { setShowDeleteModal(false); setSingleDeleteId(null); }}
        />
      )}
    </div>
  );
}

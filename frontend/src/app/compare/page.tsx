"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  searchStocks,
  fetchScore,
  generateCompareReport,
  type StockSearchResult,
  type CompareReport,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function detectMarket(ticker: string): string {
  return /^\d{6}$/.test(ticker.trim()) ? "KOSPI" : "NASDAQ";
}

const TAG_COLORS = [
  { bg: "rgba(59,130,246,0.2)", text: "#60a5fa", border: "rgba(59,130,246,0.4)" },
  { bg: "rgba(168,85,247,0.2)", text: "#c084fc", border: "rgba(168,85,247,0.4)" },
  { bg: "rgba(34,197,94,0.2)", text: "#4ade80", border: "rgba(34,197,94,0.4)" },
  { bg: "rgba(251,146,60,0.2)", text: "#fb923c", border: "rgba(251,146,60,0.4)" },
];

function signalColor(signal: string) {
  if (signal === "BUY") return "#4ade80";
  if (signal === "SELL") return "#f87171";
  return "#facc15";
}

function signalLabel(signal: string) {
  if (signal === "BUY") return "매수";
  if (signal === "SELL") return "매도";
  return "관망";
}

function gradeColor(grade: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    "A+": { bg: "rgba(34,197,94,0.25)", text: "#4ade80" },
    A: { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
    "B+": { bg: "rgba(59,130,246,0.2)", text: "#60a5fa" },
    B: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
    C: { bg: "rgba(234,179,8,0.2)", text: "#facc15" },
    D: { bg: "rgba(249,115,22,0.2)", text: "#fb923c" },
    F: { bg: "rgba(239,68,68,0.2)", text: "#f87171" },
  };
  return map[grade] || map.C;
}

function formatPrice(v: number | null | undefined, market?: string): string {
  if (v == null) return "-";
  if (market && (market === "KOSPI" || market === "KOSDAQ")) {
    return v.toLocaleString("ko-KR") + "원";
  }
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SelectedStock extends StockSearchResult {
  colorIdx: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function ComparePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selected, setSelected] = useState<SelectedStock[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Search logic ---- */
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const res = await searchStocks(q);
      setSearchResults(res.results ?? []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  /* Close dropdown on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ---- Add / Remove stocks ---- */
  const addStock = (stock: StockSearchResult) => {
    if (selected.length >= 4) return;
    if (selected.some((s) => s.ticker === stock.ticker && s.market === stock.market))
      return;
    const usedColors = new Set(selected.map((s) => s.colorIdx));
    let colorIdx = 0;
    for (let i = 0; i < TAG_COLORS.length; i++) {
      if (!usedColors.has(i)) { colorIdx = i; break; }
    }
    setSelected((prev) => [...prev, { ...stock, colorIdx }]);
    setQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const removeStock = (ticker: string, market: string) => {
    setSelected((prev) => prev.filter((s) => !(s.ticker === ticker && s.market === market)));
  };

  /* ---- AI Compare Report state ---- */
  const [aiReport, setAiReport] = useState<CompareReport | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReportError, setAiReportError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setAiReportLoading(true);
    setAiReportError(null);
    try {
      const tickers = selected.map((s) => s.ticker);
      const markets = selected.map((s) => s.market);
      const res = await generateCompareReport(tickers, markets);
      if (res.success && res.data) {
        setAiReport(res.data);
      } else {
        setAiReportError("리포트 생성에 실패했습니다.");
      }
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes("429")) {
        setAiReportError("일일 비교 리포트 생성 횟수(5회)를 초과했습니다.");
      } else if (err?.status === 401 || err?.message?.includes("401")) {
        setAiReportError("로그인이 필요합니다.");
      } else {
        setAiReportError("리포트 생성 중 오류가 발생했습니다.");
      }
    } finally {
      setAiReportLoading(false);
    }
  };

  // Reset report when selection changes
  useEffect(() => {
    setAiReport(null);
    setAiReportError(null);
  }, [selected.length]);

  /* ---- Fetch scores in parallel ---- */
  const scoreQueries = useQueries({
    queries: selected.map((s) => ({
      queryKey: ["compare-score", s.ticker, s.market],
      queryFn: () => fetchScore(s.ticker, s.market),
      enabled: selected.length >= 2,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const allLoaded =
    selected.length >= 2 && scoreQueries.every((q) => !q.isLoading);
  const anyError = scoreQueries.some((q) => q.isError);

  /* Helper: get score data for a stock by index */
  const getScore = (idx: number): any | null => {
    return scoreQueries[idx]?.data?.data ?? null;
  };

  /* Find best (max) numeric value among scores */
  const findBestIdx = (
    getter: (score: any) => number | null | undefined,
    higherIsBetter = true,
  ): number => {
    let bestIdx = -1;
    let bestVal: number | null = null;
    selected.forEach((_, idx) => {
      const sc = getScore(idx);
      if (!sc) return;
      const v = getter(sc);
      if (v == null) return;
      if (bestVal == null || (higherIsBetter ? v > bestVal : v < bestVal)) {
        bestVal = v;
        bestIdx = idx;
      }
    });
    return bestIdx;
  };

  /* ---- Signal breakdown keys ---- */
  const signalKeys = [
    { key: "candlestick", label: "캔들스틱" },
    { key: "chart_pattern", label: "차트 패턴" },
    { key: "support_resistance", label: "지지/저항" },
    { key: "volume", label: "거래량" },
    { key: "trend", label: "추세" },
    { key: "rsi", label: "RSI" },
    { key: "fundamental", label: "펀더멘탈" },
  ];

  /* ---- Render ---- */

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg className="w-8 h-8 animate-spin text-[var(--muted)] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[var(--muted)]">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚖️</span>
          </div>
          <h2 className="text-xl font-bold mb-2">종목 비교</h2>
          <p className="text-[var(--muted)] text-sm mb-6">
            여러 종목의 기술적 분석 결과를 한눈에 비교하고 최적의 투자 판단을 내리세요.
            로그인하면 종목 비교 기능을 사용할 수 있습니다.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3 text-center">
              <div className="text-lg mb-1">📊</div>
              <p className="text-xs text-[var(--muted)]">최대 4종목 동시 비교</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3 text-center">
              <div className="text-lg mb-1">🎯</div>
              <p className="text-xs text-[var(--muted)]">등급/신뢰도 비교</p>
            </div>
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3 text-center">
              <div className="text-lg mb-1">📈</div>
              <p className="text-xs text-[var(--muted)]">신호 강도 분석</p>
            </div>
          </div>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">종목 비교</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          2~4개 종목을 선택하여 기술적 분석 결과를 나란히 비교합니다
        </p>
      </div>

      {/* Search + Selected Tags */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[var(--muted)] flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              placeholder={
                selected.length >= 4
                  ? "최대 4개까지 선택 가능합니다"
                  : "종목명 또는 티커를 검색하세요"
              }
              disabled={selected.length >= 4}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--muted)] disabled:opacity-50"
            />
            {searching && (
              <svg
                className="w-4 h-4 animate-spin text-[var(--muted)]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
            >
              {searchResults.map((r) => {
                const alreadyAdded = selected.some(
                  (s) => s.ticker === r.ticker && s.market === r.market,
                );
                return (
                  <button
                    key={`${r.ticker}-${r.market}`}
                    onClick={() => addStock(r)}
                    disabled={alreadyAdded || selected.length >= 4}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-hover)] transition-colors flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[var(--muted)] ml-2">
                        ({r.ticker})
                      </span>
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {r.market}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected tags */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => {
              const c = TAG_COLORS[s.colorIdx];
              return (
                <span
                  key={`${s.ticker}-${s.market}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: c.bg,
                    color: c.text,
                    border: `1px solid ${c.border}`,
                  }}
                >
                  {s.name}
                  <span className="text-xs opacity-70">({s.ticker})</span>
                  <button
                    onClick={() => removeStock(s.ticker, s.market)}
                    className="ml-1 hover:opacity-70 transition-opacity"
                    aria-label={`${s.name} 제거`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Guidance */}
        {selected.length < 2 && (
          <p className="text-xs text-[var(--muted)]">
            {selected.length === 0
              ? "비교할 종목을 2개 이상 추가해주세요"
              : "1개 더 추가하면 비교를 시작합니다"}
          </p>
        )}
      </div>

      {/* Loading state */}
      {selected.length >= 2 && !allLoaded && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center">
          <svg
            className="w-6 h-6 animate-spin text-[var(--muted)] mx-auto mb-2"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-[var(--muted)]">분석 데이터를 불러오는 중...</p>
        </div>
      )}

      {/* Error state */}
      {allLoaded && anyError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
          일부 종목의 분석 데이터를 불러오지 못했습니다. 해당 종목을 제거하고 다시 시도해주세요.
        </div>
      )}

      {/* Comparison Table */}
      {allLoaded && selected.length >= 2 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="p-4 text-left text-[var(--muted)] font-medium w-40 min-w-[140px]">
                  지표
                </th>
                {selected.map((s, idx) => {
                  const c = TAG_COLORS[s.colorIdx];
                  return (
                    <th
                      key={`${s.ticker}-${s.market}`}
                      className="p-4 text-center font-medium min-w-[140px]"
                    >
                      <Link
                        href={`/analysis/${s.ticker}?market=${s.market}`}
                        className="hover:underline"
                        style={{ color: c.text }}
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-[var(--muted)] font-normal mt-0.5">
                        {s.ticker} / {s.market}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* 종합 판정 */}
              <CompareRow label="종합 판정" highlight={false}>
                {selected.map((s, idx) => {
                  const sc = getScore(idx);
                  if (!sc)
                    return (
                      <td key={idx} className="p-4 text-center text-[var(--muted)]">
                        -
                      </td>
                    );
                  return (
                    <td key={idx} className="p-4 text-center">
                      <span
                        className="px-2.5 py-1 rounded text-sm font-bold"
                        style={{
                          backgroundColor:
                            sc.signal === "BUY"
                              ? "rgba(34,197,94,0.2)"
                              : sc.signal === "SELL"
                                ? "rgba(239,68,68,0.2)"
                                : "rgba(234,179,8,0.2)",
                          color: signalColor(sc.signal),
                        }}
                      >
                        {signalLabel(sc.signal)}
                      </span>
                    </td>
                  );
                })}
              </CompareRow>

              {/* 등급 */}
              <CompareRow label="등급" highlight={false}>
                {selected.map((s, idx) => {
                  const sc = getScore(idx);
                  if (!sc)
                    return (
                      <td key={idx} className="p-4 text-center text-[var(--muted)]">
                        -
                      </td>
                    );
                  const gc = gradeColor(sc.grade);
                  const best = findBestIdx(
                    (d) => {
                      const order = ["F", "D", "C", "B", "B+", "A", "A+"];
                      return order.indexOf(d.grade);
                    },
                    true,
                  );
                  return (
                    <td
                      key={idx}
                      className="p-4 text-center"
                      style={
                        best === idx
                          ? { backgroundColor: "rgba(34,197,94,0.06)" }
                          : undefined
                      }
                    >
                      <span
                        className="px-2.5 py-1 rounded text-sm font-bold"
                        style={{ backgroundColor: gc.bg, color: gc.text }}
                      >
                        {sc.grade}
                      </span>
                      {best === idx && (
                        <span className="ml-1.5 text-xs text-green-400 font-semibold">
                          BEST
                        </span>
                      )}
                    </td>
                  );
                })}
              </CompareRow>

              {/* 신뢰도 */}
              <NumericRow
                label="신뢰도"
                selected={selected}
                getScore={getScore}
                getValue={(sc) => sc.confidence?.final}
                format={(v) => `${v.toFixed(1)}%`}
                findBest={findBestIdx}
                higherIsBetter={true}
              />

              {/* 종합 점수 */}
              <NumericRow
                label="종합 점수"
                selected={selected}
                getScore={getScore}
                getValue={(sc) => sc.total_score}
                format={(v) => v.toFixed(4)}
                findBest={findBestIdx}
                higherIsBetter={true}
              />

              {/* 현재가 */}
              <CompareRow label="현재가" highlight={false}>
                {selected.map((s, idx) => {
                  const sc = getScore(idx);
                  return (
                    <td key={idx} className="p-4 text-center font-medium">
                      {sc ? formatPrice(sc.current_price, s.market) : "-"}
                    </td>
                  );
                })}
              </CompareRow>

              {/* 목표가 */}
              <CompareRow label="목표가" highlight={false}>
                {selected.map((s, idx) => {
                  const sc = getScore(idx);
                  const target = sc?.target?.consensus;
                  return (
                    <td
                      key={idx}
                      className="p-4 text-center font-medium"
                      style={{ color: target ? "#4ade80" : undefined }}
                    >
                      {target ? formatPrice(target, s.market) : "-"}
                    </td>
                  );
                })}
              </CompareRow>

              {/* 손절가 */}
              <CompareRow label="손절가" highlight={false}>
                {selected.map((s, idx) => {
                  const sc = getScore(idx);
                  const sl = sc?.stop_loss?.final;
                  return (
                    <td
                      key={idx}
                      className="p-4 text-center font-medium"
                      style={{ color: sl ? "#f87171" : undefined }}
                    >
                      {sl ? formatPrice(sl, s.market) : "-"}
                    </td>
                  );
                })}
              </CompareRow>

              {/* R:R 비율 */}
              <NumericRow
                label="R:R 비율"
                selected={selected}
                getScore={getScore}
                getValue={(sc) => sc.risk_reward_ratio}
                format={(v) => `${v.toFixed(2)}:1`}
                findBest={findBestIdx}
                higherIsBetter={true}
              />

              {/* Divider */}
              <tr>
                <td
                  colSpan={selected.length + 1}
                  className="px-4 py-2 text-xs text-[var(--muted)] font-semibold uppercase tracking-wider bg-white/[0.02] border-y border-[var(--card-border)]"
                >
                  신호 분석 (Strength)
                </td>
              </tr>

              {/* Signal breakdown rows */}
              {signalKeys.map((sk) => (
                <NumericRow
                  key={sk.key}
                  label={sk.label}
                  selected={selected}
                  getScore={getScore}
                  getValue={(sc) =>
                    sc.signal_breakdown?.[sk.key]?.strength ?? null
                  }
                  format={(v) => {
                    const pct = (v * 100).toFixed(1);
                    return `${v > 0 ? "+" : ""}${pct}%`;
                  }}
                  colorize={true}
                  findBest={findBestIdx}
                  higherIsBetter={true}
                />
              ))}

              {/* Divider */}
              <tr>
                <td
                  colSpan={selected.length + 1}
                  className="px-4 py-2 text-xs text-[var(--muted)] font-semibold uppercase tracking-wider bg-white/[0.02] border-y border-[var(--card-border)]"
                >
                  보조 지표
                </td>
              </tr>

              {/* RSI */}
              <NumericRow
                label="RSI"
                selected={selected}
                getScore={getScore}
                getValue={(sc) => sc.indicators?.rsi}
                format={(v) => v.toFixed(1)}
                findBest={findBestIdx}
                higherIsBetter={false}
                colorize={false}
              />

              {/* ATR% */}
              <NumericRow
                label="ATR%"
                selected={selected}
                getScore={getScore}
                getValue={(sc) => sc.indicators?.atr_pct}
                format={(v) => `${v.toFixed(2)}%`}
                findBest={findBestIdx}
                higherIsBetter={false}
                colorize={false}
              />

              {/* 추세 */}
              <CompareRow label="추세" highlight={false}>
                {selected.map((_, idx) => {
                  const sc = getScore(idx);
                  const trend = sc?.indicators?.trend;
                  if (!trend)
                    return (
                      <td key={idx} className="p-4 text-center text-[var(--muted)]">
                        -
                      </td>
                    );
                  const dirLabel =
                    trend.direction === "uptrend"
                      ? "상승"
                      : trend.direction === "downtrend"
                        ? "하락"
                        : "횡보";
                  const dirColor =
                    trend.direction === "uptrend"
                      ? "#4ade80"
                      : trend.direction === "downtrend"
                        ? "#f87171"
                        : "#facc15";
                  return (
                    <td key={idx} className="p-4 text-center">
                      <span style={{ color: dirColor, fontWeight: 500 }}>
                        {dirLabel}
                      </span>
                      <span className="text-[var(--muted)] text-xs ml-1">
                        ({(trend.strength * 100).toFixed(0)}%)
                      </span>
                    </td>
                  );
                })}
              </CompareRow>
            </tbody>
          </table>
        </div>
      )}

      {/* AI Compare Report */}
      {allLoaded && selected.length >= 2 && (
        <div className="space-y-4">
          {/* Generate button */}
          {!aiReport && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateReport}
                disabled={aiReportLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                {aiReportLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 분석 중...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                      <line x1="10" y1="22" x2="14" y2="22" />
                    </svg>
                    AI 비교 분석
                  </>
                )}
              </button>
              {aiReportError && (
                <span className="text-sm text-red-400">{aiReportError}</span>
              )}
            </div>
          )}

          {/* Report result */}
          {aiReport && (
            <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-lg p-5 space-y-5">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                  <line x1="10" y1="22" x2="14" y2="22" />
                </svg>
                <h3 className="text-lg font-semibold text-blue-400">AI 비교 분석 리포트</h3>
              </div>

              {/* Overall */}
              {aiReport.overall && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--muted)] mb-2">종합 비교</h4>
                  <p className="text-sm leading-relaxed">{aiReport.overall}</p>
                </div>
              )}

              {/* Best pick */}
              {aiReport.best_pick?.ticker && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded">BEST PICK</span>
                    <span className="font-semibold">{aiReport.best_pick.ticker}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{aiReport.best_pick.reason}</p>
                </div>
              )}

              {/* Per-stock comparison */}
              {aiReport.comparison && Object.keys(aiReport.comparison).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--muted)] mb-2">종목별 분석</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(aiReport.comparison).map(([ticker, comment]) => {
                      const s = selected.find((sel) => sel.ticker === ticker);
                      const c = s ? TAG_COLORS[s.colorIdx] : TAG_COLORS[0];
                      return (
                        <div
                          key={ticker}
                          className="rounded-lg p-3 text-sm"
                          style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                        >
                          <span className="font-medium" style={{ color: c.text }}>{ticker}</span>
                          <p className="mt-1 leading-relaxed text-[var(--foreground)]">{comment}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Risk comparison */}
              {aiReport.risk_comparison && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--muted)] mb-2">리스크 비교</h4>
                  <p className="text-sm leading-relaxed">{aiReport.risk_comparison}</p>
                </div>
              )}

              {/* Timing */}
              {aiReport.timing && (
                <div>
                  <h4 className="text-sm font-medium text-[var(--muted)] mb-2">진입 타이밍</h4>
                  <p className="text-sm leading-relaxed">{aiReport.timing}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {selected.length < 2 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-12 text-center">
          <svg
            className="w-12 h-12 text-[var(--muted)] mx-auto mb-4 opacity-40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="9" rx="1" />
            <path d="M10 7h4" />
            <path d="M3 16h18" />
            <path d="M3 20h18" />
          </svg>
          <p className="text-[var(--muted)] text-sm">
            상단 검색창에서 비교할 종목을 추가해주세요
          </p>
          <p className="text-[var(--muted)] text-xs mt-1">
            최소 2개, 최대 4개까지 비교할 수 있습니다
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Generic table row wrapper */
function CompareRow({
  label,
  highlight,
  children,
}: {
  label: string;
  highlight: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      className="border-b border-[var(--card-border)]"
      style={highlight ? { backgroundColor: "rgba(34,197,94,0.04)" } : undefined}
    >
      <td className="p-4 text-[var(--muted)] font-medium whitespace-nowrap">
        {label}
      </td>
      {children}
    </tr>
  );
}

/** Numeric comparison row with optional best-highlighting and colorization */
function NumericRow({
  label,
  selected,
  getScore,
  getValue,
  format,
  findBest,
  higherIsBetter = true,
  colorize = false,
}: {
  label: string;
  selected: SelectedStock[];
  getScore: (idx: number) => any;
  getValue: (score: any) => number | null | undefined;
  format: (v: number) => string;
  findBest: (
    getter: (score: any) => number | null | undefined,
    higherIsBetter: boolean,
  ) => number;
  higherIsBetter?: boolean;
  colorize?: boolean;
}) {
  const bestIdx = findBest(getValue, higherIsBetter);

  return (
    <CompareRow label={label} highlight={false}>
      {selected.map((_, idx) => {
        const sc = getScore(idx);
        if (!sc) {
          return (
            <td key={idx} className="p-4 text-center text-[var(--muted)]">
              -
            </td>
          );
        }
        const v = getValue(sc);
        if (v == null) {
          return (
            <td key={idx} className="p-4 text-center text-[var(--muted)]">
              -
            </td>
          );
        }

        const formatted = format(v);
        const isBest = bestIdx === idx;
        let color: string | undefined;
        if (colorize) {
          color = v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "#6b7280";
        }

        return (
          <td
            key={idx}
            className="p-4 text-center"
            style={{
              backgroundColor: isBest ? "rgba(34,197,94,0.06)" : undefined,
            }}
          >
            <span
              style={{
                fontWeight: isBest ? 700 : 500,
                color: color,
              }}
            >
              {formatted}
            </span>
            {isBest && (
              <span className="ml-1.5 text-xs text-green-400 font-semibold">
                BEST
              </span>
            )}
          </td>
        );
      })}
    </CompareRow>
  );
}

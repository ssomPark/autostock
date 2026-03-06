"use client";

import { Fragment, useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchRecommendations, fetchScore, fetchFinancials, saveAnalysisAPI, togglePinAnalysis, fetchSectorHeatmap, type SectorHeatmapItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { SparklineChart } from "@/components/charts/sparkline-chart";
import { useLivePrices } from "@/hooks/use-live-prices";
import { formatPrice } from "@/lib/format";
import { AdUnit } from "@/components/ads/ad-unit";

function MarketStatusDot({ isOpen, label, holiday }: { isOpen: boolean; label: string; holiday?: boolean }) {
  const statusText = holiday ? "휴장" : isOpen ? "개장" : "마감";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: isOpen ? "#4ade80" : "#6b7280" }}
      />
      <span className="text-[var(--muted)]">
        {label} {statusText}
      </span>
    </span>
  );
}

function formatPct(value: number | null | undefined): React.ReactNode {
  if (value == null) return "-";
  const color = value >= 0 ? "#4ade80" : "#f87171";
  return (
    <span style={{ color, fontWeight: 500 }}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function ConfidenceCell({ dbConfidence, liveConfidence, isLoading }: {
  dbConfidence: number;
  liveConfidence?: number;
  isLoading: boolean;
}) {
  const dbPct = dbConfidence * 100;

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1">
        <span>{dbPct.toFixed(0)}%</span>
        <svg className="w-3 h-3 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
    );
  }

  if (liveConfidence == null) {
    return <span>{dbPct.toFixed(0)}%</span>;
  }

  const diff = liveConfidence - dbPct;
  const changed = Math.abs(diff) >= 1;

  if (!changed) {
    return <span>{liveConfidence.toFixed(0)}%</span>;
  }

  const diffColor = diff > 0 ? "#4ade80" : "#f87171";
  const arrow = diff > 0 ? "▲" : "▼";

  return (
    <div className="leading-tight">
      <span className="font-medium">{liveConfidence.toFixed(0)}%</span>
      <div className="flex items-center gap-0.5 text-[10px]">
        <span style={{ color: diffColor }}>{arrow}{Math.abs(diff).toFixed(0)}p</span>
        <span className="text-[var(--muted)]">({dbPct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [market, setMarket] = useState("all");
  const [action, setAction] = useState("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [savingTicker, setSavingTicker] = useState<string | null>(null);
  const [savedTickers, setSavedTickers] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sorting state
  const [sortKey, setSortKey] = useState<"confidence" | "expected" | "change" | null>("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSortClick = (key: "confidence" | "expected" | "change") => {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // Reset
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handlePin = async (rec: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    setSavingTicker(rec.ticker);
    setSaveError(null);
    try {
      // 먼저 분석 저장 (이미 있으면 업데이트)
      const [scoreRes, finRes] = await Promise.all([
        fetchScore(rec.ticker, rec.market),
        fetchFinancials(rec.ticker, rec.market),
      ]);
      const sc = scoreRes?.data;
      const fin = finRes?.data;
      await saveAnalysisAPI({
        ticker: rec.ticker,
        name: fin?.name || rec.name,
        market: rec.market,
        signal: sc.signal,
        grade: sc.grade,
        confidence: sc.confidence?.final ?? 0,
        current_price: sc.current_price ?? 0,
        total_score: sc.total_score ?? 0,
        score_data: sc,
        financials_data: fin ?? {},
      });
      // 핀 토글
      await togglePinAnalysis(rec.ticker);
      setSavedTickers((prev) => new Set(prev).add(rec.ticker));
      setTimeout(() => setSavedTickers((prev) => {
        const next = new Set(prev);
        next.delete(rec.ticker);
        return next;
      }), 2000);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("401")) {
        router.push("/auth/login");
      } else {
        setSaveError(rec.ticker);
        setTimeout(() => setSaveError(null), 3000);
      }
    } finally {
      setSavingTicker(null);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["recommendations", market, action],
    queryFn: () => fetchRecommendations({ market, action }),
  });

  // 각 종목의 실시간 ScoringEngine 신뢰도를 병렬 조회 (중복 ticker 제거)
  const recs: any[] = data?.data ?? [];
  const uniqueTickers = Array.from(
    new Map(recs.map((r: any) => [`${r.ticker}:${r.market}`, r])).values()
  );
  const liveScoreResults = useQueries({
    queries: uniqueTickers.map((rec: any) => ({
      queryKey: ["score", rec.ticker, rec.market],
      queryFn: () => fetchScore(rec.ticker, rec.market),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const liveScoreMap = new Map<string, { confidence?: number; loading: boolean }>();
  uniqueTickers.forEach((rec: any, idx: number) => {
    const q = liveScoreResults[idx];
    liveScoreMap.set(`${rec.ticker}:${rec.market}`, {
      confidence: q?.data?.data?.confidence?.final,
      loading: q?.isLoading ?? false,
    });
  });

  const { prices, marketStatus, isAnyMarketOpen } = useLivePrices({ market });

  // Helper to get sort value for a recommendation
  const getSortValue = (rec: any, key: "confidence" | "expected" | "change"): number => {
    if (key === "confidence") {
      const live = liveScoreMap.get(`${rec.ticker}:${rec.market}`)?.confidence;
      return live != null ? live / 100 : (rec.confidence ?? 0);
    }
    if (key === "expected") {
      if (rec.current_price > 0 && rec.target_price) {
        return ((rec.target_price - rec.current_price) / rec.current_price) * 100;
      }
      return -Infinity;
    }
    // change
    const lp = prices.get(rec.ticker);
    return lp?.change_from_rec ?? -Infinity;
  };

  const sortedRecs = useMemo(() => {
    if (!sortKey) return recs;
    return [...recs].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va === vb) return 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, sortKey, sortDir, prices, liveScoreMap]);

  // --- 적중률 대시보드 ---
  const [showAccuracy, setShowAccuracy] = useState(false);

  const accuracyStats = useMemo(() => {
    const buys: { hit: boolean; targetHit: boolean; returnPct: number }[] = [];
    const sells: { hit: boolean; targetHit: boolean; returnPct: number }[] = [];

    for (const rec of recs) {
      if (rec.action === "HOLD") continue;
      const lp = prices.get(rec.ticker);
      if (!lp || !rec.current_price || rec.current_price <= 0) continue;

      const livePrice = lp.live_price;
      const recPrice = rec.current_price;
      const returnPct = ((livePrice - recPrice) / recPrice) * 100;

      if (rec.action === "BUY") {
        const hit = livePrice > recPrice;
        const targetHit = rec.target_price ? livePrice >= rec.target_price : false;
        buys.push({ hit, targetHit, returnPct });
      } else if (rec.action === "SELL") {
        const hit = livePrice < recPrice;
        const targetHit = rec.target_price ? livePrice <= rec.target_price : false;
        sells.push({ hit, targetHit, returnPct: -returnPct });
      }
    }

    const all = [...buys, ...sells];
    const total = all.length;
    const hitCount = all.filter((x) => x.hit).length;
    const targetHitCount = all.filter((x) => x.targetHit).length;

    const buyTotal = buys.length;
    const buyHit = buys.filter((x) => x.hit).length;

    const sellTotal = sells.length;
    const sellHit = sells.filter((x) => x.hit).length;

    const overallRate = total > 0 ? (hitCount / total) * 100 : null;
    const buyRate = buyTotal > 0 ? (buyHit / buyTotal) * 100 : null;
    const sellRate = sellTotal > 0 ? (sellHit / sellTotal) * 100 : null;
    const targetRate = total > 0 ? (targetHitCount / total) * 100 : null;
    const avgReturn = total > 0 ? all.reduce((sum, x) => sum + x.returnPct, 0) / total : null;

    return { overallRate, buyRate, sellRate, targetRate, avgReturn, total, buyTotal, sellTotal };
  }, [recs, prices]);

  const rateColor = (rate: number | null) => {
    if (rate == null) return "var(--muted)";
    if (rate >= 70) return "#4ade80";
    if (rate >= 50) return "#facc15";
    return "#f87171";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">투자 추천</h1>
        <div className="flex flex-wrap items-center gap-2">
          {marketStatus && (
            <div className="flex items-center gap-3 mr-2">
              <MarketStatusDot isOpen={marketStatus.KR.is_open} label="KR" holiday={marketStatus.KR.holiday} />
              <MarketStatusDot isOpen={marketStatus.US.is_open} label="US" holiday={marketStatus.US.holiday} />
            </div>
          )}
          {["all", "KR", "US"].map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-3 py-1.5 rounded text-sm ${
                market === m
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]"
              }`}
            >
              {m === "all" ? "전체" : m}
            </button>
          ))}
          {["all", "BUY", "SELL", "HOLD"].map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`px-3 py-1.5 rounded text-sm ${
                action === a
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]"
              }`}
            >
              {a === "all" ? "전체" : a === "BUY" ? "매수" : a === "SELL" ? "매도" : "관망"}
            </button>
          ))}
        </div>
      </div>

      {/* 섹터 히트맵 */}
      <SectorHeatmap />

      {/* 적중률 대시보드 */}
      {!isLoading && accuracyStats.total > 0 && (
        <div>
          <button
            onClick={() => setShowAccuracy((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            적중률 분석 {showAccuracy ? "\u25B2" : "\u25BC"}
            <span className="text-xs opacity-60">({accuracyStats.total}건 분석)</span>
          </button>
          {showAccuracy && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
              {/* 전체 적중률 */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: rateColor(accuracyStats.overallRate) }}
                >
                  {accuracyStats.overallRate != null ? `${accuracyStats.overallRate.toFixed(1)}%` : "-"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">전체 적중률</div>
              </div>
              {/* BUY 적중률 */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: rateColor(accuracyStats.buyRate) }}
                >
                  {accuracyStats.buyRate != null ? `${accuracyStats.buyRate.toFixed(1)}%` : "-"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  BUY 적중률
                  {accuracyStats.buyTotal > 0 && <span className="opacity-60"> ({accuracyStats.buyTotal}건)</span>}
                </div>
              </div>
              {/* SELL 적중률 */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: rateColor(accuracyStats.sellRate) }}
                >
                  {accuracyStats.sellRate != null ? `${accuracyStats.sellRate.toFixed(1)}%` : "-"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  SELL 적중률
                  {accuracyStats.sellTotal > 0 && <span className="opacity-60"> ({accuracyStats.sellTotal}건)</span>}
                </div>
              </div>
              {/* 목표 도달률 */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: rateColor(accuracyStats.targetRate) }}
                >
                  {accuracyStats.targetRate != null ? `${accuracyStats.targetRate.toFixed(1)}%` : "-"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">목표 도달률</div>
              </div>
              {/* 평균 수익률 */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: accuracyStats.avgReturn != null ? (accuracyStats.avgReturn >= 0 ? "#4ade80" : "#f87171") : "var(--muted)" }}
                >
                  {accuracyStats.avgReturn != null
                    ? `${accuracyStats.avgReturn >= 0 ? "+" : ""}${accuracyStats.avgReturn.toFixed(2)}%`
                    : "-"}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">평균 수익률</div>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--muted)]">로딩 중...</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {sortedRecs.length === 0 && (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
                추천 데이터가 없습니다. 파이프라인을 실행해주세요.
              </div>
            )}
            {sortedRecs.map((rec: any, i: number) => {
              const showAd = i === 3;
              const lp = prices.get(rec.ticker);
              const expectedPct = rec.current_price > 0 && rec.target_price
                ? ((rec.target_price - rec.current_price) / rec.current_price * 100)
                : null;
              return (
                <Fragment key={i}>
                {showAd && <AdUnit slot="rec-infeed" format="fluid" />}
                <div
                  className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline">
                      <span className="font-medium">{rec.name}</span>
                      <span className="text-[var(--muted)] text-sm ml-1">({rec.ticker})</span>
                      {rec.source === "fundamental" && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          펀더멘탈
                        </span>
                      )}
                    </Link>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handlePin(rec, e)}
                        disabled={savingTicker === rec.ticker}
                        className="p-1.5 rounded hover:bg-[var(--surface-active)] transition-colors"
                        title="핀 고정"
                      >
                        {savingTicker === rec.ticker ? (
                          <svg className="w-4 h-4 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : saveError === rec.ticker ? (
                          <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        ) : savedTickers.has(rec.ticker) ? (
                          <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        ) : (
                          <span className="text-sm">&#128204;</span>
                        )}
                      </button>
                      <span
                        className="px-2 py-1 rounded text-sm font-medium"
                        style={{
                          backgroundColor: rec.action === "BUY" ? "rgba(34,197,94,0.2)" : rec.action === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
                          color: rec.action === "BUY" ? "#4ade80" : rec.action === "SELL" ? "#f87171" : "#facc15",
                        }}
                      >
                        {rec.action === "BUY" ? "매수" : rec.action === "SELL" ? "매도" : "관망"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">추천가</span>
                      <span className="font-medium">{formatPrice(rec.current_price, rec.market)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">신뢰도</span>
                      <span className="font-medium">
                        <ConfidenceCell
                          dbConfidence={rec.confidence}
                          liveConfidence={liveScoreMap.get(`${rec.ticker}:${rec.market}`)?.confidence}
                          isLoading={liveScoreMap.get(`${rec.ticker}:${rec.market}`)?.loading ?? false}
                        />
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">실시간가</span>
                      <span className="font-medium">
                        {lp ? formatPrice(lp.live_price, rec.market) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">추천대비</span>
                      <span className="font-medium">
                        {lp ? formatPct(lp.change_from_rec) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">목표가</span>
                      <span className="font-medium" style={{ color: "#4ade80" }}>{formatPrice(rec.target_price, rec.market)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">기대수익</span>
                      <span className="font-medium">
                        {expectedPct != null ? (
                          <span style={{ color: expectedPct >= 0 ? "#4ade80" : "#f87171" }}>
                            {expectedPct >= 0 ? "+" : ""}{expectedPct.toFixed(1)}%
                          </span>
                        ) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">손절가</span>
                      <span className="font-medium" style={{ color: "#f87171" }}>{formatPrice(rec.stop_loss, rec.market)}</span>
                    </div>
                  </div>
                  {rec.reasoning && (
                    <button
                      onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                      className="text-xs text-blue-400 mt-3 hover:underline"
                    >
                      {expandedRow === i ? "접기" : "상세 보기"}
                    </button>
                  )}
                  {expandedRow === i && rec.reasoning && (
                    <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                      <p className="text-sm leading-relaxed">{rec.reasoning}</p>
                      {rec.component_signals && Object.keys(rec.component_signals).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2 mt-2 border-t border-[var(--card-border)]">
                          {Object.entries(rec.component_signals).map(([key, val]: [string, any]) => {
                            const labelMap: Record<string, string> = {
                              candlestick: "캔들스틱",
                              chart_pattern: "차트패턴",
                              support_resistance: "지지/저항",
                              volume: "거래량",
                              news_sentiment: "뉴스",
                            };
                            const v = typeof val === "number" ? val : 0;
                            const color = v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "#6b7280";
                            return (
                              <span
                                key={key}
                                className="text-xs px-2 py-1 rounded"
                                style={{ backgroundColor: `${color}20`, color }}
                              >
                                {labelMap[key] || key}: {v > 0 ? "+" : ""}{(v * 100).toFixed(0)}%
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                  <th className="p-4 w-8"></th>
                  <th className="p-4">종목</th>
                  <th className="p-4">차트</th>
                  <th className="p-4">추천가</th>
                  <th className="p-4">실시간가</th>
                  <th
                    className="p-4 cursor-pointer select-none hover:text-[var(--foreground)] transition-colors"
                    onClick={() => handleSortClick("change")}
                  >
                    추천대비{" "}
                    {sortKey === "change" && <span className="text-blue-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                  <th className="p-4">판정</th>
                  <th
                    className="p-4 cursor-pointer select-none hover:text-[var(--foreground)] transition-colors"
                    onClick={() => handleSortClick("confidence")}
                  >
                    신뢰도{" "}
                    {sortKey === "confidence" && <span className="text-blue-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                  <th className="p-4">목표가</th>
                  <th
                    className="p-4 cursor-pointer select-none hover:text-[var(--foreground)] transition-colors"
                    onClick={() => handleSortClick("expected")}
                  >
                    기대수익{" "}
                    {sortKey === "expected" && <span className="text-blue-400">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                  <th className="p-4">손절가</th>
                  <th className="p-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRecs.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-[var(--muted)]">
                      추천 데이터가 없습니다. 파이프라인을 실행해주세요.
                    </td>
                  </tr>
                )}
                {sortedRecs.map((rec: any, i: number) => {
                  const lp = prices.get(rec.ticker);
                  return (
                    <Fragment key={i}>
                      <tr
                        className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)] cursor-pointer"
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                      >
                        <td className="p-4 text-[var(--muted)]">
                          <span className="text-xs transition-transform inline-block" style={{ transform: expandedRow === i ? "rotate(90deg)" : "none" }}>&#9654;</span>
                        </td>
                        <td className="p-4 font-medium">
                          <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {rec.name} <span className="text-[var(--muted)] text-sm">({rec.ticker})</span>
                          </Link>
                          {rec.source === "fundamental" && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              펀더멘탈
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} onClick={(e) => e.stopPropagation()}>
                            <SparklineChart ticker={rec.ticker} market={rec.market} width={120} height={48} />
                          </Link>
                        </td>
                        <td className="p-4">{formatPrice(rec.current_price, rec.market)}</td>
                        <td className="p-4">
                          {lp ? formatPrice(lp.live_price, rec.market) : "-"}
                        </td>
                        <td className="p-4">
                          {lp ? formatPct(lp.change_from_rec) : "-"}
                        </td>
                        <td className="p-4">
                          <span
                            className="px-2 py-1 rounded text-sm font-medium"
                            style={{
                              backgroundColor: rec.action === "BUY" ? "rgba(34,197,94,0.2)" : rec.action === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
                              color: rec.action === "BUY" ? "#4ade80" : rec.action === "SELL" ? "#f87171" : "#facc15",
                            }}
                          >
                            {rec.action === "BUY" ? "매수" : rec.action === "SELL" ? "매도" : "관망"}
                          </span>
                        </td>
                        <td className="p-4">
                          <ConfidenceCell
                            dbConfidence={rec.confidence}
                            liveConfidence={liveScoreMap.get(`${rec.ticker}:${rec.market}`)?.confidence}
                            isLoading={liveScoreMap.get(`${rec.ticker}:${rec.market}`)?.loading ?? false}
                          />
                        </td>
                        <td className="p-4" style={{ color: "#4ade80" }}>{formatPrice(rec.target_price, rec.market)}</td>
                        <td className="p-4">
                          {rec.current_price > 0 && rec.target_price ? (() => {
                            const pct = ((rec.target_price - rec.current_price) / rec.current_price * 100);
                            const color = pct >= 0 ? "#4ade80" : "#f87171";
                            return <span style={{ color, fontWeight: 500 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                          })() : "-"}
                        </td>
                        <td className="p-4" style={{ color: "#f87171" }}>{formatPrice(rec.stop_loss, rec.market)}</td>
                        <td className="p-4">
                          <button
                            onClick={(e) => handlePin(rec, e)}
                            disabled={savingTicker === rec.ticker}
                            className="p-1.5 rounded hover:bg-[var(--surface-active)] transition-colors"
                            title="핀 고정"
                          >
                            {savingTicker === rec.ticker ? (
                              <svg className="w-4 h-4 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : saveError === rec.ticker ? (
                              <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            ) : savedTickers.has(rec.ticker) ? (
                              <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            ) : (
                              <span className="text-sm">&#128204;</span>
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === i && rec.reasoning && (
                        <tr className="border-b border-[var(--card-border)] bg-white/[0.02]">
                          <td colSpan={12} className="px-6 py-4">
                            <div className="space-y-3">
                              <p className="text-sm leading-relaxed">{rec.reasoning}</p>
                              {rec.component_signals && Object.keys(rec.component_signals).length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--card-border)]">
                                  {Object.entries(rec.component_signals).map(([key, val]: [string, any]) => {
                                    const labelMap: Record<string, string> = {
                                      candlestick: "캔들스틱",
                                      chart_pattern: "차트패턴",
                                      support_resistance: "지지/저항",
                                      volume: "거래량",
                                      news_sentiment: "뉴스",
                                      fundamental: "펀더멘탈",
                                    };
                                    const v = typeof val === "number" ? val : 0;
                                    const color = v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "#6b7280";
                                    return (
                                      <span
                                        key={key}
                                        className="text-xs px-2 py-1 rounded"
                                        style={{ backgroundColor: `${color}20`, color }}
                                      >
                                        {labelMap[key] || key}: {v > 0 ? "+" : ""}{(v * 100).toFixed(0)}%
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}

/* ---- Sector Heatmap Component ---- */

function SectorHeatmap() {
  const [expanded, setExpanded] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sector-heatmap"],
    queryFn: fetchSectorHeatmap,
    staleTime: 5 * 60 * 1000,
  });

  const sectors: SectorHeatmapItem[] = data?.data?.sectors ?? [];
  if (isLoading || sectors.length === 0) return null;

  const maxTotal = Math.max(...sectors.map((s) => s.total));
  const hoveredData = sectors.find((s) => s.name === hoveredSector);

  const handleMouseEnter = (sector: SectorHeatmapItem, e: React.MouseEvent) => {
    setHoveredSector(sector.name);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const below = rect.top < 200;
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: below ? rect.bottom : rect.top,
      below,
    });
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-visible">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          섹터 히트맵
          <span className="text-xs opacity-60">({sectors.length}개 섹터)</span>
        </span>
        <span>{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Tooltip - fixed position */}
          {hoveredData && tooltipPos && (
            <div
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.below ? tooltipPos.y + 8 : tooltipPos.y - 8,
                transform: tooltipPos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
              }}
            >
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                <div className="font-medium text-sm">{hoveredData.name_kr} <span className="text-[var(--muted)] font-normal">({hoveredData.name})</span></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)]">종목 수</span>
                  <span className="font-medium">{hoveredData.total}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 font-medium">매수 {hoveredData.buy}</span>
                  <span className="text-red-400 font-medium">매도 {hoveredData.sell}</span>
                  <span className="text-[var(--muted)]">관망 {hoveredData.hold}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)]">평균 신뢰도</span>
                  <span className="font-medium">{hoveredData.avg_confidence.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)]">신호 강도</span>
                  <span className="font-medium">{(hoveredData.signal_strength * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[var(--muted)] pt-1 border-t border-[var(--card-border)]">
                  {hoveredData.tickers.slice(0, 6).join(", ")}
                  {hoveredData.tickers.length > 6 && ` +${hoveredData.tickers.length - 6}`}
                </div>
                {/* Arrow */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[var(--card)] border-[var(--card-border)]"
                  style={tooltipPos.below
                    ? { top: -4, borderTop: "1px solid", borderLeft: "1px solid" }
                    : { bottom: -4, borderRight: "1px solid", borderBottom: "1px solid" }
                  }
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sectors.map((sector) => {
              const buyRatio = sector.total > 0 ? sector.buy / sector.total : 0;
              const sellRatio = sector.total > 0 ? sector.sell / sector.total : 0;
              const holdRatio = sector.total > 0 ? sector.hold / sector.total : 0;
              const bgColor =
                buyRatio > 0.5
                  ? `rgba(34,197,94,${0.08 + buyRatio * 0.12})`
                  : sellRatio > 0.5
                    ? `rgba(239,68,68,${0.08 + sellRatio * 0.12})`
                    : "rgba(107,114,128,0.08)";
              const borderColor =
                buyRatio > 0.5
                  ? "rgba(34,197,94,0.3)"
                  : sellRatio > 0.5
                    ? "rgba(239,68,68,0.3)"
                    : "var(--card-border)";
              const isHovered = hoveredSector === sector.name;

              return (
                <div
                  key={sector.name}
                  className="rounded-lg p-3 cursor-default transition-colors"
                  style={{
                    backgroundColor: isHovered ? (buyRatio > 0.5 ? "rgba(34,197,94,0.15)" : sellRatio > 0.5 ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)") : bgColor,
                    border: `1px solid ${borderColor}`,
                  }}
                  onMouseEnter={(e) => handleMouseEnter(sector, e)}
                  onMouseLeave={() => { setHoveredSector(null); setTooltipPos(null); }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{sector.name_kr}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{sector.name}</div>
                    </div>
                    <span className="text-xs text-[var(--muted)] whitespace-nowrap mt-0.5">{sector.total}종목</span>
                  </div>

                  {/* BUY / SELL / HOLD 비율 바 */}
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5 bg-white/5">
                    {buyRatio > 0 && (
                      <div className="bg-green-500/70" style={{ width: `${buyRatio * 100}%` }} />
                    )}
                    {holdRatio > 0 && (
                      <div className="bg-gray-500/40" style={{ width: `${holdRatio * 100}%` }} />
                    )}
                    {sellRatio > 0 && (
                      <div className="bg-red-500/70" style={{ width: `${sellRatio * 100}%` }} />
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {sector.buy > 0 && <span className="text-green-400">{sector.buy}B</span>}
                      {sector.sell > 0 && <span className="text-red-400">{sector.sell}S</span>}
                      {sector.hold > 0 && <span className="text-[var(--muted)]">{sector.hold}H</span>}
                    </div>
                    <span className="text-[var(--muted)]">{sector.avg_confidence.toFixed(0)}%</span>
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

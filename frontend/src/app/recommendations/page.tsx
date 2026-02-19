"use client";

import { Fragment, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchRecommendations, fetchScore, fetchFinancials, saveAnalysisAPI, fetchPaperAccounts, createPaperAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { SparklineChart } from "@/components/charts/sparkline-chart";
import { useLivePrices } from "@/hooks/use-live-prices";
import { OrderModal } from "@/components/paper-trading/order-modal";
import { formatPrice } from "@/lib/format";

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

  // Paper trading state
  const [orderTarget, setOrderTarget] = useState<any>(null);
  const [paperAccountId, setPaperAccountId] = useState<number | null>(null);
  const [paperCashBalance, setPaperCashBalance] = useState<number | undefined>(undefined);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  const handlePaperBuy = async (rec: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    // Get or create paper account
    try {
      let accId = paperAccountId;
      if (!accId) {
        const accounts = await fetchPaperAccounts();
        if (accounts.length > 0) {
          accId = accounts[0].id;
          setPaperCashBalance(accounts[0].cash_balance);
        } else {
          const newAcc = await createPaperAccount({ name: "기본 계좌" });
          accId = newAcc.id;
          setPaperCashBalance(newAcc.cash_balance ?? 100_000_000);
        }
        setPaperAccountId(accId);
      }
      setOrderTarget({ ...rec, accountId: accId });
    } catch (err: any) {
      if (err?.message?.includes("401")) {
        router.push("/auth/login");
      }
    }
  };

  const handleSave = async (rec: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    setSavingTicker(rec.ticker);
    setSaveError(null);
    try {
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

      {isLoading ? (
        <div className="text-[var(--muted)]">로딩 중...</div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {data?.data?.length === 0 && (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
                추천 데이터가 없습니다. 파이프라인을 실행해주세요.
              </div>
            )}
            {data?.data?.map((rec: any, i: number) => {
              const lp = prices.get(rec.ticker);
              const expectedPct = rec.current_price > 0 && rec.target_price
                ? ((rec.target_price - rec.current_price) / rec.current_price * 100)
                : null;
              return (
                <div
                  key={i}
                  className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline">
                      <span className="font-medium">{rec.name}</span>
                      <span className="text-[var(--muted)] text-sm ml-1">({rec.ticker})</span>
                    </Link>
                    <div className="flex items-center gap-2">
                      {rec.action === "BUY" && (
                        <button
                          onClick={(e) => handlePaperBuy(rec, e)}
                          className="px-2 py-1 rounded text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                          title="모의 매수"
                        >
                          {buySuccess === rec.ticker ? "완료!" : "모의매수"}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleSave(rec, e)}
                        disabled={savingTicker === rec.ticker}
                        className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        title="내 분석 기록에 저장"
                      >
                        {savingTicker === rec.ticker ? (
                          <svg className="w-4 h-4 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : saveError === rec.ticker ? (
                          <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        ) : savedTickers.has(rec.ticker) ? (
                          <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        ) : (
                          <svg className="w-4 h-4 text-[var(--muted)]" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
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
                  <th className="p-4">추천대비</th>
                  <th className="p-4">판정</th>
                  <th className="p-4">신뢰도</th>
                  <th className="p-4">목표가</th>
                  <th className="p-4">기대수익</th>
                  <th className="p-4">손절가</th>
                  <th className="p-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {data?.data?.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-[var(--muted)]">
                      추천 데이터가 없습니다. 파이프라인을 실행해주세요.
                    </td>
                  </tr>
                )}
                {data?.data?.map((rec: any, i: number) => {
                  const lp = prices.get(rec.ticker);
                  return (
                    <Fragment key={i}>
                      <tr
                        className="border-b border-[var(--card-border)] hover:bg-white/5 cursor-pointer"
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                      >
                        <td className="p-4 text-[var(--muted)]">
                          <span className="text-xs transition-transform inline-block" style={{ transform: expandedRow === i ? "rotate(90deg)" : "none" }}>&#9654;</span>
                        </td>
                        <td className="p-4 font-medium">
                          <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {rec.name} <span className="text-[var(--muted)] text-sm">({rec.ticker})</span>
                          </Link>
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
                          <div className="flex items-center gap-1">
                            {rec.action === "BUY" && (
                              <button
                                onClick={(e) => handlePaperBuy(rec, e)}
                                className="px-2 py-1 rounded text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                                title="모의 매수"
                              >
                                {buySuccess === rec.ticker ? "완료!" : "모의매수"}
                              </button>
                            )}
                            <button
                              onClick={(e) => handleSave(rec, e)}
                              disabled={savingTicker === rec.ticker}
                              className="p-1.5 rounded hover:bg-white/10 transition-colors"
                              title="내 분석 기록에 저장"
                            >
                              {savingTicker === rec.ticker ? (
                                <svg className="w-4 h-4 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              ) : saveError === rec.ticker ? (
                                <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              ) : savedTickers.has(rec.ticker) ? (
                                <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                              ) : (
                                <svg className="w-4 h-4 text-[var(--muted)]" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                              )}
                            </button>
                          </div>
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

      {/* Paper Trading Order Modal */}
      {orderTarget && (
        <OrderModal
          isOpen={!!orderTarget}
          onClose={() => setOrderTarget(null)}
          onSuccess={() => {
            setBuySuccess(orderTarget.ticker);
            setTimeout(() => setBuySuccess(null), 2000);
          }}
          accountId={orderTarget.accountId}
          ticker={orderTarget.ticker}
          name={orderTarget.name}
          market={orderTarget.market}
          price={orderTarget.current_price}
          cashBalance={paperCashBalance}
          source="recommendation"
          recommendationId={orderTarget.id}
          recommendationAction={orderTarget.action}
          recommendationConfidence={orderTarget.confidence}
          recommendationGrade={orderTarget.grade}
        />
      )}
    </div>
  );
}

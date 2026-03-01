"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { fetchFinancials, fetchScore, saveAnalysisAPI, RateLimitError, getAnalysisRemaining, getAnalysisResetSeconds, togglePinAnalysis, fetchSavedAnalysis } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/lib/format";
import { AdUnit } from "@/components/ads/ad-unit";

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}

function formatPercent(n: number | null | undefined): string {
  if (n == null) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function formatResetTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return "1분 이내";
}

// --- Grade badge ---
function GradeBadge({ grade }: { grade: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    "A+": { bg: "rgba(34,197,94,0.25)", text: "#4ade80" },
    A: { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
    "B+": { bg: "rgba(59,130,246,0.2)", text: "#60a5fa" },
    B: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" },
    C: { bg: "rgba(234,179,8,0.2)", text: "#facc15" },
    D: { bg: "rgba(249,115,22,0.2)", text: "#fb923c" },
    F: { bg: "rgba(239,68,68,0.2)", text: "#f87171" },
  };
  const c = colorMap[grade] || colorMap.C;
  return (
    <span
      className="px-3 py-1.5 rounded-lg text-lg font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {grade}
    </span>
  );
}

// --- Signal badge ---
function SignalBadge({ signal, strength }: { signal?: string; strength?: number }) {
  const color = signal === "BUY" ? "green" : signal === "SELL" ? "red" : "yellow";
  const label = signal === "BUY" ? "매수" : signal === "SELL" ? "매도" : "관망";
  return (
    <div className="flex items-center gap-2">
      <span
        className="px-2 py-1 rounded text-sm font-medium"
        style={{
          backgroundColor:
            color === "green" ? "rgba(34,197,94,0.2)" : color === "red" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
          color: color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#facc15",
        }}
      >
        {label}
      </span>
      {strength !== undefined && (
        <span className="text-sm text-[var(--muted)]">강도: {(Math.abs(strength) * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}

function RateLimitBanner({ onLogin, resetSeconds }: { onLogin: () => void; resetSeconds: number | null }) {
  const [timeLeft, setTimeLeft] = useState(resetSeconds ?? 0);

  useEffect(() => {
    if (resetSeconds != null) setTimeLeft(resetSeconds);
  }, [resetSeconds]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [timeLeft > 0]);

  return (
    <div className="max-w-lg mx-auto mt-20 bg-[var(--card)] border border-amber-500/30 rounded-lg p-6 text-center space-y-3">
      <div className="text-amber-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold">무료 분석 횟수를 모두 사용했습니다</h3>
      {timeLeft > 0 && (
        <p className="text-sm text-amber-400 font-medium">
          {formatResetTime(timeLeft)} 후 충전
        </p>
      )}
      <p className="text-sm text-[var(--muted)]">로그인하면 무제한 분석이 가능합니다.</p>
      <button
        onClick={onLogin}
        className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
      >
        Google로 로그인
      </button>
    </div>
  );
}

function ResetCountdown({ initialSeconds }: { initialSeconds: number }) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);

  useEffect(() => {
    setTimeLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [timeLeft > 0]);

  return (
    <span className="text-amber-400 text-xs font-medium">
      {formatResetTime(timeLeft)} 후 충전 · <span className="text-[var(--muted)]">로그인하면 무제한</span>
    </span>
  );
}

export default function AnalysisPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const searchParams = useSearchParams();
  const market = searchParams.get("market") || "KOSPI";
  const queryClient = useQueryClient();
  const { isAuthenticated, login } = useAuth();

  const [pinned, setPinned] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [resetSeconds, setResetSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedAnalysis(ticker).then((res: any) => setPinned(!!res?.is_pinned)).catch(() => setPinned(false));
    }
  }, [ticker, isAuthenticated]);

  const financials = useQuery({
    queryKey: ["financials", ticker, market],
    queryFn: () => fetchFinancials(ticker, market),
    enabled: !!ticker && !rateLimited,
    retry: (count, error) => !(error instanceof RateLimitError) && count < 2,
  });

  const score = useQuery({
    queryKey: ["score", ticker, market],
    queryFn: () => fetchScore(ticker, market),
    enabled: !!ticker && !rateLimited,
    retry: (count, error) => !(error instanceof RateLimitError) && count < 2,
  });

  // Track rate limit errors
  useEffect(() => {
    const err = financials.error || score.error;
    if (err instanceof RateLimitError) {
      setRateLimited(true);
      setRemaining(0);
      setResetSeconds(err.resetSeconds);
    } else {
      const r = getAnalysisRemaining();
      if (r !== null) setRemaining(r);
      const rs = getAnalysisResetSeconds();
      if (rs !== null) setResetSeconds(rs);
    }
  }, [financials.error, score.error, financials.data, score.data]);

  const fin = financials.data?.data;
  const sc = score.data?.data;
  const isLoading = financials.isLoading || score.isLoading;

  // Derived values from score
  const details = sc?.details;
  const indicators = sc?.indicators;

  // Auto-save analysis to DB when logged in and data is loaded
  const [analysisSaved, setAnalysisSaved] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || !sc || !ticker || isLoading) return;
    setAnalysisSaved(false);
    saveAnalysisAPI({
      ticker,
      name: fin?.name || ticker,
      market,
      signal: sc.signal,
      grade: sc.grade,
      confidence: sc.confidence?.final ?? 0,
      current_price: sc.current_price ?? 0,
      total_score: sc.total_score ?? 0,
      score_data: sc,
      financials_data: fin ?? {},
    })
      .then(() => setAnalysisSaved(true))
      .catch(() => {});
  }, [isAuthenticated, sc, ticker, market, isLoading]);

  if (rateLimited) {
    return <RateLimitBanner onLogin={() => login("google")} resetSeconds={resetSeconds} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[var(--muted)]">{ticker} 분석 중...</p>
        </div>
      </div>
    );
  }

  const hasError = financials.error || score.error;
  if (hasError && !rateLimited) {
    return (
      <div className="max-w-lg mx-auto mt-20 bg-[var(--card)] border border-red-500/30 rounded-lg p-6 text-center space-y-3">
        <div className="text-red-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">분석 데이터를 불러올 수 없습니다</h3>
        <p className="text-sm text-[var(--muted)]">종목 코드({ticker})를 확인해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {fin?.name || sc?.name || ticker} 기술적 분석
          <span className="text-sm text-[var(--muted)] ml-2">({ticker}) {market}</span>
        </h1>
        <div className="flex items-center gap-2">
          {isAuthenticated && analysisSaved && !isLoading && (
            <span className="flex items-center text-xs text-green-400 whitespace-nowrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              저장됨
            </span>
          )}
        </div>
      </div>

      {/* Rate limit badge for anonymous users */}
      {!isAuthenticated && remaining !== null && !rateLimited && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            remaining === 0 ? "bg-amber-500/15 text-amber-400" : "bg-blue-600/15 text-blue-400"
          }`}>
            오늘 {remaining}/5회 남음
          </span>
          {remaining === 0 && resetSeconds != null && resetSeconds > 0 ? (
            <ResetCountdown initialSeconds={resetSeconds} />
          ) : (
            <span>로그인하면 무제한 분석</span>
          )}
        </div>
      )}

      {/* ====== Overall Verdict ====== */}
      {sc && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">종합 판정</h2>
            {isAuthenticated && analysisSaved && (
              <button
                onClick={async () => {
                  if (pinLoading) return;
                  setPinLoading(true);
                  try {
                    const res = await togglePinAnalysis(ticker);
                    setPinned(res.is_pinned);
                    queryClient.invalidateQueries({ queryKey: ["pinned-analyses"] });
                    queryClient.invalidateQueries({ queryKey: ["saved-analyses"] });
                  } finally {
                    setPinLoading(false);
                  }
                }}
                disabled={pinLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pinned
                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                    : "bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] hover:text-amber-400 hover:border-amber-500/50"
                }`}
              >
                {pinLoading ? "..." : pinned ? "\u{1F4CC} 핀 해제" : "\u{1F4CC} 핀 고정"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
            {/* Signal + Grade */}
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">신호</span>
              <span
                className="px-4 py-2 rounded-lg text-lg font-bold"
                style={{
                  backgroundColor:
                    sc.signal === "BUY" ? "rgba(34,197,94,0.2)" : sc.signal === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
                  color: sc.signal === "BUY" ? "#4ade80" : sc.signal === "SELL" ? "#f87171" : "#facc15",
                }}
              >
                {sc.signal === "BUY" ? "매수" : sc.signal === "SELL" ? "매도" : "관망"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">등급</span>
              <GradeBadge grade={sc.grade} />
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">신뢰도</span>
              <span className="text-lg font-bold">{sc.confidence.final.toFixed(0)}%</span>
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">
                {sc.signal === "SELL" ? "재매수 검토가" : "매수 추천가"}
              </span>
              <span className="text-lg font-bold text-blue-400">{formatPrice(sc.entry_price?.consensus, market)}</span>
              {sc.entry_price?.discount_pct > 0 && (
                <span className="text-xs text-[var(--muted)]">-{sc.entry_price.discount_pct}%</span>
              )}
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">목표가</span>
              <span className="text-lg font-bold text-green-400">{formatPrice(sc.target.consensus, market)}</span>
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">손절가</span>
              <span className="text-lg font-bold text-red-400">{formatPrice(sc.stop_loss.final, market)}</span>
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-xs text-[var(--muted)]">R:R 비율</span>
              <span
                className="text-lg font-bold"
                style={{ color: (sc.risk_reward_ratio ?? 0) >= 1.5 ? "#4ade80" : (sc.risk_reward_ratio ?? 0) >= 1.0 ? "#facc15" : "#f87171" }}
              >
                {sc.risk_reward_ratio != null ? `${sc.risk_reward_ratio}:1` : "-"}
              </span>
            </div>
          </div>

          {/* Confidence breakdown */}
          {sc.confidence.adjustments?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
              <p className="text-xs text-[var(--muted)] mb-2">
                신뢰도 조정 내역
                <span className="ml-2 text-[var(--foreground)]">
                  기본 {sc.confidence.base.toFixed(0)}% → 최종 {sc.confidence.final.toFixed(0)}%
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {sc.confidence.adjustments.map((a: { factor: string; delta: string }, i: number) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: a.delta.startsWith("+") ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      color: a.delta.startsWith("+") ? "#4ade80" : "#f87171",
                    }}
                  >
                    {a.factor} {a.delta}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Entry price methods */}
          {sc.entry_price?.methods?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
              <p className="text-xs text-[var(--muted)] mb-2">
                {sc.signal === "SELL" ? "재매수 검토가 산출 근거" : "매수 추천가 산출 근거"}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {sc.entry_price.methods.map((m: { method: string; price: number; rationale: string }, i: number) => (
                  <div key={i} className="text-xs px-3 py-2 rounded bg-[var(--background)]">
                    <span className="text-blue-400 font-medium">{m.method}</span>
                    <p className="font-medium mt-0.5">{formatPrice(m.price, market)}</p>
                    <p className="text-[var(--muted)] mt-0.5">{m.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target methods */}
          {sc.target.methods?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
              <p className="text-xs text-[var(--muted)] mb-2">목표가 산출 근거</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {sc.target.methods.map((m: { method: string; price: number }, i: number) => (
                  <div key={i} className="text-xs px-3 py-2 rounded bg-[var(--background)]">
                    <span className="text-[var(--muted)]">{m.method}</span>
                    <p className="font-medium mt-0.5">{formatPrice(m.price, market)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== Analysis Summary ====== */}
      {sc?.summary && sc.summary.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">분석 요약</h2>
          <div className="space-y-2 text-sm leading-relaxed">
            {sc.summary.map((line: string, i: number) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* ====== Company Info + Key Metrics ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">기업 정보</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">종목명</span>
              <span className="font-medium">{fin?.name || ticker}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">섹터</span>
              <span>{fin?.sector || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">산업</span>
              <span>{fin?.industry || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">시가총액</span>
              <span>{formatNumber(fin?.market_cap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">현재가</span>
              <span className="font-medium">
                {formatPrice(fin?.current_price, market)}
                {fin?.change_pct != null && (
                  <span className={`ml-2 ${fin.change_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fin.change_pct >= 0 ? "+" : ""}{fin.change_pct}%
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">52주 최고</span>
              <span>{formatPrice(fin?.["52w_high"], market)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">52주 최저</span>
              <span>{formatPrice(fin?.["52w_low"], market)}</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">핵심 지표</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">PER (TTM)</span>
              <span>{fin?.pe_ratio?.toFixed(1) ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">PER (Forward)</span>
              <span>{fin?.forward_pe?.toFixed(1) ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">PBR</span>
              <span>{fin?.pb_ratio?.toFixed(2) ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">ROE</span>
              <span>{formatPercent(fin?.roe)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">배당률</span>
              <span>{fin?.dividend_yield != null ? `${fin.dividend_yield.toFixed(2)}%` : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">부채비율</span>
              <span>{fin?.debt_to_equity != null ? `${fin.debt_to_equity.toFixed(2)}` : "-"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Indicators: RSI / ATR / Trend / EMA ====== */}
      {indicators && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">RSI (14)</p>
            <p
              className="text-2xl font-bold"
              style={{
                color:
                  indicators.rsi < 30 ? "#4ade80" : indicators.rsi > 70 ? "#f87171" : "var(--foreground)",
              }}
            >
              {indicators.rsi.toFixed(1)}
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">
              {indicators.rsi < 30 ? "과매도" : indicators.rsi > 70 ? "과매수" : "중립"}
            </p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">ATR (14)</p>
            <p className="text-2xl font-bold">{formatPrice(indicators.atr, market)}</p>
            <p className="text-xs text-[var(--muted)] mt-1">변동성 {indicators.atr_pct.toFixed(1)}%</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">추세</p>
            <p
              className="text-2xl font-bold"
              style={{
                color:
                  indicators.trend.direction === "uptrend" ? "#4ade80" : indicators.trend.direction === "downtrend" ? "#f87171" : "#facc15",
              }}
            >
              {indicators.trend.direction === "uptrend" ? "상승" : indicators.trend.direction === "downtrend" ? "하락" : "횡보"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">강도 {(indicators.trend.strength * 100).toFixed(0)}%</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--muted)] mb-1">EMA 위치</p>
            <p className="text-sm font-medium">
              <span style={{ color: indicators.trend.price_vs_ema20_pct >= 0 ? "#4ade80" : "#f87171" }}>
                EMA20: {indicators.trend.price_vs_ema20_pct > 0 ? "+" : ""}{indicators.trend.price_vs_ema20_pct}%
              </span>
            </p>
            <p className="text-sm font-medium mt-1">
              <span style={{ color: indicators.trend.price_vs_ema50_pct >= 0 ? "#4ade80" : "#f87171" }}>
                EMA50: {indicators.trend.price_vs_ema50_pct > 0 ? "+" : ""}{indicators.trend.price_vs_ema50_pct}%
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ====== Candlestick Chart ====== */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <CandlestickChart ticker={ticker} market={market} name={fin?.name} />
      </div>

      {/* ====== Financial Summary Table ====== */}
      {fin?.fiscal_years && fin.fiscal_years.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">재무 요약</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="text-left py-2 text-[var(--muted)]">항목</th>
                  {fin.fiscal_years.map((y: string) => (
                    <th key={y} className="text-right py-2 text-[var(--muted)]">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--card-border)]">
                  <td className="py-2">매출</td>
                  {fin.revenue.map((v: number | null, i: number) => (
                    <td key={i} className="text-right py-2">{formatNumber(v)}</td>
                  ))}
                </tr>
                <tr className="border-b border-[var(--card-border)]">
                  <td className="py-2">영업이익</td>
                  {fin.operating_income.map((v: number | null, i: number) => (
                    <td key={i} className="text-right py-2">{formatNumber(v)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2">순이익</td>
                  {fin.net_income.map((v: number | null, i: number) => (
                    <td key={i} className="text-right py-2">{formatNumber(v)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== Signal Breakdown ====== */}
      {sc?.signal_breakdown && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">신호 구성</h2>
          <div className="space-y-3">
            {Object.entries(sc.signal_breakdown).map(([key, val]: [string, any]) => {
              const labelMap: Record<string, string> = {
                candlestick: "캔들스틱 패턴",
                chart_pattern: "차트 패턴",
                support_resistance: "지지/저항선",
                volume: "거래량",
                trend: "추세 (EMA)",
                rsi: "RSI",
              };
              const pct = Math.abs(val.contribution) * 100;
              const dir = val.strength > 0 ? "BUY" : val.strength < 0 ? "SELL" : "HOLD";
              const barColor = dir === "BUY" ? "#4ade80" : dir === "SELL" ? "#f87171" : "#6b7280";
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{labelMap[key] || key}</span>
                    <span className="text-[var(--muted)]">
                      가중치 {(val.weight * 100).toFixed(0)}% | 강도 {(Math.abs(val.strength) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-[var(--background)] rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(pct * 10, 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-[var(--card-border)] flex justify-between text-sm font-medium">
              <span>종합 점수</span>
              <span style={{ color: sc.total_score > 0 ? "#4ade80" : sc.total_score < 0 ? "#f87171" : "var(--foreground)" }}>
                {sc.total_score > 0 ? "+" : ""}{(sc.total_score * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ====== Technical Analysis Details Grid ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Candlestick Patterns */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">캔들스틱 패턴</h2>
          <SignalBadge signal={details?.candlestick?.signal} strength={details?.candlestick?.strength} />
          <div className="mt-3 space-y-1">
            {details?.candlestick?.patterns?.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{p.pattern_korean || p.pattern_name}</span>
                <span className="text-[var(--muted)]">{p.confidence}%</span>
              </div>
            ))}
            {(!details?.candlestick?.patterns || details.candlestick.patterns.length === 0) && (
              <p className="text-sm text-[var(--muted)]">감지된 패턴 없음</p>
            )}
          </div>
        </div>

        {/* Chart Patterns */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">차트 패턴</h2>
          <SignalBadge signal={details?.chart_pattern?.signal} strength={details?.chart_pattern?.strength} />
          <div className="mt-3 space-y-1">
            {details?.chart_pattern?.patterns?.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{p.pattern_korean || p.pattern_name}</span>
                <span className="text-[var(--muted)]">{p.confidence}%</span>
              </div>
            ))}
            {(!details?.chart_pattern?.patterns || details.chart_pattern.patterns.length === 0) && (
              <p className="text-sm text-[var(--muted)]">감지된 패턴 없음</p>
            )}
          </div>
        </div>

        {/* Support/Resistance */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">지지/저항선</h2>
          <SignalBadge signal={details?.support_resistance?.signal} strength={details?.support_resistance?.strength} />
          <div className="mt-3 space-y-2 text-sm">
            {details?.support_resistance?.nearest_support && (
              <div className="flex justify-between">
                <span className="text-green-400">지지선</span>
                <span>
                  {formatPrice(details.support_resistance.nearest_support, market)} ({details.support_resistance.support_distance_pct}%)
                </span>
              </div>
            )}
            {details?.support_resistance?.nearest_resistance && (
              <div className="flex justify-between">
                <span className="text-red-400">저항선</span>
                <span>
                  {formatPrice(details.support_resistance.nearest_resistance, market)} ({details.support_resistance.resistance_distance_pct}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Volume Analysis */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">거래량 분석</h2>
          <SignalBadge signal={details?.volume?.signal} strength={details?.volume?.strength} />
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>거래량 추세</span>
              <span>{details?.volume?.volume_trend || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>평균 대비</span>
              <span>{details?.volume?.current_vs_avg_ratio?.toFixed(2) || "-"}x</span>
            </div>
            <div className="flex justify-between">
              <span>OBV 신호</span>
              <span>{details?.volume?.obv_signal || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>이상 거래량</span>
              <span>{details?.volume?.abnormal_volume ? "Yes" : "No"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Fibonacci Levels ====== */}
      {indicators?.fibonacci?.levels && Object.keys(indicators.fibonacci.levels).length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3">피보나치 레벨</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-sm">
            {Object.entries(indicators.fibonacci.levels).map(([level, price]: [string, any]) => {
              const isExt = level.startsWith("ext_");
              const displayLevel = isExt ? level.replace("ext_", "") : level;
              const isNearPrice =
                sc?.current_price && Math.abs((price - sc.current_price) / sc.current_price) < 0.02;
              return (
                <div
                  key={level}
                  className="px-3 py-2 rounded"
                  style={{
                    backgroundColor: isNearPrice ? "rgba(59,130,246,0.2)" : "var(--background)",
                    border: isNearPrice ? "1px solid rgba(59,130,246,0.4)" : "none",
                  }}
                >
                  <span className="text-[var(--muted)]">
                    {isExt ? `확장 ${displayLevel}` : displayLevel}
                  </span>
                  <p className="font-medium mt-0.5">{formatPrice(price, market)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AdSense ad below analysis results -- anonymous only */}
      <AdUnit slot="analysis-bottom" className="mt-6" />
    </div>
  );
}

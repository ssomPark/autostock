"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { fetchAnalysis } from "@/lib/api";
import { CandlestickChart } from "@/components/charts/candlestick-chart";

export default function AnalysisPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const searchParams = useSearchParams();
  const market = searchParams.get("market") || "KOSPI";

  const { data, isLoading } = useQuery({
    queryKey: ["analysis", ticker, market],
    queryFn: () => fetchAnalysis(ticker, market),
  });

  if (isLoading) {
    return <div className="text-[var(--muted)]">분석 중...</div>;
  }

  const analysis = data?.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {analysis?.name || ticker} 기술적 분석
        <span className="text-sm text-[var(--muted)] ml-2">({ticker}) {market}</span>
      </h1>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <CandlestickChart ticker={ticker} market={market} name={analysis?.name} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Candlestick Analysis */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">캔들스틱 패턴</h2>
          <SignalBadge signal={analysis?.candlestick?.signal} strength={analysis?.candlestick?.strength} />
          <div className="mt-3 space-y-1">
            {analysis?.candlestick?.patterns?.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{p.pattern_korean || p.pattern_name}</span>
                <span className="text-[var(--muted)]">{p.confidence}%</span>
              </div>
            ))}
            {(!analysis?.candlestick?.patterns || analysis.candlestick.patterns.length === 0) && (
              <p className="text-sm text-[var(--muted)]">감지된 패턴 없음</p>
            )}
          </div>
        </div>

        {/* Chart Pattern Analysis */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">차트 패턴</h2>
          <SignalBadge signal={analysis?.chart_pattern?.signal} strength={analysis?.chart_pattern?.strength} />
          <div className="mt-3 space-y-1">
            {analysis?.chart_pattern?.patterns?.map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{p.pattern_korean || p.pattern_name}</span>
                <span className="text-[var(--muted)]">{p.confidence}%</span>
              </div>
            ))}
            {(!analysis?.chart_pattern?.patterns || analysis.chart_pattern.patterns.length === 0) && (
              <p className="text-sm text-[var(--muted)]">감지된 패턴 없음</p>
            )}
          </div>
        </div>

        {/* Support/Resistance Analysis */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">지지/저항선</h2>
          <SignalBadge signal={analysis?.support_resistance?.signal} strength={analysis?.support_resistance?.strength} />
          <div className="mt-3 space-y-2 text-sm">
            {analysis?.support_resistance?.nearest_support && (
              <div className="flex justify-between">
                <span className="text-green-400">지지선</span>
                <span>{analysis.support_resistance.nearest_support.toLocaleString()} ({analysis.support_resistance.support_distance_pct}%)</span>
              </div>
            )}
            {analysis?.support_resistance?.nearest_resistance && (
              <div className="flex justify-between">
                <span className="text-red-400">저항선</span>
                <span>{analysis.support_resistance.nearest_resistance.toLocaleString()} ({analysis.support_resistance.resistance_distance_pct}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Volume Analysis */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">거래량 분석</h2>
          <SignalBadge signal={analysis?.volume?.signal} strength={analysis?.volume?.strength} />
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>거래량 추세</span>
              <span>{analysis?.volume?.volume_trend || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>평균 대비</span>
              <span>{analysis?.volume?.current_vs_avg_ratio?.toFixed(2) || "-"}x</span>
            </div>
            <div className="flex justify-between">
              <span>OBV 신호</span>
              <span>{analysis?.volume?.obv_signal || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>이상 거래량</span>
              <span>{analysis?.volume?.abnormal_volume ? "Yes" : "No"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalBadge({ signal, strength }: { signal?: string; strength?: number }) {
  const color = signal === "BUY" ? "green" : signal === "SELL" ? "red" : "yellow";
  const label = signal === "BUY" ? "매수" : signal === "SELL" ? "매도" : "관망";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`px-2 py-1 rounded text-sm font-medium bg-${color}-500/20 text-${color}-400`}
        style={{
          backgroundColor: color === "green" ? "rgba(34,197,94,0.2)" : color === "red" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
          color: color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#facc15",
        }}
      >
        {label}
      </span>
      {strength !== undefined && (
        <span className="text-sm text-[var(--muted)]">
          강도: {(Math.abs(strength) * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { formatPrice } from "@/lib/format";
import { useWsPrices } from "@/hooks/use-ws-prices";

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
    <span className="px-3 py-1.5 rounded-lg text-lg font-bold" style={{ backgroundColor: c.bg, color: c.text }}>
      {grade}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AnalysisTab({ ticker, market, scoreData, isLoading }: { ticker: string; market: string; scoreData: any; isLoading: boolean }) {
  const sc = scoreData;

  const wsTickers = useMemo(() => [{ ticker, market }], [ticker, market]);
  const { prices: wsPrices, connected: wsConnected } = useWsPrices({ tickers: wsTickers });
  const livePrice = wsPrices[ticker];

  if (isLoading) {
    return <div className="text-center py-20 text-[var(--muted)]">분석 중...</div>;
  }

  if (!sc) {
    return <div className="text-center py-20 text-[var(--muted)]">분석 데이터를 불러올 수 없습니다.</div>;
  }

  const signals = sc.component_signals || {};
  const info = sc.stock_info || {};
  const confidenceVal = typeof sc.confidence === "object" ? sc.confidence?.final : sc.confidence;
  const entryPrice = typeof sc.entry_price === "object" ? sc.entry_price?.consensus : sc.entry_price;
  const stopLoss = typeof sc.stop_loss === "object" ? sc.stop_loss?.final : sc.stop_loss;

  return (
    <div className="space-y-4">
      {/* Overall Verdict */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">종합 판정</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs text-[var(--muted)] mb-1">신호</p>
            <span className={`text-lg font-bold ${
              sc.signal === "BUY" ? "text-green-400" : sc.signal === "SELL" ? "text-red-400" : "text-yellow-400"
            }`}>{sc.signal}</span>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--muted)] mb-1">등급</p>
            <GradeBadge grade={sc.grade} />
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--muted)] mb-1">종합 점수</p>
            <span className="text-lg font-bold">{sc.total_score?.toFixed(1)}</span>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--muted)] mb-1">신뢰도</p>
            <span className="text-lg font-bold">{confidenceVal ? `${Number(confidenceVal).toFixed(0)}%` : "-"}</span>
          </div>
        </div>

        {/* Targets */}
        {(entryPrice || sc.target_price || stopLoss) && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--card-border)]">
            <div className="text-center">
              <p className="text-xs text-[var(--muted)]">매수 추천가</p>
              <p className="font-medium">{entryPrice ? formatPrice(entryPrice) : "-"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--muted)]">목표가</p>
              <p className="font-medium text-green-400">{sc.target_price ? formatPrice(sc.target_price) : "-"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--muted)]">손절가</p>
              <p className="font-medium text-red-400">{stopLoss ? formatPrice(stopLoss) : "-"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      {info && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">핵심 지표</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">
                현재가
                {wsConnected && livePrice && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="실시간" />
                )}
              </p>
              <p className="font-medium">
                {livePrice ? formatPrice(livePrice.price) : formatPrice(sc.current_price || info.current_price)}
              </p>
              {livePrice && livePrice.change_pct !== 0 && (
                <p className={`text-xs ${livePrice.change_pct > 0 ? "text-green-400" : "text-red-400"}`}>
                  {livePrice.change_pct > 0 ? "+" : ""}{livePrice.change_pct.toFixed(2)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">RSI</p>
              <p className="font-medium">{sc.rsi?.toFixed(1) || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">ATR</p>
              <p className="font-medium">{sc.atr?.toFixed(2) || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">추세</p>
              <p className="font-medium">{sc.trend || "-"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3">차트</h2>
        <CandlestickChart ticker={ticker} market={market} />
      </div>

      {/* Signal Components */}
      {Object.keys(signals).length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">신호 구성</h2>
          <div className="space-y-2">
            {Object.entries(signals).map(([key, val]: [string, unknown]) => {
              const v = val as { signal?: string; weight?: number; weighted_score?: number };
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-[var(--muted)]">{key}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    v.signal === "BUY" ? "bg-green-500/20 text-green-400" :
                    v.signal === "SELL" ? "bg-red-500/20 text-red-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>{v.signal || "-"}</span>
                  <div className="flex-1 bg-[var(--surface-hover)] rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.abs((v.weighted_score || 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)]">w={v.weight}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

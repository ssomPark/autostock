"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchDashboardSummary } from "@/lib/api";
import { useLivePrices } from "@/hooks/use-live-prices";

function formatPrice(price: number | null | undefined): string {
  if (price == null || price === 0) return "-";
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function RecommendationList() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
  });

  const { prices, marketStatus, isAnyMarketOpen } = useLivePrices();

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
      <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
        <h2 className="font-semibold">최근 추천</h2>
        {marketStatus && (
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: marketStatus.KR.is_open ? "#4ade80" : "#6b7280" }}
              />
              KR
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: marketStatus.US.is_open ? "#4ade80" : "#6b7280" }}
              />
              US
            </span>
          </div>
        )}
      </div>
      <div className="p-2">
        {isLoading && <p className="text-[var(--muted)] p-2">로딩 중...</p>}
        {!isLoading && (!data?.data?.top_recommendations || data.data.top_recommendations.length === 0) && (
          <p className="text-[var(--muted)] text-sm p-2">
            추천 데이터가 없습니다. 파이프라인을 실행해주세요.
          </p>
        )}
        {data?.data?.top_recommendations?.map((rec: any, i: number) => {
          const actionColor = rec.action === "BUY" ? "#4ade80" : rec.action === "SELL" ? "#f87171" : "#facc15";
          const actionBg = rec.action === "BUY" ? "rgba(34,197,94,0.2)" : rec.action === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)";
          const actionLabel = rec.action === "BUY" ? "매수" : rec.action === "SELL" ? "매도" : "관망";

          const lp = prices.get(rec.ticker);
          const displayPrice = lp ? lp.live_price : rec.current_price;
          const changePct = lp ? lp.change_from_rec : null;

          return (
            <Link
              key={i}
              href={`/analysis/${rec.ticker}?market=${rec.market}`}
              className="block py-3 px-3 border-b border-[var(--card-border)] last:border-0 hover:bg-white/5 rounded"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rec.name}</span>
                  <span className="text-[var(--muted)] text-xs">{rec.ticker}</span>
                </div>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: actionBg, color: actionColor }}
                >
                  {actionLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                <div>
                  <span className="text-[var(--muted)]">{lp ? "실시간가" : "현재가"}</span>
                  <p className="font-medium mt-0.5">{formatPrice(displayPrice)}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">{lp ? "추천대비" : "기대수익"}</span>
                  <p className="font-medium mt-0.5">
                    {lp && changePct != null ? (
                      <span style={{ color: changePct >= 0 ? "#4ade80" : "#f87171" }}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                      </span>
                    ) : rec.current_price > 0 && rec.target_price ? (() => {
                      const pct = ((rec.target_price - rec.current_price) / rec.current_price * 100);
                      return <span style={{ color: pct >= 0 ? "#4ade80" : "#f87171" }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                    })() : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">신뢰도</span>
                  <p className="font-medium mt-0.5">{rec.confidence != null ? `${(rec.confidence * 100).toFixed(0)}%` : "-"}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">목표가</span>
                  <p className="font-medium mt-0.5" style={{ color: "#4ade80" }}>{formatPrice(rec.target_price)}</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">손절가</span>
                  <p className="font-medium mt-0.5" style={{ color: "#f87171" }}>{formatPrice(rec.stop_loss)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

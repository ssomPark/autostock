"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchDashboardSummary } from "@/lib/api";

export function RecommendationList() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
  });

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
      <div className="p-4 border-b border-[var(--card-border)]">
        <h2 className="font-semibold">최근 추천</h2>
      </div>
      <div className="p-4">
        {isLoading && <p className="text-[var(--muted)]">로딩 중...</p>}
        {!isLoading && (!data?.data?.top_recommendations || data.data.top_recommendations.length === 0) && (
          <p className="text-[var(--muted)] text-sm">
            추천 데이터가 없습니다. 파이프라인을 실행해주세요.
          </p>
        )}
        {data?.data?.top_recommendations?.map((rec: any, i: number) => (
          <Link
            key={i}
            href={`/analysis/${rec.ticker}?market=${rec.market}`}
            className="flex items-center justify-between py-3 border-b border-[var(--card-border)] last:border-0 hover:bg-white/5 px-2 rounded"
          >
            <div>
              <span className="font-medium">{rec.name}</span>
              <span className="text-[var(--muted)] text-sm ml-2">{rec.ticker}</span>
            </div>
            <span
              className="px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: rec.action === "BUY" ? "rgba(34,197,94,0.2)" : rec.action === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)",
                color: rec.action === "BUY" ? "#4ade80" : rec.action === "SELL" ? "#f87171" : "#facc15",
              }}
            >
              {rec.action === "BUY" ? "매수" : rec.action === "SELL" ? "매도" : "관망"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

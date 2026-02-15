"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchRecommendations } from "@/lib/api";
import { SparklineChart } from "@/components/charts/sparkline-chart";

export default function RecommendationsPage() {
  const [market, setMarket] = useState("all");
  const [action, setAction] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["recommendations", market, action],
    queryFn: () => fetchRecommendations({ market, action }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">투자 추천</h1>
        <div className="flex gap-2">
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
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                <th className="p-4">종목</th>
                <th className="p-4">차트</th>
                <th className="p-4">현재가</th>
                <th className="p-4">판정</th>
                <th className="p-4">신뢰도</th>
                <th className="p-4">목표가</th>
                <th className="p-4">기대수익</th>
                <th className="p-4">손절가</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--muted)]">
                    추천 데이터가 없습니다. 파이프라인을 실행해주세요.
                  </td>
                </tr>
              )}
              {data?.data?.map((rec: any, i: number) => (
                <tr key={i} className="border-b border-[var(--card-border)] hover:bg-white/5 cursor-pointer">
                  <td className="p-4 font-medium">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline">
                      {rec.name} <span className="text-[var(--muted)] text-sm">({rec.ticker})</span>
                    </Link>
                  </td>
                  <td className="p-4">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`}>
                      <SparklineChart ticker={rec.ticker} market={rec.market} width={120} height={48} />
                    </Link>
                  </td>
                  <td className="p-4">{rec.current_price?.toLocaleString()}</td>
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
                  <td className="p-4">{(rec.confidence * 100).toFixed(0)}%</td>
                  <td className="p-4" style={{ color: "#4ade80" }}>{rec.target_price?.toLocaleString() ?? "-"}</td>
                  <td className="p-4">
                    {rec.current_price > 0 && rec.target_price ? (() => {
                      const pct = ((rec.target_price - rec.current_price) / rec.current_price * 100);
                      const color = pct >= 0 ? "#4ade80" : "#f87171";
                      return <span style={{ color, fontWeight: 500 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
                    })() : "-"}
                  </td>
                  <td className="p-4" style={{ color: "#f87171" }}>{rec.stop_loss?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecommendations } from "@/lib/api";

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
                <th className="p-4">시장</th>
                <th className="p-4">현재가</th>
                <th className="p-4">판정</th>
                <th className="p-4">신뢰도</th>
                <th className="p-4">목표가</th>
                <th className="p-4">손절가</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[var(--muted)]">
                    추천 데이터가 없습니다. 파이프라인을 실행해주세요.
                  </td>
                </tr>
              )}
              {data?.data?.map((rec: any, i: number) => (
                <tr key={i} className="border-b border-[var(--card-border)] hover:bg-white/5">
                  <td className="p-4 font-medium">
                    {rec.name} <span className="text-[var(--muted)] text-sm">({rec.ticker})</span>
                  </td>
                  <td className="p-4 text-sm">{rec.market}</td>
                  <td className="p-4">{rec.current_price?.toLocaleString()}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded text-sm font-medium ${
                        rec.action === "BUY"
                          ? "bg-green-500/20 text-green-400"
                          : rec.action === "SELL"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {rec.action === "BUY" ? "매수" : rec.action === "SELL" ? "매도" : "관망"}
                    </span>
                  </td>
                  <td className="p-4">{(rec.confidence * 100).toFixed(0)}%</td>
                  <td className="p-4">{rec.target_price?.toLocaleString() ?? "-"}</td>
                  <td className="p-4">{rec.stop_loss?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

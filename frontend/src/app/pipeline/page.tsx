"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchPipelineStatus, triggerPipeline } from "@/lib/api";

export default function PipelinePage() {
  const [market, setMarket] = useState("KR");

  const { data: status } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 5000,
  });

  const mutation = useMutation({
    mutationFn: (mkt: string) => triggerPipeline(mkt),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">파이프라인 관리</h1>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">파이프라인 실행</h2>
        <div className="flex gap-3 mb-4">
          {["KR", "US"].map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-4 py-2 rounded ${
                market === m ? "bg-blue-600 text-white" : "bg-[var(--background)] border border-[var(--card-border)]"
              }`}
            >
              {m === "KR" ? "한국 시장" : "미국 시장"}
            </button>
          ))}
        </div>
        <button
          onClick={() => mutation.mutate(market)}
          disabled={mutation.isPending}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium"
        >
          {mutation.isPending ? "실행 중..." : `${market} 파이프라인 실행`}
        </button>
        {mutation.isSuccess && (
          <p className="mt-3 text-green-400 text-sm">파이프라인이 시작되었습니다.</p>
        )}
      </div>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">현재 상태</h2>
        <div className="text-[var(--muted)]">
          {status?.data?.status === "running" ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              <span>파이프라인 실행 중...</span>
            </div>
          ) : (
            <span>대기 중</span>
          )}
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">일일 스케줄 (KST)</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-[var(--card-border)]">
            <span>06:00</span>
            <span>한국시장 파이프라인 (뉴스 → 분석 → 추천)</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[var(--card-border)]">
            <span>07:00</span>
            <span>한국시장 추천 완료 (09:00 개장 전)</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[var(--card-border)]">
            <span>21:00</span>
            <span>미국시장 파이프라인 시작</span>
          </div>
          <div className="flex justify-between py-2">
            <span>21:30</span>
            <span>미국시장 추천 완료 (23:30 개장 전)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

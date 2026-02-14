"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPipelineStatus } from "@/lib/api";

export function PipelineStatus() {
  const { data } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: 10000,
  });

  const status = data?.data?.status || "idle";

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-sm text-[var(--muted)]">파이프라인</p>
      <div className="flex items-center gap-2 mt-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            status === "running" ? "bg-blue-500 animate-pulse" : status === "completed" ? "bg-green-500" : "bg-[var(--muted)]"
          }`}
        />
        <span className="text-lg font-semibold">
          {status === "running" ? "실행 중" : status === "completed" ? "완료" : "대기"}
        </span>
      </div>
    </div>
  );
}

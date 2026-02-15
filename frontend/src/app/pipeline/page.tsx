"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { triggerPipeline, subscribePipelineStream, fetchPipelineStatus } from "@/lib/api";

interface StepState {
  id: string;
  name: string;
  icon: string;
  status: "pending" | "running" | "completed" | "failed";
  duration: number | null;
  summary: string | null;
}

interface PipelineState {
  pipeline_id: string | null;
  market: string | null;
  status: "idle" | "running" | "completed" | "failed";
  current_step: string | null;
  started_at: number | null;
  elapsed_seconds: number;
  steps: StepState[];
  logs: string[];
  keepalive?: boolean;
}

const DEFAULT_STEPS: StepState[] = [
  { id: "news", name: "뉴스 수집", icon: "📰", status: "pending", duration: null, summary: null },
  { id: "keywords", name: "키워드 추출", icon: "🔑", status: "pending", duration: null, summary: null },
  { id: "screening", name: "종목 스크리닝", icon: "🔍", status: "pending", duration: null, summary: null },
  { id: "analysis", name: "기술적 분석", icon: "📊", status: "pending", duration: null, summary: null },
  { id: "recommendation", name: "투자 추천 생성", icon: "💡", status: "pending", duration: null, summary: null },
  { id: "save", name: "저장 및 알림", icon: "💾", status: "pending", duration: null, summary: null },
];

function StepIndicator({ step, index, total }: { step: StepState; index: number; total: number }) {
  const statusStyles = {
    pending: "bg-[var(--card-border)] text-[var(--muted)]",
    running: "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-[var(--background)]",
    completed: "bg-emerald-600 text-white",
    failed: "bg-red-600 text-white",
  };

  const lineStyles = {
    pending: "bg-[var(--card-border)]",
    running: "bg-[var(--card-border)]",
    completed: "bg-emerald-600",
    failed: "bg-red-600",
  };

  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${statusStyles[step.status]}`}
        >
          {step.status === "running" ? (
            <span className="animate-spin text-sm">⏳</span>
          ) : step.status === "completed" ? (
            "✓"
          ) : step.status === "failed" ? (
            "✗"
          ) : (
            <span className="text-sm">{index + 1}</span>
          )}
        </div>
        <span className="text-xs text-center w-20 truncate" title={step.name}>
          {step.icon} {step.name}
        </span>
        {step.duration != null && (
          <span className="text-[10px] text-[var(--muted)]">{step.duration}s</span>
        )}
      </div>
      {index < total - 1 && (
        <div
          className={`w-8 h-0.5 mx-1 mt-[-20px] transition-colors duration-300 ${lineStyles[step.status]}`}
        />
      )}
    </div>
  );
}

function LogPanel({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="bg-black/50 border border-[var(--card-border)] rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-[var(--muted)]">파이프라인을 실행하면 로그가 표시됩니다...</p>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="py-0.5 text-[var(--foreground)] opacity-90">
            {log}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function ResultSummary({ state }: { state: PipelineState }) {
  if (state.status !== "completed" && state.status !== "failed") return null;

  const completedSteps = state.steps.filter((s) => s.status === "completed");
  const totalDuration = completedSteps.reduce((acc, s) => acc + (s.duration ?? 0), 0);

  return (
    <div
      className={`border rounded-lg p-5 ${
        state.status === "completed"
          ? "bg-emerald-950/30 border-emerald-800"
          : "bg-red-950/30 border-red-800"
      }`}
    >
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        {state.status === "completed" ? "🎉 파이프라인 완료" : "❌ 파이프라인 실패"}
        <span className="text-sm font-normal text-[var(--muted)]">
          총 {totalDuration.toFixed(1)}초
        </span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {state.steps.map((step) => (
          <div
            key={step.id}
            className={`text-sm p-2 rounded border ${
              step.status === "completed"
                ? "border-emerald-800/50 bg-emerald-950/20"
                : step.status === "failed"
                  ? "border-red-800/50 bg-red-950/20"
                  : "border-[var(--card-border)] bg-[var(--card)]"
            }`}
          >
            <div className="font-medium">
              {step.icon} {step.name}
            </div>
            {step.duration != null && (
              <div className="text-[var(--muted)] text-xs mt-0.5">{step.duration}s</div>
            )}
            {step.summary && (
              <div className="text-xs mt-0.5 opacity-80">{step.summary}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [market, setMarket] = useState("KR");
  const [state, setState] = useState<PipelineState>({
    pipeline_id: null,
    market: null,
    status: "idle",
    current_step: null,
    started_at: null,
    elapsed_seconds: 0,
    steps: DEFAULT_STEPS,
    logs: [],
  });
  const [connected, setConnected] = useState(false);

  const handleEvent = useCallback((data: Record<string, unknown>) => {
    if ("keepalive" in data) return;
    setState(data as unknown as PipelineState);
  }, []);

  // SSE connection with polling fallback
  useEffect(() => {
    const close = subscribePipelineStream(
      handleEvent,
      undefined,
      setConnected,
    );

    // Polling fallback: if SSE fails, poll every 2s
    const pollId = setInterval(async () => {
      if (!connected) {
        try {
          const res = await fetchPipelineStatus();
          if (res?.data) handleEvent(res.data);
        } catch {
          // ignore
        }
      }
    }, 2000);

    return () => {
      close();
      clearInterval(pollId);
    };
  }, [handleEvent, connected]);

  // Elapsed time ticker
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const elapsed =
    state.status === "running" && state.started_at
      ? ((Date.now() / 1000 - state.started_at + tick * 0) > 0
          ? state.elapsed_seconds
          : 0)
      : state.elapsed_seconds;

  const mutation = useMutation({
    mutationFn: (mkt: string) => triggerPipeline(mkt),
    onSuccess: async () => {
      // Immediately fetch status after trigger
      try {
        const res = await fetchPipelineStatus();
        if (res?.data) handleEvent(res.data);
      } catch {
        // ignore
      }
    },
  });

  const isRunning = state.status === "running";
  const currentStep = state.steps.find((s) => s.status === "running");
  const completedCount = state.steps.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">파이프라인 관리</h1>
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-[var(--muted)]">{connected ? "SSE 연결됨" : "연결 끊김"}</span>
        </div>
      </div>

      {/* Control panel */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {["KR", "US"].map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                disabled={isRunning}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  market === m
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-blue-600/50"
                } disabled:opacity-50`}
              >
                {m === "KR" ? "🇰🇷 한국 시장" : "🇺🇸 미국 시장"}
              </button>
            ))}
          </div>
          <button
            onClick={() => mutation.mutate(market)}
            disabled={isRunning || mutation.isPending}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors"
          >
            {isRunning ? "실행 중..." : mutation.isPending ? "시작 중..." : "파이프라인 실행"}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {isRunning && (
        <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <div>
              <span className="font-medium">
                {currentStep ? `${currentStep.icon} ${currentStep.name}` : "준비 중..."}
              </span>
              <span className="text-[var(--muted)] text-sm ml-2">
                ({completedCount}/{state.steps.length} 완료)
              </span>
            </div>
          </div>
          <div className="text-sm text-[var(--muted)] tabular-nums">
            경과: {elapsed.toFixed(1)}s
          </div>
        </div>
      )}

      {/* Step progress */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
          단계별 진행 상황
        </h2>
        <div className="flex items-start justify-center flex-wrap gap-y-4">
          {state.steps.map((step, i) => (
            <StepIndicator key={step.id} step={step} index={i} total={state.steps.length} />
          ))}
        </div>
      </div>

      {/* Result summary */}
      <ResultSummary state={state} />

      {/* Log panel */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          실시간 로그
        </h2>
        <LogPanel logs={state.logs} />
      </div>

      {/* Schedule */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          일일 스케줄 (KST)
        </h2>
        <div className="space-y-2 text-sm">
          {[
            ["06:00", "한국시장 파이프라인 (뉴스 → 분석 → 추천)"],
            ["07:00", "한국시장 추천 완료 (09:00 개장 전)"],
            ["21:00", "미국시장 파이프라인 시작"],
            ["21:30", "미국시장 추천 완료 (23:30 개장 전)"],
          ].map(([time, desc], i) => (
            <div
              key={i}
              className="flex justify-between py-2 border-b border-[var(--card-border)] last:border-0"
            >
              <span className="tabular-nums font-mono text-[var(--muted)]">{time}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

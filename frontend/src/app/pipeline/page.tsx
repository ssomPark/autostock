"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  triggerPipeline,
  subscribePipelineStream,
  fetchPipelineStatus,
  fetchPipelineHistory,
} from "@/lib/api";

/* ─── Types ─── */

interface StepState {
  id: string;
  name: string;
  icon: string;
  status: "pending" | "running" | "completed" | "failed";
  duration: number | null;
  summary: string | null;
}

interface BatchState {
  enabled: boolean;
  markets: string[];
  current_index: number;
  results: { market: string; status: string; duration: number }[];
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
  batch?: BatchState;
  keepalive?: boolean;
}

interface HistoryItem {
  id: number;
  market_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  recommendations_count: number;
  error_message: string | null;
}

const DEFAULT_STEPS: StepState[] = [
  { id: "news", name: "뉴스 수집", icon: "📰", status: "pending", duration: null, summary: null },
  { id: "keywords", name: "키워드 추출", icon: "🔑", status: "pending", duration: null, summary: null },
  { id: "screening", name: "종목 스크리닝", icon: "🔍", status: "pending", duration: null, summary: null },
  { id: "analysis", name: "기술적 분석", icon: "📊", status: "pending", duration: null, summary: null },
  { id: "recommendation", name: "투자 추천 생성", icon: "💡", status: "pending", duration: null, summary: null },
  { id: "save", name: "저장 및 알림", icon: "💾", status: "pending", duration: null, summary: null },
];

const MARKET_OPTIONS = [
  { value: "KR", label: "한국", flag: "\u{1F1F0}\u{1F1F7}" },
  { value: "US", label: "미국", flag: "\u{1F1FA}\u{1F1F8}" },
  { value: "ALL", label: "전체", flag: "\u{1F30D}" },
] as const;

/* ─── Sub-components ─── */

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
    <div className="flex sm:flex-row flex-col items-center">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${statusStyles[step.status]}`}
        >
          {step.status === "running" ? (
            <span className="animate-spin text-sm">{"\u23F3"}</span>
          ) : step.status === "completed" ? (
            "\u2713"
          ) : step.status === "failed" ? (
            "\u2717"
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
        <>
          <div
            className={`hidden sm:block w-8 h-0.5 mx-1 mt-[-20px] transition-colors duration-300 ${lineStyles[step.status]}`}
          />
          <div
            className={`sm:hidden w-0.5 h-4 my-1 transition-colors duration-300 ${lineStyles[step.status]}`}
          />
        </>
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
    <div className="bg-black/50 border border-[var(--card-border)] rounded-lg p-4 h-48 sm:h-64 overflow-y-auto font-mono text-xs">
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

function BatchProgress({ batch, currentMarket }: { batch: BatchState; currentMarket: string | null }) {
  if (!batch.enabled) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <div className="text-sm font-medium mb-3">
        전체 실행 ({batch.current_index + 1}/{batch.markets.length} 시장)
      </div>
      <div className="flex items-center gap-3">
        {batch.markets.map((m, i) => {
          const result = batch.results.find((r) => r.market === m);
          const isCurrent = i === batch.current_index && !result;
          const isCompleted = !!result;
          const isPending = i > batch.current_index && !result;

          return (
            <div key={m} className="flex items-center gap-3">
              {i > 0 && (
                <div className={`w-8 h-0.5 ${isCompleted || isCurrent ? "bg-emerald-600" : "bg-[var(--card-border)]"}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isCurrent
                        ? "bg-blue-500 animate-pulse"
                        : "bg-[var(--card-border)]"
                  }`}
                />
                <span className={`text-sm ${isCurrent ? "font-medium text-blue-400" : isPending ? "text-[var(--muted)]" : ""}`}>
                  {m}
                </span>
                {isCompleted && (
                  <span className="text-xs text-[var(--muted)]">{result.duration}s</span>
                )}
                {isCurrent && (
                  <span className="text-xs text-blue-400">실행중</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultSummary({ state }: { state: PipelineState }) {
  if (state.status !== "completed" && state.status !== "failed") return null;

  const batch = state.batch;
  const isBatch = batch?.enabled && batch.results.length > 0;

  const completedSteps = state.steps.filter((s) => s.status === "completed");
  const stepDuration = completedSteps.reduce((acc, s) => acc + (s.duration ?? 0), 0);

  let totalDuration = stepDuration;
  let durationLabel = `총 ${stepDuration.toFixed(1)}초`;

  if (isBatch) {
    totalDuration = batch.results.reduce((acc, r) => acc + r.duration, 0);
    const parts = batch.results.map((r) => `${r.market} ${r.duration}s`).join(" + ");
    durationLabel = `${parts} = 총 ${totalDuration.toFixed(1)}s`;
  }

  return (
    <div
      className={`border rounded-lg p-5 ${
        state.status === "completed"
          ? "bg-emerald-950/30 border-emerald-800"
          : "bg-red-950/30 border-red-800"
      }`}
    >
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        {state.status === "completed"
          ? isBatch
            ? "전체 파이프라인 완료"
            : "파이프라인 완료"
          : "파이프라인 실패"}
        <span className="text-sm font-normal text-[var(--muted)]">{durationLabel}</span>
      </h3>
      {isBatch && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {batch.results.map((r) => (
            <div
              key={r.market}
              className={`text-sm p-3 rounded border ${
                r.status === "completed"
                  ? "border-emerald-800/50 bg-emerald-950/20"
                  : "border-red-800/50 bg-red-950/20"
              }`}
            >
              <div className="font-medium">{r.market === "KR" ? "\u{1F1F0}\u{1F1F7}" : "\u{1F1FA}\u{1F1F8}"} {r.market} 시장</div>
              <div className="text-[var(--muted)] text-xs mt-1">{r.duration}s</div>
            </div>
          ))}
        </div>
      )}
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

/* ─── History Tab ─── */

function HistoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-history"],
    queryFn: () => fetchPipelineHistory(20),
    staleTime: 30_000,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const items: HistoryItem[] = data?.data ?? [];

  function formatDuration(started: string | null, completed: string | null): string {
    if (!started || !completed) return "-";
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    if (ms < 0) return "-";
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-emerald-950/50 text-emerald-400 border-emerald-800/50",
      failed: "bg-red-950/50 text-red-400 border-red-800/50",
      running: "bg-blue-950/50 text-blue-400 border-blue-800/50",
    };
    const labels: Record<string, string> = {
      completed: "완료",
      failed: "실패",
      running: "진행중",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded border ${styles[status] ?? "bg-[var(--card)] text-[var(--muted)] border-[var(--card-border)]"}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
        이력을 불러오는 중...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
        실행 이력이 없습니다
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-[var(--muted)] text-xs uppercase tracking-wider">
            <th className="text-left p-3 font-semibold">실행 시간</th>
            <th className="text-left p-3 font-semibold">시장</th>
            <th className="text-left p-3 font-semibold">상태</th>
            <th className="text-right p-3 font-semibold">추천 수</th>
            <th className="text-right p-3 font-semibold">소요 시간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group">
              <td className="p-3 border-t border-[var(--card-border)]">
                <div className="flex items-center gap-2">
                  {item.error_message && (
                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="text-[var(--muted)] hover:text-[var(--foreground)] text-xs"
                    >
                      {expandedId === item.id ? "\u25BC" : "\u25B6"}
                    </button>
                  )}
                  <span>{formatTime(item.started_at)}</span>
                </div>
                {expandedId === item.id && item.error_message && (
                  <div className="mt-2 text-xs text-red-400 bg-red-950/20 border border-red-800/30 rounded p-2">
                    {item.error_message}
                  </div>
                )}
              </td>
              <td className="p-3 border-t border-[var(--card-border)]">
                {item.market_type === "KR" ? "\u{1F1F0}\u{1F1F7} KR" : "\u{1F1FA}\u{1F1F8} US"}
              </td>
              <td className="p-3 border-t border-[var(--card-border)]">{statusBadge(item.status)}</td>
              <td className="p-3 border-t border-[var(--card-border)] text-right tabular-nums">
                {item.recommendations_count}
              </td>
              <td className="p-3 border-t border-[var(--card-border)] text-right tabular-nums text-[var(--muted)]">
                {formatDuration(item.started_at, item.completed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ─── */

export default function PipelinePage() {
  const [activeTab, setActiveTab] = useState<"run" | "history">("run");
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
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const elapsed = state.elapsed_seconds;

  const mutation = useMutation({
    mutationFn: (mkt: string) => triggerPipeline(mkt),
    onSuccess: async () => {
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
  const batch = state.batch;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">파이프라인 관리</h1>
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span className="text-[var(--muted)]">{connected ? "SSE 연결됨" : "연결 끊김"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-1">
        {([
          { key: "run" as const, label: "실행" },
          { key: "history" as const, label: "이력" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "run" ? (
        <>
          {/* Control panel */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {MARKET_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMarket(m.value)}
                    disabled={isRunning}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      market === m.value
                        ? "bg-blue-600 text-white"
                        : "bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-blue-600/50"
                    } disabled:opacity-50`}
                  >
                    {m.flag} {m.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => mutation.mutate(market)}
                disabled={isRunning || mutation.isPending}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors w-full sm:w-auto"
              >
                {isRunning ? "실행 중..." : mutation.isPending ? "시작 중..." : "파이프라인 실행"}
              </button>
            </div>
            {market === "ALL" && !isRunning && (
              <p className="text-xs text-[var(--muted)] mt-2">
                한국 시장 완료 후 미국 시장을 순차 실행합니다.
              </p>
            )}
          </div>

          {/* Batch progress */}
          {batch?.enabled && (
            <BatchProgress batch={batch} currentMarket={state.market} />
          )}

          {/* Status bar */}
          {isRunning && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shrink-0" />
                <div>
                  <span className="font-medium">
                    {currentStep ? `${currentStep.icon} ${currentStep.name}` : "준비 중..."}
                  </span>
                  <span className="text-[var(--muted)] text-sm ml-2">
                    ({completedCount}/{state.steps.length} 완료)
                  </span>
                  {batch?.enabled && (
                    <span className="text-blue-400 text-sm ml-2">
                      [{state.market}]
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-[var(--muted)] tabular-nums">
                경과: {elapsed.toFixed(1)}s
              </div>
            </div>
          )}

          {/* Step progress */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
              단계별 진행 상황
              {batch?.enabled && state.market && (
                <span className="ml-2 normal-case text-blue-400">({state.market})</span>
              )}
            </h2>
            <div className="flex items-start justify-center flex-wrap gap-y-2 sm:gap-y-4 sm:flex-row flex-col sm:items-start">
              {state.steps.map((step, i) => (
                <StepIndicator key={step.id} step={step} index={i} total={state.steps.length} />
              ))}
            </div>
          </div>

          {/* Result summary */}
          <ResultSummary state={state} />

          {/* Log panel */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              실시간 로그
            </h2>
            <LogPanel logs={state.logs} />
          </div>
        </>
      ) : (
        <HistoryTab />
      )}
    </div>
  );
}

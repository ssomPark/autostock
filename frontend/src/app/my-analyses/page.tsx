"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { fetchSavedAnalyses, deleteSavedAnalysisAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/lib/format";

const gradeColor: Record<string, string> = {
  "A+": "#4ade80", A: "#4ade80",
  "B+": "#60a5fa", B: "#60a5fa",
  C: "#facc15", D: "#fb923c", F: "#f87171",
};

function SignalBreakdownBar({ label, contribution, weight, strength }: { label: string; contribution: number; weight: number; strength: number }) {
  const pct = Math.abs(contribution) * 100;
  const color = contribution > 0 ? "#4ade80" : contribution < 0 ? "#f87171" : "#6b7280";
  const labelMap: Record<string, string> = {
    candlestick: "캔들스틱",
    chart_pattern: "차트 패턴",
    support_resistance: "지지/저항",
    volume: "거래량",
    trend: "추세",
    rsi: "RSI",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-[var(--muted)] shrink-0">{labelMap[label] || label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 4, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 text-right font-medium" style={{ color }}>
        {contribution > 0 ? "+" : ""}{(contribution * 100).toFixed(1)}%
      </span>
      <span className="w-10 text-right text-[var(--muted)]">
        ({(weight * 100).toFixed(0)}%)
      </span>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val == null) return "-";
  if (typeof val === "number") {
    if (Number.isInteger(val) && Math.abs(val) >= 1000) return val.toLocaleString();
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string") return val;
  return "-";
}

function AnalysisDetail({ item }: { item: any }) {
  const sc = item.score_data || {};
  const fin = item.financials_data || {};
  const breakdown = sc.signal_breakdown || {};
  const indicators = sc.indicators || {};
  const target = sc.target || {};
  const stopLoss = sc.stop_loss || {};
  const entry = sc.entry_price || {};
  const summaryArr = Array.isArray(sc.summary) ? sc.summary : sc.summary ? [sc.summary] : [];

  // indicators에서 flat한 값만 추출
  const flatIndicators: [string, string][] = [];
  if (indicators.rsi != null) flatIndicators.push(["RSI", formatValue(indicators.rsi)]);
  if (indicators.atr != null) flatIndicators.push(["ATR", formatValue(indicators.atr)]);
  if (indicators.atr_pct != null) flatIndicators.push(["ATR %", formatValue(indicators.atr_pct) + "%"]);
  if (indicators.trend) {
    const t = indicators.trend;
    if (t.direction) flatIndicators.push(["추세", t.direction === "uptrend" ? "상승" : t.direction === "downtrend" ? "하락" : "횡보"]);
    if (t.strength != null) flatIndicators.push(["추세 강도", (t.strength * 100).toFixed(0) + "%"]);
    if (t.ema_20 != null) flatIndicators.push(["EMA 20", formatValue(t.ema_20)]);
    if (t.ema_50 != null) flatIndicators.push(["EMA 50", formatValue(t.ema_50)]);
    if (t.price_vs_ema20_pct != null) flatIndicators.push(["vs EMA20", (t.price_vs_ema20_pct > 0 ? "+" : "") + t.price_vs_ema20_pct.toFixed(2) + "%"]);
  }

  // financials에서 표시할 값 (flat만, 배열/객체 제외)
  const finEntries: [string, string][] = [];
  const finLabelMap: Record<string, string> = {
    sector: "섹터", industry: "산업", pe_ratio: "PER", pb_ratio: "PBR",
    roe: "ROE", "52w_high": "52주 고가", "52w_low": "52주 저가",
    market_cap: "시가총액", dividend_yield: "배당수익률",
  };
  for (const [k, v] of Object.entries(fin)) {
    if (k === "name" || k === "ticker") continue;
    if (v == null || typeof v === "object") continue;
    const label = finLabelMap[k] || k;
    if (k === "roe" && typeof v === "number") {
      finEntries.push([label, (v * 100).toFixed(2) + "%"]);
    } else {
      finEntries.push([label, formatValue(v)]);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-4">
      {/* Signal Breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Signal Breakdown</h4>
          <div className="space-y-1.5">
            {Object.entries(breakdown).map(([key, val]: [string, any]) => (
              <SignalBreakdownBar
                key={key}
                label={key}
                contribution={val?.contribution ?? 0}
                weight={val?.weight ?? 0}
                strength={val?.strength ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Target / StopLoss / Entry */}
      {(target.consensus || stopLoss.final || entry.consensus) && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Price Targets</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {entry.consensus != null && (
              <div>
                <span className="text-[var(--muted)]">진입가</span>
                <p className="font-medium text-blue-400">{formatValue(entry.consensus)}</p>
              </div>
            )}
            {target.consensus != null && (
              <div>
                <span className="text-[var(--muted)]">목표가</span>
                <p className="font-medium text-green-400">{formatValue(target.consensus)}</p>
              </div>
            )}
            {stopLoss.final != null && (
              <div>
                <span className="text-[var(--muted)]">손절가</span>
                <p className="font-medium text-red-400">{formatValue(stopLoss.final)}</p>
              </div>
            )}
            {target.methods && (
              <div>
                <span className="text-[var(--muted)]">산출 방법</span>
                <p className="font-medium">{target.methods.map((m: any) => m.method).join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Indicators */}
      {flatIndicators.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Indicators</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            {flatIndicators.map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-[var(--muted)]">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financials */}
      {finEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wider">Financials</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            {finEntries.map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-[var(--muted)]">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summaryArr.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] mb-1 uppercase tracking-wider">Summary</h4>
          <div className="space-y-1">
            {summaryArr.map((text: string, i: number) => (
              <p key={i} className="text-sm text-[var(--foreground)] leading-relaxed">{text}</p>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="flex justify-end pt-1">
        <Link
          href={`/search?q=${item.ticker}`}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          재분석
        </Link>
      </div>
    </div>
  );
}

export default function MyAnalysesPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: analyses, isLoading } = useQuery({
    queryKey: ["saved-analyses"],
    queryFn: fetchSavedAnalyses,
    enabled: isAuthenticated,
  });

  const handleDelete = async (id: number) => {
    await deleteSavedAnalysisAPI(id);
    queryClient.invalidateQueries({ queryKey: ["saved-analyses"] });
  };

  if (authLoading) {
    return <div className="text-center py-20 text-[var(--muted)]">로딩 중...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-[var(--muted)]">
        <p className="text-lg mb-2">로그인이 필요합니다</p>
        <Link href="/auth/login" className="text-blue-400 hover:underline">로그인하기</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold">내 분석 기록</h1>

      {isLoading && <div className="text-center py-10 text-[var(--muted)]">로딩 중...</div>}

      {!isLoading && (!analyses || analyses.length === 0) && (
        <div className="text-center py-20 text-[var(--muted)]">
          <p>저장된 분석 기록이 없습니다</p>
          <p className="text-sm mt-1">종목 분석 페이지에서 분석하면 자동으로 저장됩니다</p>
        </div>
      )}

      {!isLoading && analyses && analyses.length > 0 && (
        <div className="space-y-3">
          {analyses.map((item: any) => {
            const actionColor = item.signal === "BUY" ? "#4ade80" : item.signal === "SELL" ? "#f87171" : "#facc15";
            const actionBg = item.signal === "BUY" ? "rgba(34,197,94,0.2)" : item.signal === "SELL" ? "rgba(239,68,68,0.2)" : "rgba(234,179,8,0.2)";
            const actionLabel = item.signal === "BUY" ? "매수" : item.signal === "SELL" ? "매도" : "관망";
            const sc = item.score_data || {};
            const date = item.analyzed_at ? new Date(item.analyzed_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center gap-2 hover:opacity-80 text-left"
                  >
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-[var(--muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="font-medium text-lg">{item.name}</span>
                    <span className="text-[var(--muted)] text-sm">{item.ticker}</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--muted)]">{date}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ color: gradeColor[item.grade] || "#9ca3af" }}>
                      {item.grade || "-"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: actionBg, color: actionColor }}>
                      {actionLabel}
                    </span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[var(--muted)] hover:text-red-400 text-xs transition-colors"
                      title="삭제"
                    >
                      X
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--muted)] text-xs">현재가</span>
                    <p className="font-medium">{formatPrice(item.current_price, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">신뢰도</span>
                    <p className="font-medium">{item.confidence?.toFixed(0) ?? "-"}%</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">종합 점수</span>
                    <p className="font-medium" style={{ color: item.total_score > 0 ? "#4ade80" : item.total_score < 0 ? "#f87171" : "var(--foreground)" }}>
                      {item.total_score > 0 ? "+" : ""}{(item.total_score * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">목표가</span>
                    <p className="font-medium" style={{ color: "#4ade80" }}>{formatPrice(sc.target?.consensus, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">손절가</span>
                    <p className="font-medium" style={{ color: "#f87171" }}>{formatPrice(sc.stop_loss?.final, item.market)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] text-xs">R:R</span>
                    <p className="font-medium" style={{
                      color: (sc.risk_reward_ratio ?? 0) >= 1.5 ? "#4ade80" : (sc.risk_reward_ratio ?? 0) >= 1.0 ? "#facc15" : "#f87171",
                    }}>
                      {sc.risk_reward_ratio != null ? `${sc.risk_reward_ratio}:1` : "-"}
                    </p>
                  </div>
                </div>

                {isExpanded && <AnalysisDetail item={item} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

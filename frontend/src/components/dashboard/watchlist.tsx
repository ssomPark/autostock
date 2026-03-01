"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWatchlist, getWatchlistSync, removeFromWatchlist, type WatchlistItem } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/lib/format";
import { useLivePrices } from "@/hooks/use-live-prices";

const gradeColor: Record<string, string> = {
  "A+": "#4ade80",
  A: "#4ade80",
  "B+": "#60a5fa",
  B: "#60a5fa",
  C: "#facc15",
  D: "#fb923c",
  F: "#f87171",
};

function formatPct(value: number | null | undefined): React.ReactNode {
  if (value == null) return "-";
  const color = value >= 0 ? "#4ade80" : "#f87171";
  return (
    <span style={{ color, fontWeight: 500 }}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function Watchlist() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Server-backed watchlist when logged in
  const { data: serverItems } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => getWatchlist(),
    enabled: isAuthenticated,
  });

  // localStorage fallback when not logged in
  const [localItems, setLocalItems] = useState<WatchlistItem[]>([]);
  useEffect(() => {
    if (!isAuthenticated) {
      setLocalItems(getWatchlistSync());
      const handler = () => setLocalItems(getWatchlistSync());
      window.addEventListener("watchlist-updated", handler);
      return () => window.removeEventListener("watchlist-updated", handler);
    }
  }, [isAuthenticated]);

  const items = isAuthenticated ? (serverItems ?? []) : localItems;

  // 실시간 가격 조회 (워치리스트에 종목이 있을 때만)
  const { prices, isLoading: pricesLoading } = useLivePrices({
    market: "all",
    enabled: items.length > 0,
  });

  const handleRemove = async (ticker: string) => {
    await removeFromWatchlist(ticker);
    if (isAuthenticated) {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    } else {
      setLocalItems(getWatchlistSync());
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
      <div className="p-4 border-b border-[var(--card-border)]">
        <h2 className="font-semibold">내 분석 종목</h2>
      </div>
      <div className="p-2">
        {items.map((item) => {
          const actionColor =
            item.action === "BUY" ? "#4ade80" : item.action === "SELL" ? "#f87171" : "#facc15";
          const actionBg =
            item.action === "BUY"
              ? "rgba(34,197,94,0.2)"
              : item.action === "SELL"
                ? "rgba(239,68,68,0.2)"
                : "rgba(234,179,8,0.2)";
          const actionLabel =
            item.action === "BUY" ? "매수" : item.action === "SELL" ? "매도" : "관망";

          // 실시간 가격 데이터
          const lp = prices.get(item.ticker);
          const livePrice = lp?.live_price ?? null;
          const dayChangePct = lp?.day_change_pct ?? null;

          // 분석 당시 가격 대비 변동률
          const changeFromAnalysis =
            livePrice && item.current_price > 0
              ? ((livePrice - item.current_price) / item.current_price) * 100
              : null;

          const expectedReturn =
            item.current_price > 0 && item.target_price
              ? ((item.target_price - item.current_price) / item.current_price) * 100
              : null;

          const grade = item.grade || "-";
          const rr = item.risk_reward;

          return (
            <div
              key={item.ticker}
              className="py-3 px-3 border-b border-[var(--card-border)] last:border-0 rounded"
            >
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/search?q=${item.ticker}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[var(--muted)] text-xs">{item.ticker}</span>
                </Link>
                <div className="flex items-center gap-2">
                  {/* 일간 등락률 */}
                  {dayChangePct != null && (
                    <span
                      className="text-xs font-medium"
                      style={{ color: dayChangePct >= 0 ? "#4ade80" : "#f87171" }}
                    >
                      {dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}%
                    </span>
                  )}
                  {pricesLoading && dayChangePct == null && (
                    <svg className="w-3 h-3 animate-spin text-[var(--muted)]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {/* Grade badge */}
                  <span
                    className="px-1.5 py-0.5 rounded text-xs font-bold"
                    style={{ color: gradeColor[grade] || "#9ca3af" }}
                  >
                    {grade}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: actionBg, color: actionColor }}
                  >
                    {actionLabel}
                  </span>
                  <button
                    onClick={() => handleRemove(item.ticker)}
                    className="text-[var(--muted)] hover:text-red-400 text-xs transition-colors ml-1"
                    title="삭제"
                  >
                    X
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
                <div>
                  <span className="text-[var(--muted)]">현재가</span>
                  <p className="font-medium mt-0.5">
                    {livePrice
                      ? formatPrice(livePrice, item.market)
                      : formatPrice(item.current_price, item.market)}
                  </p>
                  {livePrice && (
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                      {dayChangePct != null && (
                        <span style={{ color: dayChangePct >= 0 ? "#4ade80" : "#f87171" }}>
                          {dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}%
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-[var(--muted)]">분석대비</span>
                  <p className="font-medium mt-0.5">
                    {changeFromAnalysis != null ? formatPct(changeFromAnalysis) : "-"}
                  </p>
                  {changeFromAnalysis != null && (
                    <p className="text-[10px] mt-0.5 text-[var(--muted)]">
                      ({formatPrice(item.current_price, item.market)})
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-[var(--muted)]">신뢰도</span>
                  <p className="font-medium mt-0.5">{item.confidence.toFixed(0)}%</p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">
                    {item.action === "SELL" ? "재매수 검토가" : "매수 추천가"}
                  </span>
                  <p className="font-medium mt-0.5" style={{ color: "#60a5fa" }}>
                    {formatPrice(item.entry_price, item.market)}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">목표가</span>
                  <p className="font-medium mt-0.5" style={{ color: "#4ade80" }}>
                    {formatPrice(item.target_price, item.market)}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">기대수익</span>
                  <p className="font-medium mt-0.5">
                    {expectedReturn != null ? (
                      <span style={{ color: expectedReturn >= 0 ? "#4ade80" : "#f87171" }}>
                        {expectedReturn >= 0 ? "+" : ""}
                        {expectedReturn.toFixed(1)}%
                      </span>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">손절가</span>
                  <p className="font-medium mt-0.5" style={{ color: "#f87171" }}>
                    {formatPrice(item.stop_loss, item.market)}
                  </p>
                </div>
                <div>
                  <span className="text-[var(--muted)]">R:R</span>
                  <p
                    className="font-medium mt-0.5"
                    style={{
                      color: rr != null ? (rr >= 1.5 ? "#4ade80" : rr >= 1.0 ? "#facc15" : "#f87171") : "var(--muted)",
                    }}
                  >
                    {rr != null ? `${rr}:1` : "-"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

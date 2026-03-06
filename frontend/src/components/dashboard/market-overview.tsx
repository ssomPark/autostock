"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarketIndices, type MarketIndex } from "@/lib/api";

export function MarketOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["marketIndices"],
    queryFn: fetchMarketIndices,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const indices: MarketIndex[] = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4 animate-pulse"
          >
            <div className="h-3 w-12 bg-[var(--surface-hover)] rounded mb-3" />
            <div className="h-6 w-20 bg-[var(--surface-hover)] rounded mb-2" />
            <div className="h-3 w-16 bg-[var(--surface-hover)] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (indices.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {indices.map((idx) => {
        const isUp = idx.change_pct >= 0;
        const color = idx.change_pct === 0
          ? "var(--muted)"
          : isUp
            ? "#4ade80"
            : "#f87171";
        const arrow = idx.change_pct === 0 ? "" : isUp ? "▲" : "▼";
        const priceStr =
          idx.price >= 1000
            ? idx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : idx.price.toFixed(2);

        return (
          <div
            key={idx.key}
            className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4"
          >
            <p className="text-xs text-[var(--muted)] font-medium">{idx.name}</p>
            <p className="text-xl font-bold mt-1 tabular-nums">{priceStr}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs font-medium" style={{ color }}>
                {arrow} {Math.abs(idx.change_pct).toFixed(2)}%
              </span>
              <span className="text-[10px] text-[var(--muted)]">
                {idx.change >= 0 ? "+" : ""}{idx.change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

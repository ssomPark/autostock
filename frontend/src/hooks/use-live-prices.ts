"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBatchPrices,
  fetchMarketStatus,
  type LivePrice,
  type MarketStatusInfo,
} from "@/lib/api";

interface UseLivePricesOptions {
  market?: string;
  enabled?: boolean;
}

interface UseLivePricesResult {
  prices: Map<string, LivePrice>;
  marketStatus: { KR: MarketStatusInfo; US: MarketStatusInfo } | null;
  isLoading: boolean;
  isAnyMarketOpen: boolean;
}

export function useLivePrices(
  options: UseLivePricesOptions = {},
): UseLivePricesResult {
  const { market = "all", enabled = true } = options;

  const { data: statusData } = useQuery({
    queryKey: ["market-status"],
    queryFn: fetchMarketStatus,
    refetchInterval: 60_000, // check market status every 60s
    enabled,
  });

  const marketStatus = statusData?.data ?? null;
  const isAnyMarketOpen = marketStatus
    ? marketStatus.KR.is_open || marketStatus.US.is_open
    : false;

  const { data: priceData, isLoading } = useQuery({
    queryKey: ["live-prices", market],
    queryFn: () => fetchBatchPrices(market),
    refetchInterval: (query) => {
      // Stop polling when no market is open
      const ms = query.state.data?.market_status;
      if (!ms) return 30_000; // initial polling
      const anyOpen = ms.KR.is_open || ms.US.is_open;
      return anyOpen ? 30_000 : false;
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    enabled,
  });

  const prices = useMemo(() => {
    const map = new Map<string, LivePrice>();
    if (priceData?.data) {
      for (const p of priceData.data) {
        map.set(p.ticker, p);
      }
    }
    return map;
  }, [priceData]);

  return { prices, marketStatus, isLoading, isAnyMarketOpen };
}

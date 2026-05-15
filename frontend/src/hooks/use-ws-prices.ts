"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

interface WsPriceData {
  price: number;
  change_pct: number;
  volume: number;
}

interface UseWsPricesOptions {
  tickers: { ticker: string; market: string }[];
  enabled?: boolean;
}

/**
 * WebSocket 기반 실시간 가격 훅.
 * 서버에서 15초 주기로 구독 종목의 가격을 push.
 */
export function useWsPrices({ tickers, enabled = true }: UseWsPricesOptions) {
  const [prices, setPrices] = useState<Record<string, WsPriceData>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const subscribedRef = useRef<Set<string>>(new Set());

  // Stable ticker key string for dependency tracking
  const tickerKey = useMemo(
    () => tickers.map((t) => `${t.ticker}:${t.market}`).sort().join(","),
    [tickers],
  );

  const connect = useCallback(() => {
    if (!enabled || tickers.length === 0) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelayRef.current = 1000;

        for (const { ticker, market } of tickers) {
          ws.send(JSON.stringify({ type: "subscribe", ticker, market }));
          subscribedRef.current.add(`${ticker}:${market}`);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "price_update" && msg.data) {
            setPrices((prev) => ({ ...prev, ...msg.data }));
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        subscribedRef.current.clear();
        if (enabled) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
            connect();
          }, reconnectDelayRef.current);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket not available
    }
  }, [enabled, tickerKey]);

  useEffect(() => {
    if (!enabled || tickers.length === 0) return;
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      subscribedRef.current.clear();
    };
  }, [connect]);

  return { prices, connected };
}

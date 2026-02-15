"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { fetchOHLCV } from "@/lib/api";

interface SparklineChartProps {
  ticker: string;
  market: string;
  width?: number;
  height?: number;
}

export function SparklineChart({ ticker, market, width = 120, height = 48 }: SparklineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ohlcv", ticker, market],
    queryFn: () => fetchOHLCV(ticker, market),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const ohlcv = data?.data;
    if (!ohlcv || ohlcv.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { mode: 0, vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const first = ohlcv[0].close;
    const last = ohlcv[ohlcv.length - 1].close;
    const isUp = last >= first;

    const lineColor = isUp ? "#22c55e" : "#ef4444";
    const areaTop = isUp ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";

    const areaSeries = chart.addAreaSeries({
      lineColor,
      topColor: areaTop,
      bottomColor: "transparent",
      lineWidth: 2 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    areaSeries.setData(
      ohlcv.map((d: any) => ({ time: d.time, value: d.close }))
    );

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, width, height]);

  if (isLoading) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center">
        <div className="w-full h-[1px] bg-[var(--card-border)]" />
      </div>
    );
  }

  if (!data?.data || data.data.length === 0) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center text-[var(--muted)] text-xs">
        -
      </div>
    );
  }

  return <div ref={containerRef} style={{ width, height }} />;
}

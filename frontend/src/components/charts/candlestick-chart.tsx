"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { fetchOHLCV } from "@/lib/api";

interface CandlestickChartProps {
  ticker: string;
  market: string;
}

export function CandlestickChart({ ticker, market }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ohlcv", ticker, market],
    queryFn: () => fetchOHLCV(ticker, market),
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const ohlcv = data?.data;
    if (!ohlcv || ohlcv.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#141414" },
        textColor: "#737373",
      },
      grid: {
        vertLines: { color: "#1e1e1e" },
        horzLines: { color: "#1e1e1e" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: 0,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const candleData = ohlcv.map((d: any) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candlestickSeries.setData(candleData);

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData = ohlcv.map((d: any) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    }));
    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">{ticker} 차트</h2>
        <span className="text-sm text-[var(--muted)]">{market}</span>
      </div>
      {isLoading && (
        <div className="h-[400px] flex items-center justify-center text-[var(--muted)]">
          차트 로딩 중...
        </div>
      )}
      {!isLoading && (!data?.data || data.data.length === 0) && (
        <div className="h-[400px] flex items-center justify-center text-[var(--muted)]">
          차트 데이터를 가져올 수 없습니다
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}

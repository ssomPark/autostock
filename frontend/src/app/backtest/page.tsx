"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  searchStocks,
  runBacktest,
  type BacktestResult,
  type BacktestTrade,
  type BacktestMetrics,
  type StockSearchResult,
} from "@/lib/api";

function formatKRW(n: number): string {
  if (Math.abs(n) >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (Math.abs(n) >= 1_0000) return `${Math.round(n / 1_0000).toLocaleString()}만`;
  return n.toLocaleString();
}

function formatDate(d: string): string {
  return d.slice(5); // MM-DD
}

function getDefaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// --- Metric Card ---
function MetricCard({
  title,
  value,
  color,
  suffix,
}: {
  title: string;
  value: string | number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-xs text-[var(--muted)] mb-1">{title}</p>
      <p className="text-xl font-bold font-mono" style={{ color }}>
        {value}
        {suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

// --- Equity Chart using lightweight-charts ---
function EquityChart({
  equityCurve,
  trades,
}: {
  equityCurve: { date: string; equity: number }[];
  trades: BacktestTrade[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || equityCurve.length === 0) return;

    let chart: any = null;

    const initChart = async () => {
      const { createChart, ColorType } = await import("lightweight-charts");

      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 320,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#9ca3af",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        crosshair: {
          horzLine: { visible: true, labelVisible: true },
          vertLine: { visible: true, labelVisible: true },
        },
      });

      const areaSeries = chart.addAreaSeries({
        lineColor: "#3b82f6",
        topColor: "rgba(59,130,246,0.3)",
        bottomColor: "rgba(59,130,246,0.02)",
        lineWidth: 2,
      });

      const data = equityCurve.map((p) => ({
        time: p.date,
        value: p.equity,
      }));

      areaSeries.setData(data);

      // Add markers for trades
      const markers: any[] = [];
      for (const t of trades) {
        markers.push({
          time: t.entry_date,
          position: "belowBar",
          color: "#4ade80",
          shape: "arrowUp",
          text: "매수",
        });
        if (t.exit_date) {
          markers.push({
            time: t.exit_date,
            position: "aboveBar",
            color: "#f87171",
            shape: "arrowDown",
            text: t.reason,
          });
        }
      }
      markers.sort((a, b) => (a.time < b.time ? -1 : 1));
      areaSeries.setMarkers(markers);

      chart.timeScale().fitContent();
      chartRef.current = chart;
    };

    initChart();

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [equityCurve, trades]);

  return <div ref={containerRef} className="w-full" />;
}

// --- Main Page ---
export default function BacktestPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Form state
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const { start, end } = getDefaultDates();
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [capital, setCapital] = useState(10_000_000);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Search stocks
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await searchStocks(q);
        setSearchResults(res.results || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  const selectStock = (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setQuery(`${stock.name} (${stock.ticker})`);
    setShowDropdown(false);
  };

  const handleRun = async () => {
    if (!selectedStock) {
      setError("종목을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runBacktest({
        ticker: selectedStock.ticker,
        market: selectedStock.market,
        start_date: startDate,
        end_date: endDate,
        initial_capital: capital,
      });
      if (res.success) {
        setResult(res.data);
      } else {
        setError("백테스트 실행에 실패했습니다.");
      }
    } catch (e: any) {
      setError(e?.message || "백테스트 실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;
  if (!isAuthenticated) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">백테스팅</h1>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
          과거 주가 데이터를 기반으로 AI 매매 신호의 성과를 시뮬레이션합니다. 종목과 기간, 초기 투자금을 설정하면 수익률, 최대 낙폭(MDD), 승률 등 핵심 지표를 산출하여 전략의 유효성을 검증할 수 있습니다. 과거 성과가 미래 수익을 보장하지 않습니다.
        </p>
      </div>

      {/* Settings Form */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stock search */}
          <div className="relative sm:col-span-2 lg:col-span-1" ref={dropdownRef}>
            <label className="block text-xs text-[var(--muted)] mb-1">종목</label>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="종목명 또는 코드 검색..."
              className="w-full px-3 py-2 bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((s) => (
                  <button
                    key={s.ticker}
                    onClick={() => selectStock(s)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] transition-colors flex justify-between"
                  >
                    <span>{s.name}</span>
                    <span className="text-[var(--muted)] font-mono text-xs">{s.ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Capital + Run */}
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">초기 자본 (원)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={loading || !selectedStock}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? "분석 중..." : "백테스트 실행"}
          </button>
          {selectedStock && (
            <span className="text-xs text-[var(--muted)]">
              {selectedStock.name} ({selectedStock.ticker}) · {selectedStock.market}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-12 flex flex-col items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mb-3" />
          <p className="text-sm text-[var(--muted)]">ScoringEngine으로 일별 신호 분석 중...</p>
          <p className="text-xs text-[var(--muted)] mt-1">시뮬레이션에 시간이 소요될 수 있습니다</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              title="총 수익률"
              value={`${result.metrics.total_return_pct > 0 ? "+" : ""}${result.metrics.total_return_pct}%`}
              color={result.metrics.total_return_pct >= 0 ? "#4ade80" : "#f87171"}
            />
            <MetricCard
              title="최대 낙폭"
              value={`-${result.metrics.max_drawdown_pct}%`}
              color="#f87171"
            />
            <MetricCard
              title="샤프 비율"
              value={result.metrics.sharpe_ratio.toFixed(2)}
              color={result.metrics.sharpe_ratio >= 1 ? "#4ade80" : result.metrics.sharpe_ratio >= 0 ? "#facc15" : "#f87171"}
            />
            <MetricCard
              title="승률"
              value={`${result.metrics.win_rate}%`}
              color={result.metrics.win_rate >= 50 ? "#4ade80" : "#facc15"}
            />
          </div>

          {/* Equity Curve */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <h2 className="text-sm font-medium mb-3">자산 곡선 (Equity Curve)</h2>
            <EquityChart equityCurve={result.equity_curve} trades={result.trades} />
          </div>

          {/* Detail metrics table */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <h2 className="text-sm font-medium mb-3">상세 지표</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-sm">
              <DetailMetric label="초기 자본" value={formatKRW(result.metrics.initial_capital)} />
              <DetailMetric label="최종 자산" value={formatKRW(result.metrics.final_equity)} />
              <DetailMetric label="총 거래" value={`${result.metrics.total_trades}회`} />
              <DetailMetric
                label="평균 수익률"
                value={`${result.metrics.avg_pnl_pct > 0 ? "+" : ""}${result.metrics.avg_pnl_pct}%`}
                color={result.metrics.avg_pnl_pct >= 0 ? "#4ade80" : "#f87171"}
              />
              <DetailMetric
                label="최대 수익"
                value={`+${result.metrics.max_win_pct}%`}
                color="#4ade80"
              />
              <DetailMetric
                label="최대 손실"
                value={`${result.metrics.max_loss_pct}%`}
                color="#f87171"
              />
              <DetailMetric
                label="프로핏 팩터"
                value={result.metrics.profit_factor.toFixed(2)}
                color={result.metrics.profit_factor >= 1.5 ? "#4ade80" : result.metrics.profit_factor >= 1 ? "#facc15" : "#f87171"}
              />
              <DetailMetric label="승 / 패" value={`${result.metrics.winning_trades} / ${result.metrics.losing_trades}`} />
            </div>
          </div>

          {/* Trade history */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--card-border)]">
              <h2 className="text-sm font-medium">거래 내역</h2>
            </div>
            {result.trades.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                기간 내 거래가 발생하지 않았습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--card-border)] text-[var(--muted)]">
                      <th className="px-4 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">매수일</th>
                      <th className="px-3 py-2 text-left font-medium">매도일</th>
                      <th className="px-3 py-2 text-right font-medium">진입가</th>
                      <th className="px-3 py-2 text-right font-medium">청산가</th>
                      <th className="px-3 py-2 text-right font-medium">수량</th>
                      <th className="px-3 py-2 text-right font-medium">수익률</th>
                      <th className="px-3 py-2 text-right font-medium">손익</th>
                      <th className="px-3 py-2 text-left font-medium">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((trade, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-2 text-[var(--muted)]">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{formatDate(trade.entry_date)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{trade.exit_date ? formatDate(trade.exit_date) : "-"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {trade.entry_price.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {trade.exit_price ? trade.exit_price.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{trade.shares}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          <span style={{ color: trade.pnl_pct >= 0 ? "#4ade80" : "#f87171" }}>
                            {trade.pnl_pct > 0 ? "+" : ""}
                            {trade.pnl_pct}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          <span style={{ color: trade.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                            {trade.pnl > 0 ? "+" : ""}
                            {formatKRW(trade.pnl)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <ReasonBadge reason={trade.reason} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="font-mono font-medium" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    "익절": { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
    "손절": { bg: "rgba(239,68,68,0.2)", text: "#f87171" },
    "신호전환": { bg: "rgba(234,179,8,0.2)", text: "#facc15" },
    "기간종료": { bg: "rgba(156,163,175,0.2)", text: "#9ca3af" },
  };
  const c = colorMap[reason] || colorMap["기간종료"];
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {reason}
    </span>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fetchFundamentalResults, type FundamentalStock } from "@/lib/api";

type Market = "KR" | "US";
type Category = "all" | "value" | "quality" | "growth" | "balanced";
type SortKey = "total_score" | "per" | "pbr" | "roe" | "debt_to_equity";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "value", label: "가치" },
  { value: "growth", label: "성장" },
  { value: "quality", label: "품질" },
  { value: "balanced", label: "밸런스" },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  value: { bg: "rgba(59,130,246,0.2)", text: "#60a5fa" },
  quality: { bg: "rgba(34,197,94,0.2)", text: "#4ade80" },
  growth: { bg: "rgba(168,85,247,0.2)", text: "#c084fc" },
  balanced: { bg: "rgba(156,163,175,0.2)", text: "#9ca3af" },
};

const CATEGORY_LABELS: Record<string, string> = {
  value: "가치",
  quality: "품질",
  growth: "성장",
  balanced: "밸런스",
};

function formatMetric(v: number | null | undefined, suffix = ""): string {
  if (v == null) return "-";
  return `${v.toFixed(1)}${suffix}`;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(Math.max(value * 100, 0), 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-[var(--muted)] shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-[var(--surface-hover)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right font-mono" style={{ color }}>
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.balanced;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {CATEGORY_LABELS[category] || category}
    </span>
  );
}

export default function FundamentalPage() {
  const [market, setMarket] = useState<Market>("KR");
  const [category, setCategory] = useState<Category>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fundamental", market],
    queryFn: () => fetchFundamentalResults(market, "all", 20),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const stocks = data?.data || [];

  const filtered = useMemo(() => {
    let list = category === "all" ? stocks : stocks.filter((s) => s.category === category);
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "total_score") {
        va = a.fundamental_score ?? a.total_score ?? 0;
        vb = b.fundamental_score ?? b.total_score ?? 0;
      } else {
        va = (a.metrics as Record<string, number | null>)[sortKey] ?? 0;
        vb = (b.metrics as Record<string, number | null>)[sortKey] ?? 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [stocks, category, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">펀더멘탈 분석</h1>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
          PER, PBR, ROE, 부채비율 등 핵심 재무 지표를 가치·성장·품질·밸런스 카테고리로 분류하여 종합 점수를 산출합니다. 높은 점수일수록 해당 카테고리에서 우수한 펀더멘��을 보유한 종목입니다. 재무 데이터는 공시 기반이며, 투자 판단의 참고 자료로만 활용하세요.
        </p>
        <p className="text-sm text-[var(--muted)] mt-1">
          가치/성장/품질 기준으로 종목을 스크리닝합니다
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Market toggle */}
        <div className="flex bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
          {(["KR", "US"] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                market === m
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {m === "KR" ? "한국" : "미국"}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                category === cat.value
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full" />
            <span className="ml-3 text-sm text-[var(--muted)]">펀더멘탈 데이터 분석 중...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20 text-sm text-red-400">
            데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-[var(--muted)]">
            해당 조건의 종목이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-[var(--muted)]">
                  <th className="px-4 py-3 text-left font-medium">종목</th>
                  <th
                    className="px-3 py-3 text-right font-medium cursor-pointer hover:text-[var(--foreground)]"
                    onClick={() => handleSort("total_score")}
                  >
                    점수{sortIcon("total_score")}
                  </th>
                  <th className="px-3 py-3 text-center font-medium">카테고리</th>
                  <th
                    className="px-3 py-3 text-right font-medium cursor-pointer hover:text-[var(--foreground)]"
                    onClick={() => handleSort("per")}
                  >
                    PER{sortIcon("per")}
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium cursor-pointer hover:text-[var(--foreground)]"
                    onClick={() => handleSort("pbr")}
                  >
                    PBR{sortIcon("pbr")}
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium cursor-pointer hover:text-[var(--foreground)]"
                    onClick={() => handleSort("roe")}
                  >
                    ROE{sortIcon("roe")}
                  </th>
                  <th
                    className="px-3 py-3 text-right font-medium cursor-pointer hover:text-[var(--foreground)] hidden sm:table-cell"
                    onClick={() => handleSort("debt_to_equity")}
                  >
                    D/E{sortIcon("debt_to_equity")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stock) => {
                  const expanded = expandedTicker === stock.ticker;
                  return (
                    <StockRow
                      key={stock.ticker}
                      stock={stock}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedTicker(expanded ? null : stock.ticker)
                      }
                      market={market}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-[var(--muted)] text-right">
          {filtered.length}개 종목 표시
        </p>
      )}
    </div>
  );
}

function StockRow({
  stock,
  expanded,
  onToggle,
  market,
}: {
  stock: FundamentalStock;
  expanded: boolean;
  onToggle: () => void;
  market: string;
}) {
  const m = stock.metrics;
  const score = stock.fundamental_score ?? stock.total_score ?? 0;
  const scoreColor =
    score >= 70
      ? "#4ade80"
      : score >= 50
        ? "#60a5fa"
        : score >= 30
          ? "#facc15"
          : "#f87171";

  return (
    <>
      <tr
        className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">{expanded ? "▼" : "▶"}</span>
            <div>
              <p className="font-medium">{stock.name}</p>
              <p className="text-xs text-[var(--muted)]">{stock.ticker}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          <span className="font-bold font-mono" style={{ color: scoreColor }}>
            {score.toFixed(0)}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          <CategoryBadge category={stock.category} />
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs">
          {formatMetric(m.per)}
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs">
          {formatMetric(m.pbr)}
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs">
          {formatMetric(m.roe, "%")}
        </td>
        <td className="px-3 py-3 text-right font-mono text-xs hidden sm:table-cell">
          {formatMetric(m.debt_to_equity, "%")}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--card-border)]">
          <td colSpan={7} className="px-4 py-4 bg-[var(--surface-hover)]/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Score bars */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--muted)] mb-2">세부 점수</p>
                <ScoreBar
                  label="가치"
                  value={stock.signals?.value_score ?? stock.scores?.value ?? 0}
                  color="#60a5fa"
                />
                <ScoreBar
                  label="품질"
                  value={stock.signals?.quality_score ?? stock.scores?.quality ?? 0}
                  color="#4ade80"
                />
                <ScoreBar
                  label="성장"
                  value={stock.signals?.growth_score ?? stock.scores?.growth ?? 0}
                  color="#c084fc"
                />
              </div>

              {/* Detail metrics */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--muted)] mb-2">상세 지표</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <MetricRow label="PER" value={formatMetric(m.per)} />
                  <MetricRow label="PBR" value={formatMetric(m.pbr)} />
                  <MetricRow label="ROE" value={formatMetric(m.roe, "%")} />
                  <MetricRow label="D/E" value={formatMetric(m.debt_to_equity, "%")} />
                  <MetricRow
                    label="매출성장"
                    value={formatMetric(m.revenue_growth, "%")}
                  />
                  <MetricRow
                    label="배당률"
                    value={formatMetric(m.dividend_yield, "%")}
                  />
                  <MetricRow
                    label="유동비율"
                    value={formatMetric(m.current_ratio)}
                  />
                  <MetricRow
                    label="시가총액"
                    value={
                      m.market_cap
                        ? m.market_cap >= 1e12
                          ? `${(m.market_cap / 1e12).toFixed(1)}조`
                          : m.market_cap >= 1e8
                            ? `${(m.market_cap / 1e8).toFixed(0)}억`
                            : m.market_cap.toLocaleString()
                        : "-"
                    }
                  />
                </div>
                <div className="pt-2">
                  <Link
                    href={`/search?ticker=${stock.ticker}&market=${market === "KR" ? "KOSPI" : "NASDAQ"}`}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    기술적 분석 보기 →
                  </Link>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

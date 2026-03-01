"use client";

import { useState, useMemo, useCallback } from "react";

/* ── Shared types ── */
interface CompositionItem {
  label: string;
  value: number;
  pct: number;
}

interface Position {
  id: number;
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  avg_buy_price: number;
  total_invested: number;
  current_price: number;
  eval_amount: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

interface Trade {
  id: number;
  ticker: string;
  name: string;
  market: string;
  side: string;
  quantity: number;
  price: number;
  total_amount: number;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  executed_at: string;
}

interface Summary {
  initial_balance: number;
  bonus_balance: number;
  cash_balance: number;
  total_invested: number;
  total_eval: number;
  total_assets: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_realized_pnl: number;
  position_count: number;
  currency: string;
}

/* ── Color palette ── */
const COLORS = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
];

function formatKRW(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(0)}만`;
  return formatKRW(value);
}

/* ════════════════════════════════════════════════════
   1. DonutChart
   ════════════════════════════════════════════════════ */
export function DonutChart({
  data,
  totalAssets,
}: {
  data: CompositionItem[];
  totalAssets: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const cx = 100, cy = 100, r = 70;
  const circumference = 2 * Math.PI * r;

  const segments = useMemo(() => {
    let offset = 0;
    return data.map((item, i) => {
      const dash = (item.pct / 100) * circumference;
      const gap = circumference - dash;
      const seg = { ...item, dash, gap, offset, color: COLORS[i % COLORS.length] };
      offset += dash;
      return seg;
    });
  }, [data, circumference]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg
        viewBox="0 0 200 200"
        className="w-48 h-48 shrink-0"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={hoveredIdx === i ? 28 : 22}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-width 0.2s", cursor: "pointer" }}
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--foreground)" fontSize="11" fontWeight="bold">
          {formatCompact(totalAssets)}원
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--muted)" fontSize="9">
          총 자산
        </text>
        {hoveredIdx !== null && segments[hoveredIdx] && (
          <>
            <text x={cx} y={cy + 24} textAnchor="middle" fill={segments[hoveredIdx].color} fontSize="8.5" fontWeight="600">
              {segments[hoveredIdx].label}
            </text>
            <text x={cx} y={cy + 34} textAnchor="middle" fill="var(--muted)" fontSize="8">
              {segments[hoveredIdx].pct.toFixed(1)}%
            </text>
          </>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1, transition: "opacity 0.2s" }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="text-[var(--muted)]">{seg.label}</span>
            <span className="font-medium">{seg.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   2. AssetTrendChart
   ════════════════════════════════════════════════════ */
export function AssetTrendChart({
  trades,
  summary,
}: {
  trades: Trade[];
  summary: Summary;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = useMemo(() => {
    const sorted = [...trades].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    );
    const initialBalance = summary.initial_balance + summary.bonus_balance;
    const pts: { date: string; assets: number }[] = [];

    // Starting point
    if (sorted.length > 0) {
      const firstDate = new Date(sorted[0].executed_at);
      firstDate.setDate(firstDate.getDate() - 1);
      pts.push({ date: firstDate.toISOString().slice(0, 10), assets: initialBalance });
    }

    let cumAssets = initialBalance;
    for (const t of sorted) {
      if (t.side === "BUY") {
        // No asset change on buy (cash -> stock)
      } else if (t.side === "SELL" && t.realized_pnl != null) {
        cumAssets += t.realized_pnl;
      }
      pts.push({
        date: new Date(t.executed_at).toISOString().slice(0, 10),
        assets: cumAssets,
      });
    }

    // Current point
    pts.push({ date: new Date().toISOString().slice(0, 10), assets: summary.total_assets });

    return pts;
  }, [trades, summary]);

  if (points.length < 2) {
    return <div className="text-sm text-[var(--muted)] text-center py-8">거래 내역이 부족합니다.</div>;
  }

  const W = 500, H = 140, PAD = { top: 15, right: 20, bottom: 25, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const minY = Math.min(...points.map((p) => p.assets)) * 0.98;
  const maxY = Math.max(...points.map((p) => p.assets)) * 1.02;
  const rangeY = maxY - minY || 1;

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minY) / rangeY) * chartH;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.assets).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${toX(points.length - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${toX(0).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;

  const isPositive = summary.total_assets >= (summary.initial_balance + summary.bonus_balance);
  const strokeColor = isPositive ? "#22c55e" : "#ef4444";

  // Y axis labels
  const yTicks = 3;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => minY + (rangeY / yTicks) * i);

  // X axis labels (first, middle, last)
  const xIdxs = [0, Math.floor(points.length / 2), points.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      const idx = Math.round(((mouseX - PAD.left) / chartW) * (points.length - 1));
      setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
    },
    [points.length, chartW]
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-h-[180px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines + Y labels */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke="var(--card-border)" strokeWidth="0.5"
          />
          <text x={PAD.left - 5} y={toY(v) + 3} textAnchor="end" fill="var(--muted)" fontSize="8">
            {formatCompact(v)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xIdxs.map((idx) => (
        <text key={idx} x={toX(idx)} y={H - 5} textAnchor="middle" fill="var(--muted)" fontSize="8">
          {points[idx].date.slice(5)}
        </text>
      ))}

      {/* Area + Line */}
      <path d={areaD} fill="url(#assetGrad)" />
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.assets)} r={hoverIdx === i ? 4 : 2} fill={strokeColor} />
      ))}

      {/* Hover line + tooltip */}
      {hoverIdx !== null && points[hoverIdx] && (
        <>
          <line
            x1={toX(hoverIdx)} y1={PAD.top} x2={toX(hoverIdx)} y2={PAD.top + chartH}
            stroke="var(--muted)" strokeWidth="0.5" strokeDasharray="3 2"
          />
          <rect
            x={Math.min(toX(hoverIdx) - 50, W - PAD.right - 100)}
            y={Math.max(toY(points[hoverIdx].assets) - 38, PAD.top)}
            width="100" height="32" rx="4"
            fill="var(--card)" stroke="var(--card-border)" strokeWidth="0.5"
          />
          <text
            x={Math.min(toX(hoverIdx), W - PAD.right - 50)}
            y={Math.max(toY(points[hoverIdx].assets) - 22, PAD.top + 14)}
            textAnchor="middle" fill="var(--foreground)" fontSize="8" fontWeight="600"
          >
            {formatCompact(points[hoverIdx].assets)}원
          </text>
          <text
            x={Math.min(toX(hoverIdx), W - PAD.right - 50)}
            y={Math.max(toY(points[hoverIdx].assets) - 11, PAD.top + 25)}
            textAnchor="middle" fill="var(--muted)" fontSize="7"
          >
            {points[hoverIdx].date}
          </text>
        </>
      )}
    </svg>
  );
}

/* ════════════════════════════════════════════════════
   3. PnlBarChart — 가운데 0선 기준 좌(손해)/우(이익)
   ════════════════════════════════════════════════════ */
export function PnlBarChart({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return <div className="text-sm text-[var(--muted)] text-center py-8">보유 종목이 없습니다.</div>;
  }

  const sorted = [...positions].sort((a, b) => b.eval_amount - a.eval_amount);
  const maxGain = Math.max(...sorted.map((p) => p.unrealized_pnl), 1);
  const maxLoss = Math.max(...sorted.map((p) => -p.unrealized_pnl), 1);

  return (
    <div className="space-y-2.5">
      {sorted.map((pos) => {
        const pnl = pos.unrealized_pnl;
        const pct = pnl >= 0
          ? (pnl / maxGain) * 50
          : (Math.abs(pnl) / maxLoss) * 50;
        const isPlus = pnl >= 0;

        return (
          <div key={pos.id} className="flex items-center gap-3 text-sm">
            <div className="w-24 sm:w-32 truncate text-[var(--muted)]" title={pos.name}>
              {pos.name}
            </div>
            {/* Center-split bar: left half = loss, right half = gain */}
            <div className="flex-1 h-5 bg-[var(--surface-hover)] rounded-full overflow-hidden relative">
              {/* Center line */}
              <div className="absolute left-1/2 top-0 w-px h-full bg-[var(--card-border)]" />
              {isPlus ? (
                /* Gain: grow rightward from center */
                <div
                  className="absolute top-0 h-full rounded-r-full bg-emerald-500/30 transition-all duration-500"
                  style={{ left: "50%", width: `${Math.max(pct, 0.5)}%` }}
                />
              ) : (
                /* Loss: grow leftward from center */
                <div
                  className="absolute top-0 h-full rounded-l-full bg-red-500/30 transition-all duration-500"
                  style={{ right: "50%", width: `${Math.max(pct, 0.5)}%` }}
                />
              )}
            </div>
            <div className={`w-16 text-right font-medium tabular-nums ${
              isPlus ? "text-green-400" : "text-red-400"
            }`}>
              {pnl >= 0 ? "+" : ""}{formatCompact(pnl)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   4. MarketPieChart
   ════════════════════════════════════════════════════ */
export function MarketPieChart({
  positions,
  summary,
}: {
  positions: Position[];
  summary: Summary;
}) {
  const segments = useMemo(() => {
    const KR_MARKETS = ["KOSPI", "KOSDAQ"];
    let kr = 0, us = 0;
    for (const p of positions) {
      if (KR_MARKETS.includes(p.market)) kr += p.eval_amount;
      else us += p.eval_amount;
    }
    const cash = summary.cash_balance;
    const total = kr + us + cash;
    if (total <= 0) return [];

    const items: { label: string; value: number; pct: number; color: string }[] = [];
    if (kr > 0) items.push({ label: "한국 주식", value: kr, pct: (kr / total) * 100, color: "#3b82f6" });
    if (us > 0) items.push({ label: "미국 주식", value: us, pct: (us / total) * 100, color: "#a855f7" });
    items.push({ label: "현금", value: cash, pct: (cash / total) * 100, color: "#10b981" });
    return items;
  }, [positions, summary]);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const cx = 100, cy = 100, r = 70;
  const circumference = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    let offset = 0;
    return segments.map((seg) => {
      const dash = (seg.pct / 100) * circumference;
      const gap = circumference - dash;
      const arc = { ...seg, dash, gap, offset };
      offset += dash;
      return arc;
    });
  }, [segments, circumference]);

  if (segments.length === 0) {
    return <div className="text-sm text-[var(--muted)] text-center py-8">데이터가 없습니다.</div>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg
        viewBox="0 0 200 200"
        className="w-44 h-44 shrink-0"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={hoveredIdx === i ? 28 : 22}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={-arc.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-width 0.2s", cursor: "pointer" }}
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}
        {hoveredIdx !== null && arcs[hoveredIdx] ? (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fill={arcs[hoveredIdx].color} fontSize="12" fontWeight="bold">
              {arcs[hoveredIdx].pct.toFixed(1)}%
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--muted)" fontSize="9">
              {arcs[hoveredIdx].label}
            </text>
          </>
        ) : (
          <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--muted)" fontSize="10">
            시장별 비중
          </text>
        )}
      </svg>
      <div className="space-y-2.5">
        {arcs.map((arc, i) => (
          <div
            key={i}
            className="flex items-center gap-3 cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1, transition: "opacity 0.2s" }}
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: arc.color }} />
            <div className="text-sm">
              <div className="font-medium">{arc.label}</div>
              <div className="text-xs text-[var(--muted)]">
                {formatCompact(arc.value)}원 · {arc.pct.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

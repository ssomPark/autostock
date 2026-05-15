"use client";

function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FundamentalTab({ ticker, market, data }: { ticker: string; market: string; data: any }) {
  if (!data) {
    return <div className="text-center py-20 text-[var(--muted)]">펀더멘탈 데이터를 불러오는 중...</div>;
  }

  const metrics = data.metrics || data;

  const rows = [
    { label: "PER", value: fmt(metrics.per || metrics.trailing_pe) },
    { label: "Forward PE", value: fmt(metrics.forward_pe) },
    { label: "PBR", value: fmt(metrics.pbr || metrics.price_to_book) },
    { label: "ROE", value: fmtPct(metrics.roe || metrics.return_on_equity) },
    { label: "부채비율", value: fmtPct(metrics.debt_to_equity) },
    { label: "매출 성장률", value: fmtPct(metrics.revenue_growth) },
    { label: "이익 성장률", value: fmtPct(metrics.earnings_growth) },
    { label: "영업이익률", value: fmtPct(metrics.operating_margin) },
    { label: "배당수익률", value: fmtPct(metrics.dividend_yield) },
    { label: "유동비율", value: fmt(metrics.current_ratio) },
    { label: "시가총액", value: metrics.market_cap ? `${(metrics.market_cap / 1e8).toFixed(0)}억` : "-" },
    { label: "52주 최고", value: fmt(metrics["52w_high"]) },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4">재무 지표</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="text-xs text-[var(--muted)]">{r.label}</p>
              <p className="font-medium text-sm">{r.value}</p>
            </div>
          ))}
        </div>
      </div>

      {data.scores && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">펀더멘탈 점수</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            {Object.entries(data.scores as Record<string, number>).map(([key, val]) => (
              <div key={key}>
                <p className="text-xs text-[var(--muted)] capitalize">{key}</p>
                <div className="mt-1 bg-[var(--surface-hover)] rounded-full h-2">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(val, 100)}%` }} />
                </div>
                <p className="text-xs mt-1 font-medium">{val.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

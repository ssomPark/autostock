interface SignalSummaryProps {
  label: string;
  count: number;
  color: "buy" | "sell" | "hold";
}

const colorMap = {
  buy: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "rgba(34,197,94,0.3)" },
  sell: { bg: "rgba(239,68,68,0.15)", text: "#f87171", border: "rgba(239,68,68,0.3)" },
  hold: { bg: "rgba(234,179,8,0.15)", text: "#facc15", border: "rgba(234,179,8,0.3)" },
};

export function SignalSummary({ label, count, color }: SignalSummaryProps) {
  const c = colorMap[color];
  return (
    <div
      className="rounded-lg p-4 border"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <p className="text-sm" style={{ color: c.text }}>{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: c.text }}>{count}</p>
    </div>
  );
}

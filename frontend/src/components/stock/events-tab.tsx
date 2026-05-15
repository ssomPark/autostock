"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

const API_BASE = "/api";

interface EventStock {
  ticker: string;
  name: string;
  relation_type: string;
  expected_impact: string;
}

interface MarketEvent {
  id: number;
  title: string;
  description: string;
  event_date: string;
  category: string;
  impact_level: string;
  stocks: EventStock[];
}

const IMPACT_COLORS: Record<string, string> = {
  positive: "text-green-400",
  negative: "text-red-400",
  neutral: "text-yellow-400",
};

const CATEGORY_LABEL: Record<string, string> = {
  policy: "정책",
  earnings: "실적",
  product: "제품",
  conference: "컨퍼런스",
  ipo: "IPO",
  dividend: "배당",
  global: "글로벌",
};

export function EventsTab({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-events", ticker],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/events?upcoming_days=365`);
      const result = await res.json();
      // Filter events that include this ticker
      const events = (result.events || []).filter((e: MarketEvent) =>
        e.stocks?.some((s: EventStock) => s.ticker.toUpperCase() === ticker.toUpperCase())
      );
      return events as MarketEvent[];
    },
  });

  if (isLoading) {
    return <div className="text-center py-12 text-[var(--muted)]">이벤트를 불러오는 중...</div>;
  }

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
        <p>{ticker} 관련 이벤트가 없습니다.</p>
        <Link href="/events" className="text-sm text-blue-400 hover:underline mt-2 inline-block">
          전체 이벤트 보기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const stockInfo = event.stocks.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase());
        return (
          <div key={event.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface-hover)]">
                {CATEGORY_LABEL[event.category] || event.category}
              </span>
              <span className={`text-xs ${
                event.impact_level === "high" ? "text-red-400" :
                event.impact_level === "low" ? "text-green-400" : "text-yellow-400"
              }`}>
                {event.impact_level}
              </span>
              <span className="text-xs text-[var(--muted)] ml-auto">
                {new Date(event.event_date).toLocaleDateString("ko-KR")}
              </span>
            </div>
            <h3 className="text-sm font-medium">{event.title}</h3>
            {event.description && (
              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{event.description}</p>
            )}
            {stockInfo && (
              <div className="mt-2 text-xs">
                <span className={IMPACT_COLORS[stockInfo.expected_impact] || "text-[var(--muted)]"}>
                  {stockInfo.expected_impact === "positive" ? "수혜" :
                   stockInfo.expected_impact === "negative" ? "피해" : "중립"}
                </span>
                <span className="text-[var(--muted)] ml-2">{stockInfo.relation_type}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

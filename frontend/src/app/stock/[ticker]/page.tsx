"use client";

import { use, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchScore, fetchFinancials } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AnalysisTab } from "@/components/stock/analysis-tab";
import { FundamentalTab } from "@/components/stock/fundamental-tab";
import { NewsTab } from "@/components/stock/news-tab";
import { EventsTab } from "@/components/stock/events-tab";

const TABS = [
  { key: "analysis", label: "분석" },
  { key: "fundamental", label: "펀더멘탈" },
  { key: "news", label: "뉴스" },
  { key: "events", label: "이벤트" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  // 티커 형식으로 마켓 자동 감지: 숫자 6자리 = 한국, 영문 = 미국
  const marketParam = searchParams.get("market");
  const market = marketParam || (/^\d{6}$/.test(ticker) ? "KOSPI" : "NASDAQ");
  const nameParam = searchParams.get("name");
  const tabParam = searchParams.get("tab") as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "analysis");

  const { data: scoreData, isLoading } = useQuery({
    queryKey: ["score", ticker, market],
    queryFn: () => fetchScore(ticker, market),
    enabled: !!ticker,
  });

  const { data: financialsData } = useQuery({
    queryKey: ["financials", ticker, market],
    queryFn: () => fetchFinancials(ticker, market),
    enabled: !!ticker && activeTab === "fundamental",
  });

  const sc = scoreData?.data;
  const stockName = sc?.name || sc?.stock_info?.name || nameParam || ticker;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    url.searchParams.set("market", market);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [activeTab]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">{stockName}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-[var(--muted)]">
              <span>{ticker}</span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-xs">{market}</span>
              {sc && (
                <>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    sc.signal === "BUY" ? "bg-green-500/20 text-green-400" :
                    sc.signal === "SELL" ? "bg-red-500/20 text-red-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>{sc.signal}</span>
                  <span className="font-medium">{sc.grade}</span>
                </>
              )}
            </div>
          </div>
          {(sc?.current_price || sc?.stock_info?.current_price) && (
            <div className="ml-auto text-right">
              <div className="text-lg font-bold">
                {Number(sc.current_price || sc.stock_info?.current_price).toLocaleString()}
                <span className="text-xs text-[var(--muted)] ml-1">{market.includes("KOS") ? "원" : "$"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "analysis" && (
        <AnalysisTab ticker={ticker} market={market} scoreData={sc} isLoading={isLoading} />
      )}
      {activeTab === "fundamental" && (
        <FundamentalTab ticker={ticker} market={market} data={financialsData?.data} />
      )}
      {activeTab === "news" && (
        <NewsTab ticker={ticker} stockName={stockName} />
      )}
      {activeTab === "events" && (
        <EventsTab ticker={ticker} />
      )}
    </div>
  );
}

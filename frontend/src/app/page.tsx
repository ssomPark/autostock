"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardHeader } from "@/components/dashboard/header";
import { SignalSummary } from "@/components/dashboard/signal-summary";
import { RecommendationList } from "@/components/dashboard/recommendation-list";
import { RecentNews } from "@/components/dashboard/recent-news";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { Watchlist } from "@/components/dashboard/watchlist";
import { fetchDashboardSummary } from "@/lib/api";

export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
  });

  const summary = data?.data;

  return (
    <div className="space-y-6">
      <DashboardHeader />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SignalSummary label="매수" count={summary?.buy_count ?? 0} color="buy" />
        <SignalSummary label="매도" count={summary?.sell_count ?? 0} color="sell" />
        <SignalSummary label="관망" count={summary?.hold_count ?? 0} color="hold" />
        <PipelineStatus />
      </div>
      <Watchlist />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecommendationList />
        </div>
        <div>
          <RecentNews />
        </div>
      </div>
    </div>
  );
}

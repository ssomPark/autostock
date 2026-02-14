import { DashboardHeader } from "@/components/dashboard/header";
import { SignalSummary } from "@/components/dashboard/signal-summary";
import { RecommendationList } from "@/components/dashboard/recommendation-list";
import { RecentNews } from "@/components/dashboard/recent-news";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardHeader />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SignalSummary label="매수" count={0} color="buy" />
        <SignalSummary label="매도" count={0} color="sell" />
        <SignalSummary label="관망" count={0} color="hold" />
        <PipelineStatus />
      </div>
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

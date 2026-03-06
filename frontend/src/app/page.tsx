"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/header";
import { SignalSummary } from "@/components/dashboard/signal-summary";
import { RecommendationList } from "@/components/dashboard/recommendation-list";
import { RecentNews } from "@/components/dashboard/recent-news";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { PinnedStocks } from "@/components/dashboard/pinned-stocks";
import { fetchDashboardSummary, fetchPublicUpdates } from "@/lib/api";
import type { UpdatePost } from "@/lib/api";
import { AdUnit } from "@/components/ads/ad-unit";

/* ──────────────────────────── Feature Cards Data ──────────────────────────── */

const features = [
  {
    icon: "🔍",
    title: "종목 분석",
    desc: "캔들스틱, 차트 패턴, 지지/저항선 등 기술적 분석을 제공합니다.",
    free: true,
  },
  {
    icon: "💡",
    title: "투자 추천",
    desc: "AI 기반 매수/매도/관망 추천과 종합 점수를 확인하세요.",
    free: true,
  },
  {
    icon: "📰",
    title: "뉴스 분석",
    desc: "실시간 뉴스 감성 분석과 관련 종목 매핑을 제공합니다.",
    free: true,
  },
  {
    icon: "📅",
    title: "이벤트 캘린더",
    desc: "경제 이벤트와 수혜 종목을 캘린더에서 한눈에 확인하세요.",
    free: false,
  },
  {
    icon: "💰",
    title: "모의 투자",
    desc: "가상 자금으로 매매를 연습하고 수익률을 추적하세요.",
    free: false,
  },
  {
    icon: "📋",
    title: "분석 저장",
    desc: "분석 기록을 저장하고 이전 분석 결과를 관리하세요.",
    free: false,
  },
  {
    icon: "⚖️",
    title: "종목 비교",
    desc: "여러 종목의 기술적 분석 결과를 나란히 비교하세요.",
    free: false,
  },
  {
    icon: "📑",
    title: "포트폴리오 분석",
    desc: "보유 종목을 등록하면 AI가 종합 리포트와 리스크 분석을 생성합니다.",
    free: false,
  },
  {
    icon: "⚡",
    title: "무제한 분석",
    desc: "비로그인 시 하루 5회 → 로그인 시 무제한 분석이 가능합니다.",
    free: false,
  },
];

const comparisonRows = [
  { feature: "종목 분석", guest: "5회/일", member: "무제한" },
  { feature: "투자 추천", guest: "✓", member: "✓" },
  { feature: "뉴스 분석", guest: "✓", member: "✓" },
  { feature: "이벤트 캘린더", guest: "✗", member: "✓" },
  { feature: "모의 투자", guest: "✗", member: "✓" },
  { feature: "분석 저장", guest: "✗", member: "✓" },
  { feature: "종목 비교", guest: "✗", member: "✓" },
  { feature: "포트폴리오 분석", guest: "✗", member: "✓ (일 5회)" },
  { feature: "핀 고정 (즐겨찾기)", guest: "\u2717", member: "\u2713" },
];

/* ──────────────────────────── Update Banner ──────────────────────────── */

const UPDATE_CAT_BADGE: Record<string, { label: string; cls: string }> = {
  feature: { label: "기능 추가", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  bugfix: { label: "버그 수정", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  announcement: { label: "공지", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  maintenance: { label: "점검", cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
};

function UpdateBanner() {
  const { data } = useQuery({
    queryKey: ["publicUpdates"],
    queryFn: () => fetchPublicUpdates(5),
    staleTime: 5 * 60 * 1000,
  });

  const posts: UpdatePost[] = data?.posts ?? [];
  const [expanded, setExpanded] = useState<number | null>(null);

  if (posts.length === 0) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
        <span className="text-sm font-semibold">업데이트</span>
        <span className="text-xs text-[var(--muted)]">최근 변경사항</span>
      </div>
      <div className="divide-y divide-[var(--card-border)]">
        {posts.map((p) => {
          const badge = UPDATE_CAT_BADGE[p.category] ?? UPDATE_CAT_BADGE.announcement;
          const isOpen = expanded === p.id;
          return (
            <div key={p.id} className="px-4 py-3">
              <button
                onClick={() => setExpanded(isOpen ? null : p.id)}
                className="w-full flex items-start gap-3 text-left"
              >
                <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium border ${badge.cls}`}>
                  {badge.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{p.title}</span>
                    <span className="shrink-0 text-[10px] text-[var(--muted)]">
                      {p.created_at?.split("T")[0]}
                    </span>
                  </div>
                  {isOpen && (
                    <p className="mt-2 text-sm text-[var(--muted)] whitespace-pre-wrap leading-relaxed">
                      {p.content}
                    </p>
                  )}
                </div>
                <svg
                  className={`shrink-0 mt-1 w-4 h-4 text-[var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────── Welcome Page ──────────────────────────── */

function WelcomePage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="max-w-5xl mx-auto space-y-16 py-8 px-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 py-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
          <span>📊</span>
          AI 기반 주식 분석 플랫폼
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Trade<span className="text-blue-500">Radar</span>
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
          한국·미국 주식의 기술적 분석, AI 매매 추천, 뉴스 감성 분석까지.
          <br />
          데이터 기반의 투자 인사이트를 무료로 시작하세요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onLogin}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google로 시작하기
          </button>
          <Link
            href="/search"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors underline underline-offset-4"
          >
            로그인 없이 둘러보기 →
          </Link>
        </div>
        <p className="text-[10px] text-[var(--muted)] max-w-md mx-auto pt-2 leading-relaxed">
          로그인 시 이메일·이름·프로필 사진, 분석 기록, 모의 투자 내역이 서버에 저장됩니다.
          포트폴리오는 로컬/서버 저장을 선택할 수 있습니다. 비밀번호는 저장되지 않습니다.
        </p>
      </section>

      {/* Update Banner */}
      <UpdateBanner />

      {/* Feature Cards */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-center">주요 기능</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className={`relative rounded-xl border p-5 space-y-2 transition-colors ${
                f.free
                  ? "border-[var(--card-border)] bg-[var(--card)]"
                  : "border-[var(--card-border)] bg-[var(--card)] opacity-80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{f.icon}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    f.free
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  }`}
                >
                  {f.free ? "🔓 무료" : "🔒 로그인"}
                </span>
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-center">
          비로그인 vs 로그인 비교
        </h2>
        <div className="rounded-xl border border-[var(--card-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--card)]">
                <th className="text-left px-4 py-3 font-medium">기능</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--muted)]">
                  비로그인
                </th>
                <th className="text-center px-4 py-3 font-medium text-blue-400">
                  로그인
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={
                    i % 2 === 0
                      ? "bg-[var(--background)]"
                      : "bg-[var(--card)]/50"
                  }
                >
                  <td className="px-4 py-3">{row.feature}</td>
                  <td className="px-4 py-3 text-center text-[var(--muted)]">
                    {row.guest}
                  </td>
                  <td className="px-4 py-3 text-center">{row.member}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-center space-y-4 pb-8">
        <h2 className="text-xl font-semibold">지금 시작하세요</h2>
        <p className="text-[var(--muted)] text-sm">
          Google 계정으로 간편하게 로그인하고 모든 기능을 이용하세요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onLogin}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            지금 시작하기
          </button>
          <Link
            href="/search"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors underline underline-offset-4"
          >
            로그인 없이 둘러보기 →
          </Link>
        </div>
        <p className="text-[10px] text-[var(--muted)] max-w-md mx-auto leading-relaxed">
          로그인 시 이메일·이름·프로필 사진, 분석 기록, 모의 투자 내역이 서버에 저장됩니다.
          포트폴리오는 로컬/서버 저장을 선택할 수 있습니다. 비밀번호는 저장하지 않습니다.
        </p>
      </section>
    </div>
  );
}

/* ──────────────────────────── Dashboard (기존) ──────────────────────────── */

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
  });

  const summary = data?.data;

  return (
    <div className="space-y-6">
      <DashboardHeader />
      <UpdateBanner />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SignalSummary label="매수" count={summary?.buy_count ?? 0} color="buy" />
        <SignalSummary label="매도" count={summary?.sell_count ?? 0} color="sell" />
        <SignalSummary label="관망" count={summary?.hold_count ?? 0} color="hold" />
        <PipelineStatus />
      </div>
      <PinnedStocks />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecommendationList />
        </div>
        <div>
          <RecentNews />
        </div>
      </div>
      <AdUnit slot="dashboard-bottom" className="mt-6" />
    </div>
  );
}

/* ──────────────────────────── Page (분기) ──────────────────────────── */

export default function HomePage() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return <div className="min-h-[60vh]" />;
  }

  if (!isAuthenticated) {
    return <WelcomePage onLogin={() => login("google")} />;
  }

  return <Dashboard />;
}

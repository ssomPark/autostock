"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAdminDashboard,
  fetchAdminUsers,
  fetchAdminUserDetail,
  fetchAdminPaperTradingStats,
  fetchAdminAdRewards,
  fetchAdminAdRewardStats,
  fetchAdminAdRewardSettings,
  fetchAdminSavedAnalysesStats,
  fetchAdminEvents,
  toggleAdminEventActive,
  triggerPipeline,
  subscribePipelineStream,
  fetchPipelineStatus,
  fetchPipelineHistory,
} from "@/lib/api";

type Tab = "dashboard" | "users" | "analyses" | "paper-trading" | "ad-rewards" | "events" | "pipeline";

function formatNum(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatKRW(n: number) {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 1_0000) return `${(n / 1_0000).toFixed(0)}만`;
  return formatNum(n);
}

// ─── Summary Card ───────────────────────────────────────────
function SummaryCard({ title, value, sub, icon }: { title: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-xs text-[var(--muted)]">{title}</p>
          <p className="text-xl font-bold">{typeof value === "number" ? formatNum(value) : value}</p>
          {sub && <p className="text-xs text-[var(--muted)]">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <ErrorMessage msg="대시보드 데이터를 불러올 수 없습니다." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard icon="👥" title="전체 사용자" value={data.users.total} sub={`오늘 +${data.users.today}`} />
      <SummaryCard icon="📈" title="전체 거래" value={data.trades.total} sub={`오늘 +${data.trades.today}`} />
      <SummaryCard
        icon="🎬"
        title="광고 보상"
        value={data.ad_rewards.total}
        sub={`총 ${formatKRW(data.ad_rewards.total_amount)}원`}
      />
      <SummaryCard
        icon="🔍"
        title="분석 기록"
        value={data.saved_analyses?.total ?? 0}
        sub={`오늘 +${data.saved_analyses?.today ?? 0}`}
      />
      <SummaryCard
        icon="⭐"
        title="워치리스트"
        value={data.watchlist?.total_items ?? 0}
        sub={`${data.watchlist?.unique_users ?? 0}명 이용`}
      />
      <SummaryCard icon="📅" title="활성 이벤트" value={data.events.active} />
      <SummaryCard icon="⚙️" title="파이프라인 (7일)" value={data.pipeline.runs_this_week} />
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers({ search, page, size: 20 });
      setUsers(res.users);
      setTotal(res.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="이름 또는 이메일 검색..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {loading ? <LoadingSkeleton /> : (
        <>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">이름</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">이메일</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">가입일</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">최종 로그인</th>
                  <th className="px-4 py-3 font-medium">상세</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/5">
                    <td className="px-4 py-3">{u.id}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">
                          {u.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      {u.name}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-[var(--muted)]">{u.email}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--muted)]">{u.created_at?.split("T")[0]}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--muted)]">{u.last_login_at?.split("T")[0]}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          try { setDetail(await fetchAdminUserDetail(u.id)); } catch { /* ignore */ }
                        }}
                        className="text-blue-400 hover:underline text-xs"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">이전</button>
              <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">다음</button>
            </div>
          )}
        </>
      )}

      {/* User Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetail(null)} />
          <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              {detail.avatar_url ? (
                <img src={detail.avatar_url} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center text-lg font-bold text-blue-400">
                  {detail.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <div>
                <h3 className="font-bold">{detail.name}</h3>
                <p className="text-xs text-[var(--muted)]">{detail.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-[var(--muted)]">Provider:</span> {detail.provider}</p>
              <p><span className="text-[var(--muted)]">가입일:</span> {detail.created_at?.split("T")[0]}</p>
              <div className="flex gap-4 mt-2">
                <div className="flex-1 p-2 bg-white/5 rounded text-center">
                  <p className="text-lg font-bold">{detail.analysis_count ?? 0}</p>
                  <p className="text-xs text-[var(--muted)]">분석 기록</p>
                </div>
                <div className="flex-1 p-2 bg-white/5 rounded text-center">
                  <p className="text-lg font-bold">{detail.watchlist_count ?? 0}</p>
                  <p className="text-xs text-[var(--muted)]">워치리스트</p>
                </div>
                <div className="flex-1 p-2 bg-white/5 rounded text-center">
                  <p className="text-lg font-bold">{detail.reward_count ?? 0}</p>
                  <p className="text-xs text-[var(--muted)]">광고 보상</p>
                </div>
              </div>
              {detail.accounts?.length > 0 && (
                <div>
                  <p className="text-[var(--muted)] mb-1 mt-2">모의 투자 계좌:</p>
                  {detail.accounts.map((a: any) => (
                    <div key={a.id} className="ml-2 p-2 bg-white/5 rounded mb-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--muted)]">잔고: {formatNum(a.cash_balance)}원 / 보너스: {formatNum(a.bonus_balance)}원</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setDetail(null)} className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analyses Tab ───────────────────────────────────────────
function AnalysesTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminSavedAnalysesStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return <ErrorMessage msg="분석 기록 통계를 불러올 수 없습니다." />;

  const signalColors: Record<string, string> = {
    BUY: "bg-green-500/20 text-green-400",
    SELL: "bg-red-500/20 text-red-400",
    HOLD: "bg-yellow-500/20 text-yellow-400",
  };

  const gradeColors: Record<string, string> = {
    "A+": "text-green-400",
    A: "text-green-400",
    "B+": "text-blue-400",
    B: "text-blue-400",
    C: "text-yellow-400",
    D: "text-orange-400",
    F: "text-red-400",
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon="🔍" title="총 분석 수" value={stats.total} />
        <SummaryCard icon="📊" title="고유 종목 수" value={stats.unique_tickers} />
        <SummaryCard
          icon="📉"
          title="신호 분포"
          value={`B${stats.signal_counts?.BUY ?? 0} / S${stats.signal_counts?.SELL ?? 0} / H${stats.signal_counts?.HOLD ?? 0}`}
        />
        <SummaryCard
          icon="🏆"
          title="A등급 이상"
          value={(stats.grade_distribution?.["A+"] ?? 0) + (stats.grade_distribution?.A ?? 0)}
          sub={`전체 ${stats.total}건 중`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signal Distribution */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">신호 분포</h3>
          <div className="space-y-2">
            {Object.entries(stats.signal_counts || {}).map(([signal, count]) => {
              const pct = stats.total > 0 ? ((count as number) / stats.total * 100) : 0;
              return (
                <div key={signal} className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium w-14 text-center ${signalColors[signal] ?? "bg-gray-500/20 text-gray-400"}`}>{signal}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${signal === "BUY" ? "bg-green-500" : signal === "SELL" ? "bg-red-500" : "bg-yellow-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)] w-16 text-right">{count as number}건 ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">등급 분포</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {["A+", "A", "B+", "B", "C", "D", "F"].map((g) => (
              <div key={g} className="bg-white/5 rounded p-2 text-center">
                <p className={`text-lg font-bold ${gradeColors[g] ?? "text-gray-400"}`}>{g}</p>
                <p className="text-xs text-[var(--muted)]">{stats.grade_distribution?.[g] ?? 0}건</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Analyzed Tickers */}
      {stats.top_analyzed_tickers?.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">최다 분석 종목 TOP 5</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">순위</th>
                <th className="px-3 py-2 font-medium">종목</th>
                <th className="px-3 py-2 font-medium text-right">분석 횟수</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_analyzed_tickers.map((t: any, i: number) => (
                <tr key={t.ticker} className="border-b border-[var(--card-border)] last:border-0">
                  <td className="px-3 py-2 font-bold text-blue-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-[var(--muted)] ml-2 text-xs">{t.ticker}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{t.count}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Analyses */}
      {stats.recent_analyses?.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">최근 분석 10건</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-3 py-2 font-medium">종목</th>
                  <th className="px-3 py-2 font-medium">마켓</th>
                  <th className="px-3 py-2 font-medium">신호</th>
                  <th className="px-3 py-2 font-medium">등급</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">신뢰도</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">일시</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_analyses.map((a: any) => (
                  <tr key={a.id} className="border-b border-[var(--card-border)] last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-[var(--muted)] ml-1 text-xs">{a.ticker}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{a.market}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${signalColors[a.signal] ?? "bg-gray-500/20 text-gray-400"}`}>{a.signal}</span>
                    </td>
                    <td className={`px-3 py-2 font-bold ${gradeColors[a.grade] ?? "text-gray-400"}`}>{a.grade}</td>
                    <td className="px-3 py-2 hidden sm:table-cell text-[var(--muted)]">{(a.confidence * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 hidden md:table-cell text-[var(--muted)]">{a.analyzed_at?.split("T")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Paper Trading Tab ──────────────────────────────────────
function PaperTradingTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminPaperTradingStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return <ErrorMessage msg="모의투자 통계를 불러올 수 없습니다." />;

  const activePct = stats.accounts.total > 0 ? ((stats.accounts.active / stats.accounts.total) * 100).toFixed(0) : "0";
  const avgVolume = stats.trades.total > 0 ? stats.total_volume / stats.trades.total : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard icon="👤" title="전체 계좌" value={stats.accounts.total} sub={`활성 ${stats.accounts.active} (${activePct}%)`} />
        <SummaryCard icon="📊" title="전체 거래" value={stats.trades.total} sub={`매수 ${stats.trades.buy} / 매도 ${stats.trades.sell}`} />
        <SummaryCard icon="💰" title="총 거래량" value={`${formatKRW(stats.total_volume)}원`} sub={`평균 ${formatKRW(avgVolume)}원/건`} />
      </div>
    </div>
  );
}

// ─── Ad Rewards Tab ─────────────────────────────────────────
function AdRewardsTab() {
  const [rewardStats, setRewardStats] = useState<any>(null);
  const [rewardSettings, setRewardSettings] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAdminAdRewardStats().catch(() => null),
      fetchAdminAdRewardSettings().catch(() => null),
    ]).then(([stats, settings]) => {
      setRewardStats(stats);
      setRewardSettings(settings);
    }).finally(() => setLoading(false));
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetchAdminAdRewards({ status: statusFilter || undefined, page: logPage, size: 20 });
      setLogs(res.logs);
      setLogTotal(res.total);
    } catch { /* ignore */ }
    setLogsLoading(false);
  }, [statusFilter, logPage]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <LoadingSkeleton />;

  const logTotalPages = Math.ceil(logTotal / 20);

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-400",
      claimed: "bg-green-500/20 text-green-400",
      expired: "bg-red-500/20 text-red-400",
    };
    return colors[s] ?? "bg-gray-500/20 text-gray-400";
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {rewardStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon="🎯" title="총 청구 건" value={rewardStats.total_claimed} />
          <SummaryCard icon="💰" title="총 지급 금액" value={`${formatKRW(rewardStats.total_amount)}원`} />
          <SummaryCard icon="📅" title="오늘 건수" value={rewardStats.today_count} sub={rewardStats.today_amount > 0 ? `${formatKRW(rewardStats.today_amount)}원` : undefined} />
          <SummaryCard icon="📊" title="평균 금액" value={`${formatNum(rewardStats.avg_amount)}원`} />
        </div>
      )}

      {/* Settings */}
      {rewardSettings && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <h3 className="font-bold text-sm mb-3">보상 설정</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
            <div className="bg-white/5 rounded p-2">
              <p className="text-xs text-[var(--muted)]">쿨다운</p>
              <p className="font-medium">{rewardSettings.cooldown_seconds}초</p>
            </div>
            <div className="bg-white/5 rounded p-2">
              <p className="text-xs text-[var(--muted)]">최소 금액</p>
              <p className="font-medium">{formatNum(rewardSettings.min_amount)}원</p>
            </div>
            <div className="bg-white/5 rounded p-2">
              <p className="text-xs text-[var(--muted)]">최대 금액</p>
              <p className="font-medium">{formatNum(rewardSettings.max_amount)}원</p>
            </div>
            <div className="bg-white/5 rounded p-2">
              <p className="text-xs text-[var(--muted)]">시청 시간</p>
              <p className="font-medium">{rewardSettings.min_watch_seconds}초</p>
            </div>
            <div className="bg-white/5 rounded p-2">
              <p className="text-xs text-[var(--muted)]">만료 시간</p>
              <p className="font-medium">{rewardSettings.token_expire_seconds}초</p>
            </div>
          </div>
        </div>
      )}

      {/* Log Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm">보상 로그</h3>
          <div className="flex gap-1 ml-auto">
            {[
              { value: "", label: "전체" },
              { value: "pending", label: "대기" },
              { value: "claimed", label: "청구" },
              { value: "expired", label: "만료" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => { setStatusFilter(f.value); setLogPage(1); }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === f.value ? "bg-blue-600 text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {logsLoading ? <LoadingSkeleton /> : (
          <>
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">사용자 ID</th>
                    <th className="px-4 py-3 font-medium">금액</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">생성일</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">청구일</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/5">
                      <td className="px-4 py-3">{log.id}</td>
                      <td className="px-4 py-3">{log.user_id}</td>
                      <td className="px-4 py-3 font-medium">{formatNum(log.reward_amount)}원</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(log.status)}`}>{log.status}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-[var(--muted)]">{log.created_at?.split("T")[0]}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-[var(--muted)]">{log.claimed_at?.split("T")[0] ?? "-"}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">로그 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {logTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPage <= 1} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">이전</button>
                <span className="text-sm text-[var(--muted)]">{logPage} / {logTotalPages}</span>
                <button onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))} disabled={logPage >= logTotalPages} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">다음</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Events Tab ─────────────────────────────────────────────
function EventsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminEvents({ page, size: 30 });
      setEvents(res.events);
      setTotal(res.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 30);

  const handleToggle = async (id: number) => {
    try {
      const res = await toggleAdminEventActive(id);
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, is_active: res.is_active } : e));
    } catch { /* ignore */ }
  };

  const categoryColors: Record<string, string> = {
    policy: "bg-blue-500/20 text-blue-400",
    earnings: "bg-green-500/20 text-green-400",
    product: "bg-purple-500/20 text-purple-400",
    conference: "bg-cyan-500/20 text-cyan-400",
    ipo: "bg-amber-500/20 text-amber-400",
    dividend: "bg-emerald-500/20 text-emerald-400",
    global: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-4">
      {loading ? <LoadingSkeleton /> : (
        <>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">제목</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">카테고리</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">일자</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">종목수</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/5">
                    <td className="px-4 py-3">{e.id}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{e.title}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[e.category] ?? "bg-gray-500/20 text-gray-400"}`}>
                        {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--muted)]">{e.event_date?.split("T")[0]}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{e.stock_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(e.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          e.is_active ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        }`}
                      >
                        {e.is_active ? "활성" : "비활성"}
                      </button>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">이벤트 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">이전</button>
              <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded bg-white/5 text-sm disabled:opacity-30">다음</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Pipeline Types & Constants ─────────────────────────────

interface PipelineStepState {
  id: string;
  name: string;
  icon: string;
  status: "pending" | "running" | "completed" | "failed";
  duration: number | null;
  summary: string | null;
}

interface PipelineBatchState {
  enabled: boolean;
  markets: string[];
  current_index: number;
  results: { market: string; status: string; duration: number }[];
}

interface PipelineState {
  pipeline_id: string | null;
  market: string | null;
  status: "idle" | "running" | "completed" | "failed";
  current_step: string | null;
  started_at: number | null;
  elapsed_seconds: number;
  steps: PipelineStepState[];
  logs: string[];
  batch?: PipelineBatchState;
  keepalive?: boolean;
}

interface PipelineHistoryItem {
  id: number;
  market_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  recommendations_count: number;
  error_message: string | null;
}

const PIPELINE_DEFAULT_STEPS: PipelineStepState[] = [
  { id: "news", name: "뉴스 수집", icon: "📰", status: "pending", duration: null, summary: null },
  { id: "keywords", name: "키워드 추출", icon: "🔑", status: "pending", duration: null, summary: null },
  { id: "screening", name: "종목 스크리닝", icon: "🔍", status: "pending", duration: null, summary: null },
  { id: "analysis", name: "기술적 분석", icon: "📊", status: "pending", duration: null, summary: null },
  { id: "recommendation", name: "투자 추천 생성", icon: "💡", status: "pending", duration: null, summary: null },
  { id: "save", name: "저장 및 알림", icon: "💾", status: "pending", duration: null, summary: null },
];

const MARKET_OPTIONS = [
  { value: "KR", label: "한국", flag: "\u{1F1F0}\u{1F1F7}" },
  { value: "US", label: "미국", flag: "\u{1F1FA}\u{1F1F8}" },
  { value: "ALL", label: "전체", flag: "\u{1F30D}" },
] as const;

// ─── Pipeline Sub-components ────────────────────────────────

function PipelineStepIndicator({ step, index, total }: { step: PipelineStepState; index: number; total: number }) {
  const statusStyles = {
    pending: "bg-[var(--card-border)] text-[var(--muted)]",
    running: "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-[var(--background)]",
    completed: "bg-emerald-600 text-white",
    failed: "bg-red-600 text-white",
  };
  const lineStyles = {
    pending: "bg-[var(--card-border)]",
    running: "bg-[var(--card-border)]",
    completed: "bg-emerald-600",
    failed: "bg-red-600",
  };

  return (
    <div className="flex sm:flex-row flex-col items-center">
      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${statusStyles[step.status]}`}>
          {step.status === "running" ? (
            <span className="animate-spin text-sm">{"\u23F3"}</span>
          ) : step.status === "completed" ? "\u2713" : step.status === "failed" ? "\u2717" : (
            <span className="text-sm">{index + 1}</span>
          )}
        </div>
        <span className="text-xs text-center w-20 truncate" title={step.name}>{step.icon} {step.name}</span>
        {step.duration != null && <span className="text-[10px] text-[var(--muted)]">{step.duration}s</span>}
      </div>
      {index < total - 1 && (
        <>
          <div className={`hidden sm:block w-8 h-0.5 mx-1 mt-[-20px] transition-colors duration-300 ${lineStyles[step.status]}`} />
          <div className={`sm:hidden w-0.5 h-4 my-1 transition-colors duration-300 ${lineStyles[step.status]}`} />
        </>
      )}
    </div>
  );
}

function PipelineLogPanel({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs.length]);

  return (
    <div className="bg-black/50 border border-[var(--card-border)] rounded-lg p-4 h-48 sm:h-64 overflow-y-auto font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-[var(--muted)]">파이프라인을 실행하면 로그가 표시됩니다...</p>
      ) : logs.map((log, i) => (
        <div key={i} className="py-0.5 text-[var(--foreground)] opacity-90">{log}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function PipelineBatchProgress({ batch, currentMarket }: { batch: PipelineBatchState; currentMarket: string | null }) {
  if (!batch.enabled) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <div className="text-sm font-medium mb-3">전체 실행 ({batch.current_index + 1}/{batch.markets.length} 시장)</div>
      <div className="flex items-center gap-3">
        {batch.markets.map((m, i) => {
          const result = batch.results.find((r) => r.market === m);
          const isCurrent = i === batch.current_index && !result;
          const isCompleted = !!result;
          const isPending = i > batch.current_index && !result;
          return (
            <div key={m} className="flex items-center gap-3">
              {i > 0 && <div className={`w-8 h-0.5 ${isCompleted || isCurrent ? "bg-emerald-600" : "bg-[var(--card-border)]"}`} />}
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full shrink-0 ${isCompleted ? "bg-emerald-500" : isCurrent ? "bg-blue-500 animate-pulse" : "bg-[var(--card-border)]"}`} />
                <span className={`text-sm ${isCurrent ? "font-medium text-blue-400" : isPending ? "text-[var(--muted)]" : ""}`}>{m}</span>
                {isCompleted && <span className="text-xs text-[var(--muted)]">{result.duration}s</span>}
                {isCurrent && <span className="text-xs text-blue-400">실행중</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineResultSummary({ state }: { state: PipelineState }) {
  if (state.status !== "completed" && state.status !== "failed") return null;
  const batch = state.batch;
  const isBatch = batch?.enabled && batch.results.length > 0;
  const completedSteps = state.steps.filter((s) => s.status === "completed");
  const stepDuration = completedSteps.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  let totalDuration = stepDuration;
  let durationLabel = `총 ${stepDuration.toFixed(1)}초`;
  if (isBatch) {
    totalDuration = batch.results.reduce((acc, r) => acc + r.duration, 0);
    const parts = batch.results.map((r) => `${r.market} ${r.duration}s`).join(" + ");
    durationLabel = `${parts} = 총 ${totalDuration.toFixed(1)}s`;
  }

  return (
    <div className={`border rounded-lg p-5 ${state.status === "completed" ? "bg-emerald-950/30 border-emerald-800" : "bg-red-950/30 border-red-800"}`}>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        {state.status === "completed" ? (isBatch ? "전체 파이프라인 완료" : "파이프라인 완료") : "파이프라인 실패"}
        <span className="text-sm font-normal text-[var(--muted)]">{durationLabel}</span>
      </h3>
      {isBatch && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {batch.results.map((r) => (
            <div key={r.market} className={`text-sm p-3 rounded border ${r.status === "completed" ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-800/50 bg-red-950/20"}`}>
              <div className="font-medium">{r.market === "KR" ? "\u{1F1F0}\u{1F1F7}" : "\u{1F1FA}\u{1F1F8}"} {r.market} 시장</div>
              <div className="text-[var(--muted)] text-xs mt-1">{r.duration}s</div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {state.steps.map((step) => (
          <div key={step.id} className={`text-sm p-2 rounded border ${step.status === "completed" ? "border-emerald-800/50 bg-emerald-950/20" : step.status === "failed" ? "border-red-800/50 bg-red-950/20" : "border-[var(--card-border)] bg-[var(--card)]"}`}>
            <div className="font-medium">{step.icon} {step.name}</div>
            {step.duration != null && <div className="text-[var(--muted)] text-xs mt-0.5">{step.duration}s</div>}
            {step.summary && <div className="text-xs mt-0.5 opacity-80">{step.summary}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineHistoryPanel() {
  const [items, setItems] = useState<PipelineHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchPipelineHistory(20).then((res) => setItems(res?.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function fmtDuration(started: string | null, completed: string | null): string {
    if (!started || !completed) return "-";
    const ms = new Date(completed).getTime() - new Date(started).getTime();
    return ms < 0 ? "-" : `${(ms / 1000).toFixed(1)}s`;
  }

  function fmtTime(iso: string | null): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = { completed: "bg-emerald-950/50 text-emerald-400 border-emerald-800/50", failed: "bg-red-950/50 text-red-400 border-red-800/50", running: "bg-blue-950/50 text-blue-400 border-blue-800/50" };
    const labels: Record<string, string> = { completed: "완료", failed: "실패", running: "진행중" };
    return <span className={`text-xs px-2 py-0.5 rounded border ${styles[status] ?? "bg-[var(--card)] text-[var(--muted)] border-[var(--card-border)]"}`}>{labels[status] ?? status}</span>;
  };

  if (loading) return <LoadingSkeleton />;
  if (items.length === 0) return <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">실행 이력이 없습니다</div>;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-[var(--muted)] text-xs uppercase tracking-wider">
            <th className="text-left p-3 font-semibold">실행 시간</th>
            <th className="text-left p-3 font-semibold">시장</th>
            <th className="text-left p-3 font-semibold">상태</th>
            <th className="text-right p-3 font-semibold">추천 수</th>
            <th className="text-right p-3 font-semibold">소요 시간</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="p-3 border-t border-[var(--card-border)]">
                <div className="flex items-center gap-2">
                  {item.error_message && (
                    <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xs">
                      {expandedId === item.id ? "\u25BC" : "\u25B6"}
                    </button>
                  )}
                  <span>{fmtTime(item.started_at)}</span>
                </div>
                {expandedId === item.id && item.error_message && (
                  <div className="mt-2 text-xs text-red-400 bg-red-950/20 border border-red-800/30 rounded p-2">{item.error_message}</div>
                )}
              </td>
              <td className="p-3 border-t border-[var(--card-border)]">{item.market_type === "KR" ? "\u{1F1F0}\u{1F1F7} KR" : "\u{1F1FA}\u{1F1F8} US"}</td>
              <td className="p-3 border-t border-[var(--card-border)]">{statusBadge(item.status)}</td>
              <td className="p-3 border-t border-[var(--card-border)] text-right tabular-nums">{item.recommendations_count}</td>
              <td className="p-3 border-t border-[var(--card-border)] text-right tabular-nums text-[var(--muted)]">{fmtDuration(item.started_at, item.completed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pipeline Tab (Full) ────────────────────────────────────
function PipelineTab() {
  const { logout } = useAuth();
  const [pipelineSubTab, setPipelineSubTab] = useState<"run" | "history">("run");
  const [market, setMarket] = useState("KR");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<PipelineState>({
    pipeline_id: null, market: null, status: "idle", current_step: null,
    started_at: null, elapsed_seconds: 0, steps: PIPELINE_DEFAULT_STEPS, logs: [],
  });

  const handleEvent = useCallback((data: Record<string, unknown>) => {
    if ("keepalive" in data) return;
    setState(data as unknown as PipelineState);
  }, []);

  useEffect(() => {
    const close = subscribePipelineStream(handleEvent, undefined, setConnected);
    const pollId = setInterval(async () => {
      if (!connected) {
        try { const res = await fetchPipelineStatus(); if (res?.data) handleEvent(res.data); } catch { /* ignore */ }
      }
    }, 2000);
    return () => { close(); clearInterval(pollId); };
  }, [handleEvent, connected]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const handleRun = async () => {
    setTriggerLoading(true);
    setAdminError(null);
    try {
      await triggerPipeline(market);
      try { const res = await fetchPipelineStatus(); if (res?.data) handleEvent(res.data); } catch { /* ignore */ }
    } catch (err: any) {
      const status = err.status ?? (err.message?.includes("403") ? 403 : err.message?.includes("401") ? 401 : 0);
      if (status === 403) setAdminError("관리자만 파이프라인을 실행할 수 있습니다.");
      else if (status === 401) { setAdminError("세션이 만료되었습니다. 다시 로그인해주세요."); logout(); }
      else setAdminError(`파이프라인 실행 실패: ${err.message}`);
    }
    setTriggerLoading(false);
  };

  const isRunning = state.status === "running";
  const currentStep = state.steps.find((s) => s.status === "running");
  const completedCount = state.steps.filter((s) => s.status === "completed").length;
  const batch = state.batch;
  const elapsed = state.elapsed_seconds;

  return (
    <div className="space-y-6">
      {/* Header with SSE status */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-1">
          {([{ key: "run" as const, label: "실행" }, { key: "history" as const, label: "이력" }]).map((t) => (
            <button key={t.key} onClick={() => setPipelineSubTab(t.key)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${pipelineSubTab === t.key ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-[var(--muted)]">{connected ? "SSE 연결됨" : "연결 끊김"}</span>
        </div>
      </div>

      {pipelineSubTab === "run" ? (
        <>
          {/* Control panel */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {MARKET_OPTIONS.map((m) => (
                  <button key={m.value} onClick={() => setMarket(m.value)} disabled={isRunning}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${market === m.value ? "bg-blue-600 text-white" : "bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-blue-600/50"} disabled:opacity-50`}
                  >{m.flag} {m.label}</button>
                ))}
              </div>
              <button onClick={handleRun} disabled={isRunning || triggerLoading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors w-full sm:w-auto"
              >{isRunning ? "실행 중..." : triggerLoading ? "시작 중..." : "파이프라인 실행"}</button>
            </div>
            {market === "ALL" && !isRunning && (
              <p className="text-xs text-[var(--muted)] mt-2">한국 시장 완료 후 미국 시장을 순차 실행합니다.</p>
            )}
            {adminError && <p className="text-xs text-red-400 mt-2">{adminError}</p>}
          </div>

          {/* Batch progress */}
          {batch?.enabled && <PipelineBatchProgress batch={batch} currentMarket={state.market} />}

          {/* Status bar */}
          {isRunning && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shrink-0" />
                <div>
                  <span className="font-medium">{currentStep ? `${currentStep.icon} ${currentStep.name}` : "준비 중..."}</span>
                  <span className="text-[var(--muted)] text-sm ml-2">({completedCount}/{state.steps.length} 완료)</span>
                  {batch?.enabled && <span className="text-blue-400 text-sm ml-2">[{state.market}]</span>}
                </div>
              </div>
              <div className="text-sm text-[var(--muted)] tabular-nums">경과: {elapsed.toFixed(1)}s</div>
            </div>
          )}

          {/* Step progress */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
              단계별 진행 상황
              {batch?.enabled && state.market && <span className="ml-2 normal-case text-blue-400">({state.market})</span>}
            </h2>
            <div className="flex items-start justify-center flex-wrap gap-y-2 sm:gap-y-4 sm:flex-row flex-col sm:items-start">
              {state.steps.map((step, i) => (
                <PipelineStepIndicator key={step.id} step={step} index={i} total={state.steps.length} />
              ))}
            </div>
          </div>

          <PipelineResultSummary state={state} />

          {/* Log panel */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">실시간 로그</h2>
            <PipelineLogPanel logs={state.logs} />
          </div>
        </>
      ) : (
        <PipelineHistoryPanel />
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function ErrorMessage({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
      <span>&#x26A0;&#xFE0F;</span> {msg}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export default function AdminPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user?.is_admin)) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !user?.is_admin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--muted)]">로딩 중...</div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "대시보드" },
    { key: "users", label: "사용자" },
    { key: "analyses", label: "분석 기록" },
    { key: "paper-trading", label: "모의 투자" },
    { key: "ad-rewards", label: "광고 보상" },
    { key: "events", label: "이벤트" },
    { key: "pipeline", label: "파이프라인" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">관리자 대시보드</h1>
        <p className="text-sm text-[var(--muted)]">서비스 현황을 한눈에 확인하세요.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--card-border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && <DashboardTab />}
      {tab === "users" && <UsersTab />}
      {tab === "analyses" && <AnalysesTab />}
      {tab === "paper-trading" && <PaperTradingTab />}
      {tab === "ad-rewards" && <AdRewardsTab />}
      {tab === "events" && <EventsTab />}
      {tab === "pipeline" && <PipelineTab />}
    </div>
  );
}

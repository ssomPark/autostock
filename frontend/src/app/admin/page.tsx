"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAdminDashboard,
  fetchAdminUsers,
  fetchAdminUserDetail,
  fetchAdminMetrics,
  triggerAdminMetricsSnapshot,
  fetchAdminPaperTradingStats,
  fetchAdminSavedAnalysesStats,
  fetchAdminEvents,
  toggleAdminEventActive,
  autoGenerateEvents,
  triggerPipeline,
  resetPipeline,
  subscribePipelineStream,
  fetchPipelineStatus,
  fetchPipelineHistory,
  fetchNavOrder,
  updateAdminNavOrder,
  fetchAdminUpdates,
  createAdminUpdate,
  updateAdminUpdate,
  deleteAdminUpdate,
  fetchAdminTopPages,
  fetchAdminApiUsage,
} from "@/lib/api";
import type { UpdatePost } from "@/lib/api";

type Tab = "dashboard" | "metrics" | "users" | "analyses" | "paper-trading" | "events" | "updates" | "pipeline" | "navigation" | "api-usage";

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

  const v = data.visitors;

  return (
    <div className="space-y-4">
      {/* Visitor cards */}
      {v && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon="🌐" title="오늘 방문자" value={v.today_total} sub="전체 (브라우저 기준)" />
          <SummaryCard icon="👤" title="비로그인" value={v.today_anon} sub={v.today_total > 0 ? `${((v.today_anon / v.today_total) * 100).toFixed(0)}%` : "0%"} />
          <SummaryCard icon="🔑" title="로그인" value={v.today_logged_in} sub={v.today_total > 0 ? `${((v.today_logged_in / v.today_total) * 100).toFixed(0)}%` : "0%"} />
          <SummaryCard icon="📄" title="페이지뷰" value={v.page_views} sub="API 요청 수" />
        </div>
      )}

      {/* Existing cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon="👥" title="전체 사용자" value={data.users.total} sub={`오늘 +${data.users.today}`} />
        <SummaryCard icon="📈" title="전체 거래" value={data.trades.total} sub={`오늘 +${data.trades.today}`} />
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
    </div>
  );
}

// ─── Mini Bar Chart (CSS-only) ──────────────────────────────
function MiniBarChart({
  data,
  dataKey,
  label,
  color = "bg-blue-500",
}: {
  data: { date: string; [k: string]: number | string }[];
  dataKey: string;
  label: string;
  color?: string;
}) {
  const values = data.map((d) => (typeof d[dataKey] === "number" ? (d[dataKey] as number) : 0));
  const max = Math.max(...values, 1);

  // Label interval based on data length
  const labelInterval = data.length > 30 ? 10 : data.length > 14 ? 5 : 1;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <p className="text-sm font-medium mb-3">{label}</p>
      <div className="flex gap-[2px] h-28">
        {data.map((d, i) => {
          const v = values[i];
          const pct = (v / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[var(--card)] border border-[var(--card-border)] rounded px-2 py-1 text-xs shadow-lg whitespace-nowrap z-10">
                {d.date}: {formatNum(v)}
              </div>
              <div
                className={`w-full rounded-t ${color} min-h-[2px] transition-all`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-[2px] mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {i % labelInterval === 0 ? (
              <span className="text-[10px] text-[var(--muted)]">{d.date}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Usage Bar ──────────────────────────────────────────────
function UsageBar({ icon, label, count, max }: { icon: string; label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span className="font-semibold">{formatNum(count)}</span>
        </div>
        <div className="h-2 bg-[var(--card-border)] rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Segment Bar ────────────────────────────────────────────
function SegmentBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-[var(--muted)]">{formatNum(value)}명 ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-3 bg-[var(--card-border)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Metrics Tab ────────────────────────────────────────────
function MetricsTab() {
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [topPages, setTopPages] = useState<{ path: string; label?: string; count: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, tp] = await Promise.all([
        fetchAdminMetrics(period),
        fetchAdminTopPages().catch(() => ({ pages: [] })),
      ]);
      setData(res);
      setTopPages(tp.pages || []);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const handleSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      await triggerAdminMetricsSnapshot();
      await load();
    } catch {} finally {
      setSnapshotLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (!data) return <ErrorMessage msg="지표 데이터를 불러올 수 없습니다." />;

  const s = data.summary;
  const fu = data.feature_usage;
  const eng = data.engagement;
  const seg = data.segmentation;
  const daily = data.daily || [];

  const maxUsage = Math.max(fu.analyses, fu.trades, fu.pins, 1);

  return (
    <div className="space-y-6">
      {/* Period selector + Snapshot button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {([7, 30, 90] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--card-border)]"
              }`}
            >
              {p}일
            </button>
          ))}
        </div>
        <button
          onClick={handleSnapshot}
          disabled={snapshotLoading}
          className="px-3 py-1.5 text-xs bg-[var(--card)] border border-[var(--card-border)] rounded hover:bg-[var(--card-border)] transition-colors disabled:opacity-50"
        >
          {snapshotLoading ? "수집 중..." : "스냅샷 수집"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard icon="📊" title="DAU (오늘)" value={s.dau} />
        <SummaryCard icon="📈" title="MAU (30일)" value={s.mau} />
        <SummaryCard
          icon="🆕"
          title="신규 가입"
          value={s.new_users}
          sub={s.growth_rate > 0 ? `+${s.growth_rate}%` : s.growth_rate < 0 ? `${s.growth_rate}%` : "0%"}
        />
        <SummaryCard icon="👥" title="활성 사용자" value={s.active_users} sub={`/ ${s.total_users}명`} />
        <SummaryCard icon="🔄" title="리텐션" value={`${s.retention_rate}%`} />
        <SummaryCard icon="🌐" title="일평균 방문자" value={s.avg_visitors ?? 0} sub={`${period}일 기준`} />
        <SummaryCard icon="📄" title="총 페이지뷰" value={s.total_page_views ?? 0} sub={`${period}일 합계`} />
      </div>

      {/* DAU Trend Chart */}
      {daily.length > 0 && (
        <MiniBarChart data={daily} dataKey="active_users" label="일별 DAU 추세" color="bg-blue-500" />
      )}

      {/* Feature usage + Segmentation side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feature usage */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium mb-1">기능별 사용량 ({period}일)</p>
          <UsageBar icon="🔍" label="분석" count={fu.analyses} max={maxUsage} />
          <UsageBar icon="💹" label="거래" count={fu.trades} max={maxUsage} />
          <UsageBar icon="📌" label="핀" count={fu.pins} max={maxUsage} />
        </div>

        {/* User segmentation */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium mb-1">사용자 세분화</p>
          <SegmentBar label="활성 사용자" value={seg.active_logged_in} total={seg.registered} color="bg-green-500" />
          <SegmentBar label="비활성 사용자" value={seg.inactive} total={seg.registered} color="bg-gray-500" />
          <div className="border-t border-[var(--card-border)] pt-3 mt-3">
            <p className="text-xs text-[var(--muted)] mb-2">참여도 (활성 사용자당)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-lg font-bold">{eng.avg_analyses_per_user}</p>
                <p className="text-xs text-[var(--muted)]">평균 분석 횟수</p>
              </div>
              <div>
                <p className="text-lg font-bold">{eng.avg_trades_per_user}</p>
                <p className="text-xs text-[var(--muted)]">평균 거래 횟수</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New users trend + Analysis/Trade trend */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MiniBarChart data={daily} dataKey="new_users" label="신규 가입 추세" color="bg-green-500" />
          <MiniBarChart data={daily} dataKey="analysis_count" label="분석 추세" color="bg-purple-500" />
        </div>
      )}

      {/* Trade + Pipeline trend */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MiniBarChart data={daily} dataKey="trade_count" label="거래 추세" color="bg-amber-500" />
          <MiniBarChart data={daily} dataKey="pipeline_runs" label="파이프라인 실행 추세" color="bg-cyan-500" />
        </div>
      )}

      {/* Visitor trends */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MiniBarChart data={daily} dataKey="unique_visitors" label="일별 방문자 추세" color="bg-teal-500" />
          <MiniBarChart data={daily} dataKey="page_views" label="일별 페이지뷰 추세" color="bg-indigo-500" />
        </div>
      )}

      {/* Visitor ratio + Top pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Anon vs Logged-in ratio from snapshots */}
        {daily.length > 0 && (() => {
          const totalVisitors = daily.reduce((sum: number, d: any) => sum + (d.unique_visitors || 0), 0);
          const totalAnon = daily.reduce((sum: number, d: any) => sum + (d.unique_visitors_anon || 0), 0);
          const totalLoggedIn = daily.reduce((sum: number, d: any) => sum + (d.unique_visitors_logged || 0), 0);
          return (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium mb-1">방문자 구성 ({period}일 합계)</p>
              <SegmentBar label="비로그인 방문자" value={totalAnon} total={totalVisitors || 1} color="bg-orange-500" />
              <SegmentBar label="로그인 사용자" value={totalLoggedIn} total={totalVisitors || 1} color="bg-green-500" />
            </div>
          );
        })()}

        {/* Top pages */}
        {topPages.length > 0 && (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm font-medium mb-3">오늘 인기 페이지 TOP 10</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">기능</th>
                  <th className="px-2 py-2 font-medium text-right">요청 수</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p, i) => (
                  <tr key={p.path} className="border-b border-[var(--card-border)] last:border-0">
                    <td className="px-2 py-2 text-blue-400 font-bold">{i + 1}</td>
                    <td className="px-2 py-2">
                      <span className="text-sm">{p.label || p.path}</span>
                      {p.label && p.label !== p.path && (
                        <span className="block text-[10px] text-[var(--muted)] font-mono">{p.path}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">{formatNum(p.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
          className="flex-1 h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
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
                  <tr key={u.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--surface-hover)]">
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">이전</button>
              <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">다음</button>
            </div>
          )}
        </>
      )}

      {/* User Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setDetail(null)} />
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
                <div className="flex-1 p-2 bg-[var(--surface-hover)] rounded text-center">
                  <p className="text-lg font-bold">{detail.analysis_count ?? 0}</p>
                  <p className="text-xs text-[var(--muted)]">분석 기록</p>
                </div>
                <div className="flex-1 p-2 bg-[var(--surface-hover)] rounded text-center">
                  <p className="text-lg font-bold">{detail.watchlist_count ?? 0}</p>
                  <p className="text-xs text-[var(--muted)]">워치리스트</p>
                </div>
              </div>
              {detail.accounts?.length > 0 && (
                <div>
                  <p className="text-[var(--muted)] mb-1 mt-2">모의 투자 계좌:</p>
                  {detail.accounts.map((a: any) => (
                    <div key={a.id} className="ml-2 p-2 bg-[var(--surface-hover)] rounded mb-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--muted)]">잔고: {formatNum(a.cash_balance)}원 / 보너스: {formatNum(a.bonus_balance)}원</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setDetail(null)} className="mt-4 w-full py-2 rounded-lg bg-[var(--surface-active)] hover:bg-white/20 text-sm transition-colors">닫기</button>
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
                  <div className="flex-1 h-2 bg-[var(--surface-hover)] rounded-full overflow-hidden">
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
              <div key={g} className="bg-[var(--surface-hover)] rounded p-2 text-center">
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
                    <td className="px-3 py-2 hidden sm:table-cell text-[var(--muted)]">{a.confidence?.toFixed(0) ?? "-"}%</td>
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

// ─── Events Tab ─────────────────────────────────────────────
function EventsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Auto-generate state
  const now = new Date();
  const [genMonth, setGenMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [genMarket, setGenMarket] = useState("ALL");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ currentMonth: number; total: number; done: number } | null>(null);
  const [genResults, setGenResults] = useState<Array<{
    month: number; count: number; error?: string;
    events: Array<{ id: number; title: string; event_date: string; category: string; impact_level: string; stock_count: number }>;
  }>>([]);

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

  const handleAutoGenerate = async () => {
    setGenerating(true);
    setGenResults([]);

    const [yearStr, monthStr] = genMonth.split("-");
    const year = parseInt(yearStr);
    const startMonth = parseInt(monthStr);
    const totalMonths = 12 - startMonth + 1;
    const results: typeof genResults = [];

    for (let m = startMonth; m <= 12; m++) {
      setGenProgress({ currentMonth: m, total: totalMonths, done: m - startMonth });
      try {
        const res = await autoGenerateEvents({ year, month: m, market: genMarket });
        results.push({ month: m, count: res.generated_count, events: res.events || [] });
      } catch (err: any) {
        const error = err?.message?.includes("400")
          ? "API 키 오류"
          : err?.message?.includes("502")
          ? "OpenAI API 오류"
          : "생성 실패";
        results.push({ month: m, count: 0, events: [], error });
      }
      setGenResults([...results]);
    }

    setGenProgress(null);
    setGenerating(false);
    load();
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

  const marketOptions = [
    { value: "KR", label: "KR" },
    { value: "US", label: "US" },
    { value: "ALL", label: "ALL" },
  ];

  return (
    <div className="space-y-4">
      {/* Auto-generate panel */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">이벤트 자동 생성</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">연/월</label>
            <input
              type="month"
              value={genMonth}
              onChange={(e) => setGenMonth(e.target.value)}
              className="px-3 py-1.5 rounded bg-[var(--surface-hover)] border border-[var(--card-border)] text-sm"
              disabled={generating}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">시장</label>
            <div className="flex rounded overflow-hidden border border-[var(--card-border)]">
              {marketOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGenMarket(opt.value)}
                  disabled={generating}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    genMarket === opt.value
                      ? "bg-blue-600 text-white"
                      : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {generating && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {generating
              ? `${genProgress?.currentMonth ?? ""}월 생성 중... (${genProgress?.done ?? 0}/${genProgress?.total ?? 0})`
              : `${genMonth.split("-")[1]}월~12월 일괄 생성`}
          </button>
        </div>
        {/* 월별 진행 결과 */}
        {genResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {/* 요약 바 */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[var(--muted)]">
                총 {genResults.reduce((s, r) => s + r.count, 0)}개 신규 이벤트
                ({genResults.filter(r => r.count > 0).length}/{genResults.length}개월)
              </span>
              {!generating && genResults.some(r => r.error) && (
                <span className="text-red-400 text-xs">
                  {genResults.filter(r => r.error).length}개월 오류
                </span>
              )}
            </div>
            {/* 월별 상세 */}
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {genResults.map((r) => (
                <details key={r.month} open={r.count > 0} className="group">
                  <summary className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer ${
                    r.error
                      ? "bg-red-500/10 text-red-400"
                      : r.count > 0
                      ? "bg-green-500/10 text-green-400"
                      : "bg-[var(--surface-hover)] text-[var(--muted)]"
                  }`}>
                    <span className="font-medium w-12">{r.month}월</span>
                    {r.error
                      ? <span>{r.error}</span>
                      : <span>+{r.count}개 이벤트</span>}
                  </summary>
                  {r.events.length > 0 && (
                    <div className="ml-4 mt-1 mb-2 space-y-1">
                      {r.events.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs text-[var(--foreground)] px-2 py-1 rounded bg-[var(--surface-hover)]">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${categoryColors[ev.category] ?? "bg-gray-500/20 text-gray-400"}`}>
                            {ev.category}
                          </span>
                          <span className="text-[var(--muted)] w-20 shrink-0">{ev.event_date?.slice(5)}</span>
                          <span className="truncate">{ev.title}</span>
                          {ev.stock_count > 0 && (
                            <span className="text-[var(--muted)] shrink-0">({ev.stock_count}종목)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

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
                  <tr key={e.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--surface-hover)]">
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">이전</button>
              <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">다음</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Updates Tab ────────────────────────────────────────────

const UPDATE_CATEGORIES = [
  { value: "feature", label: "기능 추가", color: "bg-blue-500/20 text-blue-400" },
  { value: "bugfix", label: "버그 수정", color: "bg-red-500/20 text-red-400" },
  { value: "announcement", label: "공지", color: "bg-amber-500/20 text-amber-400" },
  { value: "maintenance", label: "점검", color: "bg-purple-500/20 text-purple-400" },
];

function getCategoryStyle(cat: string) {
  return UPDATE_CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-gray-500/20 text-gray-400";
}
function getCategoryLabel(cat: string) {
  return UPDATE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

function UpdatesTab() {
  const [posts, setPosts] = useState<UpdatePost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("announcement");
  const [formPublished, setFormPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUpdates({ page, size: 20 });
      setPosts(res.posts);
      setTotal(res.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 20);

  const resetForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("announcement");
    setFormPublished(true);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: UpdatePost) => {
    setEditingId(p.id);
    setFormTitle(p.title);
    setFormContent(p.content);
    setFormCategory(p.category);
    setFormPublished(p.is_published);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const data = { title: formTitle.trim(), content: formContent.trim(), category: formCategory, is_published: formPublished };
      if (editingId) {
        await updateAdminUpdate(editingId, data);
      } else {
        await createAdminUpdate(data);
      }
      resetForm();
      load();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteAdminUpdate(id);
      load();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">총 {total}개</p>
        <button
          onClick={openCreate}
          className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          + 새 게시글
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">{editingId ? "게시글 수정" : "새 게시글 작성"}</h3>
          <input
            type="text"
            placeholder="제목"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full px-3 py-2 rounded bg-[var(--surface-hover)] border border-[var(--card-border)] text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">카테고리</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="px-3 py-1.5 rounded bg-[var(--surface-hover)] border border-[var(--card-border)] text-sm"
              >
                {UPDATE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formPublished}
                  onChange={(e) => setFormPublished(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                발행
              </label>
            </div>
          </div>
          <textarea
            placeholder="내용"
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded bg-[var(--surface-hover)] border border-[var(--card-border)] text-sm resize-y"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !formTitle.trim() || !formContent.trim()}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? "저장 중..." : editingId ? "수정" : "작성"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-1.5 rounded bg-[var(--surface-hover)] text-sm transition-colors hover:bg-[var(--surface-active)]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? <LoadingSkeleton /> : (
        <>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">제목</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">카테고리</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">작성일</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">액션</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-3">{p.id}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{p.title}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryStyle(p.category)}`}>
                        {getCategoryLabel(p.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--muted)]">
                      {p.created_at?.split("T")[0]}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.is_published ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                      }`}>
                        {p.is_published ? "발행" : "미발행"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="px-2 py-1 rounded text-xs bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">게시글 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">이전</button>
              <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded bg-[var(--surface-hover)] text-sm disabled:opacity-30">다음</button>
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
  status: "idle" | "running" | "completed" | "failed" | "timeout";
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
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

// ─── Navigation Tab ─────────────────────────────────────────

const NAV_ITEM_META: Record<string, { label: string; icon: string }> = {
  "/": { label: "대시보드", icon: "📊" },
  "/search": { label: "종목 분석", icon: "🔍" },
  "/my-analyses": { label: "분석 기록", icon: "📋" },
  "/recommendations": { label: "투자 추천", icon: "💡" },
  "/events": { label: "이벤트 캘린더", icon: "📅" },
  "/paper-trading": { label: "모의 투자", icon: "💰" },
  "/news": { label: "뉴스", icon: "📰" },
  "/compare": { label: "종목 비교", icon: "⚖️" },
  "/portfolio": { label: "포트폴리오", icon: "📑" },
  "/fundamental": { label: "펀더멘탈", icon: "📈" },
  "/backtest": { label: "백테스팅", icon: "🔄" },
  "/admin": { label: "관리자", icon: "🛡️" },
};

function NavigationTab() {
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchNavOrder()
      .then((res) => setOrder(res.order))
      .catch(() => setOrder(Object.keys(NAV_ITEM_META)))
      .finally(() => setLoading(false));
  }, []);

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
    setSaved(false);
  };

  const moveDown = (idx: number) => {
    if (idx >= order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAdminNavOrder(order);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-[var(--muted)]">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">메뉴 순서 관리</h2>
          <p className="text-sm text-[var(--muted)]">사이드바 메뉴의 표시 순서를 변경합니다.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            saved
              ? "bg-green-600 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          } disabled:opacity-50`}
        >
          {saving ? "저장 중..." : saved ? "저장 완료" : "순서 저장"}
        </button>
      </div>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-xs text-[var(--muted)]">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">메뉴</th>
              <th className="px-4 py-3 text-left">경로</th>
              <th className="px-4 py-3 text-right w-24">순서</th>
            </tr>
          </thead>
          <tbody>
            {order.map((href, idx) => {
              const meta = NAV_ITEM_META[href] || { label: href, icon: "❓" };
              return (
                <tr
                  key={href}
                  className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.icon}</span>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)] font-mono">{href}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-[var(--surface-active)] disabled:opacity-20 transition-colors"
                        title="위로"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === order.length - 1}
                        className="p-1 rounded hover:bg-[var(--surface-active)] disabled:opacity-20 transition-colors"
                        title="아래로"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const [resetLoading, setResetLoading] = useState(false);
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

  const handleReset = async () => {
    setResetLoading(true);
    setAdminError(null);
    try {
      await resetPipeline();
      try { const res = await fetchPipelineStatus(); if (res?.data) handleEvent(res.data); } catch { /* ignore */ }
    } catch (err: any) {
      setAdminError(`파이프라인 리셋 실패: ${err.message}`);
    }
    setResetLoading(false);
  };

  const isRunning = state.status === "running";
  const isTimeout = state.status === "timeout";
  const isFailed = state.status === "failed";
  const showReset = isTimeout || isFailed || (isRunning && state.elapsed_seconds > 300);
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
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={handleRun} disabled={isRunning || isTimeout || triggerLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors flex-1 sm:flex-none"
                >{isRunning ? "실행 중..." : triggerLoading ? "시작 중..." : "파이프라인 실행"}</button>
                {showReset && (
                  <button onClick={handleReset} disabled={resetLoading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded font-medium text-sm transition-colors"
                  >{resetLoading ? "리셋 중..." : "강제 리셋"}</button>
                )}
              </div>
            </div>
            {market === "ALL" && !isRunning && (
              <p className="text-xs text-[var(--muted)] mt-2">한국 시장 완료 후 미국 시장을 순차 실행합니다.</p>
            )}
            {adminError && <p className="text-xs text-red-400 mt-2">{adminError}</p>}
          </div>

          {/* Batch progress */}
          {batch?.enabled && <PipelineBatchProgress batch={batch} currentMarket={state.market} />}

          {/* Timeout / Failed banner */}
          {isTimeout && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-lg">⏱️</span>
                <div>
                  <span className="font-medium text-red-400">파이프라인 타임아웃</span>
                  <span className="text-[var(--muted)] text-sm ml-2">15분 초과 응답 없음 — 강제 리셋 후 재실행하세요</span>
                </div>
              </div>
              <div className="text-sm text-[var(--muted)] tabular-nums">경과: {Math.floor(elapsed / 60)}분 {Math.floor(elapsed % 60)}초</div>
            </div>
          )}
          {isFailed && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-lg">❌</span>
              <span className="font-medium text-red-400">파이프라인 실패 — 강제 리셋 후 재실행하세요</span>
            </div>
          )}

          {/* Status bar */}
          {isRunning && (
            <div className={`${elapsed > 300 ? "bg-yellow-950/30 border-yellow-800/50" : "bg-blue-950/30 border-blue-800/50"} border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 ${elapsed > 300 ? "bg-yellow-500" : "bg-blue-500"} rounded-full animate-pulse shrink-0`} />
                <div>
                  <span className="font-medium">{currentStep ? `${currentStep.icon} ${currentStep.name}` : "준비 중..."}</span>
                  <span className="text-[var(--muted)] text-sm ml-2">({completedCount}/{state.steps.length} 완료)</span>
                  {batch?.enabled && <span className="text-blue-400 text-sm ml-2">[{state.market}]</span>}
                  {elapsed > 300 && <span className="text-yellow-400 text-sm ml-2">⚠ 지연됨</span>}
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

// ─── API Usage Tab ──────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  ai_comment: "AI 코멘트",
  compare_report: "비교 리포트",
  event_generate: "이벤트 생성",
  portfolio_report: "포트폴리오 리포트",
};

const KIS_LABELS: Record<string, string> = {
  price: "현재가",
  ohlcv: "OHLCV",
  token: "토큰 발급",
};

function ApiUsageTab() {
  const [period, setPeriod] = useState(7);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p: number) => {
    setLoading(true);
    fetchAdminApiUsage(p).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <ErrorMessage msg="API 사용량 데이터를 불러올 수 없습니다." />;

  const oa = data.openai || { daily: [], by_feature: {}, total: { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 } };
  const kis = data.kis || { daily: [], totals: {} };
  const total = oa.total;

  const maxFeature = Math.max(...Object.values(oa.by_feature as Record<string, any>).map((f: any) => f.calls), 1);
  const kisValues = Object.values(kis.totals as Record<string, number>);
  const maxKis = Math.max(...kisValues, 1);

  return (
    <div className="space-y-4">
      {/* Period selector + model info */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[7, 30, 90].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                period === p
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {p}일
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--muted)]">
          모델: {data.model} &middot; ${data.pricing?.input ?? 0}/1M in &middot; ${data.pricing?.output ?? 0}/1M out
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon="&#x1F4E1;" title="총 호출" value={formatNum(total.calls)} sub={`${period}일 합계`} />
        <SummaryCard icon="&#x1F4E5;" title="입력 토큰" value={formatNum(total.input_tokens)} />
        <SummaryCard icon="&#x1F4E4;" title="출력 토큰" value={formatNum(total.output_tokens)} />
        <SummaryCard icon="&#x1F4B2;" title="추정 비용" value={`$${total.cost_usd.toFixed(4)}`} sub="USD" />
      </div>

      {/* Daily trend */}
      {oa.daily && oa.daily.length > 0 && (
        <MiniBarChart data={oa.daily} dataKey="total_calls" label="일별 OpenAI 호출 추세" color="bg-violet-500" />
      )}

      {/* Feature + KIS side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OpenAI by feature */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium mb-1">기능별 OpenAI 사용량</p>
          {Object.entries(oa.by_feature as Record<string, any>).sort((a, b) => b[1].calls - a[1].calls).map(([feat, d]: [string, any]) => (
            <UsageBar
              key={feat}
              icon="&#x1F916;"
              label={FEATURE_LABELS[feat] || feat}
              count={d.calls}
              max={maxFeature}
            />
          ))}
          {Object.keys(oa.by_feature).length === 0 && (
            <p className="text-sm text-[var(--muted)]">데이터 없음</p>
          )}
        </div>

        {/* KIS usage */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium mb-1">KIS API 사용량</p>
          {Object.entries(kis.totals as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
            <UsageBar
              key={action}
              icon="&#x1F4C8;"
              label={KIS_LABELS[action] || action}
              count={count}
              max={maxKis}
            />
          ))}
          {Object.keys(kis.totals).length === 0 && (
            <p className="text-sm text-[var(--muted)]">데이터 없음</p>
          )}
        </div>
      </div>

      {/* Detailed table */}
      {Object.keys(oa.by_feature).length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                <th className="px-4 py-2">기능</th>
                <th className="px-4 py-2 text-right">호출 수</th>
                <th className="px-4 py-2 text-right">입력 토큰</th>
                <th className="px-4 py-2 text-right">출력 토큰</th>
                <th className="px-4 py-2 text-right">비용 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(oa.by_feature as Record<string, any>).sort((a, b) => b[1].calls - a[1].calls).map(([feat, d]: [string, any]) => (
                <tr key={feat} className="border-b border-[var(--card-border)] last:border-0">
                  <td className="px-4 py-2">{FEATURE_LABELS[feat] || feat}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatNum(d.calls)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatNum(d.input_tokens)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatNum(d.output_tokens)}</td>
                  <td className="px-4 py-2 text-right font-mono">${d.cost_usd.toFixed(4)}</td>
                </tr>
              ))}
              <tr className="bg-[var(--surface-hover)] font-semibold">
                <td className="px-4 py-2">합계</td>
                <td className="px-4 py-2 text-right font-mono">{formatNum(total.calls)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatNum(total.input_tokens)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatNum(total.output_tokens)}</td>
                <td className="px-4 py-2 text-right font-mono">${total.cost_usd.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-[var(--surface-hover)] rounded-lg animate-pulse" />
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
    { key: "metrics", label: "핵심 지표" },
    { key: "users", label: "사용자" },
    { key: "analyses", label: "분석 기록" },
    { key: "paper-trading", label: "모의 투자" },
    { key: "events", label: "이벤트" },
    { key: "updates", label: "업데이트" },
    { key: "pipeline", label: "파이프라인" },
    { key: "navigation", label: "메뉴 관리" },
    { key: "api-usage", label: "API 사용량" },
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
      {tab === "metrics" && <MetricsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "analyses" && <AnalysesTab />}
      {tab === "paper-trading" && <PaperTradingTab />}
      {tab === "events" && <EventsTab />}
      {tab === "updates" && <UpdatesTab />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "navigation" && <NavigationTab />}
      {tab === "api-usage" && <ApiUsageTab />}
    </div>
  );
}

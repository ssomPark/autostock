"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAdminDashboard,
  fetchAdminUsers,
  fetchAdminUserDetail,
  fetchAdminAdRewards,
  fetchAdminAdRewardStats,
  fetchAdminAdRewardSettings,
  fetchAdminPaperTradingStats,
  fetchAdminEvents,
  toggleAdminEventActive,
  triggerPipeline,
} from "@/lib/api";

type Tab = "dashboard" | "users" | "ad-rewards" | "paper-trading" | "events" | "pipeline";

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <SummaryCard icon="👥" title="전체 사용자" value={data.users.total} sub={`오늘 +${data.users.today}`} />
      <SummaryCard icon="📈" title="전체 거래" value={data.trades.total} sub={`오늘 +${data.trades.today}`} />
      <SummaryCard icon="🎬" title="광고 보상" value={data.ad_rewards.total} sub={`총 ${formatKRW(data.ad_rewards.total_amount)}원`} />
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
              <p><span className="text-[var(--muted)]">광고 보상 횟수:</span> {detail.reward_count}</p>
              {detail.accounts?.length > 0 && (
                <div>
                  <p className="text-[var(--muted)] mb-1">모의 투자 계좌:</p>
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

// ─── Ad Rewards Tab ─────────────────────────────────────────
function AdRewardsTab() {
  const [stats, setStats] = useState<any>(null);
  const [adSettings, setAdSettings] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAdminAdRewardStats(), fetchAdminAdRewardSettings()])
      .then(([s, settings]) => { setStats(s); setAdSettings(settings); })
      .catch(() => {});
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminAdRewards({ status: statusFilter, page, size: 30 });
      setLogs(res.logs);
      setTotal(res.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon="🎯" title="총 지급" value={stats.total_claimed} sub={`총 ${formatKRW(stats.total_amount)}원`} />
          <SummaryCard icon="📊" title="오늘" value={stats.today_count} sub={`${formatKRW(stats.today_amount)}원`} />
          <SummaryCard icon="💰" title="평균 보상" value={`${formatKRW(stats.avg_amount)}원`} />
          {adSettings && (
            <SummaryCard icon="⏱️" title="쿨다운" value={`${adSettings.cooldown_seconds / 60}분`} sub={`${formatKRW(adSettings.min_amount)}~${formatKRW(adSettings.max_amount)}원`} />
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {["", "pending", "claimed", "expired"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-blue-600/20 text-blue-400" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"
            }`}
          >
            {s === "" ? "전체" : s === "pending" ? "대기" : s === "claimed" ? "지급" : "만료"}
          </button>
        ))}
      </div>

      {loading ? <LoadingSkeleton /> : (
        <>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">유저ID</th>
                  <th className="px-4 py-3 font-medium">금액</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">생성일</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">지급일</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-white/5">
                    <td className="px-4 py-3">{log.id}</td>
                    <td className="px-4 py-3">{log.user_id}</td>
                    <td className="px-4 py-3">{log.reward_amount ? `${formatNum(log.reward_amount)}원` : "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.status === "claimed" ? "bg-green-500/20 text-green-400" :
                        log.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {log.status === "claimed" ? "지급" : log.status === "pending" ? "대기" : "만료"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-[var(--muted)]">{log.created_at?.split("T")[0]}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-[var(--muted)]">{log.claimed_at?.split("T")[0] ?? "-"}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">데이터 없음</td></tr>
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

// ─── Paper Trading Tab ──────────────────────────────────────
function PaperTradingTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminPaperTradingStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!stats) return <ErrorMessage msg="모의투자 통계를 불러올 수 없습니다." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <SummaryCard icon="👤" title="전체 계좌" value={stats.accounts.total} sub={`활성 ${stats.accounts.active}`} />
      <SummaryCard icon="📊" title="전체 거래" value={stats.trades.total} sub={`매수 ${stats.trades.buy} / 매도 ${stats.trades.sell}`} />
      <SummaryCard icon="💰" title="총 거래량" value={`${formatKRW(stats.total_volume)}원`} />
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

// ─── Pipeline Tab ───────────────────────────────────────────
function PipelineTab() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRun = async (market: string) => {
    setRunning(true);
    setResult(null);
    try {
      await triggerPipeline(market);
      setResult(`${market} 파이프라인이 시작되었습니다.`);
    } catch (err: any) {
      setResult(`실패: ${err.message}`);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6">
        <h3 className="font-bold mb-4">파이프라인 실행</h3>
        <div className="flex flex-wrap gap-3">
          {["KR", "US", "ALL"].map((m) => (
            <button
              key={m}
              onClick={() => handleRun(m)}
              disabled={running}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {running ? "실행 중..." : `${m} 분석 시작`}
            </button>
          ))}
        </div>
        {result && (
          <p className={`mt-3 text-sm ${result.startsWith("실패") ? "text-red-400" : "text-green-400"}`}>{result}</p>
        )}
      </div>
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
    { key: "ad-rewards", label: "광고 보상" },
    { key: "paper-trading", label: "모의 투자" },
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
      {tab === "ad-rewards" && <AdRewardsTab />}
      {tab === "paper-trading" && <PaperTradingTab />}
      {tab === "events" && <EventsTab />}
      {tab === "pipeline" && <PipelineTab />}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  fetchPaperAccounts,
  createPaperAccount,
  deletePaperAccount,
  resetPaperAccount,
  fetchPaperPositions,
  fetchPaperTrades,
  fetchPaperSummary,
  executePaperSell,
  executePaperBuy,
  fetchRecommendations,
} from "@/lib/api";
import { OrderModal } from "@/components/paper-trading/order-modal";

interface Account {
  id: number;
  name: string;
  initial_balance: number;
  cash_balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface Position {
  id: number;
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  avg_buy_price: number;
  total_invested: number;
  current_price: number;
  eval_amount: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  price_fallback?: boolean;
  recommendation_action?: string;
  recommendation_confidence?: number;
  recommendation_grade?: string;
}

interface Trade {
  id: number;
  ticker: string;
  name: string;
  market: string;
  side: string;
  quantity: number;
  price: number;
  total_amount: number;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  source: string;
  executed_at: string;
}

interface Summary {
  initial_balance: number;
  cash_balance: number;
  total_invested: number;
  total_eval: number;
  total_assets: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_realized_pnl: number;
  position_count: number;
  currency: string;
}

function formatKRW(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function PnlText({ value, pct }: { value: number; pct?: number }) {
  const color = value >= 0 ? "#4ade80" : "#f87171";
  return (
    <span style={{ color, fontWeight: 500 }}>
      {value >= 0 ? "+" : ""}
      {formatKRW(value)}
      {pct != null && (
        <span className="text-xs ml-1">
          ({value >= 0 ? "+" : ""}{pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

// --- Sell Modal ---
function SellModal({
  position,
  accountId,
  onClose,
  onSuccess,
}: {
  position: Position;
  accountId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(position.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRevenue = quantity * position.current_price;
  const costBasis = position.avg_buy_price * quantity;
  const pnl = totalRevenue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

  const handleSell = async () => {
    if (quantity <= 0 || quantity > position.quantity) return;
    setLoading(true);
    setError(null);
    try {
      await executePaperSell({
        account_id: accountId,
        ticker: position.ticker,
        quantity,
        price: position.current_price,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message?.includes("400") ? "매도 수량이 보유 수량을 초과합니다." : "매도 실행에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">모의 매도</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="space-y-4">
          <div className="bg-white/5 rounded-lg p-3">
            <span className="font-medium">{position.name}</span>
            <span className="text-[var(--muted)] text-sm ml-1">({position.ticker})</span>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
              <div><span className="text-[var(--muted)]">보유</span> <span className="font-medium">{position.quantity}주</span></div>
              <div><span className="text-[var(--muted)]">평균매수가</span> <span className="font-medium">{formatKRW(position.avg_buy_price)}</span></div>
              <div><span className="text-[var(--muted)]">현재가</span> <span className="font-medium">{formatKRW(position.current_price)}</span></div>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">매도 수량</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-lg">-</button>
              <input
                type="number"
                min={1}
                max={position.quantity}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(position.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                className="flex-1 h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-center text-lg font-medium focus:outline-none focus:border-blue-500"
              />
              <button onClick={() => setQuantity(Math.min(position.quantity, quantity + 1))} className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-lg">+</button>
            </div>
            <div className="flex gap-2 mt-2">
              {[
                { label: "25%", q: Math.max(1, Math.floor(position.quantity * 0.25)) },
                { label: "50%", q: Math.max(1, Math.floor(position.quantity * 0.5)) },
                { label: "75%", q: Math.max(1, Math.floor(position.quantity * 0.75)) },
                { label: "전량", q: position.quantity },
              ].map(({ label, q }) => (
                <button
                  key={label}
                  onClick={() => setQuantity(q)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${quantity === q ? "bg-red-600 text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">매도 금액</span>
              <span className="font-medium">{formatKRW(totalRevenue)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">예상 손익</span>
              <PnlText value={pnl} pct={pnlPct} />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}
          <button
            onClick={handleSell}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {loading ? "매도 중..." : `${quantity}주 매도`}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Manual Buy Form ---
function ManualBuyForm({ accountId, onSuccess }: { accountId: number; onSuccess: () => void }) {
  const [ticker, setTicker] = useState("");
  const [market, setMarket] = useState("KOSPI");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleBuy = async () => {
    if (!ticker.trim()) {
      setError("종목코드를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await executePaperBuy({
        account_id: accountId,
        ticker: ticker.trim().toUpperCase(),
        name: ticker.trim().toUpperCase(),
        market,
        quantity,
        price: 0, // price=0 means we need to fetch it
        source: "manual",
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setTicker("");
      setQuantity(1);
      onSuccess();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("400")) setError("잔고가 부족하거나 유효하지 않은 종목입니다.");
      else setError("매수에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <h3 className="font-medium mb-3">수동 매수</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="종목코드 (예: 005930, AAPL)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="KOSPI">KOSPI</option>
          <option value="KOSDAQ">KOSDAQ</option>
          <option value="NYSE">NYSE</option>
          <option value="NASDAQ">NASDAQ</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm text-center focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-[var(--muted)]">주</span>
        </div>
        <button
          onClick={handleBuy}
          disabled={loading}
          className="h-10 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap"
        >
          {loading ? "..." : success ? "완료!" : "매수"}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

// --- Recommended Stocks Section ---
function RecommendedBuyList({
  accountId,
  ownedTickers,
  onSuccess,
}: {
  accountId: number;
  ownedTickers: Set<string>;
  onSuccess: () => void;
}) {
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderTarget, setOrderTarget] = useState<any>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchRecommendations({ market: "all", action: "BUY" });
        // ticker 중복 제거 (최신 추천만 유지)
        const seen = new Set<string>();
        const unique = (data?.data ?? []).filter((r: any) => {
          if (seen.has(r.ticker)) return false;
          seen.add(r.ticker);
          return true;
        });
        setRecs(unique);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <h3 className="font-medium mb-3">추천 매수 종목</h3>
        <div className="text-sm text-[var(--muted)]">로딩 중...</div>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">추천 매수 종목</h3>
        <Link href="/recommendations" className="text-xs text-blue-400 hover:underline">
          전체 보기
        </Link>
      </div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {recs.map((rec: any) => {
          const owned = ownedTickers.has(rec.ticker);
          return (
            <div
              key={rec.ticker}
              className="flex items-center justify-between bg-white/5 rounded-lg p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="font-medium text-sm hover:underline truncate">
                    {rec.name}
                  </Link>
                  <span className="text-xs text-[var(--muted)] shrink-0">({rec.ticker})</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
                  <span>{rec.current_price?.toLocaleString()}원</span>
                  <span>신뢰도 {(rec.confidence * 100).toFixed(0)}%</span>
                  {rec.target_price && (
                    <span style={{ color: "#4ade80" }}>
                      목표 {rec.target_price.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOrderTarget(rec)}
                className={`ml-2 px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0 ${
                  buySuccess === rec.ticker
                    ? "bg-green-600/20 text-green-400"
                    : owned
                    ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                    : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                }`}
              >
                {buySuccess === rec.ticker ? "완료!" : owned ? "추가매수" : "매수"}
              </button>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-[var(--card-border)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-left text-xs text-[var(--muted)]">
              <th className="p-2.5">종목</th>
              <th className="p-2.5 text-right">현재가</th>
              <th className="p-2.5 text-right">목표가</th>
              <th className="p-2.5 text-right">기대수익</th>
              <th className="p-2.5 text-right">신뢰도</th>
              <th className="p-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {recs.map((rec: any) => {
              const owned = ownedTickers.has(rec.ticker);
              const expectedPct =
                rec.current_price > 0 && rec.target_price
                  ? ((rec.target_price - rec.current_price) / rec.current_price) * 100
                  : null;
              return (
                <tr key={rec.ticker} className="border-b border-[var(--card-border)] hover:bg-white/5 text-sm">
                  <td className="p-2.5">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline">
                      <span className="font-medium">{rec.name}</span>
                      <span className="text-[var(--muted)] text-xs ml-1">({rec.ticker})</span>
                    </Link>
                    {owned && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400">보유중</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right">{rec.current_price?.toLocaleString()}</td>
                  <td className="p-2.5 text-right" style={{ color: "#4ade80" }}>
                    {rec.target_price?.toLocaleString() ?? "-"}
                  </td>
                  <td className="p-2.5 text-right">
                    {expectedPct != null ? (
                      <span style={{ color: expectedPct >= 0 ? "#4ade80" : "#f87171", fontWeight: 500 }}>
                        {expectedPct >= 0 ? "+" : ""}{expectedPct.toFixed(1)}%
                      </span>
                    ) : "-"}
                  </td>
                  <td className="p-2.5 text-right">{(rec.confidence * 100).toFixed(0)}%</td>
                  <td className="p-2.5 text-right">
                    <button
                      onClick={() => setOrderTarget(rec)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        buySuccess === rec.ticker
                          ? "bg-green-600/20 text-green-400"
                          : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                      }`}
                    >
                      {buySuccess === rec.ticker ? "완료!" : owned ? "추가매수" : "매수"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Order Modal */}
      {orderTarget && (
        <OrderModal
          isOpen={!!orderTarget}
          onClose={() => setOrderTarget(null)}
          onSuccess={() => {
            setBuySuccess(orderTarget.ticker);
            setTimeout(() => setBuySuccess(null), 2000);
            onSuccess();
          }}
          accountId={accountId}
          ticker={orderTarget.ticker}
          name={orderTarget.name}
          market={orderTarget.market}
          price={orderTarget.current_price}
          source="recommendation"
          recommendationId={orderTarget.id}
          recommendationAction={orderTarget.action}
          recommendationConfidence={orderTarget.confidence}
          recommendationGrade={orderTarget.grade}
        />
      )}
    </div>
  );
}

// --- Main Page ---
export default function PaperTradingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrades, setShowTrades] = useState(false);
  const [sellTarget, setSellTarget] = useState<Position | null>(null);

  // Account creation
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("기본 계좌");
  const [newBalance, setNewBalance] = useState(100_000_000);
  const [creating, setCreating] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async (accountId: number) => {
    try {
      const [s, p, t] = await Promise.all([
        fetchPaperSummary(accountId),
        fetchPaperPositions(accountId),
        fetchPaperTrades(accountId, { limit: 20 }),
      ]);
      setSummary(s);
      setPositions(p);
      setTrades(t);
    } catch (err: any) {
      if (err?.message?.includes("401")) {
        router.push("/auth/login");
      }
    }
  }, [router]);

  const loadAccounts = useCallback(async () => {
    try {
      const accs = await fetchPaperAccounts();
      setAccounts(accs);
      if (accs.length > 0) {
        const id = activeAccountId && accs.find((a: Account) => a.id === activeAccountId) ? activeAccountId : accs[0].id;
        setActiveAccountId(id);
        await loadData(id);
      }
    } catch (err: any) {
      if (err?.message?.includes("401")) {
        router.push("/auth/login");
      }
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, loadData, router]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadAccounts();
    } else if (!authLoading && !isAuthenticated) {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateAccount = async () => {
    setCreating(true);
    try {
      const acc = await createPaperAccount({ name: newName, initial_balance: newBalance });
      setShowCreate(false);
      setActiveAccountId(acc.id);
      await loadAccounts();
    } catch {
      // Error handling
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async () => {
    if (!activeAccountId || !confirm("정말 계좌를 초기화하시겠습니까? 모든 포지션과 거래 이력이 삭제됩니다.")) return;
    setResetting(true);
    try {
      await resetPaperAccount(activeAccountId);
      await loadData(activeAccountId);
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeAccountId || !confirm("정말 계좌를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      await deletePaperAccount(activeAccountId);
      setActiveAccountId(null);
      setSummary(null);
      setPositions([]);
      setTrades([]);
      await loadAccounts();
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = () => {
    if (activeAccountId) loadData(activeAccountId);
  };

  // Auth check
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-[var(--muted)]">로딩 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="text-6xl">🔒</div>
        <h2 className="text-xl font-bold">로그인이 필요합니다</h2>
        <p className="text-[var(--muted)] text-center">모의 투자 기능을 사용하려면 로그인하세요.</p>
        <button
          onClick={() => router.push("/auth/login")}
          className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
        >
          로그인하기
        </button>
      </div>
    );
  }

  // No accounts
  if (accounts.length === 0 || showCreate) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">모의 투자</h1>
        <div className="max-w-md mx-auto">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 space-y-4">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">💰</div>
              <h2 className="text-lg font-bold">모의 투자 계좌 생성</h2>
              <p className="text-sm text-[var(--muted)] mt-1">가상 자금으로 투자 연습을 시작하세요.</p>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">계좌 이름</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">초기 잔고</label>
              <div className="flex gap-2 mb-2">
                {[10_000_000, 50_000_000, 100_000_000, 500_000_000].map((b) => (
                  <button
                    key={b}
                    onClick={() => setNewBalance(b)}
                    className={`flex-1 py-1.5 rounded text-xs transition-colors ${
                      newBalance === b ? "bg-blue-600 text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"
                    }`}
                  >
                    {(b / 10000).toLocaleString()}만
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              {accounts.length > 0 && (
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
                >
                  취소
                </button>
              )}
              <button
                onClick={handleCreateAccount}
                disabled={creating}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {creating ? "생성 중..." : "계좌 생성"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">모의 투자</h1>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <select
              value={activeAccountId ?? ""}
              onChange={async (e) => {
                const id = parseInt(e.target.value);
                setActiveAccountId(id);
                await loadData(id);
              }}
              className="h-9 rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleRefresh}
            className="h-9 px-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-sm hover:bg-white/10 transition-colors"
            title="새로고침"
          >
            ↻
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
          >
            + 새 계좌
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="text-xs text-[var(--muted)] mb-1">총 자산</div>
            <div className="text-lg font-bold">{formatKRW(summary.total_assets)}원</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="text-xs text-[var(--muted)] mb-1">총 수익률</div>
            <div className="text-lg font-bold">
              <PnlText value={summary.total_pnl} pct={summary.total_pnl_pct} />
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="text-xs text-[var(--muted)] mb-1">현금 잔고</div>
            <div className="text-lg font-bold">{formatKRW(summary.cash_balance)}원</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="text-xs text-[var(--muted)] mb-1">보유 종목</div>
            <div className="text-lg font-bold">{summary.position_count}개</div>
            {summary.total_realized_pnl !== 0 && (
              <div className="text-xs text-[var(--muted)] mt-0.5">
                실현손익: <PnlText value={summary.total_realized_pnl} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Positions */}
      <div>
        <h2 className="text-lg font-bold mb-3">보유 포지션</h2>
        {positions.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
            보유 중인 포지션이 없습니다. 추천 페이지에서 모의 매수하거나 아래에서 수동 매수하세요.
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {positions.map((pos) => (
                <div key={pos.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">{pos.name}</span>
                      <span className="text-[var(--muted)] text-sm ml-1">({pos.ticker})</span>
                    </div>
                    <button
                      onClick={() => setSellTarget(pos)}
                      className="px-3 py-1 rounded text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                    >
                      매도
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-[var(--muted)]">수량</span><span>{pos.quantity}주</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">평균매수가</span><span>{formatKRW(pos.avg_buy_price)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">현재가</span><span>{formatKRW(pos.current_price)}{pos.price_fallback && <span className="text-xs text-yellow-400 ml-1" title="실시간 가격 조회 불가, 매수가 기준">*</span>}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">평가금액</span><span>{formatKRW(pos.eval_amount)}</span></div>
                    <div className="col-span-2 flex justify-between">
                      <span className="text-[var(--muted)]">평가손익</span>
                      <PnlText value={pos.unrealized_pnl} pct={pos.unrealized_pnl_pct} />
                    </div>
                  </div>
                  {pos.recommendation_action && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--muted)]">
                      <span className="px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">추천</span>
                      {pos.recommendation_grade && <span>{pos.recommendation_grade}</span>}
                      {pos.recommendation_confidence != null && <span>{(pos.recommendation_confidence * 100).toFixed(0)}%</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                    <th className="p-3">종목</th>
                    <th className="p-3 text-right">수량</th>
                    <th className="p-3 text-right">평균매수가</th>
                    <th className="p-3 text-right">현재가</th>
                    <th className="p-3 text-right">평가금액</th>
                    <th className="p-3 text-right">평가손익</th>
                    <th className="p-3 text-right">수익률</th>
                    <th className="p-3 text-center">출처</th>
                    <th className="p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos.id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                      <td className="p-3">
                        <span className="font-medium">{pos.name}</span>
                        <span className="text-[var(--muted)] text-sm ml-1">({pos.ticker})</span>
                      </td>
                      <td className="p-3 text-right">{pos.quantity}</td>
                      <td className="p-3 text-right">{formatKRW(pos.avg_buy_price)}</td>
                      <td className="p-3 text-right">{formatKRW(pos.current_price)}{pos.price_fallback && <span className="text-xs text-yellow-400 ml-1" title="실시간 가격 조회 불가, 매수가 기준">*</span>}</td>
                      <td className="p-3 text-right">{formatKRW(pos.eval_amount)}</td>
                      <td className="p-3 text-right"><PnlText value={pos.unrealized_pnl} /></td>
                      <td className="p-3 text-right">
                        <span style={{ color: pos.unrealized_pnl_pct >= 0 ? "#4ade80" : "#f87171", fontWeight: 500 }}>
                          {pos.unrealized_pnl_pct >= 0 ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {pos.recommendation_action ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">추천</span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">수동</span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => setSellTarget(pos)}
                          className="px-3 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                        >
                          매도
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Recommended Stocks */}
      {activeAccountId && (
        <RecommendedBuyList
          accountId={activeAccountId}
          ownedTickers={new Set(positions.map((p) => p.ticker))}
          onSuccess={handleRefresh}
        />
      )}

      {/* Manual Buy */}
      {activeAccountId && (
        <ManualBuyForm accountId={activeAccountId} onSuccess={handleRefresh} />
      )}

      {/* Trade History */}
      <div>
        <button
          onClick={() => setShowTrades(!showTrades)}
          className="flex items-center gap-2 text-lg font-bold mb-3"
        >
          <span className="text-sm transition-transform inline-block" style={{ transform: showTrades ? "rotate(90deg)" : "none" }}>&#9654;</span>
          거래 이력
          <span className="text-sm text-[var(--muted)] font-normal">({trades.length}건)</span>
        </button>
        {showTrades && (
          <>
            {trades.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 text-center text-[var(--muted)]">
                거래 이력이 없습니다.
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  {trades.map((t) => (
                    <div key={t.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.side === "BUY" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                            {t.side === "BUY" ? "매수" : "매도"}
                          </span>
                          <span className="font-medium text-sm">{t.name} ({t.ticker})</span>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {new Date(t.executed_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--muted)]">{t.quantity}주 x {formatKRW(t.price)}</span>
                        <span className="font-medium">{formatKRW(t.total_amount)}원</span>
                      </div>
                      {t.realized_pnl != null && t.side === "SELL" && (
                        <div className="text-right text-sm mt-0.5">
                          <PnlText value={t.realized_pnl} pct={t.realized_pnl_pct ?? undefined} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Desktop */}
                <div className="hidden md:block bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                        <th className="p-3">유형</th>
                        <th className="p-3">종목</th>
                        <th className="p-3 text-right">수량</th>
                        <th className="p-3 text-right">가격</th>
                        <th className="p-3 text-right">금액</th>
                        <th className="p-3 text-right">실현손익</th>
                        <th className="p-3 text-center">출처</th>
                        <th className="p-3">일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr key={t.id} className="border-b border-[var(--card-border)] hover:bg-white/5 text-sm">
                          <td className="p-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.side === "BUY" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                              {t.side === "BUY" ? "매수" : "매도"}
                            </span>
                          </td>
                          <td className="p-3 font-medium">{t.name} <span className="text-[var(--muted)]">({t.ticker})</span></td>
                          <td className="p-3 text-right">{t.quantity}</td>
                          <td className="p-3 text-right">{formatKRW(t.price)}</td>
                          <td className="p-3 text-right">{formatKRW(t.total_amount)}</td>
                          <td className="p-3 text-right">
                            {t.side === "SELL" && t.realized_pnl != null ? (
                              <PnlText value={t.realized_pnl} pct={t.realized_pnl_pct ?? undefined} />
                            ) : "-"}
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-xs text-[var(--muted)]">{t.source === "recommendation" ? "추천" : "수동"}</span>
                          </td>
                          <td className="p-3 text-[var(--muted)]">
                            {new Date(t.executed_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Account Settings */}
      <div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-lg font-bold mb-3"
        >
          <span className="text-sm transition-transform inline-block" style={{ transform: showSettings ? "rotate(90deg)" : "none" }}>&#9654;</span>
          계좌 설정
        </button>
        {showSettings && (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">계좌 초기화</div>
                <div className="text-sm text-[var(--muted)]">잔고를 초기금액으로 리셋하고 모든 포지션/거래 이력을 삭제합니다.</div>
              </div>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-2 rounded-lg bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 disabled:opacity-50 text-sm transition-colors"
              >
                {resetting ? "초기화 중..." : "초기화"}
              </button>
            </div>
            <div className="border-t border-[var(--card-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-red-400">계좌 삭제</div>
                <div className="text-sm text-[var(--muted)]">이 계좌를 완전히 삭제합니다. 되돌릴 수 없습니다.</div>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 text-sm transition-colors"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sell Modal */}
      {sellTarget && activeAccountId && (
        <SellModal
          position={sellTarget}
          accountId={activeAccountId}
          onClose={() => setSellTarget(null)}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  fetchExchangeRate,
  fetchLeaderboard,
  fetchMarketStatus,
  searchStocks,
  depositPaperAccount,
  createPaperOrder,
  createPaperOCOOrder,
  fetchPaperOrders,
  cancelPaperOrder,
} from "@/lib/api";
import type { LeaderboardEntry, LeaderboardResponse, StockSearchResult, PaperOrder } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { OrderModal } from "@/components/paper-trading/order-modal";
import { DonutChart, AssetTrendChart, PnlBarChart, MarketPieChart } from "@/components/paper-trading/portfolio-charts";
import { useLivePrices } from "@/hooks/use-live-prices";

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
  exchange_rate?: number | null;
  stock_pnl?: number | null;
  fx_pnl?: number | null;
  buy_exchange_rate?: number | null;
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
  exchange_rate?: number | null;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  source: string;
  executed_at: string;
}

interface Summary {
  initial_balance: number;
  bonus_balance: number;
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

function formatPrice(value: number, market: string) {
  const isUS = ["NYSE", "NASDAQ", "AMEX"].includes(market) || market.startsWith("Nasdaq");
  if (isUS) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${formatKRW(value)}원`;
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

// --- Sell Modal (탭: 즉시 매도 / 지정가·손절 / 예약 매도) ---
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
  const [tab, setTab] = useState<"instant" | "limit" | "scheduled">("instant");
  const [quantity, setQuantity] = useState(position.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellRate, setSellRate] = useState<number | null>(position.exchange_rate ?? null);

  // 지정가/손절 탭
  const [targetPrice, setTargetPrice] = useState<number>(Math.round(position.current_price * 1.05 * 100) / 100);
  const [useStopLoss, setUseStopLoss] = useState(false);
  const [stopPrice, setStopPrice] = useState<number>(Math.round(position.current_price * 0.95 * 100) / 100);

  // 예약 매도 탭
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  const isUS = ["NYSE", "NASDAQ", "AMEX"].includes(position.market) || position.market.startsWith("Nasdaq");

  useEffect(() => {
    if (isUS) {
      fetchExchangeRate().then((d) => setSellRate(d.rate)).catch(() => {});
    }
  }, [isUS]);

  // 매도 금액 (KRW): US면 환율 적용
  const totalRevenueKRW = isUS && sellRate
    ? quantity * position.current_price * sellRate
    : quantity * position.current_price;

  // 원가 (KRW): total_invested 기반
  const costPerShareKRW = position.total_invested / position.quantity;
  const costBasisKRW = costPerShareKRW * quantity;

  const pnl = totalRevenueKRW - costBasisKRW;
  const pnlPct = costBasisKRW > 0 ? (pnl / costBasisKRW) * 100 : 0;

  const targetPctDiff = position.current_price > 0 ? ((targetPrice - position.current_price) / position.current_price * 100) : 0;
  const stopPctDiff = position.current_price > 0 ? ((stopPrice - position.current_price) / position.current_price * 100) : 0;

  const handleInstantSell = async () => {
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

  const handleLimitOrder = async () => {
    if (quantity <= 0 || quantity > position.quantity) return;
    setLoading(true);
    setError(null);
    try {
      if (useStopLoss) {
        await createPaperOCOOrder({
          account_id: accountId,
          ticker: position.ticker,
          quantity,
          target_price: targetPrice,
          stop_price: stopPrice,
        });
      } else {
        await createPaperOrder({
          account_id: accountId,
          ticker: position.ticker,
          quantity,
          order_type: "limit_sell",
          target_price: targetPrice,
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("400")) setError("주문 생성에 실패했습니다. 수량이나 가격을 확인하세요.");
      else setError("주문 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleScheduledOrder = async () => {
    if (quantity <= 0 || quantity > position.quantity) return;
    if (!scheduledDate) { setError("날짜를 선택하세요."); return; }
    setLoading(true);
    setError(null);
    try {
      const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
      await createPaperOrder({
        account_id: accountId,
        ticker: position.ticker,
        quantity,
        order_type: "scheduled",
        scheduled_at: dt.toISOString(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError("예약 주문 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const QuantityInput = () => (
    <div>
      <label className="block text-sm text-[var(--muted)] mb-1">매도 수량</label>
      <div className="flex items-center gap-2">
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] transition-colors flex items-center justify-center text-lg">-</button>
        <input
          type="number" min={1} max={position.quantity} value={quantity || ""}
          onChange={(e) => { const v = e.target.value; if (v === "") { setQuantity(0); return; } setQuantity(Math.min(position.quantity, Math.max(0, parseInt(v) || 0))); }}
          onFocus={(e) => e.target.select()} onBlur={() => { if (quantity < 1) setQuantity(1); }}
          className="flex-1 h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-center text-lg font-medium focus:outline-none focus:border-blue-500"
        />
        <button onClick={() => setQuantity(Math.min(position.quantity, quantity + 1))} className="w-10 h-10 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] transition-colors flex items-center justify-center text-lg">+</button>
      </div>
      <div className="flex gap-2 mt-2">
        {[
          { label: "25%", q: Math.max(1, Math.floor(position.quantity * 0.25)) },
          { label: "50%", q: Math.max(1, Math.floor(position.quantity * 0.5)) },
          { label: "75%", q: Math.max(1, Math.floor(position.quantity * 0.75)) },
          { label: "전량", q: position.quantity },
        ].map(({ label, q }) => (
          <button key={label} onClick={() => setQuantity(q)}
            className={`flex-1 py-1 rounded text-xs transition-colors ${quantity === q ? "bg-red-600 text-white" : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"}`}
          >{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">모의 매도</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--surface-active)] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* 종목 정보 */}
        <div className="bg-[var(--surface-hover)] rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{position.name}</span>
              <span className="text-[var(--muted)] text-sm ml-1">({position.ticker})</span>
            </div>
            {isUS && <span className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400">{position.market}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            <div><span className="text-[var(--muted)]">보유</span> <span className="font-medium">{position.quantity}주</span></div>
            <div><span className="text-[var(--muted)]">평균매수가</span> <span className="font-medium">{formatPrice(position.avg_buy_price, position.market)}</span></div>
            <div><span className="text-[var(--muted)]">현재가</span> <span className="font-medium">{formatPrice(position.current_price, position.market)}</span></div>
            {isUS && sellRate && (
              <div><span className="text-[var(--muted)]">환율</span> <span className="font-medium">{sellRate.toLocaleString()}원</span></div>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-4 bg-[var(--surface-hover)] rounded-lg p-1">
          {([
            { key: "instant" as const, label: "즉시 매도" },
            { key: "limit" as const, label: "지정가/손절" },
            { key: "scheduled" as const, label: "예약 매도" },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => { setTab(key); setError(null); }}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${tab === key ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >{label}</button>
          ))}
        </div>

        <div className="space-y-4">
          {/* 즉시 매도 */}
          {tab === "instant" && (
            <>
              <QuantityInput />
              <div className="bg-[var(--surface-hover)] rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">매도 금액</span>
                  <span className="font-medium">{formatKRW(totalRevenueKRW)}원</span>
                </div>
                {isUS && sellRate && (
                  <div className="flex justify-between text-xs text-[var(--muted)]">
                    <span>USD</span>
                    <span>${(quantity * position.current_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">예상 손익</span>
                  <PnlText value={pnl} pct={pnlPct} />
                </div>
              </div>
              <button onClick={handleInstantSell} disabled={loading || (isUS && !sellRate)}
                className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {loading ? "매도 중..." : isUS && !sellRate ? "환율 조회 중..." : `${quantity}주 즉시 매도`}
              </button>
            </>
          )}

          {/* 지정가/손절 */}
          {tab === "limit" && (
            <>
              <QuantityInput />
              <div>
                <label className="block text-sm text-[var(--muted)] mb-1">
                  목표가 (이 가격 이상이면 매도)
                  <span className="ml-2" style={{ color: targetPctDiff >= 0 ? "#4ade80" : "#f87171" }}>
                    {targetPctDiff >= 0 ? "+" : ""}{targetPctDiff.toFixed(1)}%
                  </span>
                </label>
                <input type="number" value={targetPrice || ""} step={isUS ? 0.01 : 1} min={0}
                  onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="useStopLoss" checked={useStopLoss} onChange={(e) => setUseStopLoss(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--card-border)] bg-[var(--surface-hover)]"
                />
                <label htmlFor="useStopLoss" className="text-sm">손절도 함께 설정 (OCO)</label>
              </div>
              {useStopLoss && (
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">
                    손절가 (이 가격 이하이면 매도)
                    <span className="ml-2" style={{ color: stopPctDiff >= 0 ? "#4ade80" : "#f87171" }}>
                      {stopPctDiff >= 0 ? "+" : ""}{stopPctDiff.toFixed(1)}%
                    </span>
                  </label>
                  <input type="number" value={stopPrice || ""} step={isUS ? 0.01 : 1} min={0}
                    onChange={(e) => setStopPrice(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <div className="bg-[var(--surface-hover)] rounded-lg p-3 text-xs text-[var(--muted)] space-y-1">
                <p>현재가 기준 목표가 도달 시 자동 매도됩니다.</p>
                {useStopLoss && <p>OCO: 지정가 또는 손절가 중 하나가 체결되면 다른 하나는 자동 취소됩니다.</p>}
                <p>스케줄러가 약 5분 간격으로 체크합니다.</p>
              </div>
              <button onClick={handleLimitOrder} disabled={loading || targetPrice <= 0}
                className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {loading ? "주문 중..." : useStopLoss ? "OCO 주문 등록" : "지정가 주문 등록"}
              </button>
            </>
          )}

          {/* 예약 매도 */}
          {tab === "scheduled" && (
            <>
              <QuantityInput />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">날짜</label>
                  <input type="date" value={scheduledDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted)] mb-1">시간</label>
                  <input type="time" value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="bg-[var(--surface-hover)] rounded-lg p-3 text-xs text-[var(--muted)] space-y-1">
                <p>지정 시각에 시장가로 자동 매도됩니다.</p>
                <p>스케줄러가 약 5분 간격으로 체크합니다.</p>
              </div>
              <button onClick={handleScheduledOrder} disabled={loading || !scheduledDate}
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {loading ? "주문 중..." : "예약 매도 등록"}
              </button>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Orders Panel ---
const ORDER_TYPE_LABELS: Record<string, string> = {
  limit_sell: "지정가",
  stop_loss: "손절",
  scheduled: "예약",
};

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "대기중", color: "bg-amber-600/20 text-amber-400" },
  executed: { label: "체결", color: "bg-green-600/20 text-green-400" },
  cancelled: { label: "취소", color: "bg-gray-600/20 text-gray-400" },
};

function OrdersPanel({ accountId, onRefresh }: { accountId: number; onRefresh: () => void }) {
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchPaperOrders(accountId, statusFilter === "all" ? {} : { status: "pending" });
      setOrders(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accountId, statusFilter]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30_000); // 30초 자동 갱신
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleCancel = async (orderId: number) => {
    setCancellingId(orderId);
    try {
      await cancelPaperOrder(orderId);
      await loadOrders();
      onRefresh();
    } catch {
      // ignore
    } finally {
      setCancellingId(null);
    }
  };

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  if (loading) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
        <h3 className="font-medium mb-3">활성 주문</h3>
        <div className="text-sm text-[var(--muted)]">로딩 중...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold">예약 주문</h2>
        {pendingCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">{pendingCount}건 대기</span>
        )}
        <div className="flex gap-1 ml-auto">
          {(["pending", "all"] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === v ? "bg-blue-600 text-white" : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"}`}
            >
              {v === "pending" ? "대기중" : "전체"}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 text-center text-[var(--muted)] text-sm">
          {statusFilter === "pending" ? "대기 중인 주문이 없습니다." : "주문 이력이 없습니다."}
          <p className="mt-1 text-xs">매도 버튼의 지정가/손절/예약 탭에서 주문을 등록하세요.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {orders.map((order) => {
              const st = ORDER_STATUS_LABELS[order.status] ?? ORDER_STATUS_LABELS.pending;
              return (
                <div key={order.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.color}`}>{st.label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-active)] text-[var(--muted)]">{ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}</span>
                      {order.oco_group_id && <span className="text-[10px] text-purple-400">OCO</span>}
                    </div>
                    {order.status === "pending" && (
                      <button onClick={() => handleCancel(order.id)} disabled={cancellingId === order.id}
                        className="text-xs px-2 py-1 rounded bg-red-600/10 text-red-400 hover:bg-red-600/20 disabled:opacity-50 transition-colors"
                      >{cancellingId === order.id ? "..." : "취소"}</button>
                    )}
                  </div>
                  <div className="font-medium text-sm">{order.name} <span className="text-[var(--muted)]">({order.ticker})</span></div>
                  <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-[var(--muted)]">
                    <span>수량: {order.quantity}주</span>
                    {order.target_price && <span>목표가: {order.target_price.toLocaleString()}</span>}
                    {order.stop_price && <span>손절가: {order.stop_price.toLocaleString()}</span>}
                    {order.scheduled_at && <span>예약: {new Date(order.scheduled_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                    {order.executed_price && <span>체결가: {order.executed_price.toLocaleString()}</span>}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-1">
                    {order.created_at && new Date(order.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {order.cancel_reason && <span className="ml-2">({order.cancel_reason})</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
                  <th className="p-3">종목</th>
                  <th className="p-3 text-center">유형</th>
                  <th className="p-3 text-right">수량</th>
                  <th className="p-3 text-right">조건</th>
                  <th className="p-3 text-center">상태</th>
                  <th className="p-3">등록일</th>
                  <th className="p-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const st = ORDER_STATUS_LABELS[order.status] ?? ORDER_STATUS_LABELS.pending;
                  return (
                    <tr key={order.id} className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)] text-sm">
                      <td className="p-3">
                        <span className="font-medium">{order.name}</span>
                        <span className="text-[var(--muted)] ml-1">({order.ticker})</span>
                        {order.oco_group_id && <span className="text-[10px] text-purple-400 ml-1">OCO</span>}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-active)]">{ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}</span>
                      </td>
                      <td className="p-3 text-right">{order.quantity}주</td>
                      <td className="p-3 text-right text-xs">
                        {order.target_price && <div>목표 {order.target_price.toLocaleString()}</div>}
                        {order.stop_price && <div>손절 {order.stop_price.toLocaleString()}</div>}
                        {order.scheduled_at && <div>{new Date(order.scheduled_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>}
                        {order.executed_price && <div className="text-green-400">체결 {order.executed_price.toLocaleString()}</div>}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st.color}`}>{st.label}</span>
                        {order.cancel_reason && <div className="text-[10px] text-[var(--muted)] mt-0.5">{order.cancel_reason}</div>}
                      </td>
                      <td className="p-3 text-[var(--muted)] text-xs">
                        {order.created_at && new Date(order.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3">
                        {order.status === "pending" && (
                          <button onClick={() => handleCancel(order.id)} disabled={cancellingId === order.id}
                            className="text-xs px-2 py-1 rounded bg-red-600/10 text-red-400 hover:bg-red-600/20 disabled:opacity-50 transition-colors"
                          >{cancellingId === order.id ? "..." : "취소"}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// --- Leaderboard View ---
const MEDALS: Record<number, string> = { 1: "\uD83E\uDD47", 2: "\uD83E\uDD48", 3: "\uD83E\uDD49" };

function LeaderboardView() {
  const { data, isLoading, error } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-[var(--muted)]">랭킹 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <svg className="w-8 h-8 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        <p className="text-[var(--muted)] text-sm">랭킹을 불러올 수 없습니다.</p>
      </div>
    );
  }

  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <div className="text-4xl">&#x1F3C6;</div>
        <p className="text-[var(--muted)]">아직 참여자가 없습니다.</p>
        <p className="text-[var(--muted)] text-sm">모의 투자 계좌를 만들면 자동으로 랭킹에 참여됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data?.updated_at && (
        <p className="text-xs text-[var(--muted)]">
          마지막 업데이트: {new Date(data.updated_at).toLocaleString("ko-KR")}
        </p>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {entries.map((entry) => {
          const isMe = entry.user_id === data?.current_user_id;
          return (
            <div
              key={`${entry.user_id}-${entry.rank}`}
              className={`bg-[var(--card)] border rounded-lg p-4 ${
                isMe ? "border-blue-500 ring-1 ring-blue-500/30" : "border-[var(--card-border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl w-10 text-center shrink-0">
                  {MEDALS[entry.rank] ?? <span className="text-base font-bold text-[var(--muted)]">{entry.rank}</span>}
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {entry.user_avatar ? (
                    <img src={entry.user_avatar} alt="" className="w-8 h-8 rounded-full shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-active)] flex items-center justify-center text-sm shrink-0">
                      {entry.user_name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {entry.user_name}
                      {isMe && <span className="ml-1 text-xs text-blue-400">(나)</span>}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{entry.account_name}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="font-bold text-lg"
                    style={{ color: entry.return_pct >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {entry.return_pct > 0 ? "+" : ""}{entry.return_pct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {entry.total_pnl >= 0 ? "+" : ""}{entry.total_pnl.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)] ml-[52px]">
                <span>총 자산 {entry.total_value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원</span>
                <span>거래 {entry.trade_count}회</span>
                <span>종목 {entry.position_count}개</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-left text-sm text-[var(--muted)]">
              <th className="p-3 w-16 text-center">순위</th>
              <th className="p-3">사용자</th>
              <th className="p-3 text-right">수익률</th>
              <th className="p-3 text-right">총 수익금</th>
              <th className="p-3 text-right">총 자산</th>
              <th className="p-3 text-right">거래</th>
              <th className="p-3 text-right">종목</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isMe = entry.user_id === data?.current_user_id;
              return (
                <tr
                  key={`${entry.user_id}-${entry.rank}`}
                  className={`border-b border-[var(--card-border)] text-sm ${
                    isMe ? "bg-blue-500/10" : "hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <td className="p-3 text-center text-lg">
                    {MEDALS[entry.rank] ?? <span className="text-sm font-bold text-[var(--muted)]">{entry.rank}위</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {entry.user_avatar ? (
                        <img src={entry.user_avatar} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--surface-active)] flex items-center justify-center text-xs">
                          {entry.user_name[0]}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">{entry.user_name}</span>
                        {isMe && <span className="ml-1 text-xs text-blue-400">(나)</span>}
                        <div className="text-xs text-[var(--muted)]">{entry.account_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className="font-bold"
                      style={{ color: entry.return_pct >= 0 ? "#4ade80" : "#f87171" }}
                    >
                      {entry.return_pct > 0 ? "+" : ""}{entry.return_pct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <span style={{ color: entry.total_pnl >= 0 ? "#4ade80" : "#f87171" }}>
                      {entry.total_pnl >= 0 ? "+" : ""}{entry.total_pnl.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {entry.total_value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
                  </td>
                  <td className="p-3 text-right">{entry.trade_count}회</td>
                  <td className="p-3 text-right">{entry.position_count}개</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Manual Buy Form ---
function ManualBuyForm({ accountId, onSuccess }: { accountId: number; onSuccess: () => void }) {
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState("");
  const [market, setMarket] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    setHighlightIdx(-1);
    // Clear selection when user edits
    if (ticker) {
      setTicker("");
      setMarket("");
      setName("");
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchStocks(value.trim());
        setSuggestions(data.results || []);
        setShowDropdown((data.results || []).length > 0);
      } catch {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 300);
  }, [ticker]);

  const selectSuggestion = useCallback((item: StockSearchResult) => {
    setInput(`${item.name} (${item.ticker})`);
    setTicker(item.ticker);
    setMarket(item.market);
    setName(item.name);
    setShowDropdown(false);
    setSuggestions([]);
  }, []);

  const clearSelection = () => {
    setInput("");
    setTicker("");
    setMarket("");
    setName("");
    setSuggestions([]);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        selectSuggestion(suggestions[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleBuy = async () => {
    if (!ticker) {
      setError("종목을 검색하여 선택하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await executePaperBuy({
        account_id: accountId,
        ticker: ticker.trim().toUpperCase(),
        name: name || ticker.trim().toUpperCase(),
        market,
        quantity,
        price: 0,
        source: "manual",
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      clearSelection();
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

  const isSelected = !!ticker;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <h3 className="font-medium mb-3">수동 매수</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1" ref={dropdownRef}>
          <input
            type="text"
            placeholder="종목명 또는 코드 검색 (예: 삼성전자, AAPL)"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            className={`w-full h-10 rounded-lg bg-[var(--surface-hover)] border px-3 text-sm focus:outline-none focus:border-blue-500 ${
              isSelected ? "border-green-500/50" : "border-[var(--card-border)]"
            }`}
          />
          {isSelected && (
            <button
              onClick={clearSelection}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              title="선택 초기화"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
              {suggestions.map((item, idx) => (
                <button
                  key={`${item.ticker}-${idx}`}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item); }}
                  className={`w-full px-3 py-2 flex items-center justify-between text-left text-sm transition-colors ${
                    idx === highlightIdx ? "bg-blue-600/20" : "hover:bg-[var(--background)]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-xs text-[var(--muted)] shrink-0">{item.ticker}</span>
                  </div>
                  <span className="text-xs text-[var(--muted)] ml-2 shrink-0">{item.market}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {isSelected && (
          <div className="flex items-center h-10 px-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400 whitespace-nowrap">
            {market}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={quantity || ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") { setQuantity(0); return; }
              setQuantity(Math.max(0, parseInt(v) || 0));
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => { if (quantity < 1) setQuantity(1); }}
            className="w-20 h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm text-center focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-[var(--muted)]">주</span>
        </div>
        <button
          onClick={handleBuy}
          disabled={loading || !isSelected}
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
  cashBalance,
  onSuccess,
}: {
  accountId: number;
  ownedTickers: Set<string>;
  cashBalance?: number;
  onSuccess: () => void;
}) {
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderTarget, setOrderTarget] = useState<any>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  // Live / closing prices from batch API
  const { prices: livePrices, isAnyMarketOpen } = useLivePrices();

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
          const lp = livePrices.get(rec.ticker);
          const displayPrice = lp ? lp.live_price : rec.current_price;
          return (
            <div
              key={rec.ticker}
              className="flex items-center justify-between bg-[var(--surface-hover)] rounded-lg p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="font-medium text-sm hover:underline truncate">
                    {rec.name}
                  </Link>
                  <span className="text-xs text-[var(--muted)] shrink-0">({rec.ticker})</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
                  <span>{formatPrice(displayPrice, rec.market)}{lp?.is_close_price && <span className="text-yellow-400 ml-0.5" title="종가">C</span>}</span>
                  <span>신뢰도 {(rec.confidence * 100).toFixed(0)}%</span>
                  {rec.target_price && (
                    <span style={{ color: "#4ade80" }}>
                      목표 {formatPrice(rec.target_price, rec.market)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOrderTarget({ ...rec, current_price: displayPrice })}
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
              const lp = livePrices.get(rec.ticker);
              const displayPrice = lp ? lp.live_price : rec.current_price;
              const expectedPct =
                displayPrice > 0 && rec.target_price
                  ? ((rec.target_price - displayPrice) / displayPrice) * 100
                  : null;
              return (
                <tr key={rec.ticker} className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)] text-sm">
                  <td className="p-2.5">
                    <Link href={`/analysis/${rec.ticker}?market=${rec.market}`} className="hover:underline">
                      <span className="font-medium">{rec.name}</span>
                      <span className="text-[var(--muted)] text-xs ml-1">({rec.ticker})</span>
                    </Link>
                    {owned && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400">보유중</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right">
                    {formatPrice(displayPrice, rec.market)}
                    {lp?.is_close_price && <span className="text-yellow-400 text-xs ml-0.5" title="종가">C</span>}
                  </td>
                  <td className="p-2.5 text-right" style={{ color: "#4ade80" }}>
                    {rec.target_price ? formatPrice(rec.target_price, rec.market) : "-"}
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
                      onClick={() => setOrderTarget({ ...rec, current_price: displayPrice })}
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
          cashBalance={cashBalance}
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

  // Deposit (추가 입금)
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(10_000_000);
  const [depositing, setDepositing] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState<"portfolio" | "ranking">("portfolio");

  // Trade history filters
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeSideFilter, setTradeSideFilter] = useState<"all" | "BUY" | "SELL">("all");
  const [tradePeriodFilter, setTradePeriodFilter] = useState<"all" | "1w" | "1m" | "3m">("all");

  // Portfolio chart tab
  const [portfolioTab, setPortfolioTab] = useState<"donut" | "trend" | "pnl" | "market" | "bar">("donut");

  // Market status for auto-refresh (direct query, no batch price overhead)
  const { data: marketStatusData } = useQuery({
    queryKey: ["market-status"],
    queryFn: fetchMarketStatus,
    refetchInterval: 60_000,
    enabled: isAuthenticated,
  });
  const marketStatus = marketStatusData?.data ?? null;
  // Default to true (assume open) so auto-refresh works even if status fetch fails
  const isAnyMarketOpen = marketStatus
    ? marketStatus.KR.is_open || marketStatus.US.is_open
    : true;

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

  // Auto-refresh positions/summary: 15s when market open, 5min when closed
  const REFRESH_OPEN = 15;
  const REFRESH_CLOSED = 300;
  const refreshSec = isAnyMarketOpen ? REFRESH_OPEN : REFRESH_CLOSED;
  const [countdown, setCountdown] = useState(refreshSec);
  const [refreshing, setRefreshing] = useState(false);
  const activeIdRef = useRef(activeAccountId);
  activeIdRef.current = activeAccountId;

  useEffect(() => {
    setCountdown(refreshSec);
  }, [refreshSec]);

  useEffect(() => {
    if (!activeAccountId) return;
    setCountdown(refreshSec);
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (activeIdRef.current) {
            setRefreshing(true);
            loadData(activeIdRef.current).finally(() => setRefreshing(false));
          }
          return refreshSec;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(tick);
  }, [activeAccountId, refreshSec, loadData]);

  const handleDeposit = async () => {
    if (!activeAccountId || depositing || depositAmount <= 0) return;
    setDepositing(true);
    try {
      await depositPaperAccount(activeAccountId, depositAmount);
      setShowDeposit(false);
      await loadData(activeAccountId);
    } catch {
      // ignore
    } finally {
      setDepositing(false);
    }
  };

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
    if (activeAccountId) {
      setRefreshing(true);
      loadData(activeAccountId).finally(() => setRefreshing(false));
      setCountdown(refreshSec);
    }
  };

  // --- Portfolio composition data ---
  const portfolioComposition = useMemo(() => {
    if (!summary || positions.length === 0) return [];
    const totalValue = summary.cash_balance + positions.reduce((sum, p) => sum + p.eval_amount, 0);
    if (totalValue <= 0) return [];

    const sorted = [...positions].sort((a, b) => b.eval_amount - a.eval_amount);
    const top = sorted.slice(0, 10);
    const rest = sorted.slice(10);
    const restSum = rest.reduce((sum, p) => sum + p.eval_amount, 0);

    const items: { label: string; value: number; pct: number }[] = [];
    for (const p of top) {
      items.push({ label: p.name, value: p.eval_amount, pct: (p.eval_amount / totalValue) * 100 });
    }
    if (restSum > 0) {
      items.push({ label: `기타 (${rest.length}종목)`, value: restSum, pct: (restSum / totalValue) * 100 });
    }
    items.push({ label: "현금", value: summary.cash_balance, pct: (summary.cash_balance / totalValue) * 100 });
    return items;
  }, [positions, summary]);

  // --- Filtered trades ---
  const filteredTrades = useMemo(() => {
    let filtered = trades;
    // Side filter
    if (tradeSideFilter !== "all") {
      filtered = filtered.filter((t) => t.side === tradeSideFilter);
    }
    // Search filter
    if (tradeSearch.trim()) {
      const q = tradeSearch.trim().toLowerCase();
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(q) || t.ticker.toLowerCase().includes(q)
      );
    }
    // Period filter
    if (tradePeriodFilter !== "all") {
      const now = Date.now();
      const msMap = { "1w": 7 * 86400000, "1m": 30 * 86400000, "3m": 90 * 86400000 };
      const cutoff = now - msMap[tradePeriodFilter];
      filtered = filtered.filter((t) => new Date(t.executed_at).getTime() >= cutoff);
    }
    return filtered;
  }, [trades, tradeSideFilter, tradeSearch, tradePeriodFilter]);

  // --- Trade statistics ---
  const tradeStats = useMemo(() => {
    const sellTrades = trades.filter((t) => t.side === "SELL" && t.realized_pnl != null);
    const totalCount = trades.length;
    const winTrades = sellTrades.filter((t) => (t.realized_pnl ?? 0) > 0);
    const winRate = sellTrades.length > 0 ? (winTrades.length / sellTrades.length) * 100 : 0;
    const avgPnlPct = sellTrades.length > 0
      ? sellTrades.reduce((sum, t) => sum + (t.realized_pnl_pct ?? 0), 0) / sellTrades.length
      : 0;
    let bestTrade: Trade | null = null;
    let bestPnl = -Infinity;
    for (const t of sellTrades) {
      if ((t.realized_pnl ?? 0) > bestPnl) {
        bestPnl = t.realized_pnl ?? 0;
        bestTrade = t;
      }
    }
    return { totalCount, sellCount: sellTrades.length, winRate, avgPnlPct, bestTrade, bestPnl };
  }, [trades]);

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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">모의 투자</h1>
        </div>
        {/* Tabs — 비로그인 시 포트폴리오 탭 클릭하면 로그인 유도 */}
        <div className="flex gap-1 border-b border-[var(--card-border)]">
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "portfolio"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            내 포트폴리오
          </button>
          <button
            onClick={() => setActiveTab("ranking")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "ranking"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            랭킹
          </button>
        </div>
        {activeTab === "ranking" ? (
          <LeaderboardView />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <h2 className="text-xl font-bold">가상 자금으로 실전처럼 투자 연습</h2>
              <p className="text-[var(--muted)] text-center max-w-md">
                실제 시장 데이터 기반으로 매수/매도를 체험하고, 수익률을 추적하세요. 리스크 없이 투자 전략을 테스트할 수 있습니다.
              </p>
              <button
                onClick={() => router.push("/auth/login")}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                로그인하여 시작하기
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
                <div className="text-2xl mb-2">&#x1F4B0;</div>
                <h3 className="font-semibold mb-1">가상 자금 운용</h3>
                <p className="text-sm text-[var(--muted)]">원하는 초기 자금으로 여러 계좌를 만들어 다양한 전략을 테스트하세요.</p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
                <div className="text-2xl mb-2">&#x1F4C9;</div>
                <h3 className="font-semibold mb-1">실시간 손익 추적</h3>
                <p className="text-sm text-[var(--muted)]">보유 종목의 실시간 평가 금액, 수익률, 손익을 한눈에 확인합니다.</p>
              </div>
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
                <div className="text-2xl mb-2">&#x1F3C6;</div>
                <h3 className="font-semibold mb-1">수익률 랭킹</h3>
                <p className="text-sm text-[var(--muted)]">다른 투자자들과 수익률을 비교하고 랭킹에 도전하세요.</p>
              </div>
            </div>
          </div>
        )}
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
                className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
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
                      newBalance === b ? "bg-blue-600 text-white" : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"
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
                className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              {accounts.length > 0 && (
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-sm transition-colors"
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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">모의 투자</h1>
            {marketStatus && (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: marketStatus.KR.is_open ? "#4ade80" : "#6b7280" }} />
                KR
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: marketStatus.US.is_open ? "#4ade80" : "#6b7280" }} />
                US
              </span>
            </div>
          )}
          </div>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
            가상 자금으로 실제 시장 데이터에 기반한 매매를 연습합니다. 포지션 관리, 수익률 추적, 거래 이력을 통해 실전 감각을 익히세요. 모의 투자 수익률은 실제 투자 수익을 보장하지 않습니다.
          </p>
        </div>
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
            className="relative h-9 w-9 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-sm hover:bg-[var(--surface-active)] transition-colors flex items-center justify-center"
            title={`새로고침 (${countdown}초 후 자동 갱신)`}
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.1} />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={isAnyMarketOpen ? "#4ade80" : "#6b7280"}
                strokeWidth="1.5"
                strokeDasharray={`${(2 * Math.PI * 15)}`}
                strokeDashoffset={`${(2 * Math.PI * 15) * (1 - countdown / refreshSec)}`}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span className={`relative text-xs ${refreshing ? "animate-spin" : ""}`}>
              {refreshing ? "↻" : countdown}
            </span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
          >
            + 새 계좌
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "portfolio"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          내 포트폴리오
        </button>
        <button
          onClick={() => setActiveTab("ranking")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ranking"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          랭킹
        </button>
      </div>

      {activeTab === "ranking" ? (
        <LeaderboardView />
      ) : (
      <>
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="text-xs text-[var(--muted)] mb-1">총 자산</div>
            <div className="text-lg font-bold">{formatKRW(summary.total_assets)}원</div>
            {summary.bonus_balance > 0 && (
              <div className="text-xs text-amber-400 mt-0.5">
                초기 {formatKRW(summary.initial_balance)} + 입금 {formatKRW(summary.bonus_balance)}
              </div>
            )}
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
            <div className="mt-2">
              <button
                onClick={() => setShowDeposit(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-medium transition-colors"
              >
                + 추가 입금
              </button>
            </div>
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

      {/* Manual Buy */}
      {activeAccountId && (
        <ManualBuyForm accountId={activeAccountId} onSuccess={handleRefresh} />
      )}

      {/* Portfolio Composition — Tabbed Charts */}
      {portfolioComposition.length > 0 && summary && (
        <div>
          <h2 className="text-lg font-bold mb-3">포트폴리오 구성</h2>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[var(--card-border)] overflow-x-auto">
              {(["donut", "trend", "pnl", "market", "bar"] as const).map((tab) => {
                const labels = { donut: "도넛", trend: "자산 추이", pnl: "손익", market: "시장", bar: "바" };
                return (
                  <button
                    key={tab}
                    onClick={() => setPortfolioTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      portfolioTab === tab
                        ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
            {/* Tab Content */}
            <div className="p-4">
              {portfolioTab === "donut" && (
                <DonutChart data={portfolioComposition} totalAssets={summary.total_assets} />
              )}
              {portfolioTab === "trend" && (
                <AssetTrendChart trades={trades} summary={summary} />
              )}
              {portfolioTab === "pnl" && (
                <PnlBarChart positions={positions} />
              )}
              {portfolioTab === "market" && (
                <MarketPieChart positions={positions} summary={summary} />
              )}
              {portfolioTab === "bar" && (
                <div className="space-y-2.5">
                  {portfolioComposition.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      <div className="w-24 sm:w-32 truncate text-[var(--muted)]" title={item.label}>
                        {item.label}
                      </div>
                      <div className="flex-1 h-5 bg-[var(--surface-hover)] rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.label === "현금"
                              ? "bg-emerald-500/30"
                              : item.label.startsWith("기타")
                              ? "bg-gray-500/30"
                              : "bg-blue-500/30"
                          }`}
                          style={{ width: `${Math.max(item.pct, 1)}%` }}
                        />
                      </div>
                      <div className="w-14 text-right font-medium tabular-nums">
                        {item.pct.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Positions */}
      <div>
        <h2 className="text-lg font-bold mb-3">보유 포지션</h2>
        {positions.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-8 text-center text-[var(--muted)]">
            보유 중인 포지션이 없습니다. 추천 페이지에서 모의 매수하거나 위에서 수동 매수하세요.
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
                    <div className="flex justify-between"><span className="text-[var(--muted)]">평균매수가</span><span>{formatPrice(pos.avg_buy_price, pos.market)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">현재가</span><span>{formatPrice(pos.current_price, pos.market)}{pos.price_fallback && <span className="text-xs text-yellow-400 ml-1" title="실시간 가격 조회 불가, 매수가 기준">*</span>}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">평가금액</span><span>{formatKRW(pos.eval_amount)}원</span></div>
                    <div className="col-span-2 flex justify-between">
                      <span className="text-[var(--muted)]">평가손익</span>
                      <PnlText value={pos.unrealized_pnl} pct={pos.unrealized_pnl_pct} />
                    </div>
                    {pos.stock_pnl != null && pos.fx_pnl != null && (
                      <div className="col-span-2 flex justify-end gap-3 text-xs text-[var(--muted)]">
                        <span>주가 <span style={{ color: pos.stock_pnl >= 0 ? "#4ade80" : "#f87171" }}>{pos.stock_pnl >= 0 ? "+" : ""}{formatKRW(pos.stock_pnl)}</span></span>
                        <span>환율 <span style={{ color: pos.fx_pnl >= 0 ? "#4ade80" : "#f87171" }}>{pos.fx_pnl >= 0 ? "+" : ""}{formatKRW(pos.fx_pnl)}</span></span>
                      </div>
                    )}
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
                    <tr key={pos.id} className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)]">
                      <td className="p-3">
                        <span className="font-medium">{pos.name}</span>
                        <span className="text-[var(--muted)] text-sm ml-1">({pos.ticker})</span>
                      </td>
                      <td className="p-3 text-right">{pos.quantity}</td>
                      <td className="p-3 text-right">{formatPrice(pos.avg_buy_price, pos.market)}</td>
                      <td className="p-3 text-right">{formatPrice(pos.current_price, pos.market)}{pos.price_fallback && <span className="text-xs text-yellow-400 ml-1" title="실시간 가격 조회 불가, 매수가 기준">*</span>}</td>
                      <td className="p-3 text-right">{formatKRW(pos.eval_amount)}원</td>
                      <td className="p-3 text-right">
                        <PnlText value={pos.unrealized_pnl} />
                        {pos.stock_pnl != null && pos.fx_pnl != null && (
                          <div className="flex justify-end gap-2 text-[10px] text-[var(--muted)] mt-0.5">
                            <span>주가 <span style={{ color: pos.stock_pnl >= 0 ? "#4ade80" : "#f87171" }}>{pos.stock_pnl >= 0 ? "+" : ""}{formatKRW(pos.stock_pnl)}</span></span>
                            <span>환율 <span style={{ color: pos.fx_pnl >= 0 ? "#4ade80" : "#f87171" }}>{pos.fx_pnl >= 0 ? "+" : ""}{formatKRW(pos.fx_pnl)}</span></span>
                          </div>
                        )}
                      </td>
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

      {/* Orders Panel */}
      {activeAccountId && (
        <OrdersPanel accountId={activeAccountId} onRefresh={handleRefresh} />
      )}

      {/* Recommended Stocks */}
      {activeAccountId && (
        <RecommendedBuyList
          accountId={activeAccountId}
          ownedTickers={new Set(positions.map((p) => p.ticker))}
          cashBalance={summary?.cash_balance}
          onSuccess={handleRefresh}
        />
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
            {/* Trade Statistics */}
            {trades.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--muted)] mb-1">총 거래 수</div>
                  <div className="text-lg font-bold">{tradeStats.totalCount}건</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    매수 {trades.filter((t) => t.side === "BUY").length} / 매도 {tradeStats.sellCount}
                  </div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--muted)] mb-1">승률</div>
                  <div className="text-lg font-bold" style={{ color: tradeStats.winRate >= 50 ? "#4ade80" : tradeStats.sellCount > 0 ? "#f87171" : "inherit" }}>
                    {tradeStats.sellCount > 0 ? `${tradeStats.winRate.toFixed(1)}%` : "-"}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    {tradeStats.sellCount > 0 ? `${tradeStats.sellCount}건 중 ${Math.round(tradeStats.winRate * tradeStats.sellCount / 100)}건 수익` : "매도 이력 없음"}
                  </div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--muted)] mb-1">평균 수익률</div>
                  <div className="text-lg font-bold">
                    {tradeStats.sellCount > 0 ? (
                      <span style={{ color: tradeStats.avgPnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                        {tradeStats.avgPnlPct >= 0 ? "+" : ""}{tradeStats.avgPnlPct.toFixed(2)}%
                      </span>
                    ) : "-"}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">매도 기준</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--muted)] mb-1">최대 수익 거래</div>
                  {tradeStats.bestTrade ? (
                    <>
                      <div className="text-lg font-bold" style={{ color: tradeStats.bestPnl >= 0 ? "#4ade80" : "#f87171" }}>
                        {tradeStats.bestPnl >= 0 ? "+" : ""}{formatKRW(tradeStats.bestPnl)}원
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5 truncate" title={tradeStats.bestTrade.name}>
                        {tradeStats.bestTrade.name} ({tradeStats.bestTrade.ticker})
                      </div>
                    </>
                  ) : (
                    <div className="text-lg font-bold">-</div>
                  )}
                </div>
              </div>
            )}

            {/* Trade Filters */}
            {trades.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="종목명/코드 검색"
                  value={tradeSearch}
                  onChange={(e) => setTradeSearch(e.target.value)}
                  className="h-9 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500 sm:w-48"
                />
                <div className="flex gap-1">
                  {(["all", "BUY", "SELL"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setTradeSideFilter(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tradeSideFilter === v
                          ? "bg-blue-600 text-white"
                          : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"
                      }`}
                    >
                      {v === "all" ? "전체" : v === "BUY" ? "매수" : "매도"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {(["all", "1w", "1m", "3m"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setTradePeriodFilter(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        tradePeriodFilter === v
                          ? "bg-blue-600 text-white"
                          : "bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface-active)]"
                      }`}
                    >
                      {v === "all" ? "전체기간" : v === "1w" ? "1주" : v === "1m" ? "1개월" : "3개월"}
                    </button>
                  ))}
                </div>
                {(tradeSearch || tradeSideFilter !== "all" || tradePeriodFilter !== "all") && (
                  <span className="text-xs text-[var(--muted)] self-center">
                    {filteredTrades.length}건
                  </span>
                )}
              </div>
            )}

            {trades.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 text-center text-[var(--muted)]">
                거래 이력이 없습니다.
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 text-center text-[var(--muted)]">
                검색 조건에 맞는 거래가 없습니다.
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  {filteredTrades.map((t) => (
                    <div key={t.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.side === "BUY" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                            {t.side === "BUY" ? "매수" : "매도"}
                          </span>
                          <span className="font-medium text-sm">{t.name} ({t.ticker})</span>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {new Date(t.executed_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--muted)]">{t.quantity}주 x {formatPrice(t.price, t.market)}</span>
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
                      {filteredTrades.map((t) => (
                        <tr key={t.id} className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)] text-sm">
                          <td className="p-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.side === "BUY" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                              {t.side === "BUY" ? "매수" : "매도"}
                            </span>
                          </td>
                          <td className="p-3 font-medium">{t.name} <span className="text-[var(--muted)]">({t.ticker})</span></td>
                          <td className="p-3 text-right">{t.quantity}</td>
                          <td className="p-3 text-right">{formatPrice(t.price, t.market)}</td>
                          <td className="p-3 text-right">{formatKRW(t.total_amount)}원</td>
                          <td className="p-3 text-right">
                            {t.side === "SELL" && t.realized_pnl != null ? (
                              <PnlText value={t.realized_pnl} pct={t.realized_pnl_pct ?? undefined} />
                            ) : "-"}
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-xs text-[var(--muted)]">{t.source === "recommendation" ? "추천" : "수동"}</span>
                          </td>
                          <td className="p-3 text-[var(--muted)]">
                            {new Date(t.executed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setShowDeposit(false)} />
          <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">추가 입금</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {[1_000_000, 5_000_000, 10_000_000, 50_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setDepositAmount(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    depositAmount === v ? "bg-blue-600 text-white" : "bg-[var(--surface-active)] text-[var(--muted)] hover:bg-white/20"
                  }`}
                >
                  {formatKRW(v)}원
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">입금액 (원)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Math.max(0, Number(e.target.value)))}
                className="w-full h-10 rounded-lg bg-[var(--surface-hover)] border border-[var(--card-border)] px-3 text-sm focus:outline-none focus:border-blue-500"
                min={0}
                step={1_000_000}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowDeposit(false)}
                className="flex-1 py-2.5 rounded-lg bg-[var(--surface-active)] hover:bg-white/20 text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeposit}
                disabled={depositing || depositAmount <= 0}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {depositing ? "처리 중..." : `${formatKRW(depositAmount)}원 입금`}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

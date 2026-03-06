"""Background order checker for paper trading limit/stop-loss/scheduled orders.

Periodically checks pending orders and executes them when conditions are met.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from itertools import groupby
from operator import attrgetter

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))

# Check intervals (seconds)
MARKET_OPEN_INTERVAL = 300  # 5 minutes
MARKET_CLOSED_INTERVAL = 900  # 15 minutes
SCHEDULED_ONLY_INTERVAL = 300  # 5 minutes (scheduled orders only)


class OrderChecker:
    """Lightweight asyncio-based order checker."""

    def __init__(self):
        self._task: asyncio.Task | None = None

    async def _check_and_execute(self) -> None:
        """Check all pending orders and execute if conditions met."""
        from src.db.database import get_async_session
        from src.models.db_models import (
            PaperOrderModel,
            PaperPositionModel,
            PaperAccountModel,
            PaperTradeModel,
        )
        from src.services.market_data_service import MarketDataService, get_usd_krw_rate
        from src.api.routes.notifications import create_notification

        svc = MarketDataService()

        try:
            async for session in get_async_session():
                # Fetch all pending orders
                result = await session.execute(
                    select(PaperOrderModel)
                    .where(PaperOrderModel.status == "pending")
                    .order_by(PaperOrderModel.ticker, PaperOrderModel.created_at.asc())
                )
                orders = result.scalars().all()

                if not orders:
                    return

                now = datetime.now(KST).replace(tzinfo=None)

                # Group by ticker for batch price lookup
                sorted_orders = sorted(orders, key=attrgetter("ticker"))
                for ticker, group_iter in groupby(sorted_orders, key=attrgetter("ticker")):
                    ticker_orders = list(group_iter)
                    sample = ticker_orders[0]

                    # Handle scheduled orders first (no price needed)
                    scheduled = [o for o in ticker_orders if o.order_type == "scheduled"]
                    price_orders = [o for o in ticker_orders if o.order_type != "scheduled"]

                    for order in scheduled:
                        if order.scheduled_at and now >= order.scheduled_at:
                            await self._execute_order_at_market(
                                session, order, svc, now
                            )

                    if not price_orders:
                        continue

                    # Fetch current price
                    try:
                        price_data = await asyncio.to_thread(
                            svc.get_current_price, ticker, sample.market
                        )
                        current_price = price_data.get("current_price", 0)
                        if not current_price or current_price <= 0:
                            logger.warning(f"[OrderChecker] Price unavailable for {ticker}, skip")
                            continue
                    except Exception as e:
                        logger.warning(f"[OrderChecker] Price fetch failed for {ticker}: {e}")
                        continue

                    # Check each order — limit_sell first (익절 우선)
                    price_orders.sort(key=lambda o: 0 if o.order_type == "limit_sell" else 1)

                    for order in price_orders:
                        # Re-check status (may have been cancelled by OCO)
                        await session.refresh(order)
                        if order.status != "pending":
                            continue

                        should_execute = False
                        if order.order_type == "limit_sell" and order.target_price:
                            should_execute = current_price >= order.target_price
                        elif order.order_type == "stop_loss" and order.stop_price:
                            should_execute = current_price <= order.stop_price

                        if should_execute:
                            await self._execute_sell_order(
                                session, order, current_price, svc, now
                            )

                await session.commit()
                break
        except Exception as e:
            logger.error(f"[OrderChecker] Check failed: {e}")

    async def _execute_order_at_market(
        self,
        session: AsyncSession,
        order,
        svc,
        now: datetime,
    ) -> None:
        """Execute a scheduled order at market price."""
        from src.services.market_data_service import get_usd_krw_rate

        try:
            price_data = await asyncio.to_thread(
                svc.get_current_price, order.ticker, order.market
            )
            current_price = price_data.get("current_price", 0)
            if not current_price or current_price <= 0:
                logger.warning(f"[OrderChecker] Scheduled order {order.id}: price unavailable, skip")
                return
        except Exception as e:
            logger.warning(f"[OrderChecker] Scheduled order {order.id}: price fetch failed: {e}")
            return

        await self._execute_sell_order(session, order, current_price, svc, now)

    async def _execute_sell_order(
        self,
        session: AsyncSession,
        order,
        sell_price: float,
        svc,
        now: datetime,
    ) -> None:
        """Execute a sell order at the given price."""
        from src.models.db_models import (
            PaperOrderModel,
            PaperPositionModel,
            PaperAccountModel,
            PaperTradeModel,
        )
        from src.services.market_data_service import get_usd_krw_rate
        from src.api.routes.notifications import create_notification

        # Verify position still exists
        pos_result = await session.execute(
            select(PaperPositionModel).where(
                PaperPositionModel.account_id == order.account_id,
                PaperPositionModel.ticker == order.ticker,
            )
        )
        position = pos_result.scalar_one_or_none()
        if position is None or position.quantity < order.quantity:
            order.status = "cancelled"
            order.cancel_reason = "insufficient_position"
            order.updated_at = now
            logger.info(f"[OrderChecker] Order {order.id} cancelled: insufficient position")
            return

        # Get account
        account = await session.get(PaperAccountModel, order.account_id)
        if account is None:
            order.status = "cancelled"
            order.cancel_reason = "account_not_found"
            order.updated_at = now
            return

        # Calculate P&L (same logic as execute_sell)
        is_us = order.market in ("NYSE", "NASDAQ")
        exchange_rate = None
        if is_us:
            exchange_rate = await asyncio.to_thread(get_usd_krw_rate)

        total_revenue_krw = order.quantity * sell_price * (exchange_rate or 1)
        cost_per_share_krw = position.total_invested / position.quantity
        cost_basis_krw = cost_per_share_krw * order.quantity
        realized_pnl = total_revenue_krw - cost_basis_krw
        realized_pnl_pct = (realized_pnl / cost_basis_krw * 100) if cost_basis_krw > 0 else 0.0

        # Update account cash
        account.cash_balance += total_revenue_krw
        account.updated_at = now

        # Update position
        position.quantity -= order.quantity
        position.total_invested -= cost_basis_krw
        remaining = position.quantity
        if remaining <= 0:
            await session.delete(position)
        else:
            position.updated_at = now

        # Create trade record
        trade = PaperTradeModel(
            account_id=order.account_id,
            ticker=order.ticker,
            name=order.name,
            market=order.market,
            side="SELL",
            quantity=order.quantity,
            price=sell_price,
            total_amount=total_revenue_krw,
            exchange_rate=exchange_rate,
            realized_pnl=realized_pnl,
            realized_pnl_pct=realized_pnl_pct,
            source="order",
        )
        session.add(trade)
        await session.flush()  # get trade.id

        # Update order status
        order.status = "executed"
        order.executed_price = sell_price
        order.executed_at = now
        order.trade_id = trade.id
        order.updated_at = now

        # Cancel OCO siblings
        if order.oco_group_id:
            oco_result = await session.execute(
                select(PaperOrderModel).where(
                    PaperOrderModel.oco_group_id == order.oco_group_id,
                    PaperOrderModel.status == "pending",
                    PaperOrderModel.id != order.id,
                )
            )
            for sibling in oco_result.scalars().all():
                sibling.status = "cancelled"
                sibling.cancel_reason = "oco_executed"
                sibling.updated_at = now

        # Cancel excess pending orders for this ticker
        from src.api.routes.paper_trading import _cancel_excess_orders
        await _cancel_excess_orders(session, order.account_id, order.ticker, remaining)

        # Notification
        type_label = {"limit_sell": "지정가", "stop_loss": "손절", "scheduled": "예약"}
        pnl_text = f"+{realized_pnl:,.0f}" if realized_pnl >= 0 else f"{realized_pnl:,.0f}"
        try:
            await create_notification(
                session,
                user_id=order.user_id,
                type="order_executed",
                title=f"{type_label.get(order.order_type, '')} 매도 체결",
                message=f"{order.name}({order.ticker}) {order.quantity}주 @ {sell_price:,.2f} — 손익 {pnl_text}원",
                link="/paper-trading",
            )
        except Exception as e:
            logger.warning(f"[OrderChecker] Notification failed for order {order.id}: {e}")

        logger.info(
            f"[OrderChecker] Order {order.id} executed: {order.ticker} "
            f"{order.order_type} {order.quantity}주 @ {sell_price:.2f} "
            f"P&L={realized_pnl:,.0f}"
        )

    def _has_active_market(self) -> bool:
        """Check if any market is currently open."""
        try:
            from src.utils.market_hours import is_market_open
            return is_market_open("KR") or is_market_open("US")
        except Exception:
            return False

    async def _has_scheduled_orders(self) -> bool:
        """Check if any scheduled pending orders exist."""
        try:
            from src.db.database import get_async_session
            from src.models.db_models import PaperOrderModel

            async for session in get_async_session():
                result = await session.scalar(
                    select(func.count(PaperOrderModel.id)).where(
                        PaperOrderModel.status == "pending",
                        PaperOrderModel.order_type == "scheduled",
                    )
                )
                return (result or 0) > 0
        except Exception:
            return False

    async def _loop(self) -> None:
        """Main checker loop."""
        while True:
            try:
                await self._check_and_execute()

                # Determine sleep interval
                if self._has_active_market():
                    interval = MARKET_OPEN_INTERVAL
                elif await self._has_scheduled_orders():
                    interval = SCHEDULED_ONLY_INTERVAL
                else:
                    interval = MARKET_CLOSED_INTERVAL

                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[OrderChecker] Loop error: {e}")
                await asyncio.sleep(60)

    def start(self) -> None:
        """Start the checker as a background task."""
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._loop())
        logger.info("[OrderChecker] Order checker started (5min market / 15min idle)")

    def stop(self) -> None:
        """Stop the checker."""
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("[OrderChecker] Order checker stopped")

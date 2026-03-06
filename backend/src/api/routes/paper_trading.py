"""Paper trading (mock investment) routes."""

from __future__ import annotations

import asyncio
import logging
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.dependencies import get_current_user, get_current_user_optional
from src.config.settings import settings
from src.db.database import get_async_session
from src.models.db_models import (
    UserModel,
    PaperAccountModel,
    PaperPositionModel,
    PaperTradeModel,
    PaperOrderModel,
    AdRewardLogModel,
)
from src.services.market_data_service import MarketDataService, get_usd_krw_rate
from src.utils.redis_cache import cache_get_json, cache_set_json
from src.utils.stock_name_resolver import resolve_kr_name

logger = logging.getLogger(__name__)
router = APIRouter()

_market_data_svc = MarketDataService()


# --- Pydantic schemas ---

class CreateAccountIn(BaseModel):
    name: str = "기본 계좌"
    initial_balance: float = 100_000_000
    currency: str = "KRW"


class BuyOrderIn(BaseModel):
    account_id: int
    ticker: str
    name: str
    market: str
    quantity: int
    price: float
    source: str = "manual"
    recommendation_id: int | None = None
    recommendation_action: str | None = None
    recommendation_confidence: float | None = None
    recommendation_grade: str | None = None


class SellOrderIn(BaseModel):
    account_id: int
    ticker: str
    quantity: int
    price: float


class AdRewardRequestIn(BaseModel):
    account_id: int


class AdRewardClaimIn(BaseModel):
    reward_token: str
    account_id: int


class CreateOrderIn(BaseModel):
    account_id: int
    ticker: str
    quantity: int
    order_type: str  # "limit_sell" | "stop_loss" | "scheduled"
    target_price: float | None = None
    stop_price: float | None = None
    scheduled_at: str | None = None  # ISO format


class CreateOCOOrderIn(BaseModel):
    account_id: int
    ticker: str
    quantity: int
    target_price: float  # 지정가 (이 가격 이상이면 매도)
    stop_price: float  # 손절가 (이 가격 이하이면 매도)


class DepositIn(BaseModel):
    account_id: int
    amount: int  # KRW 단위


# --- Helpers ---

def _serialize_position(pos: PaperPositionModel) -> dict:
    return {
        "id": pos.id,
        "account_id": pos.account_id,
        "ticker": pos.ticker,
        "name": pos.name,
        "market": pos.market,
        "quantity": pos.quantity,
        "avg_buy_price": pos.avg_buy_price,
        "total_invested": pos.total_invested,
        "recommendation_id": pos.recommendation_id,
        "recommendation_action": pos.recommendation_action,
        "recommendation_confidence": pos.recommendation_confidence,
        "recommendation_grade": pos.recommendation_grade,
        "opened_at": pos.opened_at.isoformat() if pos.opened_at else None,
        "updated_at": pos.updated_at.isoformat() if pos.updated_at else None,
    }


def _serialize_trade(trade: PaperTradeModel) -> dict:
    return {
        "id": trade.id,
        "account_id": trade.account_id,
        "ticker": trade.ticker,
        "name": trade.name,
        "market": trade.market,
        "side": trade.side,
        "quantity": trade.quantity,
        "price": trade.price,
        "total_amount": trade.total_amount,
        "realized_pnl": trade.realized_pnl,
        "realized_pnl_pct": trade.realized_pnl_pct,
        "source": trade.source,
        "exchange_rate": trade.exchange_rate,
        "recommendation_id": trade.recommendation_id,
        "recommendation_action": trade.recommendation_action,
        "recommendation_confidence": trade.recommendation_confidence,
        "recommendation_grade": trade.recommendation_grade,
        "executed_at": trade.executed_at.isoformat() if trade.executed_at else None,
    }


def _serialize_order(order: PaperOrderModel) -> dict:
    return {
        "id": order.id,
        "account_id": order.account_id,
        "ticker": order.ticker,
        "name": order.name,
        "market": order.market,
        "quantity": order.quantity,
        "order_type": order.order_type,
        "target_price": order.target_price,
        "stop_price": order.stop_price,
        "scheduled_at": order.scheduled_at.isoformat() if order.scheduled_at else None,
        "oco_group_id": order.oco_group_id,
        "status": order.status,
        "executed_price": order.executed_price,
        "executed_at": order.executed_at.isoformat() if order.executed_at else None,
        "trade_id": order.trade_id,
        "cancel_reason": order.cancel_reason,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
    }


async def _cancel_excess_orders(
    session: AsyncSession, account_id: int, ticker: str, remaining_qty: int,
) -> int:
    """잔량 초과하는 pending 주문을 FIFO 순으로 취소. 반환: 취소 건수."""
    result = await session.execute(
        select(PaperOrderModel)
        .where(
            PaperOrderModel.account_id == account_id,
            PaperOrderModel.ticker == ticker,
            PaperOrderModel.status == "pending",
        )
        .order_by(PaperOrderModel.created_at.asc())
    )
    orders = result.scalars().all()
    pending_total = 0
    cancelled = 0
    for order in orders:
        pending_total += order.quantity
        if pending_total > remaining_qty:
            order.status = "cancelled"
            order.cancel_reason = "position_sold"
            order.updated_at = datetime.now()
            cancelled += 1
    return cancelled


async def _verify_account_owner(
    account_id: int, user: UserModel, session: AsyncSession
) -> PaperAccountModel:
    """계좌 소유권 확인. 본인 계좌가 아니면 404."""
    result = await session.execute(
        select(PaperAccountModel).where(
            PaperAccountModel.id == account_id,
            PaperAccountModel.user_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")
    return account


# --- Account CRUD ---

@router.post("/accounts")
async def create_account(
    body: CreateAccountIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = PaperAccountModel(
        user_id=user.id,
        name=body.name,
        initial_balance=body.initial_balance,
        cash_balance=body.initial_balance,
        currency=body.currency,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return {
        "id": account.id,
        "name": account.name,
        "initial_balance": account.initial_balance,
        "cash_balance": account.cash_balance,
        "currency": account.currency,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


@router.get("/accounts")
async def list_accounts(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(PaperAccountModel)
        .where(PaperAccountModel.user_id == user.id)
        .order_by(PaperAccountModel.created_at.desc())
    )
    accounts = result.scalars().all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "initial_balance": a.initial_balance,
            "cash_balance": a.cash_balance,
            "currency": a.currency,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in accounts
    ]


@router.get("/accounts/{account_id}")
async def get_account(
    account_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(account_id, user, session)
    # Position count
    pos_result = await session.execute(
        select(PaperPositionModel).where(PaperPositionModel.account_id == account_id)
    )
    positions = pos_result.scalars().all()
    return {
        "id": account.id,
        "name": account.name,
        "initial_balance": account.initial_balance,
        "cash_balance": account.cash_balance,
        "currency": account.currency,
        "is_active": account.is_active,
        "position_count": len(positions),
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(account_id, user, session)
    await session.delete(account)
    await session.commit()
    return {"ok": True}


@router.post("/accounts/{account_id}/reset")
async def reset_account(
    account_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(account_id, user, session)
    # Delete positions, trades, and pending orders
    await session.execute(
        delete(PaperOrderModel).where(PaperOrderModel.account_id == account_id)
    )
    await session.execute(
        delete(PaperPositionModel).where(PaperPositionModel.account_id == account_id)
    )
    await session.execute(
        delete(PaperTradeModel).where(PaperTradeModel.account_id == account_id)
    )
    account.cash_balance = account.initial_balance
    account.bonus_balance = 0.0
    account.updated_at = datetime.now()
    await session.commit()
    return {"ok": True, "cash_balance": account.cash_balance}


# --- Buy / Sell ---

@router.post("/buy")
async def execute_buy(
    body: BuyOrderIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(body.account_id, user, session)

    # If price is 0, fetch current market price
    price = body.price
    if price <= 0:
        try:
            price_data = await asyncio.to_thread(
                _market_data_svc.get_current_price, body.ticker, body.market
            )
            price = price_data.get("current_price", 0)
            if price <= 0:
                raise HTTPException(status_code=400, detail="현재가를 조회할 수 없습니다.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail="현재가를 조회할 수 없습니다. 잠시 후 다시 시도해주세요.")

    # Resolve Korean name
    stock_name = body.name
    if body.ticker.isdigit() and len(body.ticker) == 6:
        resolved = resolve_kr_name(body.ticker)
        if resolved and resolved != body.ticker:
            stock_name = resolved

    # US 종목 환율 조회
    is_us = body.market in ("NYSE", "NASDAQ")
    exchange_rate = None
    if is_us:
        exchange_rate = await asyncio.to_thread(get_usd_krw_rate)

    # 금액 계산: US면 환율 적용 (price는 USD, total_cost_krw는 KRW)
    total_cost_krw = body.quantity * price * (exchange_rate or 1)

    if account.cash_balance < total_cost_krw:
        raise HTTPException(
            status_code=400,
            detail=f"잔고 부족: 필요 {total_cost_krw:,.0f}원, 보유 {account.cash_balance:,.0f}원",
        )

    # Deduct cash (KRW)
    account.cash_balance -= total_cost_krw
    account.updated_at = datetime.now()

    # Upsert position
    result = await session.execute(
        select(PaperPositionModel).where(
            PaperPositionModel.account_id == body.account_id,
            PaperPositionModel.ticker == body.ticker,
        )
    )
    position = result.scalar_one_or_none()

    if position is None:
        # avg_buy_price: 원래 통화(USD/KRW), total_invested: 항상 KRW
        position = PaperPositionModel(
            account_id=body.account_id,
            ticker=body.ticker,
            name=stock_name,
            market=body.market,
            quantity=body.quantity,
            avg_buy_price=price,
            total_invested=total_cost_krw,
            recommendation_id=body.recommendation_id,
            recommendation_action=body.recommendation_action,
            recommendation_confidence=body.recommendation_confidence,
            recommendation_grade=body.recommendation_grade,
        )
        session.add(position)
    else:
        # 추가 매수: avg_buy_price는 원래 통화로 평균, total_invested는 KRW 누적
        old_total = position.avg_buy_price * position.quantity
        new_quantity = position.quantity + body.quantity
        position.avg_buy_price = (old_total + body.quantity * price) / new_quantity
        position.quantity = new_quantity
        position.total_invested += total_cost_krw
        position.name = stock_name
        position.updated_at = datetime.now()

    # Record trade (price: 원래 통화, total_amount: KRW)
    trade = PaperTradeModel(
        account_id=body.account_id,
        ticker=body.ticker,
        name=stock_name,
        market=body.market,
        side="BUY",
        quantity=body.quantity,
        price=price,
        total_amount=total_cost_krw,
        exchange_rate=exchange_rate,
        source=body.source,
        recommendation_id=body.recommendation_id,
        recommendation_action=body.recommendation_action,
        recommendation_confidence=body.recommendation_confidence,
        recommendation_grade=body.recommendation_grade,
    )
    session.add(trade)

    await session.commit()
    return {
        "ok": True,
        "trade_id": trade.id,
        "ticker": body.ticker,
        "quantity": body.quantity,
        "price": price,
        "total_cost": total_cost_krw,
        "exchange_rate": exchange_rate,
        "cash_balance": account.cash_balance,
    }


@router.post("/sell")
async def execute_sell(
    body: SellOrderIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(body.account_id, user, session)

    # Find position
    result = await session.execute(
        select(PaperPositionModel).where(
            PaperPositionModel.account_id == body.account_id,
            PaperPositionModel.ticker == body.ticker,
        )
    )
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=400, detail="보유하지 않은 종목입니다.")
    if position.quantity < body.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"보유 수량 부족: 보유 {position.quantity}주, 매도 요청 {body.quantity}주",
        )

    # US 종목 환율 조회
    is_us = position.market in ("NYSE", "NASDAQ")
    exchange_rate = None
    if is_us:
        exchange_rate = await asyncio.to_thread(get_usd_krw_rate)

    # 매도 금액: US면 환율 적용 (body.price는 USD, total_revenue_krw는 KRW)
    total_revenue_krw = body.quantity * body.price * (exchange_rate or 1)

    # 원가: total_invested 기반 (항상 KRW)
    cost_per_share_krw = position.total_invested / position.quantity
    cost_basis_krw = cost_per_share_krw * body.quantity

    realized_pnl = total_revenue_krw - cost_basis_krw
    realized_pnl_pct = (realized_pnl / cost_basis_krw * 100) if cost_basis_krw > 0 else 0.0

    # Update cash (KRW)
    account.cash_balance += total_revenue_krw
    account.updated_at = datetime.now()

    # Update position (total_invested는 KRW 기준 차감)
    position.quantity -= body.quantity
    position.total_invested -= cost_basis_krw
    remaining = position.quantity
    if remaining <= 0:
        await session.delete(position)
    else:
        position.updated_at = datetime.now()

    # Record trade (price: 원래 통화, total_amount: KRW)
    trade = PaperTradeModel(
        account_id=body.account_id,
        ticker=body.ticker,
        name=position.name,
        market=position.market,
        side="SELL",
        quantity=body.quantity,
        price=body.price,
        total_amount=total_revenue_krw,
        exchange_rate=exchange_rate,
        realized_pnl=realized_pnl,
        realized_pnl_pct=realized_pnl_pct,
        source="manual",
    )
    session.add(trade)

    # 수동 매도 후 잔량 부족한 pending 주문 자동 취소
    await _cancel_excess_orders(session, body.account_id, body.ticker, remaining)

    await session.commit()
    return {
        "ok": True,
        "trade_id": trade.id,
        "ticker": body.ticker,
        "quantity": body.quantity,
        "price": body.price,
        "total_revenue": total_revenue_krw,
        "exchange_rate": exchange_rate,
        "realized_pnl": round(realized_pnl, 2),
        "realized_pnl_pct": round(realized_pnl_pct, 2),
        "cash_balance": account.cash_balance,
    }


# --- Positions / Trades / Summary ---

@router.get("/positions/{account_id}")
async def get_positions(
    account_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await _verify_account_owner(account_id, user, session)

    result = await session.execute(
        select(PaperPositionModel)
        .where(PaperPositionModel.account_id == account_id)
        .order_by(PaperPositionModel.opened_at.desc())
    )
    positions = result.scalars().all()

    if not positions:
        return []

    # Fetch current prices concurrently
    async def _fetch_price(pos: PaperPositionModel) -> dict:
        data = _serialize_position(pos)
        current_price = 0.0
        try:
            price_data = await asyncio.to_thread(
                _market_data_svc.get_current_price, pos.ticker, pos.market
            )
            current_price = price_data.get("current_price", 0)
        except Exception as e:
            logger.warning(f"Price fetch failed for {pos.ticker}: {e}")

        # Fallback: 가격 조회 실패 시 평균매수가 사용
        if not current_price or current_price <= 0:
            current_price = pos.avg_buy_price

        # US 종목 환율 적용: eval_amount는 항상 KRW
        is_us = pos.market in ("NYSE", "NASDAQ")
        rate = None
        if is_us:
            rate = await asyncio.to_thread(get_usd_krw_rate)
            eval_amount = current_price * pos.quantity * rate
        else:
            eval_amount = current_price * pos.quantity

        data["current_price"] = current_price
        data["eval_amount"] = eval_amount
        data["exchange_rate"] = rate
        data["unrealized_pnl"] = eval_amount - pos.total_invested
        data["unrealized_pnl_pct"] = (
            ((eval_amount - pos.total_invested) / pos.total_invested * 100)
            if pos.total_invested > 0
            else 0.0
        )
        # US 종목: 주가 손익 vs 환율 손익 분리
        if is_us and rate and pos.total_invested > 0 and pos.quantity > 0:
            buy_rate = pos.total_invested / (pos.avg_buy_price * pos.quantity)
            data["stock_pnl"] = (current_price - pos.avg_buy_price) * pos.quantity * rate
            data["fx_pnl"] = pos.avg_buy_price * pos.quantity * (rate - buy_rate)
            data["buy_exchange_rate"] = round(buy_rate, 2)
        data["price_fallback"] = current_price == pos.avg_buy_price
        return data

    tasks = [_fetch_price(pos) for pos in positions]
    results = await asyncio.gather(*tasks)
    return results


@router.get("/trades/{account_id}")
async def get_trades(
    account_id: int,
    ticker: str | None = Query(None),
    side: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(50, le=200),
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await _verify_account_owner(account_id, user, session)

    query = (
        select(PaperTradeModel)
        .where(PaperTradeModel.account_id == account_id)
    )
    if ticker:
        query = query.where(PaperTradeModel.ticker == ticker)
    if side:
        query = query.where(PaperTradeModel.side == side)
    if source:
        query = query.where(PaperTradeModel.source == source)

    query = query.order_by(PaperTradeModel.executed_at.desc()).limit(limit)

    result = await session.execute(query)
    trades = result.scalars().all()
    return [_serialize_trade(t) for t in trades]


@router.get("/summary/{account_id}")
async def get_summary(
    account_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    account = await _verify_account_owner(account_id, user, session)

    result = await session.execute(
        select(PaperPositionModel).where(PaperPositionModel.account_id == account_id)
    )
    positions = result.scalars().all()

    total_invested = sum(p.total_invested for p in positions)
    total_eval = 0.0

    if positions:
        async def _fetch_eval(pos: PaperPositionModel) -> float:
            try:
                price_data = await asyncio.to_thread(
                    _market_data_svc.get_current_price, pos.ticker, pos.market
                )
                price = price_data.get("current_price", 0)
                if price and price > 0:
                    # US 종목 환율 적용
                    if pos.market in ("NYSE", "NASDAQ"):
                        rate = await asyncio.to_thread(get_usd_krw_rate)
                        return price * pos.quantity * rate
                    return price * pos.quantity
            except Exception:
                pass
            # Fallback: total_invested (항상 KRW)
            return pos.total_invested

        tasks = [_fetch_eval(pos) for pos in positions]
        evals = await asyncio.gather(*tasks)
        total_eval = sum(evals)

    total_assets = account.cash_balance + total_eval
    effective_capital = account.initial_balance + getattr(account, 'bonus_balance', 0)
    total_pnl = total_assets - effective_capital
    total_pnl_pct = (
        (total_pnl / effective_capital * 100)
        if effective_capital > 0
        else 0.0
    )

    # Realized PnL from trades
    trade_result = await session.execute(
        select(PaperTradeModel).where(
            PaperTradeModel.account_id == account_id,
            PaperTradeModel.side == "SELL",
        )
    )
    sell_trades = trade_result.scalars().all()
    total_realized_pnl = sum(t.realized_pnl or 0 for t in sell_trades)

    return {
        "account_id": account_id,
        "name": account.name,
        "initial_balance": account.initial_balance,
        "bonus_balance": getattr(account, 'bonus_balance', 0) or 0,
        "cash_balance": account.cash_balance,
        "total_invested": total_invested,
        "total_eval": total_eval,
        "total_assets": total_assets,
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "total_realized_pnl": round(total_realized_pnl, 2),
        "position_count": len(positions),
        "currency": account.currency,
    }


@router.get("/exchange-rate")
async def get_exchange_rate():
    """프론트엔드에서 주문 전 환율 표시용."""
    rate = await asyncio.to_thread(get_usd_krw_rate)
    return {"rate": round(rate, 2), "pair": "USDKRW"}


# --- Leaderboard ---


@router.get("/leaderboard")
async def get_leaderboard(
    user: UserModel | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_async_session),
):
    """수익률 랭킹 리더보드. 비로그인도 조회 가능."""
    # Redis 캐시 확인
    cached = await cache_get_json("leaderboard")
    if cached:
        return {**cached, "current_user_id": user.id if user else None}

    # User + positions eager load (N+1 제거)
    result = await session.execute(
        select(PaperAccountModel)
        .options(
            selectinload(PaperAccountModel.positions),
            selectinload(PaperAccountModel.user),
        )
        .where(PaperAccountModel.is_active == True)  # noqa: E712
    )
    accounts = result.scalars().all()

    # trade_count 일괄 조회 (1개 쿼리로 N개 계좌 처리)
    account_ids = [a.id for a in accounts]
    trade_count_map: dict[int, int] = {}
    if account_ids:
        tc_result = await session.execute(
            select(PaperTradeModel.account_id, func.count(PaperTradeModel.id))
            .where(PaperTradeModel.account_id.in_(account_ids))
            .group_by(PaperTradeModel.account_id)
        )
        trade_count_map = dict(tc_result.all())

    # 유니크 티커 수집 → 병렬 가격 조회
    unique_tickers: set[tuple[str, str]] = set()
    for account in accounts:
        for pos in account.positions:
            unique_tickers.add((pos.ticker, pos.market))

    async def _fetch_price(ticker: str, market: str):
        try:
            data = await asyncio.to_thread(
                _market_data_svc.get_current_price, ticker, market
            )
            price = data.get("current_price", 0)
            return (ticker, market), price if price and price > 0 else 0
        except Exception:
            return (ticker, market), 0

    price_results = await asyncio.gather(
        *[_fetch_price(t, m) for t, m in unique_tickers]
    )
    price_map = dict(price_results)

    # 환율 1회만 조회
    has_us = any(m in ("NYSE", "NASDAQ") for _, m in unique_tickers)
    usd_rate = (await asyncio.to_thread(get_usd_krw_rate)) if has_us else 1

    entries = []
    for account in accounts:
        total_eval = account.cash_balance
        for pos in account.positions:
            current_price = price_map.get((pos.ticker, pos.market), 0)
            if not current_price or current_price <= 0:
                current_price = pos.avg_buy_price

            if pos.market in ("NYSE", "NASDAQ"):
                total_eval += current_price * pos.quantity * usd_rate
            else:
                total_eval += current_price * pos.quantity

        effective_capital = account.initial_balance + getattr(account, 'bonus_balance', 0)
        total_pnl = total_eval - effective_capital
        return_pct = (
            (total_pnl / effective_capital * 100)
            if effective_capital > 0
            else 0
        )

        user_obj = account.user
        entries.append(
            {
                "user_id": account.user_id,
                "user_name": user_obj.name if user_obj and user_obj.name else "익명",
                "user_avatar": user_obj.avatar_url if user_obj else None,
                "account_name": account.name,
                "initial_balance": account.initial_balance,
                "total_value": round(total_eval, 0),
                "total_pnl": round(total_pnl, 0),
                "return_pct": round(return_pct, 2),
                "trade_count": trade_count_map.get(account.id, 0),
                "position_count": len(account.positions),
            }
        )

    entries.sort(key=lambda x: x["return_pct"], reverse=True)
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    lb_result = {"entries": entries, "updated_at": datetime.now().isoformat()}
    await cache_set_json("leaderboard", lb_result, ttl=300)

    return {**lb_result, "current_user_id": user.id if user else None}


# --- Ad Reward ---

@router.get("/ad-reward/status")
async def get_ad_reward_status(
    account_id: int = Query(...),
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """광고 보상 쿨다운 상태 조회."""
    await _verify_account_owner(account_id, user, session)

    cooldown_sec = settings.ad_reward_cooldown_seconds
    _KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(_KST)
    now = now_kst.astimezone(timezone.utc).replace(tzinfo=None)

    # 마지막 claimed 기록
    result = await session.execute(
        select(AdRewardLogModel)
        .where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "claimed",
        )
        .order_by(AdRewardLogModel.claimed_at.desc())
        .limit(1)
    )
    last_claimed = result.scalar_one_or_none()

    can_watch = True
    cooldown_remaining = 0
    next_available_at = None

    if last_claimed and last_claimed.claimed_at:
        elapsed = (now - last_claimed.claimed_at).total_seconds()
        if elapsed < cooldown_sec:
            can_watch = False
            cooldown_remaining = int(cooldown_sec - elapsed)
            next_available_at = (last_claimed.claimed_at + timedelta(seconds=cooldown_sec)).isoformat()

    # 총 누적 보상
    total_result = await session.execute(
        select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "claimed",
        )
    )
    total_earned = total_result.scalar() or 0

    # 오늘 보상 횟수 (KST 기준 자정)
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    today_result = await session.execute(
        select(func.count(AdRewardLogModel.id)).where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "claimed",
            AdRewardLogModel.claimed_at >= today_start,
        )
    )
    today_count = today_result.scalar() or 0

    return {
        "can_watch": can_watch,
        "cooldown_remaining": cooldown_remaining,
        "next_available_at": next_available_at,
        "total_earned": total_earned,
        "today_count": today_count,
    }


@router.post("/ad-reward/request")
async def request_ad_reward(
    body: AdRewardRequestIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """광고 시청 전 토큰 발급."""
    await _verify_account_owner(body.account_id, user, session)

    cooldown_sec = settings.ad_reward_cooldown_seconds
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 쿨다운 체크
    result = await session.execute(
        select(AdRewardLogModel)
        .where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "claimed",
        )
        .order_by(AdRewardLogModel.claimed_at.desc())
        .limit(1)
    )
    last_claimed = result.scalar_one_or_none()

    if last_claimed and last_claimed.claimed_at:
        elapsed = (now - last_claimed.claimed_at).total_seconds()
        if elapsed < cooldown_sec:
            remaining = int(cooldown_sec - elapsed)
            return {
                "reward_token": None,
                "can_watch": False,
                "cooldown_remaining": remaining,
            }

    # 기존 pending 토큰 만료 처리
    pending_result = await session.execute(
        select(AdRewardLogModel).where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "pending",
        )
    )
    for old_log in pending_result.scalars().all():
        old_log.status = "expired"

    # 새 토큰 생성
    token = str(uuid.uuid4())
    log = AdRewardLogModel(
        account_id=body.account_id,
        user_id=user.id,
        reward_token=token,
        status="pending",
    )
    session.add(log)
    await session.commit()

    return {
        "reward_token": token,
        "can_watch": True,
        "cooldown_remaining": 0,
    }


@router.post("/ad-reward/claim")
async def claim_ad_reward(
    body: AdRewardClaimIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """광고 시청 후 보상 지급."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    token_expire_sec = settings.ad_reward_token_expire_seconds
    min_watch_sec = settings.ad_reward_min_watch_seconds
    cooldown_sec = settings.ad_reward_cooldown_seconds

    # 1. 토큰 조회 (status=pending, 10분 이내)
    result = await session.execute(
        select(AdRewardLogModel).where(
            AdRewardLogModel.reward_token == body.reward_token,
            AdRewardLogModel.status == "pending",
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 토큰입니다.")

    # 토큰 만료 체크
    if (now - log.created_at).total_seconds() > token_expire_sec:
        log.status = "expired"
        await session.commit()
        raise HTTPException(status_code=400, detail="토큰이 만료되었습니다. 다시 시도하세요.")

    # 2. user_id / account_id 매칭
    if log.user_id != user.id or log.account_id != body.account_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    # 3. 최소 시청 시간 검증
    elapsed = (now - log.created_at).total_seconds()
    if elapsed < min_watch_sec:
        raise HTTPException(
            status_code=400,
            detail=f"광고 시청이 완료되지 않았습니다. ({int(min_watch_sec - elapsed)}초 남음)",
        )

    # 4. 쿨다운 이중 체크
    cooldown_result = await session.execute(
        select(AdRewardLogModel)
        .where(
            AdRewardLogModel.user_id == user.id,
            AdRewardLogModel.status == "claimed",
        )
        .order_by(AdRewardLogModel.claimed_at.desc())
        .limit(1)
    )
    last_claimed = cooldown_result.scalar_one_or_none()
    if last_claimed and last_claimed.claimed_at:
        if (now - last_claimed.claimed_at).total_seconds() < cooldown_sec:
            log.status = "expired"
            await session.commit()
            raise HTTPException(status_code=400, detail="쿨다운 중입니다. 잠시 후 다시 시도하세요.")

    # 5. 보상 금액 결정
    reward_amount = random.randint(
        settings.ad_reward_min_amount,
        settings.ad_reward_max_amount,
    )

    # 6. 계좌 업데이트
    account = await _verify_account_owner(body.account_id, user, session)
    account.cash_balance += reward_amount
    account.bonus_balance = (getattr(account, 'bonus_balance', 0) or 0) + reward_amount
    account.updated_at = now

    # 7. 로그 업데이트
    log.reward_amount = reward_amount
    log.status = "claimed"
    log.claimed_at = now

    await session.commit()

    return {
        "ok": True,
        "reward_amount": reward_amount,
        "new_cash_balance": account.cash_balance,
        "new_bonus_balance": account.bonus_balance,
    }


# --- Orders (지정가/손절/예약) ---

@router.post("/orders")
async def create_order(
    body: CreateOrderIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """단일 주문 생성 (limit_sell / stop_loss / scheduled)."""
    account = await _verify_account_owner(body.account_id, user, session)

    # 포지션 확인
    result = await session.execute(
        select(PaperPositionModel).where(
            PaperPositionModel.account_id == body.account_id,
            PaperPositionModel.ticker == body.ticker,
        )
    )
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=400, detail="보유하지 않은 종목입니다.")

    # 기존 pending 주문 합산
    pending_result = await session.execute(
        select(func.coalesce(func.sum(PaperOrderModel.quantity), 0)).where(
            PaperOrderModel.account_id == body.account_id,
            PaperOrderModel.ticker == body.ticker,
            PaperOrderModel.status == "pending",
        )
    )
    pending_qty = pending_result.scalar() or 0

    if pending_qty + body.quantity > position.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"주문 수량 초과: 보유 {position.quantity}주, 기존 주문 {pending_qty}주, 신규 {body.quantity}주",
        )

    # 타입별 필수 필드 검증
    if body.order_type == "limit_sell":
        if not body.target_price or body.target_price <= 0:
            raise HTTPException(status_code=400, detail="지정가(target_price)를 입력하세요.")
    elif body.order_type == "stop_loss":
        if not body.stop_price or body.stop_price <= 0:
            raise HTTPException(status_code=400, detail="손절가(stop_price)를 입력하세요.")
    elif body.order_type == "scheduled":
        if not body.scheduled_at:
            raise HTTPException(status_code=400, detail="예약 시간(scheduled_at)을 입력하세요.")
    else:
        raise HTTPException(status_code=400, detail="유효하지 않은 주문 유형입니다.")

    scheduled_dt = None
    if body.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="예약 시간 형식이 올바르지 않습니다.")

    order = PaperOrderModel(
        account_id=body.account_id,
        user_id=user.id,
        ticker=body.ticker,
        name=position.name,
        market=position.market,
        quantity=body.quantity,
        order_type=body.order_type,
        target_price=body.target_price,
        stop_price=body.stop_price,
        scheduled_at=scheduled_dt,
        status="pending",
    )
    session.add(order)
    await session.commit()
    await session.refresh(order)

    return _serialize_order(order)


@router.post("/orders/oco")
async def create_oco_order(
    body: CreateOCOOrderIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """OCO 주문 (지정가 + 손절 동시 생성)."""
    account = await _verify_account_owner(body.account_id, user, session)

    # 포지션 확인
    result = await session.execute(
        select(PaperPositionModel).where(
            PaperPositionModel.account_id == body.account_id,
            PaperPositionModel.ticker == body.ticker,
        )
    )
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=400, detail="보유하지 않은 종목입니다.")

    # 기존 pending 주문 합산 — OCO는 같은 수량으로 2건 생성하지만 실제 체결은 1건
    pending_result = await session.execute(
        select(func.coalesce(func.sum(PaperOrderModel.quantity), 0)).where(
            PaperOrderModel.account_id == body.account_id,
            PaperOrderModel.ticker == body.ticker,
            PaperOrderModel.status == "pending",
        )
    )
    pending_qty = pending_result.scalar() or 0

    if pending_qty + body.quantity > position.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"주문 수량 초과: 보유 {position.quantity}주, 기존 주문 {pending_qty}주, 신규 {body.quantity}주",
        )

    if body.target_price <= 0 or body.stop_price <= 0:
        raise HTTPException(status_code=400, detail="지정가와 손절가를 모두 입력하세요.")
    if body.target_price <= body.stop_price:
        raise HTTPException(status_code=400, detail="지정가는 손절가보다 높아야 합니다.")

    oco_group = str(uuid.uuid4())[:8]

    limit_order = PaperOrderModel(
        account_id=body.account_id,
        user_id=user.id,
        ticker=body.ticker,
        name=position.name,
        market=position.market,
        quantity=body.quantity,
        order_type="limit_sell",
        target_price=body.target_price,
        oco_group_id=oco_group,
        status="pending",
    )
    stop_order = PaperOrderModel(
        account_id=body.account_id,
        user_id=user.id,
        ticker=body.ticker,
        name=position.name,
        market=position.market,
        quantity=body.quantity,
        order_type="stop_loss",
        stop_price=body.stop_price,
        oco_group_id=oco_group,
        status="pending",
    )
    session.add(limit_order)
    session.add(stop_order)
    await session.commit()
    await session.refresh(limit_order)
    await session.refresh(stop_order)

    return {
        "oco_group_id": oco_group,
        "orders": [_serialize_order(limit_order), _serialize_order(stop_order)],
    }


@router.get("/orders/{account_id}")
async def list_orders(
    account_id: int,
    status: str | None = Query(None),
    ticker: str | None = Query(None),
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """주문 목록 조회."""
    await _verify_account_owner(account_id, user, session)

    query = select(PaperOrderModel).where(PaperOrderModel.account_id == account_id)
    if status:
        query = query.where(PaperOrderModel.status == status)
    if ticker:
        query = query.where(PaperOrderModel.ticker == ticker)

    query = query.order_by(PaperOrderModel.created_at.desc())

    result = await session.execute(query)
    orders = result.scalars().all()
    return [_serialize_order(o) for o in orders]


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """주문 취소."""
    result = await session.execute(
        select(PaperOrderModel).where(
            PaperOrderModel.id == order_id,
            PaperOrderModel.user_id == user.id,
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail="대기 중인 주문만 취소할 수 있습니다.")

    order.status = "cancelled"
    order.cancel_reason = "user_cancelled"
    order.updated_at = datetime.now()

    # OCO 그룹 내 나머지 주문도 함께 취소
    if order.oco_group_id:
        oco_result = await session.execute(
            select(PaperOrderModel).where(
                PaperOrderModel.oco_group_id == order.oco_group_id,
                PaperOrderModel.status == "pending",
                PaperOrderModel.id != order_id,
            )
        )
        for sibling in oco_result.scalars().all():
            sibling.status = "cancelled"
            sibling.cancel_reason = "oco_cancelled"
            sibling.updated_at = datetime.now()

    await session.commit()
    return {"ok": True}


# --- Deposit (추가 입금) ---

@router.post("/deposit")
async def deposit(
    body: DepositIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """모의 투자 계좌에 추가 입금."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="입금액은 0보다 커야 합니다.")

    account = await _verify_account_owner(body.account_id, user, session)
    account.cash_balance += body.amount
    account.bonus_balance = (getattr(account, 'bonus_balance', 0) or 0) + body.amount
    account.updated_at = datetime.now()

    await session.commit()

    return {
        "ok": True,
        "deposit_amount": body.amount,
        "new_cash_balance": account.cash_balance,
        "new_bonus_balance": account.bonus_balance,
    }

"""Paper trading (mock investment) routes."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.db.database import get_async_session
from src.models.db_models import (
    UserModel,
    PaperAccountModel,
    PaperPositionModel,
    PaperTradeModel,
)
from src.services.market_data_service import MarketDataService
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
        "recommendation_id": trade.recommendation_id,
        "recommendation_action": trade.recommendation_action,
        "recommendation_confidence": trade.recommendation_confidence,
        "recommendation_grade": trade.recommendation_grade,
        "executed_at": trade.executed_at.isoformat() if trade.executed_at else None,
    }


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
    # Delete positions and trades
    await session.execute(
        delete(PaperPositionModel).where(PaperPositionModel.account_id == account_id)
    )
    await session.execute(
        delete(PaperTradeModel).where(PaperTradeModel.account_id == account_id)
    )
    account.cash_balance = account.initial_balance
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
            raise HTTPException(status_code=400, detail=f"가격 조회 실패: {e}")

    # Resolve Korean name
    stock_name = body.name
    if body.ticker.isdigit() and len(body.ticker) == 6:
        resolved = resolve_kr_name(body.ticker)
        if resolved and resolved != body.ticker:
            stock_name = resolved

    total_cost = body.quantity * price
    if account.cash_balance < total_cost:
        raise HTTPException(
            status_code=400,
            detail=f"잔고 부족: 필요 {total_cost:,.0f}, 보유 {account.cash_balance:,.0f}",
        )

    # Deduct cash
    account.cash_balance -= total_cost
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
        position = PaperPositionModel(
            account_id=body.account_id,
            ticker=body.ticker,
            name=stock_name,
            market=body.market,
            quantity=body.quantity,
            avg_buy_price=price,
            total_invested=total_cost,
            recommendation_id=body.recommendation_id,
            recommendation_action=body.recommendation_action,
            recommendation_confidence=body.recommendation_confidence,
            recommendation_grade=body.recommendation_grade,
        )
        session.add(position)
    else:
        old_total = position.avg_buy_price * position.quantity
        new_quantity = position.quantity + body.quantity
        position.avg_buy_price = (old_total + total_cost) / new_quantity
        position.quantity = new_quantity
        position.total_invested += total_cost
        position.name = stock_name  # 한글 이름 갱신
        position.updated_at = datetime.now()

    # Record trade
    trade = PaperTradeModel(
        account_id=body.account_id,
        ticker=body.ticker,
        name=stock_name,
        market=body.market,
        side="BUY",
        quantity=body.quantity,
        price=price,
        total_amount=total_cost,
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
        "total_cost": total_cost,
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

    total_revenue = body.quantity * body.price
    cost_basis = position.avg_buy_price * body.quantity
    realized_pnl = total_revenue - cost_basis
    realized_pnl_pct = (realized_pnl / cost_basis * 100) if cost_basis > 0 else 0.0

    # Update cash
    account.cash_balance += total_revenue
    account.updated_at = datetime.now()

    # Update position
    position.quantity -= body.quantity
    position.total_invested -= cost_basis
    if position.quantity <= 0:
        await session.delete(position)
    else:
        position.updated_at = datetime.now()

    # Record trade
    trade = PaperTradeModel(
        account_id=body.account_id,
        ticker=body.ticker,
        name=position.name,
        market=position.market,
        side="SELL",
        quantity=body.quantity,
        price=body.price,
        total_amount=total_revenue,
        realized_pnl=realized_pnl,
        realized_pnl_pct=realized_pnl_pct,
        source="manual",
    )
    session.add(trade)

    await session.commit()
    return {
        "ok": True,
        "trade_id": trade.id,
        "ticker": body.ticker,
        "quantity": body.quantity,
        "price": body.price,
        "total_revenue": total_revenue,
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

        eval_amount = current_price * pos.quantity
        data["current_price"] = current_price
        data["eval_amount"] = eval_amount
        data["unrealized_pnl"] = eval_amount - pos.total_invested
        data["unrealized_pnl_pct"] = (
            ((eval_amount - pos.total_invested) / pos.total_invested * 100)
            if pos.total_invested > 0
            else 0.0
        )
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
                    return price * pos.quantity
            except Exception:
                pass
            # Fallback: 가격 조회 실패 시 평균매수가 사용
            return pos.avg_buy_price * pos.quantity

        tasks = [_fetch_eval(pos) for pos in positions]
        evals = await asyncio.gather(*tasks)
        total_eval = sum(evals)

    total_assets = account.cash_balance + total_eval
    total_pnl = total_assets - account.initial_balance
    total_pnl_pct = (
        (total_pnl / account.initial_balance * 100)
        if account.initial_balance > 0
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

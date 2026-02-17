"""Watchlist CRUD routes (authenticated)."""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.db.database import get_async_session
from src.models.db_models import UserModel, WatchlistItemModel

router = APIRouter()


class WatchlistItemIn(BaseModel):
    ticker: str
    name: str
    market: str
    action: str = "HOLD"
    grade: str = ""
    confidence: float = 0.0
    current_price: float = 0.0
    change_pct: float | None = None
    entry_price: float | None = None
    target_price: float | None = None
    stop_loss: float | None = None
    risk_reward: float | None = None


@router.get("")
async def get_watchlist(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(WatchlistItemModel)
        .where(WatchlistItemModel.user_id == user.id)
        .order_by(WatchlistItemModel.added_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "ticker": item.ticker,
            "name": item.name,
            "market": item.market,
            "action": item.action,
            "grade": item.grade,
            "confidence": item.confidence,
            "current_price": item.current_price,
            "change_pct": item.change_pct,
            "entry_price": item.entry_price,
            "target_price": item.target_price,
            "stop_loss": item.stop_loss,
            "risk_reward": item.risk_reward,
            "added_at": item.added_at.isoformat() if item.added_at else None,
        }
        for item in items
    ]


@router.post("")
async def add_to_watchlist(
    body: WatchlistItemIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    # Upsert by (user_id, ticker)
    result = await session.execute(
        select(WatchlistItemModel).where(
            WatchlistItemModel.user_id == user.id,
            WatchlistItemModel.ticker == body.ticker,
        )
    )
    item = result.scalar_one_or_none()

    if item is None:
        item = WatchlistItemModel(user_id=user.id, ticker=body.ticker)
        session.add(item)

    item.name = body.name
    item.market = body.market
    item.action = body.action
    item.grade = body.grade
    item.confidence = body.confidence
    item.current_price = body.current_price
    item.change_pct = body.change_pct
    item.entry_price = body.entry_price
    item.target_price = body.target_price
    item.stop_loss = body.stop_loss
    item.risk_reward = body.risk_reward
    item.added_at = datetime.now()

    await session.commit()
    return {"ok": True, "ticker": body.ticker}


@router.delete("/{ticker}")
async def remove_from_watchlist(
    ticker: str,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await session.execute(
        delete(WatchlistItemModel).where(
            WatchlistItemModel.user_id == user.id,
            WatchlistItemModel.ticker == ticker,
        )
    )
    await session.commit()
    return {"ok": True, "ticker": ticker}

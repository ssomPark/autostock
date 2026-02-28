"""Admin dashboard API routes."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.dependencies import get_admin_user
from src.config.settings import settings
from src.db.database import get_async_session
from src.models.db_models import (
    AdRewardLogModel,
    MarketEventModel,
    PaperAccountModel,
    PaperTradeModel,
    PipelineRunModel,
    UserModel,
)

router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Admin dashboard summary cards."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = (await session.execute(func.count(UserModel.id))).scalar() or 0
    new_users_today = (
        await session.execute(
            select(func.count(UserModel.id)).where(UserModel.created_at >= today_start)
        )
    ).scalar() or 0

    total_trades = (await session.execute(select(func.count(PaperTradeModel.id)))).scalar() or 0
    trades_today = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.executed_at >= today_start)
        )
    ).scalar() or 0

    total_rewards = (await session.execute(select(func.count(AdRewardLogModel.id)))).scalar() or 0
    rewards_today = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.created_at >= today_start)
        )
    ).scalar() or 0
    total_reward_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed"
            )
        )
    ).scalar() or 0

    active_events = (
        await session.execute(
            select(func.count(MarketEventModel.id)).where(MarketEventModel.is_active == True)
        )
    ).scalar() or 0

    pipeline_runs_week = (
        await session.execute(
            select(func.count(PipelineRunModel.id)).where(
                PipelineRunModel.started_at >= now - timedelta(days=7)
            )
        )
    ).scalar() or 0

    return {
        "users": {"total": total_users, "today": new_users_today},
        "trades": {"total": total_trades, "today": trades_today},
        "ad_rewards": {"total": total_rewards, "today": rewards_today, "total_amount": total_reward_amount},
        "events": {"active": active_events},
        "pipeline": {"runs_this_week": pipeline_runs_week},
    }


@router.get("/users")
async def list_users(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    search: str = Query("", description="Search by name or email"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List users with pagination and search."""
    query = select(UserModel)
    count_query = select(func.count(UserModel.id))

    if search:
        pattern = f"%{search}%"
        query = query.where(UserModel.name.ilike(pattern) | UserModel.email.ilike(pattern))
        count_query = count_query.where(UserModel.name.ilike(pattern) | UserModel.email.ilike(pattern))

    total = (await session.execute(count_query)).scalar() or 0
    result = await session.execute(
        query.order_by(UserModel.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    users = result.scalars().all()

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "avatar_url": u.avatar_url,
                "provider": u.provider,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: int,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """User detail with accounts and reward count."""
    result = await session.execute(
        select(UserModel).options(selectinload(UserModel.paper_accounts)).where(UserModel.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    reward_count = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.user_id == user_id)
        )
    ).scalar() or 0

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "provider": user.provider,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "cash_balance": a.cash_balance,
                "bonus_balance": a.bonus_balance,
                "initial_balance": a.initial_balance,
                "currency": a.currency,
                "is_active": a.is_active,
            }
            for a in user.paper_accounts
        ],
        "reward_count": reward_count,
    }


@router.get("/ad-rewards")
async def list_ad_rewards(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    status_filter: str = Query("", alias="status", description="Filter by status: pending/claimed/expired"),
    user_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
):
    """Ad reward logs with filtering."""
    query = select(AdRewardLogModel)
    count_query = select(func.count(AdRewardLogModel.id))

    if status_filter:
        query = query.where(AdRewardLogModel.status == status_filter)
        count_query = count_query.where(AdRewardLogModel.status == status_filter)
    if user_id is not None:
        query = query.where(AdRewardLogModel.user_id == user_id)
        count_query = count_query.where(AdRewardLogModel.user_id == user_id)

    total = (await session.execute(count_query)).scalar() or 0
    result = await session.execute(
        query.order_by(AdRewardLogModel.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "account_id": log.account_id,
                "user_id": log.user_id,
                "reward_amount": log.reward_amount,
                "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "claimed_at": log.claimed_at.isoformat() if log.claimed_at else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/ad-rewards/stats")
async def ad_reward_stats(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Ad reward aggregate statistics."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_claimed = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.status == "claimed")
        )
    ).scalar() or 0

    total_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed"
            )
        )
    ).scalar() or 0

    today_count = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(
                AdRewardLogModel.created_at >= today_start
            )
        )
    ).scalar() or 0

    today_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed",
                AdRewardLogModel.created_at >= today_start,
            )
        )
    ).scalar() or 0

    avg_amount = total_amount / total_claimed if total_claimed > 0 else 0

    return {
        "total_claimed": total_claimed,
        "total_amount": total_amount,
        "today_count": today_count,
        "today_amount": today_amount,
        "avg_amount": round(avg_amount),
    }


@router.get("/ad-rewards/settings")
async def ad_reward_settings(
    _=Depends(get_admin_user),
):
    """Current ad reward settings."""
    return {
        "cooldown_seconds": settings.ad_reward_cooldown_seconds,
        "min_amount": settings.ad_reward_min_amount,
        "max_amount": settings.ad_reward_max_amount,
        "min_watch_seconds": settings.ad_reward_min_watch_seconds,
        "token_expire_seconds": settings.ad_reward_token_expire_seconds,
    }


@router.get("/paper-trading/stats")
async def paper_trading_stats(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Paper trading aggregate statistics."""
    total_accounts = (await session.execute(select(func.count(PaperAccountModel.id)))).scalar() or 0
    active_accounts = (
        await session.execute(
            select(func.count(PaperAccountModel.id)).where(PaperAccountModel.is_active == True)
        )
    ).scalar() or 0

    total_trades = (await session.execute(select(func.count(PaperTradeModel.id)))).scalar() or 0
    buy_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.side == "BUY")
        )
    ).scalar() or 0
    sell_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.side == "SELL")
        )
    ).scalar() or 0

    total_volume = (
        await session.execute(
            select(func.coalesce(func.sum(PaperTradeModel.total_amount), 0))
        )
    ).scalar() or 0

    return {
        "accounts": {"total": total_accounts, "active": active_accounts},
        "trades": {"total": total_trades, "buy": buy_count, "sell": sell_count},
        "total_volume": total_volume,
    }


@router.get("/events")
async def list_events_admin(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
):
    """List all events including inactive ones."""
    count_total = (await session.execute(select(func.count(MarketEventModel.id)))).scalar() or 0
    result = await session.execute(
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .order_by(MarketEventModel.event_date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    events = result.scalars().all()

    return {
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "description": e.description,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "category": e.category,
                "impact_level": e.impact_level,
                "is_active": e.is_active,
                "stock_count": len(e.stocks),
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
        "total": count_total,
        "page": page,
        "size": size,
    }


@router.patch("/events/{event_id}/toggle-active")
async def toggle_event_active(
    event_id: int,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Toggle event active/inactive status."""
    from fastapi import HTTPException

    result = await session.execute(
        select(MarketEventModel).where(MarketEventModel.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event.is_active = not event.is_active
    await session.commit()

    return {"id": event.id, "is_active": event.is_active}

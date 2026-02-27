"""Market Events API routes for event-driven investing."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.database import get_async_session
from src.models.db_models import MarketEventModel, EventStockModel
from src.models.schemas import (
    EventCreate,
    EventUpdate,
    EventStockCreate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _event_to_response(event: MarketEventModel) -> dict:
    """Convert DB model to response dict."""
    now = datetime.now()
    event_date = event.event_date
    days_until = (event_date.replace(tzinfo=None) - now.replace(tzinfo=None)).days if event_date else None

    stocks = []
    if event.stocks:
        for s in event.stocks:
            stocks.append({
                "id": s.id,
                "event_id": s.event_id,
                "ticker": s.ticker,
                "name": s.name,
                "market": s.market,
                "relation_type": s.relation_type,
                "expected_impact": s.expected_impact,
                "reasoning": s.reasoning,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            })

    return {
        "id": event.id,
        "title": event.title,
        "description": event.description or "",
        "event_date": event.event_date.isoformat() if event.event_date else None,
        "category": event.category,
        "impact_level": event.impact_level,
        "source_url": event.source_url,
        "is_active": event.is_active,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        "stocks": stocks,
        "days_until": days_until,
    }


@router.get("/stocks/search")
async def search_event_stocks(
    ticker: str = Query(...),
    session: AsyncSession = Depends(get_async_session),
):
    """특정 종목이 연관된 이벤트 목록 조회."""
    stmt = (
        select(MarketEventModel)
        .join(EventStockModel)
        .options(selectinload(MarketEventModel.stocks))
        .where(
            and_(
                EventStockModel.ticker == ticker.upper(),
                MarketEventModel.is_active.is_(True),
            )
        )
        .order_by(MarketEventModel.event_date.asc())
    )
    result = await session.execute(stmt)
    events = result.scalars().unique().all()

    return {
        "success": True,
        "data": [_event_to_response(e) for e in events],
        "count": len(events),
    }


@router.get("")
async def list_events(
    year: int | None = Query(None),
    month: int | None = Query(None),
    category: str | None = Query(None),
    upcoming_days: int | None = Query(None, description="향후 N일 이내 이벤트만"),
    include_past: bool = Query(False),
    session: AsyncSession = Depends(get_async_session),
):
    """이벤트 목록 조회. 월별/카테고리/기간 필터 지원."""
    conditions = [MarketEventModel.is_active.is_(True)]

    if year and month:
        from calendar import monthrange
        start = datetime(year, month, 1)
        _, last_day = monthrange(year, month)
        end = datetime(year, month, last_day, 23, 59, 59)
        conditions.append(MarketEventModel.event_date >= start)
        conditions.append(MarketEventModel.event_date <= end)
    elif upcoming_days:
        now = datetime.now()
        if not include_past:
            conditions.append(MarketEventModel.event_date >= now - timedelta(days=1))
        conditions.append(MarketEventModel.event_date <= now + timedelta(days=upcoming_days))
    elif not include_past:
        conditions.append(MarketEventModel.event_date >= datetime.now() - timedelta(days=1))

    if category:
        conditions.append(MarketEventModel.category == category)

    stmt = (
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .where(and_(*conditions))
        .order_by(MarketEventModel.event_date.asc())
    )
    result = await session.execute(stmt)
    events = result.scalars().all()

    return {
        "success": True,
        "data": [_event_to_response(e) for e in events],
        "count": len(events),
    }


@router.get("/{event_id}")
async def get_event(
    event_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """단일 이벤트 상세 조회."""
    stmt = (
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .where(MarketEventModel.id == event_id)
    )
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

    return {"success": True, "data": _event_to_response(event)}


@router.post("")
async def create_event(
    body: EventCreate,
    session: AsyncSession = Depends(get_async_session),
):
    """새 이벤트 생성 (수혜종목 포함)."""
    event = MarketEventModel(
        title=body.title,
        description=body.description,
        event_date=body.event_date,
        category=body.category.value,
        impact_level=body.impact_level.value,
        source_url=body.source_url,
    )
    session.add(event)
    await session.flush()

    for stock in body.stocks:
        es = EventStockModel(
            event_id=event.id,
            ticker=stock.ticker,
            name=stock.name,
            market=stock.market,
            relation_type=stock.relation_type.value,
            expected_impact=stock.expected_impact.value,
            reasoning=stock.reasoning,
        )
        session.add(es)

    await session.commit()

    # Reload with stocks
    stmt = (
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .where(MarketEventModel.id == event.id)
    )
    result = await session.execute(stmt)
    event = result.scalar_one()

    return {"success": True, "data": _event_to_response(event)}


@router.put("/{event_id}")
async def update_event(
    event_id: int,
    body: EventUpdate,
    session: AsyncSession = Depends(get_async_session),
):
    """이벤트 수정."""
    stmt = select(MarketEventModel).where(MarketEventModel.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(event, field, value)

    event.updated_at = datetime.now()
    await session.commit()

    stmt = (
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .where(MarketEventModel.id == event.id)
    )
    result = await session.execute(stmt)
    event = result.scalar_one()

    return {"success": True, "data": _event_to_response(event)}


@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """이벤트 삭제."""
    stmt = select(MarketEventModel).where(MarketEventModel.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

    await session.delete(event)
    await session.commit()

    return {"success": True, "message": "이벤트가 삭제되었습니다"}


# --- Event Stock sub-routes ---

@router.post("/{event_id}/stocks")
async def add_event_stock(
    event_id: int,
    body: EventStockCreate,
    session: AsyncSession = Depends(get_async_session),
):
    """이벤트에 수혜종목 추가."""
    stmt = select(MarketEventModel).where(MarketEventModel.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

    es = EventStockModel(
        event_id=event_id,
        ticker=body.ticker,
        name=body.name,
        market=body.market,
        relation_type=body.relation_type.value,
        expected_impact=body.expected_impact.value,
        reasoning=body.reasoning,
    )
    session.add(es)
    await session.commit()

    return {
        "success": True,
        "data": {
            "id": es.id,
            "event_id": es.event_id,
            "ticker": es.ticker,
            "name": es.name,
            "market": es.market,
            "relation_type": es.relation_type,
            "expected_impact": es.expected_impact,
            "reasoning": es.reasoning,
            "created_at": es.created_at.isoformat() if es.created_at else None,
        },
    }


@router.delete("/{event_id}/stocks/{stock_id}")
async def remove_event_stock(
    event_id: int,
    stock_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    """이벤트에서 수혜종목 제거."""
    stmt = select(EventStockModel).where(
        and_(EventStockModel.id == stock_id, EventStockModel.event_id == event_id)
    )
    result = await session.execute(stmt)
    es = result.scalar_one_or_none()
    if not es:
        raise HTTPException(status_code=404, detail="종목 매핑을 찾을 수 없습니다")

    await session.delete(es)
    await session.commit()

    return {"success": True, "message": "수혜종목이 제거되었습니다"}

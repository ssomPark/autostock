"""Recommendations API routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_async_session
from src.models.db_models import RecommendationModel, PipelineRunModel
from src.utils.stock_name_resolver import resolve_kr_name

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory cache for resolved names to avoid repeated calls
_name_cache: dict[str, str] = {}


def _is_kr_ticker(ticker: str) -> bool:
    return ticker.isdigit() and len(ticker) == 6


def _needs_kr_resolve(name: str, ticker: str) -> bool:
    """한국 종목인데 한글 이름이 아닌 경우 True."""
    if not _is_kr_ticker(ticker):
        return False
    if not name or name == ticker:
        return True
    # 한글이 하나도 없으면 영어 이름 -> 재해소 필요
    return not any('\uac00' <= c <= '\ud7a3' for c in name)


def _resolve_name(ticker: str, market: str) -> str:
    """Resolve stock name from ticker (cached)."""
    if ticker in _name_cache:
        return _name_cache[ticker]

    # Korean ticker: use Naver Finance for Korean name
    if _is_kr_ticker(ticker):
        name = resolve_kr_name(ticker)
        if name and name != ticker:
            _name_cache[ticker] = name
            return name

    # US or fallback
    try:
        from src.api.routes.n8n import _resolve_stock_name
        name = _resolve_stock_name(ticker, market)
        _name_cache[ticker] = name
        return name
    except Exception:
        return ticker


def _rec_to_dict(r: RecommendationModel) -> dict:
    # If name is missing, same as ticker, or English for a Korean stock -> resolve
    name = r.name
    if not name or name == r.ticker or _needs_kr_resolve(name, r.ticker):
        name = _resolve_name(r.ticker, r.market or "KOSPI")

    return {
        "ticker": r.ticker,
        "name": name,
        "market": r.market,
        "current_price": r.current_price,
        "action": r.action,
        "confidence": r.confidence,
        "composite_score": r.composite_score,
        "target_price": r.target_price,
        "stop_loss": r.stop_loss,
        "reasoning": r.reasoning,
        "component_signals": r.component_signals,
        "detected_patterns": r.detected_patterns,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


async def _get_latest_pipeline(session: AsyncSession) -> PipelineRunModel | None:
    """Get the single most recent pipeline (any market)."""
    result = await session.execute(
        select(PipelineRunModel)
        .where(PipelineRunModel.status == "completed")
        .where(PipelineRunModel.recommendations_count > 0)
        .order_by(desc(PipelineRunModel.completed_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_latest_pipeline_ids(
    session: AsyncSession, market: str = "all"
) -> list[int]:
    """Get latest pipeline IDs — one per market type when market='all'."""
    if market != "all":
        result = await session.execute(
            select(PipelineRunModel.id)
            .where(PipelineRunModel.status == "completed")
            .where(PipelineRunModel.recommendations_count > 0)
            .where(PipelineRunModel.market_type == market)
            .order_by(desc(PipelineRunModel.completed_at))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return [row] if row else []

    # all: latest pipeline per market type
    ids: list[int] = []
    for mkt in ["KR", "US"]:
        result = await session.execute(
            select(PipelineRunModel.id)
            .where(PipelineRunModel.status == "completed")
            .where(PipelineRunModel.recommendations_count > 0)
            .where(PipelineRunModel.market_type == mkt)
            .order_by(desc(PipelineRunModel.completed_at))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            ids.append(row)
    return ids


# NOTE: /summary/dashboard MUST be registered before /{ticker}
@router.get("/summary/dashboard")
async def get_dashboard_summary(
    session: AsyncSession = Depends(get_async_session),
):
    """Get dashboard summary with counts and top recommendations.

    Combines the latest KR and US pipeline results so both markets are visible.
    """
    pipeline_ids = await _get_latest_pipeline_ids(session, market="all")

    if not pipeline_ids:
        return {
            "success": True,
            "data": {
                "total_recommendations": 0,
                "buy_count": 0,
                "sell_count": 0,
                "hold_count": 0,
                "top_recommendations": [],
                "latest_pipeline": None,
            },
        }

    recs_result = await session.execute(
        select(RecommendationModel)
        .where(RecommendationModel.pipeline_run_id.in_(pipeline_ids))
        .order_by(desc(RecommendationModel.confidence))
    )
    recommendations = recs_result.scalars().all()

    buy_count = sum(1 for r in recommendations if r.action == "BUY")
    sell_count = sum(1 for r in recommendations if r.action == "SELL")
    hold_count = sum(1 for r in recommendations if r.action == "HOLD")

    top_recs = [_rec_to_dict(r) for r in recommendations[:5]]

    # Return info about the most recent pipeline for display
    latest_pipeline = await _get_latest_pipeline(session)

    return {
        "success": True,
        "data": {
            "total_recommendations": len(recommendations),
            "buy_count": buy_count,
            "sell_count": sell_count,
            "hold_count": hold_count,
            "top_recommendations": top_recs,
            "latest_pipeline": {
                "id": latest_pipeline.id,
                "market_type": latest_pipeline.market_type,
                "status": latest_pipeline.status,
                "started_at": latest_pipeline.started_at.isoformat() if latest_pipeline.started_at else None,
                "completed_at": latest_pipeline.completed_at.isoformat() if latest_pipeline.completed_at else None,
                "recommendations_count": latest_pipeline.recommendations_count,
            } if latest_pipeline else None,
        },
    }


@router.get("")
async def get_recommendations(
    market: str = Query("all", description="Market filter: KR, US, or all"),
    action: str = Query("all", description="Action filter: BUY, SELL, HOLD, or all"),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    """Get latest stock recommendations.

    When market='all', combines the latest KR and US pipeline results.
    """
    pipeline_ids = await _get_latest_pipeline_ids(session, market=market)

    if not pipeline_ids:
        return {
            "success": True,
            "data": [],
            "filters": {"market": market, "action": action, "limit": limit},
        }

    query = select(RecommendationModel).where(
        RecommendationModel.pipeline_run_id.in_(pipeline_ids)
    )

    # Filter by actual stock market (RecommendationModel.market stores KOSPI/KOSDAQ/NasdaqGS etc.)
    if market == "KR":
        query = query.where(RecommendationModel.market.in_(["KOSPI", "KOSDAQ"]))
    elif market == "US":
        query = query.where(~RecommendationModel.market.in_(["KOSPI", "KOSDAQ"]))

    if action != "all":
        query = query.where(RecommendationModel.action == action)

    query = query.order_by(desc(RecommendationModel.confidence)).limit(limit)

    result = await session.execute(query)
    recs = result.scalars().all()

    return {
        "success": True,
        "data": [_rec_to_dict(r) for r in recs],
        "filters": {"market": market, "action": action, "limit": limit},
    }


@router.get("/{ticker}")
async def get_recommendation_by_ticker(
    ticker: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Get recommendation for a specific ticker."""
    result = await session.execute(
        select(RecommendationModel)
        .where(RecommendationModel.ticker == ticker)
        .order_by(desc(RecommendationModel.created_at))
        .limit(1)
    )
    rec = result.scalar_one_or_none()

    if not rec:
        return {
            "success": True,
            "data": None,
            "message": f"No recommendation found for {ticker}",
        }

    return {
        "success": True,
        "data": _rec_to_dict(rec),
    }

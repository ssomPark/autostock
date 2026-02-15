"""Recommendations API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_async_session
from src.models.db_models import RecommendationModel, PipelineRunModel

router = APIRouter()


def _rec_to_dict(r: RecommendationModel) -> dict:
    return {
        "ticker": r.ticker,
        "name": r.name,
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
    result = await session.execute(
        select(PipelineRunModel)
        .where(PipelineRunModel.status == "completed")
        .where(PipelineRunModel.recommendations_count > 0)
        .order_by(desc(PipelineRunModel.completed_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# NOTE: /summary/dashboard MUST be registered before /{ticker}
@router.get("/summary/dashboard")
async def get_dashboard_summary(
    session: AsyncSession = Depends(get_async_session),
):
    """Get dashboard summary with counts and top recommendations."""
    latest_pipeline = await _get_latest_pipeline(session)

    if not latest_pipeline:
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
        .where(RecommendationModel.pipeline_run_id == latest_pipeline.id)
        .order_by(desc(RecommendationModel.confidence))
    )
    recommendations = recs_result.scalars().all()

    buy_count = sum(1 for r in recommendations if r.action == "BUY")
    sell_count = sum(1 for r in recommendations if r.action == "SELL")
    hold_count = sum(1 for r in recommendations if r.action == "HOLD")

    top_recs = [_rec_to_dict(r) for r in recommendations[:5]]

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
            },
        },
    }


@router.get("")
async def get_recommendations(
    market: str = Query("all", description="Market filter: KR, US, or all"),
    action: str = Query("all", description="Action filter: BUY, SELL, HOLD, or all"),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    """Get latest stock recommendations."""
    latest_pipeline = await _get_latest_pipeline(session)

    if not latest_pipeline:
        return {
            "success": True,
            "data": [],
            "filters": {"market": market, "action": action, "limit": limit},
        }

    query = select(RecommendationModel).where(
        RecommendationModel.pipeline_run_id == latest_pipeline.id
    )

    if market != "all":
        query = query.where(RecommendationModel.market == market)
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

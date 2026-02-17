"""Pipeline API routes."""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.db.database import get_async_session
from src.services.pipeline_tracker import tracker

router = APIRouter()
logger = logging.getLogger(__name__)


async def _trigger_n8n_webhook(pipeline_id: str, market_type: str) -> None:
    """Trigger N8N webhook to start the pipeline workflow."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                settings.n8n_webhook_url,
                json={
                    "pipeline_id": pipeline_id,
                    "market": market_type,
                    "backend_url": settings.n8n_backend_url,
                },
            )
            resp.raise_for_status()
            logger.info(f"N8N webhook triggered: {resp.status_code}")
    except Exception as e:
        logger.error(f"Failed to trigger N8N webhook: {e}")
        await tracker.fail("news", f"N8N 웹훅 호출 실패: {e}")


@router.post("/run")
async def trigger_pipeline(
    market: str = Query("KR", description="Market type: KR, US, or ALL"),
):
    """Trigger the daily analysis pipeline via N8N webhook."""
    import asyncio

    if market == "ALL":
        pipeline_id = await tracker.start("KR", batch_markets=["KR", "US"])
        asyncio.create_task(_trigger_n8n_webhook(pipeline_id, "KR"))
        return {
            "success": True,
            "message": "Batch pipeline triggered for KR → US markets via N8N",
            "pipeline_id": pipeline_id,
        }
    else:
        pipeline_id = await tracker.start(market)
        asyncio.create_task(_trigger_n8n_webhook(pipeline_id, market))
        return {
            "success": True,
            "message": f"Pipeline triggered for {market} market via N8N",
            "pipeline_id": pipeline_id,
        }


@router.get("/status")
async def get_pipeline_status():
    """Get current pipeline status from tracker."""
    return {
        "success": True,
        "data": tracker.get_state(),
    }


@router.get("/stream")
async def pipeline_stream():
    """SSE endpoint for real-time pipeline progress."""

    async def event_generator():
        async for event in tracker.subscribe():
            data = json.dumps(event, ensure_ascii=False)
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history")
async def get_pipeline_history(
    limit: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_async_session),
):
    """Get pipeline run history from database."""
    try:
        from sqlalchemy import func, select

        from src.models.db_models import PipelineRunModel, RecommendationModel

        # Query recent pipeline runs with recommendation counts
        stmt = (
            select(
                PipelineRunModel,
                func.count(RecommendationModel.id).label("rec_count"),
            )
            .outerjoin(RecommendationModel)
            .group_by(PipelineRunModel.id)
            .order_by(PipelineRunModel.started_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        rows = result.all()

        data = []
        for run, rec_count in rows:
            data.append({
                "id": run.id,
                "market_type": run.market_type,
                "status": run.status,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                "recommendations_count": rec_count,
                "error_message": run.error_message,
            })

        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        logger.error(f"Failed to fetch pipeline history: {e}")
        return {"success": True, "data": [], "count": 0}

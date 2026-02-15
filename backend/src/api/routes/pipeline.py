"""Pipeline API routes."""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from src.config.settings import settings
from src.services.pipeline_tracker import tracker

router = APIRouter()
logger = logging.getLogger(__name__)


async def _trigger_n8n_webhook(pipeline_id: str, market_type: str) -> None:
    """Trigger N8N webhook to start the pipeline workflow."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
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
    market: str = Query("KR", description="Market type: KR or US"),
):
    """Trigger the daily analysis pipeline via N8N webhook."""
    pipeline_id = await tracker.start(market)

    # Fire-and-forget: N8N will call back to update progress
    import asyncio
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
async def get_pipeline_history(limit: int = Query(10, ge=1, le=50)):
    """Get pipeline run history."""
    return {"success": True, "data": [], "count": 0}

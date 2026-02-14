"""Pipeline API routes."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Query

from src.flows.daily_pipeline import DailyPipeline

router = APIRouter()
logger = logging.getLogger(__name__)


async def _run_pipeline(market_type: str) -> None:
    """Run pipeline in background."""
    try:
        pipeline = DailyPipeline(market_type=market_type)
        result = pipeline.kickoff()
        logger.info(f"Pipeline completed: {result}")
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")


@router.post("/run")
async def trigger_pipeline(
    background_tasks: BackgroundTasks,
    market: str = Query("KR", description="Market type: KR or US"),
):
    """Manually trigger the daily analysis pipeline."""
    background_tasks.add_task(_run_pipeline, market)
    return {
        "success": True,
        "message": f"Pipeline triggered for {market} market",
    }


@router.get("/status")
async def get_pipeline_status():
    """Get latest pipeline status."""
    return {
        "success": True,
        "data": {
            "status": "idle",
            "last_run": None,
            "message": "No pipeline runs yet",
        },
    }


@router.get("/history")
async def get_pipeline_history(limit: int = Query(10, ge=1, le=50)):
    """Get pipeline run history."""
    return {"success": True, "data": [], "count": 0}

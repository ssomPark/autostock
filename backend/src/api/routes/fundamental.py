"""Fundamental screening API routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from src.services.fundamental_screener import FundamentalScreener
from src.services.fundamental_pipeline import FundamentalPipeline

logger = logging.getLogger(__name__)
router = APIRouter()

_screener = FundamentalScreener()


@router.post("/scan")
async def trigger_fundamental_scan(
    market: str = Query("KR", description="Market: KR or US"),
    limit: int = Query(20, ge=1, le=50),
):
    """Trigger a fundamental screening pipeline run (saves to DB)."""
    try:
        pipeline = FundamentalPipeline()
        result = await pipeline.run(market=market, limit=limit)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Fundamental scan failed: {e}")
        return {"success": False, "error": str(e)}


@router.get("/results")
async def get_fundamental_results(
    market: str = Query("KR", description="Market: KR or US"),
    category: str = Query("all", description="Category: value, quality, growth, balanced, all"),
    limit: int = Query(20, ge=1, le=50),
):
    """Get fundamental screening results (live, not from DB)."""
    try:
        results = _screener.screen(market=market, limit=limit)
        if category != "all":
            results = [r for r in results if r["category"] == category]
        return {"success": True, "data": results, "count": len(results)}
    except Exception as e:
        logger.error(f"Fundamental results failed: {e}")
        return {"success": False, "data": [], "count": 0, "error": str(e)}


@router.get("/score/{ticker}")
async def get_fundamental_score(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NASDAQ, NYSE"),
):
    """Get fundamental score for a single stock (real-time calculation)."""
    try:
        result = _screener.score_fundamentals(ticker, ticker, market)
        if not result:
            return {
                "success": False,
                "error": f"Could not fetch fundamental data for {ticker}",
            }
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Fundamental score failed for {ticker}: {e}")
        return {"success": False, "error": str(e)}

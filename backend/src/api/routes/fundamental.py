"""Fundamental screening API routes."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query

from src.services.fundamental_screener import FundamentalScreener
from src.services.fundamental_pipeline import FundamentalPipeline
from src.utils.market_hours import is_market_open, seconds_until_next_open
from src.utils.redis_cache import cache_get_json, cache_set_json

logger = logging.getLogger(__name__)
router = APIRouter()

_screener = FundamentalScreener()

_MAX_TTL = 259200  # 72시간


def _fund_smart_ttl(market: str, default_ttl: int) -> int:
    """Market-aware TTL for fundamental data."""
    mtype = "KR" if market.upper() in ("KR", "KOSPI", "KOSDAQ") else "US"
    if is_market_open(mtype):
        return default_ttl
    until_open = seconds_until_next_open(mtype)
    if until_open > 0:
        return min(until_open, _MAX_TTL)
    return default_ttl


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
    """Get fundamental screening results with Redis caching (5 min TTL)."""
    cache_key = f"fundamental:results:{market}:{limit}"
    try:
        cached = await cache_get_json(cache_key)
        if cached is not None:
            results = cached
        else:
            results = await asyncio.to_thread(_screener.screen, market=market, limit=limit)
            await cache_set_json(cache_key, results, ttl=_fund_smart_ttl(market, 300))
    except Exception as e:
        logger.error(f"Fundamental results failed: {e}")
        return {"success": False, "data": [], "count": 0, "error": str(e)}

    if category != "all":
        results = [r for r in results if r.get("category") == category]
    return {"success": True, "data": results, "count": len(results)}


@router.get("/score/{ticker}")
async def get_fundamental_score(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NASDAQ, NYSE"),
):
    """Get fundamental score for a single stock with Redis caching."""
    cache_key = f"fundamental:score:{ticker}:{market}"
    try:
        cached = await cache_get_json(cache_key)
        if cached is not None:
            return {"success": True, "data": cached}
    except Exception:
        pass

    try:
        result = await asyncio.to_thread(_screener.score_fundamentals, ticker, ticker, market)
        if not result:
            return {
                "success": False,
                "error": f"Could not fetch fundamental data for {ticker}",
            }
        try:
            await cache_set_json(cache_key, result, ttl=_fund_smart_ttl(market, 600))
        except Exception:
            pass
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Fundamental score failed for {ticker}: {e}")
        return {"success": False, "error": str(e)}

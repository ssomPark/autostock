"""News API routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from src.services.news_service import NewsService
from src.utils.redis_cache import cache_get_json, cache_set_json

router = APIRouter()
news_service = NewsService()


@router.get("")
async def get_news(
    source: str = Query("all", description="Source filter"),
    ticker: str | None = Query(None, description="Filter by ticker/stock name"),
    limit: int = Query(20, ge=1, le=100),
):
    """Get recent news articles."""
    if ticker:
        # ticker-filtered search (no cache)
        articles = news_service.get_recent_news(limit=limit * 3)
        tk = ticker.upper()
        filtered = [a for a in articles if tk in (a.get("title", "") + a.get("summary", "")).upper()]
        return {"success": True, "data": filtered[:limit], "count": len(filtered[:limit])}

    cache_key = f"news:latest:{limit}"
    cached = await cache_get_json(cache_key)
    if cached:
        return {"success": True, "data": cached, "count": len(cached), "cached": True}

    articles = news_service.get_recent_news(limit=limit)
    await cache_set_json(cache_key, articles, ttl=300)
    return {"success": True, "data": articles, "count": len(articles)}


@router.get("/collect")
async def trigger_news_collection():
    """Manually trigger news collection."""
    articles = news_service.collect_news()
    return {
        "success": True,
        "message": f"Collected {len(articles)} articles",
        "data": articles,
    }

"""News API routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

from src.services.news_service import NewsService

router = APIRouter()
news_service = NewsService()


@router.get("/")
async def get_news(
    source: str = Query("all", description="Source filter"),
    limit: int = Query(20, ge=1, le=100),
):
    """Get recent news articles."""
    articles = news_service.get_recent_news(limit=limit)
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

"""Recommendations API routes."""

from __future__ import annotations

from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/")
async def get_recommendations(
    market: str = Query("all", description="Market filter: KR, US, or all"),
    action: str = Query("all", description="Action filter: BUY, SELL, HOLD, or all"),
    limit: int = Query(20, ge=1, le=100),
):
    """Get latest stock recommendations."""
    # Placeholder - will connect to DB
    return {
        "success": True,
        "data": [],
        "filters": {"market": market, "action": action, "limit": limit},
    }


@router.get("/{ticker}")
async def get_recommendation_by_ticker(ticker: str):
    """Get recommendation for a specific ticker."""
    return {
        "success": True,
        "data": None,
        "message": f"No recommendation found for {ticker}",
    }


@router.get("/summary/dashboard")
async def get_dashboard_summary():
    """Get dashboard summary with counts and top recommendations."""
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

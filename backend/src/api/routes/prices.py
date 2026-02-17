"""Real-time price routes for live market data."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_async_session
from src.models.db_models import RecommendationModel, PipelineRunModel
from src.api.routes.recommendations import _get_latest_pipeline_ids
from src.services.market_data_service import MarketDataService
from src.utils.market_hours import get_market_status, is_market_open

logger = logging.getLogger(__name__)
router = APIRouter()

_market_data_svc = MarketDataService()


def _sanitize(obj: Any) -> Any:
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def _market_to_type(market: str) -> str:
    """Map market value (KOSPI/KOSDAQ/NYSE/NASDAQ) to market type (KR/US)."""
    if market in ("KOSPI", "KOSDAQ"):
        return "KR"
    return "US"


@router.get("/market-status")
async def get_market_status_endpoint():
    """Get current open/closed status for KR and US markets."""
    return {"success": True, "data": get_market_status()}


@router.get("/batch")
async def get_batch_prices(
    market: str = Query("all", description="Market filter: KR, US, or all"),
    session: AsyncSession = Depends(get_async_session),
):
    """Get live prices for the latest recommended stocks.

    Only fetches prices when the relevant market is open.
    """
    status = get_market_status()
    kr_open = status["KR"]["is_open"]
    us_open = status["US"]["is_open"]

    # If no market is open, return early
    if not kr_open and not us_open:
        return {
            "success": True,
            "data": [],
            "market_status": status,
        }

    # Get latest recommended tickers from DB
    try:
        pipeline_ids = await _get_latest_pipeline_ids(session, market=market)
    except Exception as e:
        logger.warning(f"DB unavailable for batch prices: {e}")
        return {"success": True, "data": [], "market_status": status}

    if not pipeline_ids:
        return {"success": True, "data": [], "market_status": status}

    result = await session.execute(
        select(RecommendationModel)
        .where(RecommendationModel.pipeline_run_id.in_(pipeline_ids))
    )
    recs = result.scalars().all()

    # Filter to only tickers whose market is currently open
    tickers_to_fetch = []
    for r in recs:
        mtype = _market_to_type(r.market or "KOSPI")
        if market != "all" and mtype != market:
            continue
        if (mtype == "KR" and kr_open) or (mtype == "US" and us_open):
            tickers_to_fetch.append({
                "ticker": r.ticker,
                "market": r.market,
                "rec_price": r.current_price,
            })

    if not tickers_to_fetch:
        return {"success": True, "data": [], "market_status": status}

    # Fetch prices concurrently using asyncio.to_thread
    async def _fetch_one(item: dict) -> dict | None:
        try:
            price_data = await asyncio.to_thread(
                _market_data_svc.get_current_price,
                item["ticker"],
                item["market"],
            )
            live_price = price_data.get("current_price", 0)
            rec_price = item["rec_price"] or 0

            change_from_rec = 0.0
            if rec_price > 0 and live_price > 0:
                change_from_rec = ((live_price - rec_price) / rec_price) * 100

            return _sanitize({
                "ticker": item["ticker"],
                "market": item["market"],
                "rec_price": rec_price,
                "live_price": live_price,
                "change_from_rec": round(change_from_rec, 2),
                "day_change_pct": price_data.get("change_pct", 0),
                "volume": price_data.get("volume", 0),
            })
        except Exception as e:
            logger.warning(f"Failed to fetch price for {item['ticker']}: {e}")
            return None

    tasks = [_fetch_one(item) for item in tickers_to_fetch]
    results = await asyncio.gather(*tasks)

    prices = [r for r in results if r is not None]

    return {
        "success": True,
        "data": prices,
        "market_status": status,
    }

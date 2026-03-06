"""Recommendations API routes."""

from __future__ import annotations

import logging

import yfinance as yf
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_async_session
from src.models.db_models import RecommendationModel, PipelineRunModel
from src.utils.redis_cache import cache_get_json, cache_set_json
from src.utils.stock_name_resolver import resolve_kr_name

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory cache for resolved names to avoid repeated calls
_name_cache: dict[str, str] = {}


def _is_kr_ticker(ticker: str) -> bool:
    return ticker.isdigit() and len(ticker) == 6


def _needs_kr_resolve(name: str, ticker: str) -> bool:
    """한국 종목인데 한글 이름이 아닌 경우 True."""
    if not _is_kr_ticker(ticker):
        return False
    if not name or name == ticker:
        return True
    # 한글이 하나도 없으면 영어 이름 -> 재해소 필요
    return not any('\uac00' <= c <= '\ud7a3' for c in name)


def _resolve_name(ticker: str, market: str) -> str:
    """Resolve stock name from ticker (cached)."""
    if ticker in _name_cache:
        return _name_cache[ticker]

    # Korean ticker: use Naver Finance for Korean name
    if _is_kr_ticker(ticker):
        name = resolve_kr_name(ticker)
        if name and name != ticker:
            _name_cache[ticker] = name
            return name

    # US or fallback
    try:
        from src.api.routes.n8n import _resolve_stock_name
        name = _resolve_stock_name(ticker, market)
        _name_cache[ticker] = name
        return name
    except Exception:
        return ticker


def _rec_to_dict(r: RecommendationModel) -> dict:
    # If name is missing, same as ticker, or English for a Korean stock -> resolve
    name = r.name
    if not name or name == r.ticker or _needs_kr_resolve(name, r.ticker):
        name = _resolve_name(r.ticker, r.market or "KOSPI")

    # Source field (may be NULL for old records)
    source = getattr(r, "source", None) or "news"
    fundamental_score = getattr(r, "fundamental_score", None)
    fundamental_category = getattr(r, "fundamental_category", None)

    return {
        "ticker": r.ticker,
        "name": name,
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
        "source": source,
        "fundamental_score": fundamental_score,
        "fundamental_category": fundamental_category,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


async def _get_latest_pipeline(session: AsyncSession) -> PipelineRunModel | None:
    """Get the single most recent pipeline (any market)."""
    result = await session.execute(
        select(PipelineRunModel)
        .where(PipelineRunModel.status == "completed")
        .where(PipelineRunModel.recommendations_count > 0)
        .order_by(desc(PipelineRunModel.completed_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_latest_pipeline_ids(
    session: AsyncSession, market: str = "all"
) -> list[int]:
    """Get latest pipeline IDs — one per market type when market='all'."""
    if market != "all":
        # Include both news and fundamental pipelines for the market
        ids: list[int] = []
        market_types = [market, f"{market}_FUND"]
        for mkt in market_types:
            result = await session.execute(
                select(PipelineRunModel.id)
                .where(PipelineRunModel.status == "completed")
                .where(PipelineRunModel.recommendations_count > 0)
                .where(PipelineRunModel.market_type == mkt)
                .order_by(desc(PipelineRunModel.completed_at))
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row:
                ids.append(row)
        return ids

    # all: latest pipeline per market type (news + fundamental)
    ids: list[int] = []
    for mkt in ["KR", "US", "KR_FUND", "US_FUND"]:
        result = await session.execute(
            select(PipelineRunModel.id)
            .where(PipelineRunModel.status == "completed")
            .where(PipelineRunModel.recommendations_count > 0)
            .where(PipelineRunModel.market_type == mkt)
            .order_by(desc(PipelineRunModel.completed_at))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            ids.append(row)
    return ids


# --- Sector Heatmap ---

# Korean sector map (industry code → sector name)
_KR_SECTOR_MAP: dict[str, str] = {
    "반도체": "Technology",
    "전자부품": "Technology",
    "소프트웨어": "Technology",
    "IT서비스": "Technology",
    "자동차": "Consumer Cyclical",
    "화학": "Basic Materials",
    "철강": "Basic Materials",
    "제약": "Healthcare",
    "바이오": "Healthcare",
    "은행": "Financial Services",
    "보험": "Financial Services",
    "증권": "Financial Services",
    "건설": "Industrials",
    "기계": "Industrials",
    "운송": "Industrials",
    "식품": "Consumer Defensive",
    "유통": "Consumer Cyclical",
    "에너지": "Energy",
    "통신": "Communication Services",
    "미디어": "Communication Services",
    "부동산": "Real Estate",
}

_SECTOR_KR_MAP = {
    "Technology": "기술",
    "Healthcare": "헬스케어",
    "Financial Services": "금융",
    "Consumer Cyclical": "경기소비재",
    "Consumer Defensive": "필수소비재",
    "Industrials": "산업재",
    "Basic Materials": "소재",
    "Energy": "에너지",
    "Communication Services": "커뮤니케이션",
    "Real Estate": "부동산",
    "Utilities": "유틸리티",
}


def _get_sector_sync(ticker: str, market: str) -> str:
    """Resolve sector for a ticker (synchronous)."""
    # US stocks: yfinance
    if not ticker.isdigit():
        try:
            info = yf.Ticker(ticker).info or {}
            return info.get("sector", "Other")
        except Exception:
            return "Other"

    # Korean stocks: try yfinance, fallback to map
    try:
        suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
        info = yf.Ticker(f"{ticker}{suffix}").info or {}
        sector = info.get("sector")
        if sector:
            return sector
        industry = info.get("industry", "")
        for k, v in _KR_SECTOR_MAP.items():
            if k in industry:
                return v
    except Exception:
        pass
    return "Other"


@router.get("/sector-heatmap")
async def get_sector_heatmap(
    session: AsyncSession = Depends(get_async_session),
):
    """Get sector heatmap data from latest recommendations."""
    import asyncio

    # Check cache first
    cached = await cache_get_json("sector_heatmap")
    if cached is not None:
        return {"success": True, "data": cached}

    pipeline_ids = await _get_latest_pipeline_ids(session, market="all")
    if not pipeline_ids:
        return {"success": True, "data": {"sectors": []}}

    recs_result = await session.execute(
        select(RecommendationModel)
        .where(RecommendationModel.pipeline_run_id.in_(pipeline_ids))
    )
    all_recs = recs_result.scalars().all()

    # Deduplicate
    seen: dict[str, RecommendationModel] = {}
    for r in all_recs:
        if r.ticker not in seen or (r.confidence or 0) > (seen[r.ticker].confidence or 0):
            seen[r.ticker] = r
    recs = list(seen.values())

    if not recs:
        return {"success": True, "data": {"sectors": []}}

    # Resolve sectors in parallel (with Redis per-ticker caching)
    async def _resolve_sector(rec: RecommendationModel) -> tuple[RecommendationModel, str]:
        cache_key = f"sector:{rec.ticker}"
        cached_sector = await cache_get_json(cache_key)
        if cached_sector is not None:
            return rec, cached_sector
        sector = await asyncio.to_thread(_get_sector_sync, rec.ticker, rec.market or "KOSPI")
        await cache_set_json(cache_key, sector, ttl=86400)
        return rec, sector

    results = await asyncio.gather(*[_resolve_sector(r) for r in recs])

    # Group by sector
    sector_data: dict[str, dict] = {}
    for rec, sector in results:
        if sector not in sector_data:
            sector_data[sector] = {
                "name": sector,
                "name_kr": _SECTOR_KR_MAP.get(sector, sector),
                "total": 0,
                "buy": 0,
                "sell": 0,
                "hold": 0,
                "confidences": [],
                "scores": [],
                "tickers": [],
            }
        sd = sector_data[sector]
        sd["total"] += 1
        if rec.action == "BUY":
            sd["buy"] += 1
        elif rec.action == "SELL":
            sd["sell"] += 1
        else:
            sd["hold"] += 1
        if rec.confidence:
            sd["confidences"].append(rec.confidence)
        if rec.composite_score:
            sd["scores"].append(rec.composite_score)
        sd["tickers"].append(rec.ticker)

    # Build response
    sectors = []
    for sd in sector_data.values():
        confs = sd.pop("confidences")
        scores = sd.pop("scores")
        sd["avg_confidence"] = round(sum(confs) / len(confs) * 100, 1) if confs else 0
        sd["avg_score"] = round(sum(scores) / len(scores), 3) if scores else 0
        # Signal strength: (buy - sell) / total, range [-1, 1]
        sd["signal_strength"] = round((sd["buy"] - sd["sell"]) / sd["total"], 2) if sd["total"] else 0
        sectors.append(sd)

    sectors.sort(key=lambda s: s["total"], reverse=True)

    result = {"sectors": sectors}
    await cache_set_json("sector_heatmap", result, ttl=600)
    return {"success": True, "data": result}


# NOTE: /summary/dashboard MUST be registered before /{ticker}
@router.get("/summary/dashboard")
async def get_dashboard_summary(
    session: AsyncSession = Depends(get_async_session),
):
    """Get dashboard summary with counts and top recommendations.

    Combines the latest KR and US pipeline results so both markets are visible.
    """
    pipeline_ids = await _get_latest_pipeline_ids(session, market="all")

    if not pipeline_ids:
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
        .where(RecommendationModel.pipeline_run_id.in_(pipeline_ids))
        .order_by(desc(RecommendationModel.confidence))
    )
    all_recs = recs_result.scalars().all()

    # 여러 파이프라인 합산 시 동일 ticker 중복 제거
    seen: dict[str, RecommendationModel] = {}
    for r in all_recs:
        if r.ticker not in seen or (r.confidence or 0) > (seen[r.ticker].confidence or 0):
            seen[r.ticker] = r
    recommendations = list(seen.values())
    recommendations.sort(key=lambda r: r.confidence or 0, reverse=True)

    buy_count = sum(1 for r in recommendations if r.action == "BUY")
    sell_count = sum(1 for r in recommendations if r.action == "SELL")
    hold_count = sum(1 for r in recommendations if r.action == "HOLD")

    top_recs = [_rec_to_dict(r) for r in recommendations[:5]]

    # Return info about the most recent pipeline for display
    latest_pipeline = await _get_latest_pipeline(session)

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
            } if latest_pipeline else None,
        },
    }


@router.get("")
async def get_recommendations(
    market: str = Query("all", description="Market filter: KR, US, or all"),
    action: str = Query("all", description="Action filter: BUY, SELL, HOLD, or all"),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    """Get latest stock recommendations.

    When market='all', combines the latest KR and US pipeline results.
    """
    pipeline_ids = await _get_latest_pipeline_ids(session, market=market)

    if not pipeline_ids:
        return {
            "success": True,
            "data": [],
            "filters": {"market": market, "action": action, "limit": limit},
        }

    query = select(RecommendationModel).where(
        RecommendationModel.pipeline_run_id.in_(pipeline_ids)
    )

    # Filter by actual stock market (RecommendationModel.market stores KOSPI/KOSDAQ/NasdaqGS etc.)
    if market == "KR":
        query = query.where(RecommendationModel.market.in_(["KOSPI", "KOSDAQ"]))
    elif market == "US":
        query = query.where(~RecommendationModel.market.in_(["KOSPI", "KOSDAQ"]))

    if action != "all":
        query = query.where(RecommendationModel.action == action)

    query = query.order_by(desc(RecommendationModel.confidence)).limit(limit)

    result = await session.execute(query)
    recs = result.scalars().all()

    # 여러 파이프라인 합산 시 동일 ticker 중복 제거 (confidence 높은 것 유지)
    seen: dict[str, RecommendationModel] = {}
    for r in recs:
        if r.ticker not in seen or (r.confidence or 0) > (seen[r.ticker].confidence or 0):
            seen[r.ticker] = r
    unique_recs = list(seen.values())
    unique_recs.sort(key=lambda r: r.confidence or 0, reverse=True)

    return {
        "success": True,
        "data": [_rec_to_dict(r) for r in unique_recs[:limit]],
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

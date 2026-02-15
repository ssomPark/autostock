"""N8N integration API routes.

Endpoints called by N8N workflow to orchestrate the analysis pipeline.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.analysis.signal_aggregator import ComponentSignal, SignalAggregator
from src.db.database import get_async_session
from src.models.db_models import PipelineRunModel, RecommendationModel
from src.services.market_screener import MarketScreener
from src.services.pipeline_tracker import tracker
from src.tools.stock_mapper import KEYWORD_TICKER_MAP

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Request/Response Models ---


class StartRequest(BaseModel):
    market: str = Field("KR", description="Market type: KR or US")


class StartResponse(BaseModel):
    pipeline_id: str
    status: str = "running"


class ProgressRequest(BaseModel):
    step: str = Field(..., description="Step ID: news, keywords, screening, analysis, recommendation, save")
    action: str = Field(..., description="Action: start, done, fail")
    summary: str = ""
    error: str = ""


class CompleteRequest(BaseModel):
    summary: str = ""


class StockMappingRequest(BaseModel):
    keywords: list[str] = Field(..., description="Keywords to map to tickers")


class AggregateRequest(BaseModel):
    ticker: str
    name: str = ""
    market: str = "KOSPI"
    current_price: float = 0.0
    nearest_support: float | None = None
    nearest_resistance: float | None = None
    news_sentiment: float = 0.0
    candlestick_strength: float = 0.0
    chart_pattern_strength: float = 0.0
    support_resistance_strength: float = 0.0
    volume_strength: float = 0.0


class RecommendationItem(BaseModel):
    ticker: str
    name: str
    market: str
    current_price: float = 0.0
    action: str
    confidence: float = 0.0
    composite_score: float = 0.0
    target_price: float | None = None
    stop_loss: float | None = None
    reasoning: str = ""
    component_signals: dict = Field(default_factory=dict)
    detected_patterns: list = Field(default_factory=list)


class MarketScreenerRequest(BaseModel):
    market: str = Field("KR", description="Market type: KR or US")
    limit: int = Field(15, description="Max number of stocks to return")


class SaveRecommendationsRequest(BaseModel):
    pipeline_id: str
    market: str = "KR"
    recommendations: list[RecommendationItem]


# --- Endpoints ---


@router.post("/start", response_model=StartResponse)
async def start_pipeline(req: StartRequest):
    """Start pipeline tracking. Called at the beginning of N8N workflow."""
    pipeline_id = await tracker.start(req.market)
    logger.info(f"N8N pipeline started: {pipeline_id} (market={req.market})")
    return StartResponse(pipeline_id=pipeline_id)


@router.post("/progress")
async def update_progress(req: ProgressRequest):
    """Update pipeline step progress. Called by N8N before/after each step."""
    if req.action == "start":
        await tracker.step_start(req.step)
    elif req.action == "done":
        await tracker.step_done(req.step, req.summary)
    elif req.action == "fail":
        await tracker.fail(req.step, req.error or "Unknown error")
    else:
        return {"success": False, "message": f"Unknown action: {req.action}"}

    return {"success": True, "step": req.step, "action": req.action}


@router.post("/complete")
async def complete_pipeline(req: CompleteRequest):
    """Mark pipeline as complete. Called at the end of N8N workflow."""
    await tracker.complete(req.summary)
    logger.info(f"N8N pipeline completed: {req.summary}")
    return {"success": True, "status": "completed"}


@router.post("/stock-mapping")
async def map_keywords_to_stocks(req: StockMappingRequest):
    """Map keywords to stock tickers. Reuses StockMapperTool logic."""
    results = []
    seen_tickers: set[str] = set()

    for kw in req.keywords:
        kw_lower = kw.lower()
        mapping = KEYWORD_TICKER_MAP.get(kw) or KEYWORD_TICKER_MAP.get(kw_lower)
        if mapping:
            if isinstance(mapping, list):
                for m in mapping:
                    if m["ticker"] not in seen_tickers:
                        results.append(m)
                        seen_tickers.add(m["ticker"])
            else:
                if mapping["ticker"] not in seen_tickers:
                    results.append(mapping)
                    seen_tickers.add(mapping["ticker"])

    return {"success": True, "data": results, "count": len(results)}


@router.post("/market-screener")
async def market_screener(req: MarketScreenerRequest):
    """Screen stocks from market data (volume leaders, top movers)."""
    try:
        screener = MarketScreener()
        data = screener.screen(market=req.market, limit=req.limit)
        logger.info(f"Market screener returned {len(data)} stocks (market={req.market})")
        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        logger.error(f"Market screener failed: {e}")
        return {"success": True, "data": [], "count": 0}


@router.post("/aggregate")
async def aggregate_signals(req: AggregateRequest):
    """Aggregate analysis signals into a recommendation score."""
    signals = {}

    if req.news_sentiment != 0.0:
        signals["news_sentiment"] = ComponentSignal(
            name="news_sentiment",
            signal="BUY" if req.news_sentiment > 0 else "SELL" if req.news_sentiment < 0 else "HOLD",
            strength=req.news_sentiment,
        )
    if req.candlestick_strength != 0.0:
        signals["candlestick"] = ComponentSignal(
            name="candlestick",
            signal="BUY" if req.candlestick_strength > 0 else "SELL" if req.candlestick_strength < 0 else "HOLD",
            strength=req.candlestick_strength,
        )
    if req.chart_pattern_strength != 0.0:
        signals["chart_pattern"] = ComponentSignal(
            name="chart_pattern",
            signal="BUY" if req.chart_pattern_strength > 0 else "SELL" if req.chart_pattern_strength < 0 else "HOLD",
            strength=req.chart_pattern_strength,
        )
    if req.support_resistance_strength != 0.0:
        signals["support_resistance"] = ComponentSignal(
            name="support_resistance",
            signal="BUY" if req.support_resistance_strength > 0 else "SELL" if req.support_resistance_strength < 0 else "HOLD",
            strength=req.support_resistance_strength,
        )
    if req.volume_strength != 0.0:
        signals["volume"] = ComponentSignal(
            name="volume",
            signal="BUY" if req.volume_strength > 0 else "SELL" if req.volume_strength < 0 else "HOLD",
            strength=req.volume_strength,
        )

    aggregator = SignalAggregator()
    result = aggregator.aggregate(signals)
    result["ticker"] = req.ticker
    result["name"] = req.name
    result["market"] = req.market
    result["current_price"] = req.current_price
    result["nearest_support"] = req.nearest_support
    result["nearest_resistance"] = req.nearest_resistance

    return {"success": True, "data": result}


@router.post("/save-recommendations")
async def save_recommendations(
    req: SaveRecommendationsRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Save recommendation results to the database."""
    try:
        # Create pipeline run record
        pipeline_run = PipelineRunModel(
            market_type=req.market,
            status="completed",
            started_at=datetime.now(),
            completed_at=datetime.now(),
            recommendations_count=len(req.recommendations),
        )
        session.add(pipeline_run)
        await session.flush()

        # Save each recommendation
        for rec in req.recommendations:
            recommendation = RecommendationModel(
                pipeline_run_id=pipeline_run.id,
                ticker=rec.ticker,
                name=rec.name,
                market=rec.market,
                current_price=rec.current_price,
                action=rec.action,
                confidence=rec.confidence,
                composite_score=rec.composite_score,
                target_price=rec.target_price,
                stop_loss=rec.stop_loss,
                reasoning=rec.reasoning,
                component_signals=rec.component_signals,
                detected_patterns=rec.detected_patterns,
            )
            session.add(recommendation)

        await session.commit()
        logger.info(f"Saved {len(req.recommendations)} recommendations for pipeline {req.pipeline_id}")

        return {
            "success": True,
            "message": f"Saved {len(req.recommendations)} recommendations",
            "pipeline_run_id": pipeline_run.id,
        }
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to save recommendations: {e}")
        return {"success": False, "message": str(e)}

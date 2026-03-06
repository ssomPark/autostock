"""N8N integration API routes.

Endpoints called by N8N workflow to orchestrate the analysis pipeline.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import yfinance as yf
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.analysis.scoring_engine import ScoringEngine
from src.analysis.signal_aggregator import ComponentSignal, SignalAggregator
from src.db.database import get_async_session
from src.models.db_models import (
    EventStockModel,
    MarketEventModel,
    NotificationModel,
    PipelineRunModel,
    RecommendationModel,
    SavedAnalysisModel,
)
from src.services.market_screener import MarketScreener
from src.services.pipeline_tracker import tracker
from src.tools.stock_mapper import KEYWORD_TICKER_MAP
from src.utils.stock_name_resolver import resolve_kr_name

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_ohlcv_with_fallback(ticker: str, market: str):
    """Get OHLCV data with yfinance fallback when primary source fails."""
    import pandas as pd
    from src.services.market_data_service import MarketDataService
    service = MarketDataService()
    df = service.get_ohlcv(ticker, market)
    if df is None or (hasattr(df, 'empty') and df.empty):
        try:
            yf_ticker = ticker
            if ticker.isdigit():
                suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
                yf_ticker = f"{ticker}{suffix}"
            yf_df = yf.Ticker(yf_ticker).history(period="3mo")
            if not yf_df.empty:
                yf_df.columns = [c.lower() for c in yf_df.columns]
                if "stock splits" in yf_df.columns:
                    yf_df.drop(columns=["stock splits", "dividends"], errors="ignore", inplace=True)
                yf_df.index = pd.to_datetime(yf_df.index).tz_localize(None)
                return yf_df
        except Exception as e:
            logger.warning(f"yfinance fallback failed for {ticker}: {e}")
    return df


def _get_fundamentals(ticker: str, market: str) -> dict:
    """Extract fundamental data from yfinance for ScoringEngine confidence adjustment."""
    try:
        yf_ticker = ticker
        if ticker.isdigit():
            suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
            yf_ticker = f"{ticker}{suffix}"
        info = yf.Ticker(yf_ticker).info or {}
        return {
            "targetMeanPrice": info.get("targetMeanPrice"),
            "recommendationKey": info.get("recommendationKey"),
            "shortPercentOfFloat": info.get("shortPercentOfFloat"),
            "earningsGrowth": info.get("earningsGrowth"),
            "shortName": info.get("shortName") or info.get("longName"),
            "sector": info.get("sector"),
            "market": market,
        }
    except Exception as e:
        logger.warning(f"Failed to fetch fundamentals for {ticker}: {e}")
        return {}


def _resolve_stock_name(ticker: str, market: str = "KOSPI") -> str:
    """Resolve stock name from ticker via stock_mapper, Naver, or yfinance."""
    # 1. Check stock_mapper for known tickers
    for _key, val in KEYWORD_TICKER_MAP.items():
        entries = val if isinstance(val, list) else [val]
        for entry in entries:
            if entry["ticker"] == ticker:
                return entry["name"]

    # 2. Korean stocks: resolve from Naver Finance (returns Korean name)
    if ticker.isdigit() and len(ticker) == 6:
        name = resolve_kr_name(ticker)
        if name and name != ticker:
            return name

    # 3. Fallback to yfinance (US stocks)
    try:
        yf_ticker = ticker
        if ticker.isdigit():
            suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
            yf_ticker = f"{ticker}{suffix}"
        info = yf.Ticker(yf_ticker).info or {}
        name = info.get("shortName") or info.get("longName")
        if name:
            return name
    except Exception as e:
        logger.warning(f"Failed to resolve name for {ticker}: {e}")

    return ticker


# --- Event & Diversity Helpers ---


async def _get_event_stocks(
    session: AsyncSession, market: str, days: int = 30
) -> list[dict]:
    """향후 N일 이내 이벤트의 positive 수혜종목 조회."""
    _KST = timezone(timedelta(hours=9))
    now = datetime.now(_KST).replace(tzinfo=None)
    cutoff = now + timedelta(days=days)
    kr_markets = {"KOSPI", "KOSDAQ"}

    stmt = (
        select(EventStockModel, MarketEventModel)
        .join(MarketEventModel, EventStockModel.event_id == MarketEventModel.id)
        .where(
            MarketEventModel.is_active == True,  # noqa: E712
            MarketEventModel.event_date >= now,
            MarketEventModel.event_date <= cutoff,
            EventStockModel.expected_impact == "positive",
        )
    )
    result = await session.execute(stmt)
    rows = result.all()

    stocks = []
    seen: set[str] = set()
    for es, ev in rows:
        # 마켓 필터: KR 파이프라인이면 KOSPI/KOSDAQ만, US면 나머지
        if market == "KR" and es.market not in kr_markets:
            continue
        if market == "US" and es.market in kr_markets:
            continue
        if es.ticker in seen:
            continue
        seen.add(es.ticker)

        days_until = (ev.event_date - now).days
        stocks.append({
            "ticker": es.ticker,
            "name": es.name,
            "market": es.market,
            "source": "event",
            "event_title": ev.title,
            "event_date": ev.event_date.strftime("%Y-%m-%d"),
            "days_until_event": days_until,
            "relation_type": es.relation_type,
            "impact_level": ev.impact_level,
        })

    return stocks


async def _get_recent_recommendation_tickers(
    session: AsyncSession, market: str, days: int = 7
) -> set[str]:
    """최근 N일간 추천된 종목 ticker 집합."""
    cutoff = datetime.now() - timedelta(days=days)
    kr_markets = {"KOSPI", "KOSDAQ"}

    stmt = select(RecommendationModel.ticker).where(
        RecommendationModel.created_at >= cutoff,
    )
    result = await session.execute(stmt)
    tickers = set()
    for (ticker,) in result.all():
        # 마켓 정보가 없으므로 모두 포함 (같은 ticker가 다른 마켓에 있을 확률 낮음)
        tickers.add(ticker)
    return tickers


async def _get_stock_event_info(session: AsyncSession, ticker: str) -> str | None:
    """종목 관련 향후 30일 이벤트 정보 문자열 반환."""
    _KST = timezone(timedelta(hours=9))
    now = datetime.now(_KST).replace(tzinfo=None)
    cutoff = now + timedelta(days=30)

    stmt = (
        select(EventStockModel, MarketEventModel)
        .join(MarketEventModel, EventStockModel.event_id == MarketEventModel.id)
        .where(
            EventStockModel.ticker == ticker,
            EventStockModel.expected_impact == "positive",
            MarketEventModel.is_active == True,  # noqa: E712
            MarketEventModel.event_date >= now,
            MarketEventModel.event_date <= cutoff,
        )
        .order_by(MarketEventModel.event_date)
    )
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return None

    parts = []
    for es, ev in rows:
        days_until = (ev.event_date - now).days
        relation = "직접 수혜" if es.relation_type == "direct" else "간접 수혜" if es.relation_type == "indirect" else "섹터 수혜"
        parts.append(f"{ev.title} ({relation}) - D-{days_until}")

    return "\n📅 관련 이벤트: " + " | ".join(parts)


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
    fundamental_strength: float = 0.0


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
    import asyncio

    await tracker.complete(req.summary)
    logger.info(f"N8N pipeline completed: {req.summary}")

    # 배치 모드: 다음 마켓 자동 실행
    next_market = await tracker.advance_batch()
    if next_market:
        from src.api.routes.pipeline import _trigger_n8n_webhook

        pid = tracker.get_state()["pipeline_id"]
        asyncio.create_task(_trigger_n8n_webhook(pid, next_market))
        return {"success": True, "status": "batch_continuing", "next_market": next_market}

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
async def market_screener(
    req: MarketScreenerRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Screen stocks from market data (volume leaders, top movers) + event stocks."""
    try:
        screener = MarketScreener()
        data = screener.screen(market=req.market, limit=req.limit)
        logger.info(f"Market screener returned {len(data)} stocks (market={req.market})")

        # --- 이벤트 수혜종목 병합 ---
        try:
            event_stocks = await _get_event_stocks(session, req.market, days=30)
            existing_tickers = {item["ticker"] for item in data}
            added = 0
            for es in event_stocks:
                if es["ticker"] not in existing_tickers:
                    data.append(es)
                    existing_tickers.add(es["ticker"])
                    added += 1
            if added:
                logger.info(f"Added {added} event stocks to screener results")
        except Exception as e:
            logger.warning(f"Event stock merge failed (non-fatal): {e}")

        # --- 최근 추천 종목 뒤로 밀기 ---
        try:
            recent_tickers = await _get_recent_recommendation_tickers(session, req.market, days=7)
            if recent_tickers:
                new_stocks = [s for s in data if s["ticker"] not in recent_tickers]
                old_stocks = [s for s in data if s["ticker"] in recent_tickers]
                data = new_stocks + old_stocks
                if old_stocks:
                    logger.info(f"Deprioritized {len(old_stocks)} recently recommended stocks")
        except Exception as e:
            logger.warning(f"Recent recommendation deprioritize failed (non-fatal): {e}")

        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        logger.error(f"Market screener failed: {e}")
        return {"success": False, "data": [], "count": 0, "error": "스크리닝 처리 중 오류가 발생했습니다."}


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
    if req.fundamental_strength != 0.0:
        signals["fundamental"] = ComponentSignal(
            name="fundamental",
            signal="BUY" if req.fundamental_strength > 0 else "SELL" if req.fundamental_strength < 0 else "HOLD",
            strength=req.fundamental_strength,
        )

    aggregator = SignalAggregator()
    result = aggregator.aggregate(signals)
    result["ticker"] = req.ticker
    result["name"] = req.name
    result["market"] = req.market
    result["current_price"] = req.current_price
    result["nearest_support"] = req.nearest_support
    result["nearest_resistance"] = req.nearest_resistance

    # ScoringEngine 등급 산출 (OHLCV 데이터 필요)
    try:
        df = _get_ohlcv_with_fallback(req.ticker, req.market)
        if df is not None and len(df) >= 20:
            fundamentals = _get_fundamentals(req.ticker, req.market)
            engine = ScoringEngine(df, fundamentals=fundamentals)
            score_result = engine.compute()
            result["grade"] = score_result.get("grade")
            result["scoring_confidence"] = score_result.get("confidence", {}).get("final")
            result["risk_reward_ratio"] = score_result.get("risk_reward_ratio")
    except Exception as e:
        logger.warning(f"ScoringEngine grade failed for {req.ticker}: {e}")

    return {"success": True, "data": result}


@router.post("/save-recommendations")
async def save_recommendations(
    req: SaveRecommendationsRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Save recommendation results to the database."""
    try:
        # 마켓 불일치 종목 필터링 (US 파이프라인에 한국 종목 등)
        def _market_matches(rec_market: str, pipeline_market: str) -> bool:
            kr_markets = {"KOSPI", "KOSDAQ"}
            if pipeline_market == "KR":
                return rec_market in kr_markets
            if pipeline_market == "US":
                return rec_market not in kr_markets
            return True

        filtered = [
            rec for rec in req.recommendations
            if _market_matches(rec.market, req.market)
        ]
        if len(filtered) < len(req.recommendations):
            logger.info(
                f"Filtered mismatched market: {len(req.recommendations)} → {len(filtered)}"
            )

        # 중복 종목 제거 (같은 ticker → composite_score가 높은 것만 유지)
        deduped: dict[str, RecommendationItem] = {}
        for rec in filtered:
            existing = deduped.get(rec.ticker)
            if existing is None or rec.composite_score > existing.composite_score:
                deduped[rec.ticker] = rec
        unique_recs = list(deduped.values())

        if len(unique_recs) < len(filtered):
            logger.info(
                f"Deduplicated {len(filtered)} → {len(unique_recs)} recommendations"
            )

        # Create pipeline run record
        pipeline_run = PipelineRunModel(
            market_type=req.market,
            status="completed",
            started_at=datetime.now(),
            completed_at=datetime.now(),
            recommendations_count=len(unique_recs),
        )
        session.add(pipeline_run)
        await session.flush()

        # Save each recommendation
        for rec in unique_recs:
            # Resolve name if it's empty or same as ticker
            name = rec.name
            if not name or name == rec.ticker:
                name = _resolve_stock_name(rec.ticker, rec.market)

            # ScoringEngine 신뢰도 계산 (통일된 confidence 사용)
            confidence = rec.confidence
            try:
                df = _get_ohlcv_with_fallback(rec.ticker, rec.market)
                if df is not None and len(df) >= 20:
                    fundamentals = _get_fundamentals(rec.ticker, rec.market)
                    engine = ScoringEngine(df, fundamentals=fundamentals)
                    score_result = engine.compute()
                    scoring_conf = score_result.get("confidence", {}).get("final")
                    if scoring_conf is not None:
                        confidence = scoring_conf / 100.0  # 5~95% → 0.05~0.95
            except Exception as e:
                logger.warning(f"ScoringEngine confidence failed for {rec.ticker}: {e}")

            # 이벤트 정보 reasoning에 추가
            reasoning = rec.reasoning
            try:
                event_info = await _get_stock_event_info(session, rec.ticker)
                if event_info:
                    reasoning = reasoning + event_info
            except Exception as e:
                logger.warning(f"Event info lookup failed for {rec.ticker}: {e}")

            recommendation = RecommendationModel(
                pipeline_run_id=pipeline_run.id,
                ticker=rec.ticker,
                name=name,
                market=rec.market,
                current_price=rec.current_price,
                action=rec.action,
                confidence=confidence,
                composite_score=rec.composite_score,
                target_price=rec.target_price,
                stop_loss=rec.stop_loss,
                reasoning=reasoning,
                component_signals=rec.component_signals,
                detected_patterns=rec.detected_patterns,
            )
            session.add(recommendation)

        await session.commit()
        logger.info(f"Saved {len(unique_recs)} recommendations for pipeline {req.pipeline_id}")

        # --- 알림 생성: 핀 고정 종목과 매칭 ---
        try:
            saved_tickers = {rec.ticker for rec in unique_recs}
            # 핀 고정한 사용자+종목 조회
            pinned_result = await session.execute(
                select(SavedAnalysisModel.user_id, SavedAnalysisModel.ticker, SavedAnalysisModel.name)
                .where(
                    SavedAnalysisModel.is_pinned == True,  # noqa: E712
                    SavedAnalysisModel.ticker.in_(saved_tickers),
                )
                .distinct(SavedAnalysisModel.user_id, SavedAnalysisModel.ticker)
            )
            pinned_rows = pinned_result.all()

            # 추천 데이터를 ticker로 인덱싱
            rec_map = {rec.ticker: rec for rec in unique_recs}
            notifications = []
            for user_id, ticker, stock_name in pinned_rows:
                rec = rec_map.get(ticker)
                if not rec:
                    continue
                action_kr = "매수" if rec.action == "BUY" else "매도" if rec.action == "SELL" else "관망"
                conf_pct = rec.confidence * 100 if rec.confidence < 1 else rec.confidence
                notifications.append(NotificationModel(
                    user_id=user_id,
                    type="recommendation",
                    title=f"{stock_name or ticker}: 새 {action_kr} 추천",
                    message=f"신뢰도 {conf_pct:.0f}%, 목표가 {rec.target_price or '-'}",
                    link="/recommendations",
                ))

            if notifications:
                session.add_all(notifications)
                await session.commit()
                logger.info(f"Created {len(notifications)} pin-match notifications")
        except Exception as e:
            logger.warning(f"Notification creation failed (non-fatal): {e}")

        return {
            "success": True,
            "message": f"Saved {len(unique_recs)} recommendations",
            "pipeline_run_id": pipeline_run.id,
        }
    except Exception as e:
        await session.rollback()
        logger.error(f"Failed to save recommendations: {e}")
        return {"success": False, "message": "추천 저장 중 오류가 발생했습니다."}

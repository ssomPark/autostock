"""Fundamental screening pipeline — runs independently of the news pipeline.

Flow: Scan stock universe → Score fundamentals → Run technical analysis → Save to DB.
No LLM or N8N dependency — pure Python.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from src.analysis.scoring_engine import ScoringEngine
from src.db.database import AsyncSessionLocal
from src.models.db_models import PipelineRunModel, RecommendationModel
from src.services.fundamental_screener import FundamentalScreener
from src.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)


class FundamentalPipeline:
    """Scans for fundamentally strong stocks and saves recommendations."""

    def __init__(self):
        self.screener = FundamentalScreener()
        self.market_data = MarketDataService()

    async def run(self, market: str = "KR", limit: int = 20) -> dict:
        """Execute full fundamental scanning pipeline.

        Returns summary dict with counts and top picks.
        """
        started = datetime.now()
        market_type = f"{market.upper()}_FUND"
        logger.info(f"[FundamentalPipeline] Starting {market_type} scan...")

        # 1. Fundamental screening
        candidates = self.screener.screen(market=market, limit=limit)
        if not candidates:
            logger.warning(f"[FundamentalPipeline] No candidates found for {market}")
            return {"market": market_type, "candidates": 0, "saved": 0}

        logger.info(f"[FundamentalPipeline] {len(candidates)} candidates from screener")

        # 2. Technical analysis + combined scoring for each candidate
        recommendations: list[dict] = []
        for cand in candidates:
            try:
                rec = self._analyze_candidate(cand)
                if rec:
                    recommendations.append(rec)
            except Exception as e:
                logger.warning(
                    f"[FundamentalPipeline] Analysis failed for {cand['ticker']}: {e}"
                )

        logger.info(
            f"[FundamentalPipeline] {len(recommendations)} recommendations generated"
        )

        # 3. Save to DB
        saved = 0
        try:
            saved = await self._save_to_db(
                market_type=market_type,
                started=started,
                recommendations=recommendations,
            )
        except Exception as e:
            logger.error(f"[FundamentalPipeline] DB save failed: {e}")

        summary = {
            "market": market_type,
            "candidates": len(candidates),
            "recommendations": len(recommendations),
            "saved": saved,
            "top_picks": [
                {
                    "ticker": r["ticker"],
                    "name": r["name"],
                    "action": r["action"],
                    "fundamental_score": r["fundamental_score"],
                    "confidence": r["confidence"],
                    "category": r["fundamental_category"],
                }
                for r in recommendations[:5]
            ],
        }
        logger.info(f"[FundamentalPipeline] {market_type} complete: {summary}")
        return summary

    def _analyze_candidate(self, cand: dict) -> dict | None:
        """Run ScoringEngine on a candidate and merge with fundamental data."""
        ticker = cand["ticker"]
        market = cand["market"]

        # Get OHLCV for technical analysis
        df = self.market_data.get_ohlcv(ticker, market=market)
        if df is None or len(df) < 20:
            logger.debug(f"  {ticker}: insufficient OHLCV data ({len(df) if df is not None else 0} rows)")
            return None

        # Build fundamentals dict for ScoringEngine
        metrics = cand.get("metrics", {})
        fundamentals = {
            "trailingPE": metrics.get("per"),
            "forwardPE": metrics.get("forward_pe"),
            "priceToBook": metrics.get("pbr"),
            "returnOnEquity": metrics.get("roe"),
            "debtToEquity": metrics.get("debt_to_equity"),
            "earningsGrowth": metrics.get("earnings_growth"),
            "revenueGrowth": metrics.get("revenue_growth"),
            "operatingMargins": metrics.get("operating_margin"),
            "fiftyTwoWeekHigh": metrics.get("52w_high"),
            "currentPrice": metrics.get("current_price"),
            "market": market,
        }

        # Run ScoringEngine
        engine = ScoringEngine(df, fundamentals=fundamentals)
        result = engine.compute()

        signal = result["signal"]
        confidence = result["confidence"]["final"] / 100.0  # normalize to 0~1 (DB convention)
        grade = result["grade"]
        current_price = result["current_price"]

        # Build recommendation
        return {
            "ticker": ticker,
            "name": cand["name"],
            "market": market,
            "current_price": current_price,
            "action": signal,
            "confidence": confidence,
            "composite_score": result["total_score"],
            "target_price": result["target"]["consensus"],
            "stop_loss": result["stop_loss"]["final"],
            "reasoning": " ".join(result.get("summary", [])),
            "component_signals": result.get("signal_breakdown", {}),
            "detected_patterns": [],
            "grade": grade,
            "fundamental_score": cand["fundamental_score"],
            "fundamental_category": cand["category"],
            "source": "fundamental",
        }

    async def _save_to_db(
        self,
        market_type: str,
        started: datetime,
        recommendations: list[dict],
    ) -> int:
        """Save pipeline run and recommendations to database."""
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Create pipeline run
                pipeline_run = PipelineRunModel(
                    market_type=market_type,
                    status="completed",
                    started_at=started,
                    completed_at=datetime.now(),
                    recommendations_count=len(recommendations),
                    source="fundamental",
                )
                session.add(pipeline_run)
                await session.flush()

                # Save recommendations
                for rec in recommendations:
                    rec_model = RecommendationModel(
                        pipeline_run_id=pipeline_run.id,
                        ticker=rec["ticker"],
                        name=rec["name"],
                        market=rec["market"],
                        current_price=rec["current_price"],
                        action=rec["action"],
                        confidence=rec["confidence"],
                        composite_score=rec["composite_score"],
                        target_price=rec["target_price"],
                        stop_loss=rec["stop_loss"],
                        reasoning=rec["reasoning"],
                        component_signals=rec["component_signals"],
                        detected_patterns=rec["detected_patterns"],
                        source="fundamental",
                        fundamental_score=rec["fundamental_score"],
                        fundamental_category=rec["fundamental_category"],
                    )
                    session.add(rec_model)

                await session.commit()
                logger.info(
                    f"[FundamentalPipeline] Saved pipeline_run={pipeline_run.id} "
                    f"with {len(recommendations)} recommendations"
                )
                return len(recommendations)

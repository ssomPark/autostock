"""Daily pipeline flow - orchestrates the full analysis pipeline.

Flow:
1. collect_news -> News Collector crawls financial news
2. extract_keywords -> Keyword Extractor analyzes news for keywords/sentiment
3. screen_stocks -> Stock Screener maps keywords to tickers
4. analyze_stocks -> 4 technical analysts run in parallel
5. generate_recommendations -> Investment Strategist makes final calls
6. save_and_notify -> Save to DB + push notifications
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime

from crewai.flow.flow import Flow, listen, start

from src.crews.news_crew import create_news_crew
from src.crews.screening_crew import create_screening_crew
from src.crews.analysis_crew import create_analysis_crew
from src.crews.recommendation_crew import create_recommendation_crew
from src.services.pipeline_tracker import tracker

logger = logging.getLogger(__name__)

# Reference to the main FastAPI event loop (set before pipeline runs)
_event_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store the main event loop so _track() can schedule coroutines from threads."""
    global _event_loop
    _event_loop = loop


def _track(coro) -> None:
    """Schedule an async tracker coroutine from a sync (threaded) context."""
    loop = _event_loop
    if loop is not None and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        try:
            future.result(timeout=10)
        except Exception as e:
            logger.warning(f"Tracker call failed: {e}")
    else:
        # Fallback: no main loop available
        try:
            asyncio.run(coro)
        except RuntimeError:
            pass


class DailyPipeline(Flow):
    """Main daily analysis pipeline."""

    def __init__(self, market_type: str = "KR"):
        super().__init__()
        self.market_type = market_type
        self.pipeline_id: int | None = None
        self.news_articles: list[dict] = []
        self.keywords: list[dict] = []
        self.candidates: list[dict] = []
        self.analyses: list[dict] = []
        self.recommendations: list[dict] = []
        self.started_at = datetime.now()

    @start()
    def collect_news(self) -> str:
        """Step 1: Collect news from Korean financial media."""
        _track(tracker.step_start("news"))
        logger.info(f"[Pipeline] Starting news collection for {self.market_type} market")
        try:
            crew = create_news_crew()
            result = crew.kickoff()
            result_str = str(result)
            _track(tracker.step_done("news", "뉴스 수집 완료"))
            logger.info("[Pipeline] News collection completed")
            return result_str
        except Exception as e:
            _track(tracker.fail("news", str(e)))
            raise

    @listen(collect_news)
    def extract_keywords(self, news_result: str) -> str:
        """Step 2: Extract keywords and sentiment from collected news."""
        _track(tracker.step_start("keywords"))
        logger.info("[Pipeline] Extracting keywords from news")
        try:
            self.news_articles = json.loads(news_result) if isinstance(news_result, str) else []
        except (json.JSONDecodeError, TypeError):
            self.news_articles = []
        count = len(self.news_articles)
        _track(tracker.step_done("keywords", f"뉴스 {count}건에서 키워드 추출"))
        return news_result

    @listen(extract_keywords)
    def screen_stocks(self, keywords_result: str) -> str:
        """Step 3: Map keywords to stock tickers."""
        _track(tracker.step_start("screening"))
        logger.info("[Pipeline] Screening stocks from keywords")
        try:
            crew = create_screening_crew()
            result = crew.kickoff(inputs={"keywords": keywords_result})
            result_str = str(result)
            _track(tracker.step_done("screening", "종목 스크리닝 완료"))
            logger.info("[Pipeline] Stock screening completed")
            return result_str
        except Exception as e:
            _track(tracker.fail("screening", str(e)))
            raise

    @listen(screen_stocks)
    def analyze_stocks(self, screening_result: str) -> str:
        """Step 4: Run technical analysis on candidate stocks."""
        _track(tracker.step_start("analysis"))
        logger.info("[Pipeline] Starting technical analysis")
        try:
            crew = create_analysis_crew()
            result = crew.kickoff(inputs={"candidates": screening_result})
            result_str = str(result)
            _track(tracker.step_done("analysis", "기술적 분석 완료"))
            logger.info("[Pipeline] Technical analysis completed")
            return result_str
        except Exception as e:
            _track(tracker.fail("analysis", str(e)))
            raise

    @listen(analyze_stocks)
    def generate_recommendations(self, analysis_result: str) -> str:
        """Step 5: Generate final BUY/SELL/HOLD recommendations."""
        _track(tracker.step_start("recommendation"))
        logger.info("[Pipeline] Generating recommendations")
        try:
            crew = create_recommendation_crew()
            result = crew.kickoff(inputs={
                "analyses": analysis_result,
                "news": json.dumps(self.news_articles, ensure_ascii=False),
            })
            result_str = str(result)
            _track(tracker.step_done("recommendation", "투자 추천 생성 완료"))
            logger.info("[Pipeline] Recommendations generated")
            return result_str
        except Exception as e:
            _track(tracker.fail("recommendation", str(e)))
            raise

    @listen(generate_recommendations)
    def save_and_notify(self, recommendations_result: str) -> dict:
        """Step 6: Save results to database and send notifications."""
        _track(tracker.step_start("save"))
        logger.info("[Pipeline] Saving results and sending notifications")
        try:
            self.recommendations = (
                json.loads(recommendations_result)
                if isinstance(recommendations_result, str)
                else []
            )
        except (json.JSONDecodeError, TypeError):
            self.recommendations = []

        completed_at = datetime.now()
        duration = (completed_at - self.started_at).total_seconds()

        summary = {
            "pipeline_id": self.pipeline_id,
            "market_type": self.market_type,
            "status": "completed",
            "started_at": str(self.started_at),
            "completed_at": str(completed_at),
            "duration_seconds": round(duration, 1),
            "news_count": len(self.news_articles),
            "recommendations_count": len(self.recommendations),
            "recommendations": self.recommendations,
        }

        rec_count = len(self.recommendations)
        _track(tracker.step_done("save", f"추천 {rec_count}건 저장"))
        _track(tracker.complete(
            f"총 {round(duration, 1)}초 소요, 추천 {rec_count}건"
        ))

        logger.info(
            f"[Pipeline] Completed in {duration:.1f}s | "
            f"News: {len(self.news_articles)} | "
            f"Recommendations: {rec_count}"
        )
        return summary


async def run_daily_pipeline(market_type: str = "KR") -> dict:
    """Run the daily analysis pipeline."""
    pipeline = DailyPipeline(market_type=market_type)
    result = await pipeline.kickoff_async()
    return result

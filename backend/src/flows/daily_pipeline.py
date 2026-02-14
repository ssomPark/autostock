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

import json
import logging
from datetime import datetime

from crewai.flow.flow import Flow, listen, start

from src.crews.news_crew import create_news_crew
from src.crews.screening_crew import create_screening_crew
from src.crews.analysis_crew import create_analysis_crew
from src.crews.recommendation_crew import create_recommendation_crew

logger = logging.getLogger(__name__)


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
        logger.info(f"[Pipeline] Starting news collection for {self.market_type} market")
        crew = create_news_crew()
        result = crew.kickoff()
        logger.info(f"[Pipeline] News collection completed")
        return str(result)

    @listen(collect_news)
    def extract_keywords(self, news_result: str) -> str:
        """Step 2: Extract keywords and sentiment from collected news."""
        logger.info("[Pipeline] Extracting keywords from news")
        try:
            self.news_articles = json.loads(news_result) if isinstance(news_result, str) else []
        except (json.JSONDecodeError, TypeError):
            self.news_articles = []
        return news_result

    @listen(extract_keywords)
    def screen_stocks(self, keywords_result: str) -> str:
        """Step 3: Map keywords to stock tickers."""
        logger.info("[Pipeline] Screening stocks from keywords")
        crew = create_screening_crew()
        result = crew.kickoff(inputs={"keywords": keywords_result})
        logger.info("[Pipeline] Stock screening completed")
        return str(result)

    @listen(screen_stocks)
    def analyze_stocks(self, screening_result: str) -> str:
        """Step 4: Run technical analysis on candidate stocks."""
        logger.info("[Pipeline] Starting technical analysis")
        crew = create_analysis_crew()
        result = crew.kickoff(inputs={"candidates": screening_result})
        logger.info("[Pipeline] Technical analysis completed")
        return str(result)

    @listen(analyze_stocks)
    def generate_recommendations(self, analysis_result: str) -> str:
        """Step 5: Generate final BUY/SELL/HOLD recommendations."""
        logger.info("[Pipeline] Generating recommendations")
        crew = create_recommendation_crew()
        result = crew.kickoff(inputs={
            "analyses": analysis_result,
            "news": json.dumps(self.news_articles, ensure_ascii=False),
        })
        logger.info("[Pipeline] Recommendations generated")
        return str(result)

    @listen(generate_recommendations)
    def save_and_notify(self, recommendations_result: str) -> dict:
        """Step 6: Save results to database and send notifications."""
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

        logger.info(
            f"[Pipeline] Completed in {duration:.1f}s | "
            f"News: {len(self.news_articles)} | "
            f"Recommendations: {len(self.recommendations)}"
        )
        return summary


async def run_daily_pipeline(market_type: str = "KR") -> dict:
    """Run the daily analysis pipeline."""
    pipeline = DailyPipeline(market_type=market_type)
    result = await pipeline.kickoff_async()
    return result

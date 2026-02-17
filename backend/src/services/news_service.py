"""News service - manages news collection and storage."""

from __future__ import annotations

import logging
from datetime import datetime

from src.tools.news_scraper import NewsCrawlerTool
from src.services.news_analyzer import NewsAnalyzer

logger = logging.getLogger(__name__)


class NewsService:
    """Service for collecting and managing news articles."""

    def __init__(self):
        self.crawler = NewsCrawlerTool()
        self.analyzer = NewsAnalyzer()

    def collect_news(self, category: str = "economy") -> list[dict]:
        """Collect news from all sources."""
        result = self.crawler._run(category)
        try:
            import json
            articles = json.loads(result)
        except Exception:
            articles = []
        logger.info(f"Collected {len(articles)} news articles")
        return self._enrich_articles(articles)

    def get_recent_news(self, limit: int = 20) -> list[dict]:
        """Get most recent news articles from database."""
        # Will be connected to DB in full implementation
        return self.collect_news()[:limit]

    def _enrich_articles(self, articles: list[dict]) -> list[dict]:
        """Add sentiment and related stock info to each article."""
        for article in articles:
            analysis = self.analyzer.analyze_article(
                article.get("title", ""),
                article.get("summary", ""),
            )
            article["related_stocks"] = analysis["related_stocks"]
            article["sentiment"] = analysis["sentiment"]
            article["sentiment_score"] = analysis["sentiment_score"]
        return articles

"""News service - manages news collection and storage."""

from __future__ import annotations

import logging
from datetime import datetime

from src.tools.news_scraper import NewsCrawlerTool

logger = logging.getLogger(__name__)


class NewsService:
    """Service for collecting and managing news articles."""

    def __init__(self):
        self.crawler = NewsCrawlerTool()

    def collect_news(self, category: str = "economy") -> list[dict]:
        """Collect news from all sources."""
        result = self.crawler._run(category)
        try:
            import json
            articles = json.loads(result)
        except Exception:
            articles = []
        logger.info(f"Collected {len(articles)} news articles")
        return articles

    def get_recent_news(self, limit: int = 20) -> list[dict]:
        """Get most recent news articles from database."""
        # Will be connected to DB in full implementation
        return self.collect_news()[:limit]

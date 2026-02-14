"""News scraper tool for CrewAI agents.

Crawls Korean financial news from:
- 매일경제 (Maeil Business)
- 한국경제 (Hankyung)
- 네이버 금융 (Naver Finance)
"""

from __future__ import annotations

from crewai.tools import BaseTool
from pydantic import Field
import httpx
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)


class NewsCrawlerTool(BaseTool):
    name: str = "news_crawler"
    description: str = (
        "한국 주요 경제 매체(매일경제, 한경, 네이버 금융)에서 최신 뉴스를 크롤링합니다. "
        "input으로 'economy', 'tech', 'stock' 등의 카테고리를 받습니다."
    )

    async def _arun(self, category: str = "economy") -> str:
        return self._run(category)

    def _run(self, category: str = "economy") -> str:
        articles = []
        articles.extend(self._crawl_naver_finance(category))
        articles.extend(self._crawl_maeil(category))
        articles.extend(self._crawl_hankyung(category))
        return str(articles)

    def _crawl_naver_finance(self, category: str) -> list[dict]:
        """Crawl Naver Finance news."""
        articles = []
        url = "https://finance.naver.com/news/mainnews.naver"
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            for item in soup.select("li.block1"):
                title_el = item.select_one("dd.articleSubject a")
                summary_el = item.select_one("dd.articleSummary")
                if title_el:
                    title = title_el.get_text(strip=True)
                    link = title_el.get("href", "")
                    if link and not link.startswith("http"):
                        link = f"https://finance.naver.com{link}"
                    summary = summary_el.get_text(strip=True) if summary_el else ""
                    articles.append({
                        "title": title,
                        "summary": summary[:200],
                        "url": link,
                        "source": "naver_finance",
                    })
        except Exception as e:
            logger.warning(f"Naver Finance crawl failed: {e}")
        return articles[:10]

    def _crawl_maeil(self, category: str) -> list[dict]:
        """Crawl Maeil Business Newspaper."""
        articles = []
        url = "https://www.mk.co.kr/news/stock/"
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            for item in soup.select("dt.tit a, h3.tit a")[:10]:
                title = item.get_text(strip=True)
                link = item.get("href", "")
                if link and not link.startswith("http"):
                    link = f"https://www.mk.co.kr{link}"
                articles.append({
                    "title": title,
                    "summary": "",
                    "url": link,
                    "source": "maeil",
                })
        except Exception as e:
            logger.warning(f"Maeil crawl failed: {e}")
        return articles[:10]

    def _crawl_hankyung(self, category: str) -> list[dict]:
        """Crawl Hankyung (한국경제)."""
        articles = []
        url = "https://www.hankyung.com/economy"
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            for item in soup.select("h3.tit a, .article-tit a")[:10]:
                title = item.get_text(strip=True)
                link = item.get("href", "")
                if link and not link.startswith("http"):
                    link = f"https://www.hankyung.com{link}"
                articles.append({
                    "title": title,
                    "summary": "",
                    "url": link,
                    "source": "hankyung",
                })
        except Exception as e:
            logger.warning(f"Hankyung crawl failed: {e}")
        return articles[:10]


class NaverFinanceScraperTool(BaseTool):
    name: str = "naver_finance_scraper"
    description: str = (
        "네이버 금융에서 특정 종목의 뉴스를 크롤링합니다. "
        "input으로 종목코드(예: '005930')를 받습니다."
    )

    def _run(self, ticker: str) -> str:
        articles = []
        url = f"https://finance.naver.com/item/news.naver?code={ticker}"
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            for row in soup.select("table.type5 tr"):
                title_el = row.select_one("td.title a")
                date_el = row.select_one("td.date")
                if title_el:
                    title = title_el.get_text(strip=True)
                    link = title_el.get("href", "")
                    if link and not link.startswith("http"):
                        link = f"https://finance.naver.com{link}"
                    date = date_el.get_text(strip=True) if date_el else ""
                    articles.append({
                        "title": title,
                        "url": link,
                        "date": date,
                        "source": "naver_finance",
                    })
        except Exception as e:
            logger.warning(f"Naver stock news crawl failed: {e}")
        return str(articles[:15])

"""Market screener service.

Fetches top stocks by volume and price change from:
- KR: Naver Finance (거래량 상위 + 상승률 상위)
- US: yfinance screener (most_actives + day_gainers)

Fallback to blue-chip lists when external sources fail.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Fallback blue-chip lists when scraping/API fails
KR_FALLBACK = [
    {"ticker": "005930", "name": "삼성전자", "market": "KOSPI", "source": "fallback"},
    {"ticker": "000660", "name": "SK하이닉스", "market": "KOSPI", "source": "fallback"},
    {"ticker": "035420", "name": "NAVER", "market": "KOSPI", "source": "fallback"},
    {"ticker": "035720", "name": "카카오", "market": "KOSPI", "source": "fallback"},
    {"ticker": "005380", "name": "현대차", "market": "KOSPI", "source": "fallback"},
    {"ticker": "006400", "name": "삼성SDI", "market": "KOSPI", "source": "fallback"},
    {"ticker": "051910", "name": "LG화학", "market": "KOSPI", "source": "fallback"},
    {"ticker": "003670", "name": "포스코퓨처엠", "market": "KOSPI", "source": "fallback"},
    {"ticker": "105560", "name": "KB금융", "market": "KOSPI", "source": "fallback"},
    {"ticker": "055550", "name": "신한지주", "market": "KOSPI", "source": "fallback"},
]

US_FALLBACK = [
    {"ticker": "AAPL", "name": "Apple", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "MSFT", "name": "Microsoft", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "GOOGL", "name": "Alphabet", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "AMZN", "name": "Amazon", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "NVDA", "name": "NVIDIA", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "META", "name": "Meta", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "TSLA", "name": "Tesla", "market": "NASDAQ", "source": "fallback"},
    {"ticker": "JPM", "name": "JPMorgan", "market": "NYSE", "source": "fallback"},
    {"ticker": "V", "name": "Visa", "market": "NYSE", "source": "fallback"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "market": "NYSE", "source": "fallback"},
]


class MarketScreener:
    """Screens stocks from market data sources (volume leaders, top movers)."""

    def get_kr_volume_leaders(self, limit: int = 10) -> list[dict]:
        """Fetch KR stocks with highest trading volume from Naver Finance."""
        results: list[dict] = []
        for sosok in (0, 1):  # 0=KOSPI, 1=KOSDAQ
            market_name = "KOSPI" if sosok == 0 else "KOSDAQ"
            url = f"https://finance.naver.com/sise/sise_quant.naver?sosok={sosok}"
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "lxml")

                for row in soup.select("table.type_2 tr"):
                    cols = row.select("td")
                    if len(cols) < 6:
                        continue
                    name_el = cols[1].select_one("a")
                    if not name_el:
                        continue

                    name = name_el.get_text(strip=True)
                    href = name_el.get("href", "")
                    # Extract ticker from href like /item/main.naver?code=005930
                    ticker = ""
                    if "code=" in href:
                        ticker = href.split("code=")[-1].split("&")[0]
                    if not ticker:
                        continue

                    price_text = cols[2].get_text(strip=True).replace(",", "")
                    volume_text = cols[5].get_text(strip=True).replace(",", "")

                    results.append({
                        "ticker": ticker,
                        "name": name,
                        "market": market_name,
                        "current_price": _safe_int(price_text),
                        "volume": _safe_int(volume_text),
                        "source": "naver_volume",
                    })

                    if len(results) >= limit:
                        break
            except Exception as e:
                logger.warning(f"Naver volume leaders crawl failed (sosok={sosok}): {e}")

            if len(results) >= limit:
                break

        return results[:limit]

    def get_kr_top_movers(self, limit: int = 10) -> list[dict]:
        """Fetch KR stocks with highest price increase from Naver Finance."""
        results: list[dict] = []
        for sosok in (0, 1):
            market_name = "KOSPI" if sosok == 0 else "KOSDAQ"
            url = f"https://finance.naver.com/sise/sise_rise.naver?sosok={sosok}"
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "lxml")

                for row in soup.select("table.type_2 tr"):
                    cols = row.select("td")
                    if len(cols) < 6:
                        continue
                    name_el = cols[1].select_one("a")
                    if not name_el:
                        continue

                    name = name_el.get_text(strip=True)
                    href = name_el.get("href", "")
                    ticker = ""
                    if "code=" in href:
                        ticker = href.split("code=")[-1].split("&")[0]
                    if not ticker:
                        continue

                    price_text = cols[2].get_text(strip=True).replace(",", "")
                    change_pct_text = cols[4].get_text(strip=True).replace("%", "").replace("+", "")

                    results.append({
                        "ticker": ticker,
                        "name": name,
                        "market": market_name,
                        "current_price": _safe_int(price_text),
                        "change_pct": _safe_float(change_pct_text),
                        "source": "naver_rise",
                    })

                    if len(results) >= limit:
                        break
            except Exception as e:
                logger.warning(f"Naver top movers crawl failed (sosok={sosok}): {e}")

            if len(results) >= limit:
                break

        return results[:limit]

    def get_us_market_movers(self, limit: int = 15) -> list[dict]:
        """Fetch US market movers via yfinance."""
        results: list[dict] = []
        try:
            import yfinance as yf

            for screen_key in ("most_actives", "day_gainers"):
                try:
                    resp = yf.screen(screen_key, count=limit)
                    quotes = resp.get("quotes", [])
                    for q in quotes:
                        ticker = q.get("symbol", "")
                        if not ticker or any(r["ticker"] == ticker for r in results):
                            continue
                        results.append({
                            "ticker": ticker,
                            "name": q.get("shortName", q.get("longName", ticker)),
                            "market": q.get("fullExchangeName", "NASDAQ"),
                            "current_price": q.get("regularMarketPrice", 0),
                            "change_pct": q.get("regularMarketChangePercent", 0),
                            "volume": q.get("regularMarketVolume", 0),
                            "source": f"yfinance_{screen_key}",
                        })
                        if len(results) >= limit:
                            break
                except Exception as e:
                    logger.warning(f"yfinance screener '{screen_key}' failed: {e}")

                if len(results) >= limit:
                    break
        except ImportError:
            logger.warning("yfinance not available for US screener")
        except Exception as e:
            logger.warning(f"US market movers failed: {e}")

        return results[:limit]

    def screen(self, market: str = "KR", limit: int = 15) -> list[dict]:
        """Screen stocks from market data sources with fallback.

        KR: Mix of volume leaders + top movers (deduped)
        US: yfinance screener
        """
        if market.upper() == "KR":
            return self._screen_kr(limit)
        else:
            return self._screen_us(limit)

    def _screen_kr(self, limit: int) -> list[dict]:
        seen: set[str] = set()
        results: list[dict] = []

        # Get both sources
        volume_stocks = self.get_kr_volume_leaders(limit=limit)
        mover_stocks = self.get_kr_top_movers(limit=limit)

        # Interleave: volume first, then movers, dedup by ticker
        for stock in volume_stocks:
            if stock["ticker"] not in seen:
                results.append(stock)
                seen.add(stock["ticker"])
        for stock in mover_stocks:
            if stock["ticker"] not in seen:
                results.append(stock)
                seen.add(stock["ticker"])

        # Fallback if scraping returned too few
        if len(results) < 3:
            logger.info("KR screener: using fallback blue-chip list")
            for stock in KR_FALLBACK:
                if stock["ticker"] not in seen:
                    results.append(stock)
                    seen.add(stock["ticker"])

        return results[:limit]

    def _screen_us(self, limit: int) -> list[dict]:
        results = self.get_us_market_movers(limit=limit)

        # Fallback if API returned too few
        if len(results) < 3:
            logger.info("US screener: using fallback blue-chip list")
            seen = {r["ticker"] for r in results}
            for stock in US_FALLBACK:
                if stock["ticker"] not in seen:
                    results.append(stock)
                    seen.add(stock["ticker"])

        return results[:limit]


def _safe_int(text: str) -> int:
    try:
        return int(text)
    except (ValueError, TypeError):
        return 0


def _safe_float(text: str) -> float:
    try:
        return float(text)
    except (ValueError, TypeError):
        return 0.0

"""Korean stock name resolver using Naver Finance."""

from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)

# In-memory cache: ticker -> Korean name
_name_cache: dict[str, str] = {}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


def _is_kr_ticker(ticker: str) -> bool:
    """6자리 숫자면 한국 종목코드."""
    return bool(re.fullmatch(r"\d{6}", ticker))


def resolve_kr_name(ticker: str) -> str:
    """네이버 금융에서 한글 종목명 조회 (캐시 적용).

    Returns ticker itself if lookup fails.
    """
    if not _is_kr_ticker(ticker):
        return ticker

    if ticker in _name_cache:
        return _name_cache[ticker]

    try:
        url = f"https://finance.naver.com/item/main.naver?code={ticker}"
        resp = httpx.get(url, headers=HEADERS, timeout=5, follow_redirects=True)
        resp.raise_for_status()

        # Extract name from <title>종목명 : 네이버 금융</title>
        match = re.search(r"<title>\s*(.+?)\s*:", resp.text)
        if match:
            name = match.group(1).strip()
            if name and name != ticker:
                _name_cache[ticker] = name
                return name
    except Exception as e:
        logger.debug(f"Naver name lookup failed for {ticker}: {e}")

    _name_cache[ticker] = ticker
    return ticker


def resolve_names_bulk(tickers: list[str]) -> dict[str, str]:
    """여러 종목의 한글명을 한 번에 조회."""
    result: dict[str, str] = {}
    for ticker in tickers:
        result[ticker] = resolve_kr_name(ticker)
    return result

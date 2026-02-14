"""Stock mapper tool - maps keywords to stock tickers.

Maps Korean/English keywords to relevant stock tickers on
KOSPI/KOSDAQ/NYSE/NASDAQ markets.
"""

from __future__ import annotations

import json
import logging

from crewai.tools import BaseTool

logger = logging.getLogger(__name__)

# Common keyword-to-ticker mappings
KEYWORD_TICKER_MAP = {
    # Korean companies
    "삼성전자": {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    "삼성": {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    "SK하이닉스": {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
    "하이닉스": {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
    "LG에너지솔루션": {"ticker": "373220", "market": "KOSPI", "name": "LG에너지솔루션"},
    "네이버": {"ticker": "035420", "market": "KOSPI", "name": "NAVER"},
    "카카오": {"ticker": "035720", "market": "KOSPI", "name": "카카오"},
    "현대차": {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
    "현대자동차": {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
    "기아": {"ticker": "000270", "market": "KOSPI", "name": "기아"},
    "셀트리온": {"ticker": "068270", "market": "KOSPI", "name": "셀트리온"},
    "포스코": {"ticker": "005490", "market": "KOSPI", "name": "POSCO홀딩스"},
    "LG화학": {"ticker": "051910", "market": "KOSPI", "name": "LG화학"},
    "삼성바이오로직스": {"ticker": "207940", "market": "KOSPI", "name": "삼성바이오로직스"},
    "삼성SDI": {"ticker": "006400", "market": "KOSPI", "name": "삼성SDI"},
    "크래프톤": {"ticker": "259960", "market": "KOSPI", "name": "크래프톤"},
    "에코프로비엠": {"ticker": "247540", "market": "KOSDAQ", "name": "에코프로비엠"},
    "에코프로": {"ticker": "086520", "market": "KOSDAQ", "name": "에코프로"},
    # Sector keywords
    "반도체": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
        {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
    ],
    "2차전지": [
        {"ticker": "373220", "market": "KOSPI", "name": "LG에너지솔루션"},
        {"ticker": "006400", "market": "KOSPI", "name": "삼성SDI"},
        {"ticker": "247540", "market": "KOSDAQ", "name": "에코프로비엠"},
    ],
    "자동차": [
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
        {"ticker": "000270", "market": "KOSPI", "name": "기아"},
    ],
    "바이오": [
        {"ticker": "068270", "market": "KOSPI", "name": "셀트리온"},
        {"ticker": "207940", "market": "KOSPI", "name": "삼성바이오로직스"},
    ],
    "AI": [
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
        {"ticker": "GOOGL", "market": "NASDAQ", "name": "Alphabet"},
    ],
    "인공지능": [
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
    ],
    # US companies
    "애플": {"ticker": "AAPL", "market": "NASDAQ", "name": "Apple"},
    "apple": {"ticker": "AAPL", "market": "NASDAQ", "name": "Apple"},
    "테슬라": {"ticker": "TSLA", "market": "NASDAQ", "name": "Tesla"},
    "tesla": {"ticker": "TSLA", "market": "NASDAQ", "name": "Tesla"},
    "엔비디아": {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
    "nvidia": {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
    "마이크로소프트": {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
    "microsoft": {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
    "구글": {"ticker": "GOOGL", "market": "NASDAQ", "name": "Alphabet"},
    "아마존": {"ticker": "AMZN", "market": "NASDAQ", "name": "Amazon"},
    "메타": {"ticker": "META", "market": "NASDAQ", "name": "Meta Platforms"},
}


class StockMapperTool(BaseTool):
    name: str = "stock_mapper"
    description: str = (
        "키워드를 주식 종목 티커로 매핑합니다. "
        "input으로 쉼표로 구분된 키워드 목록을 받습니다. "
        "예: '삼성전자,반도체,AI'"
    )

    def _run(self, keywords_str: str) -> str:
        keywords = [k.strip() for k in keywords_str.split(",")]
        results = []
        seen_tickers = set()

        for kw in keywords:
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

        return json.dumps(results, ensure_ascii=False)

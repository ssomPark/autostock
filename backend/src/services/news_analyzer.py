"""News analyzer - maps articles to related stocks and performs sentiment analysis."""

from __future__ import annotations

import logging

from src.tools.stock_mapper import KEYWORD_TICKER_MAP

logger = logging.getLogger(__name__)

# 호재 키워드
POSITIVE_KEYWORDS = [
    "급등", "상승", "호재", "흑자", "성장", "신고가", "최고", "돌파",
    "수혜", "기대", "호실적", "증가", "확대", "개선", "반등", "매수",
    "상향", "수주", "계약",
]

# 악재 키워드
NEGATIVE_KEYWORDS = [
    "급락", "하락", "악재", "적자", "감소", "신저가", "최저", "폭락",
    "우려", "리스크", "부진", "위축", "하향", "매도", "손실", "제재",
    "규제", "소송",
]

# 뉴스 토픽 → 관련 종목 확장 매핑 (KEYWORD_TICKER_MAP 보완)
NEWS_TOPIC_MAP: dict[str, list[dict]] = {
    # 금융/증시 테마
    "IPO": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    ],
    "공모주": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    ],
    "배당": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
    ],
    "금리": [
        {"ticker": "105560", "market": "KOSPI", "name": "KB금융"},
        {"ticker": "055550", "market": "KOSPI", "name": "신한지주"},
        {"ticker": "086790", "market": "KOSPI", "name": "하나금융지주"},
    ],
    "은행": [
        {"ticker": "105560", "market": "KOSPI", "name": "KB금융"},
        {"ticker": "055550", "market": "KOSPI", "name": "신한지주"},
        {"ticker": "086790", "market": "KOSPI", "name": "하나금융지주"},
    ],
    "환율": [
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
        {"ticker": "000270", "market": "KOSPI", "name": "기아"},
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    ],
    "수출": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
        {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
    ],
    # 산업 테마
    "전기차": [
        {"ticker": "373220", "market": "KOSPI", "name": "LG에너지솔루션"},
        {"ticker": "006400", "market": "KOSPI", "name": "삼성SDI"},
        {"ticker": "051910", "market": "KOSPI", "name": "LG화학"},
        {"ticker": "TSLA", "market": "NASDAQ", "name": "Tesla"},
    ],
    "배터리": [
        {"ticker": "373220", "market": "KOSPI", "name": "LG에너지솔루션"},
        {"ticker": "006400", "market": "KOSPI", "name": "삼성SDI"},
        {"ticker": "247540", "market": "KOSDAQ", "name": "에코프로비엠"},
    ],
    "HBM": [
        {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    ],
    "GPU": [
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
        {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
    ],
    "데이터센터": [
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
        {"ticker": "AMZN", "market": "NASDAQ", "name": "Amazon"},
    ],
    "클라우드": [
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
        {"ticker": "AMZN", "market": "NASDAQ", "name": "Amazon"},
        {"ticker": "GOOGL", "market": "NASDAQ", "name": "Alphabet"},
        {"ticker": "035420", "market": "KOSPI", "name": "NAVER"},
    ],
    "게임": [
        {"ticker": "259960", "market": "KOSPI", "name": "크래프톤"},
        {"ticker": "035420", "market": "KOSPI", "name": "NAVER"},
        {"ticker": "035720", "market": "KOSPI", "name": "카카오"},
    ],
    "플랫폼": [
        {"ticker": "035420", "market": "KOSPI", "name": "NAVER"},
        {"ticker": "035720", "market": "KOSPI", "name": "카카오"},
        {"ticker": "META", "market": "NASDAQ", "name": "Meta Platforms"},
    ],
    "제약": [
        {"ticker": "068270", "market": "KOSPI", "name": "셀트리온"},
        {"ticker": "207940", "market": "KOSPI", "name": "삼성바이오로직스"},
    ],
    "신약": [
        {"ticker": "068270", "market": "KOSPI", "name": "셀트리온"},
        {"ticker": "207940", "market": "KOSPI", "name": "삼성바이오로직스"},
    ],
    "조선": [
        {"ticker": "009540", "market": "KOSPI", "name": "HD한국조선해양"},
        {"ticker": "042660", "market": "KOSPI", "name": "한화오션"},
    ],
    "방산": [
        {"ticker": "012450", "market": "KOSPI", "name": "한화에어로스페이스"},
        {"ticker": "047810", "market": "KOSPI", "name": "한국항공우주"},
    ],
    "원전": [
        {"ticker": "009830", "market": "KOSPI", "name": "한화솔루션"},
        {"ticker": "034020", "market": "KOSPI", "name": "두산에너빌리티"},
    ],
    "원자력": [
        {"ticker": "034020", "market": "KOSPI", "name": "두산에너빌리티"},
    ],
    "로봇": [
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
        {"ticker": "TSLA", "market": "NASDAQ", "name": "Tesla"},
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
    ],
    "자율주행": [
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
        {"ticker": "TSLA", "market": "NASDAQ", "name": "Tesla"},
        {"ticker": "GOOGL", "market": "NASDAQ", "name": "Alphabet"},
    ],
    "철강": [
        {"ticker": "005490", "market": "KOSPI", "name": "POSCO홀딩스"},
    ],
    "유가": [
        {"ticker": "010950", "market": "KOSPI", "name": "S-Oil"},
    ],
    "정유": [
        {"ticker": "010950", "market": "KOSPI", "name": "S-Oil"},
    ],
    "엔터": [
        {"ticker": "352820", "market": "KOSPI", "name": "하이브"},
    ],
    "K-POP": [
        {"ticker": "352820", "market": "KOSPI", "name": "하이브"},
    ],
    "코스피": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
        {"ticker": "000660", "market": "KOSPI", "name": "SK하이닉스"},
        {"ticker": "005380", "market": "KOSPI", "name": "현대자동차"},
    ],
    "코스닥": [
        {"ticker": "247540", "market": "KOSDAQ", "name": "에코프로비엠"},
        {"ticker": "086520", "market": "KOSDAQ", "name": "에코프로"},
    ],
    "나스닥": [
        {"ticker": "AAPL", "market": "NASDAQ", "name": "Apple"},
        {"ticker": "NVDA", "market": "NASDAQ", "name": "NVIDIA"},
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
    ],
    "S&P": [
        {"ticker": "AAPL", "market": "NASDAQ", "name": "Apple"},
        {"ticker": "MSFT", "market": "NASDAQ", "name": "Microsoft"},
    ],
    "크립토": [
        {"ticker": "COIN", "market": "NASDAQ", "name": "Coinbase"},
    ],
    "비트코인": [
        {"ticker": "COIN", "market": "NASDAQ", "name": "Coinbase"},
    ],
    "ETF": [
        {"ticker": "005930", "market": "KOSPI", "name": "삼성전자"},
    ],
}


class NewsAnalyzer:
    """Rule-based news analyzer: keyword matching for stock mapping + sentiment."""

    def __init__(self):
        # KEYWORD_TICKER_MAP + NEWS_TOPIC_MAP 통합
        self._combined_map: dict[str, list[dict]] = {}
        for keyword, mapping in KEYWORD_TICKER_MAP.items():
            self._combined_map[keyword] = mapping if isinstance(mapping, list) else [mapping]
        for keyword, stocks in NEWS_TOPIC_MAP.items():
            if keyword in self._combined_map:
                # 기존 매핑에 중복 없이 추가
                existing_tickers = {s["ticker"] for s in self._combined_map[keyword]}
                for s in stocks:
                    if s["ticker"] not in existing_tickers:
                        self._combined_map[keyword].append(s)
                        existing_tickers.add(s["ticker"])
            else:
                self._combined_map[keyword] = stocks

    def analyze_article(self, title: str, summary: str) -> dict:
        """Analyze a single article for related stocks and sentiment.

        Returns dict with related_stocks, sentiment, sentiment_score.
        """
        related_stocks = self._find_related_stocks(title, summary)
        sentiment, sentiment_score = self._analyze_sentiment(title, summary)
        return {
            "related_stocks": related_stocks,
            "sentiment": sentiment,
            "sentiment_score": sentiment_score,
        }

    def _find_related_stocks(self, title: str, summary: str) -> list[dict]:
        """Find related stocks from combined keyword maps."""
        seen_tickers: set[str] = set()
        results: list[dict] = []
        text = f"{title} {summary}"

        for keyword, entries in self._combined_map.items():
            if keyword in text:
                for entry in entries:
                    if entry["ticker"] not in seen_tickers:
                        results.append({
                            "ticker": entry["ticker"],
                            "name": entry["name"],
                            "market": entry["market"],
                        })
                        seen_tickers.add(entry["ticker"])

        return results

    def _analyze_sentiment(self, title: str, summary: str) -> tuple[str, float]:
        """Analyze sentiment using keyword pattern matching.

        Title matches get 2x weight, summary matches get 1x weight.
        Returns (sentiment_label, sentiment_score).
        """
        pos_score = 0.0
        neg_score = 0.0

        for kw in POSITIVE_KEYWORDS:
            if kw in title:
                pos_score += 2.0
            if kw in summary:
                pos_score += 1.0

        for kw in NEGATIVE_KEYWORDS:
            if kw in title:
                neg_score += 2.0
            if kw in summary:
                neg_score += 1.0

        total = pos_score + neg_score
        if total == 0:
            return "neutral", 0.0

        raw_score = (pos_score - neg_score) / total  # -1.0 ~ 1.0

        if raw_score > 0.1:
            sentiment = "positive"
        elif raw_score < -0.1:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        return sentiment, round(raw_score, 2)

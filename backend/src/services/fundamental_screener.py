"""Fundamental value screener — finds undervalued, financially healthy stocks.

Runs independently of the news pipeline. Scans a broad stock universe
and scores each on Value, Quality, and Growth dimensions using yfinance data.
"""

from __future__ import annotations

import logging
import time

import yfinance as yf

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stock universe (extended blue-chip + mid-cap lists for scanning)
# ---------------------------------------------------------------------------

KR_UNIVERSE = [
    # KOSPI 대형
    ("005930", "삼성전자", "KOSPI"),
    ("000660", "SK하이닉스", "KOSPI"),
    ("035420", "NAVER", "KOSPI"),
    ("035720", "카카오", "KOSPI"),
    ("005380", "현대차", "KOSPI"),
    ("006400", "삼성SDI", "KOSPI"),
    ("051910", "LG화학", "KOSPI"),
    ("003670", "포스코퓨처엠", "KOSPI"),
    ("105560", "KB금융", "KOSPI"),
    ("055550", "신한지주", "KOSPI"),
    ("066570", "LG전자", "KOSPI"),
    ("000270", "기아", "KOSPI"),
    ("012330", "현대모비스", "KOSPI"),
    ("096770", "SK이노베이션", "KOSPI"),
    ("034730", "SK", "KOSPI"),
    ("003550", "LG", "KOSPI"),
    ("032830", "삼성생명", "KOSPI"),
    ("030200", "KT", "KOSPI"),
    ("017670", "SK텔레콤", "KOSPI"),
    ("086790", "하나금융지주", "KOSPI"),
    ("015760", "한국전력", "KOSPI"),
    ("009150", "삼성전기", "KOSPI"),
    ("028260", "삼성물산", "KOSPI"),
    ("033780", "KT&G", "KOSPI"),
    ("010130", "고려아연", "KOSPI"),
    ("036570", "엔씨소프트", "KOSPI"),
    ("004020", "현대제철", "KOSPI"),
    ("000810", "삼성화재", "KOSPI"),
    ("051900", "LG생활건강", "KOSPI"),
    ("090430", "아모레퍼시픽", "KOSPI"),
    # KOSDAQ 중대형
    ("247540", "에코프로비엠", "KOSDAQ"),
    ("086520", "에코프로", "KOSDAQ"),
    ("403870", "HPSP", "KOSDAQ"),
    ("196170", "알테오젠", "KOSDAQ"),
    ("058470", "리노공업", "KOSDAQ"),
    ("041510", "에스엠", "KOSDAQ"),
    ("293490", "카카오게임즈", "KOSDAQ"),
    ("263750", "펄어비스", "KOSDAQ"),
    ("112040", "위메이드", "KOSDAQ"),
    ("035900", "JYP Ent.", "KOSDAQ"),
]

US_UNIVERSE = [
    ("AAPL", "Apple", "NASDAQ"), ("MSFT", "Microsoft", "NASDAQ"),
    ("GOOGL", "Alphabet", "NASDAQ"), ("AMZN", "Amazon", "NASDAQ"),
    ("NVDA", "NVIDIA", "NASDAQ"), ("META", "Meta", "NASDAQ"),
    ("TSLA", "Tesla", "NASDAQ"), ("JPM", "JPMorgan", "NYSE"),
    ("V", "Visa", "NYSE"), ("JNJ", "Johnson & Johnson", "NYSE"),
    ("WMT", "Walmart", "NYSE"), ("PG", "Procter & Gamble", "NYSE"),
    ("UNH", "UnitedHealth", "NYSE"), ("HD", "Home Depot", "NYSE"),
    ("MA", "Mastercard", "NYSE"), ("DIS", "Disney", "NYSE"),
    ("BAC", "Bank of America", "NYSE"), ("ADBE", "Adobe", "NASDAQ"),
    ("CRM", "Salesforce", "NYSE"), ("NFLX", "Netflix", "NASDAQ"),
    ("PFE", "Pfizer", "NYSE"), ("INTC", "Intel", "NASDAQ"),
    ("CSCO", "Cisco", "NASDAQ"), ("ABT", "Abbott", "NYSE"),
    ("NKE", "Nike", "NYSE"), ("AMD", "AMD", "NASDAQ"),
    ("QCOM", "Qualcomm", "NASDAQ"), ("T", "AT&T", "NYSE"),
    ("LOW", "Lowe's", "NYSE"), ("PYPL", "PayPal", "NASDAQ"),
    ("BABA", "Alibaba", "NYSE"), ("SQ", "Block", "NYSE"),
    ("SHOP", "Shopify", "NYSE"), ("SNAP", "Snap", "NYSE"),
    ("UBER", "Uber", "NYSE"), ("ABNB", "Airbnb", "NASDAQ"),
    ("COIN", "Coinbase", "NASDAQ"), ("PLTR", "Palantir", "NASDAQ"),
    ("SOFI", "SoFi", "NASDAQ"), ("RIVN", "Rivian", "NASDAQ"),
]


class FundamentalScreener:
    """Scans stocks for fundamental strength independently of news."""

    # Rate limiting: delay between yfinance calls (seconds)
    RATE_DELAY = 0.5

    def _yf_ticker(self, ticker: str, market: str) -> str:
        """Convert to yfinance ticker format."""
        if market == "KOSPI":
            return f"{ticker}.KS"
        if market == "KOSDAQ":
            return f"{ticker}.KQ"
        return ticker

    def score_fundamentals(self, ticker: str, name: str, market: str) -> dict | None:
        """Score a single stock on Value, Quality, Growth dimensions.

        Returns dict with fundamental_score (0-100), category, metrics, or None on failure.
        """
        yf_sym = self._yf_ticker(ticker, market)
        try:
            info = yf.Ticker(yf_sym).info or {}
        except Exception as e:
            logger.debug(f"yfinance info failed for {ticker}: {e}")
            return None

        if not info.get("regularMarketPrice") and not info.get("currentPrice"):
            return None

        per = info.get("trailingPE")
        forward_pe = info.get("forwardPE")
        pbr = info.get("priceToBook")
        roe = info.get("returnOnEquity")
        debt_eq = info.get("debtToEquity")
        earnings_growth = info.get("earningsGrowth")
        revenue_growth = info.get("revenueGrowth")
        op_margin = info.get("operatingMargins")
        high_52w = info.get("fiftyTwoWeekHigh")
        current = info.get("currentPrice") or info.get("regularMarketPrice") or 0
        market_cap = info.get("marketCap")
        dividend_yield = info.get("dividendYield")

        # --- Value score (0~1) ---
        value_score = self._compute_value(per, pbr, high_52w, current, forward_pe)

        # --- Quality score (0~1) ---
        quality_score = self._compute_quality(roe, debt_eq, op_margin)

        # --- Growth score (0~1) ---
        growth_score = self._compute_growth(earnings_growth, revenue_growth)

        # Weighted composite: 0~100
        fundamental_score = value_score * 35 + quality_score * 35 + growth_score * 30

        # Determine primary category
        scores = {"value": value_score, "quality": quality_score, "growth": growth_score}
        top = max(scores, key=scores.get)  # type: ignore
        if max(scores.values()) - min(scores.values()) < 0.15:
            category = "balanced"
        else:
            category = top

        # Pass filter: at least one dimension must be strong
        pass_filter = (
            (value_score >= 0.40)
            or (quality_score >= 0.45)
            or (growth_score >= 0.45)
            or (fundamental_score >= 45)
        )

        return {
            "ticker": ticker,
            "name": info.get("shortName") or info.get("longName") or name,
            "market": market,
            "fundamental_score": round(fundamental_score, 1),
            "category": category,
            "pass_filter": pass_filter,
            "metrics": {
                "per": _safe_round(per),
                "forward_pe": _safe_round(forward_pe),
                "pbr": _safe_round(pbr),
                "roe": _safe_round(roe, 4),
                "debt_to_equity": _safe_round(debt_eq),
                "earnings_growth": _safe_round(earnings_growth, 4),
                "revenue_growth": _safe_round(revenue_growth, 4),
                "operating_margin": _safe_round(op_margin, 4),
                "52w_high": _safe_round(high_52w),
                "52w_discount": round((high_52w - current) / high_52w, 4) if high_52w and current and high_52w > 0 else None,
                "current_price": round(current, 2) if current else 0,
                "market_cap": market_cap,
                "dividend_yield": _safe_round(dividend_yield, 4),
            },
            "signals": {
                "value_score": round(value_score, 4),
                "quality_score": round(quality_score, 4),
                "growth_score": round(growth_score, 4),
            },
        }

    def screen(self, market: str = "KR", limit: int = 20) -> list[dict]:
        """Screen full stock universe and return top fundamentally strong stocks."""
        universe = KR_UNIVERSE if market.upper() == "KR" else US_UNIVERSE
        logger.info(f"[FundamentalScreener] Scanning {len(universe)} {market} stocks...")

        results: list[dict] = []
        for ticker, name, mkt in universe:
            try:
                score = self.score_fundamentals(ticker, name, mkt)
                if score and score["pass_filter"]:
                    results.append(score)
                    logger.debug(
                        f"  {ticker} ({name}): score={score['fundamental_score']:.1f} "
                        f"cat={score['category']}"
                    )
            except Exception as e:
                logger.warning(f"  {ticker} scan failed: {e}")

            time.sleep(self.RATE_DELAY)

        # Sort by fundamental_score descending
        results.sort(key=lambda x: x["fundamental_score"], reverse=True)
        logger.info(
            f"[FundamentalScreener] {market} scan done: "
            f"{len(results)}/{len(universe)} passed filter"
        )
        return results[:limit]

    # ------------------------------------------------------------------
    # Score computation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_value(
        per: float | None,
        pbr: float | None,
        high_52w: float | None,
        current: float,
        forward_pe: float | None,
    ) -> float:
        """Value dimension: low PER, low PBR, 52w discount. Returns 0~1."""
        parts: list[float] = []

        if per is not None and per > 0:
            if per <= 8:
                parts.append(1.0)
            elif per <= 12:
                parts.append(0.7)
            elif per <= 15:
                parts.append(0.4)
            elif per <= 25:
                parts.append(0.1)
            else:
                parts.append(0.0)

        if pbr is not None and pbr > 0:
            if pbr <= 0.5:
                parts.append(1.0)
            elif pbr <= 0.8:
                parts.append(0.7)
            elif pbr <= 1.0:
                parts.append(0.5)
            elif pbr <= 1.5:
                parts.append(0.2)
            else:
                parts.append(0.0)

        if high_52w and current and high_52w > 0:
            discount = (high_52w - current) / high_52w
            if discount >= 0.30:
                parts.append(1.0)
            elif discount >= 0.20:
                parts.append(0.7)
            elif discount >= 0.10:
                parts.append(0.4)
            else:
                parts.append(0.1)

        if forward_pe is not None and forward_pe > 0:
            if forward_pe <= 10:
                parts.append(0.9)
            elif forward_pe <= 15:
                parts.append(0.5)
            elif forward_pe <= 20:
                parts.append(0.2)
            else:
                parts.append(0.0)

        return sum(parts) / len(parts) if parts else 0.0

    @staticmethod
    def _compute_quality(
        roe: float | None,
        debt_eq: float | None,
        op_margin: float | None,
    ) -> float:
        """Quality dimension: high ROE, low debt, good margins. Returns 0~1."""
        parts: list[float] = []

        if roe is not None:
            if roe >= 0.25:
                parts.append(1.0)
            elif roe >= 0.15:
                parts.append(0.7)
            elif roe >= 0.10:
                parts.append(0.4)
            elif roe >= 0.05:
                parts.append(0.2)
            else:
                parts.append(0.0)

        if debt_eq is not None:
            # debt_to_equity is in percentage in yfinance (e.g., 50 = 50%)
            ratio = debt_eq / 100 if debt_eq > 5 else debt_eq
            if ratio <= 0.3:
                parts.append(1.0)
            elif ratio <= 0.5:
                parts.append(0.7)
            elif ratio <= 1.0:
                parts.append(0.4)
            elif ratio <= 2.0:
                parts.append(0.1)
            else:
                parts.append(0.0)

        if op_margin is not None:
            if op_margin >= 0.25:
                parts.append(1.0)
            elif op_margin >= 0.15:
                parts.append(0.7)
            elif op_margin >= 0.10:
                parts.append(0.4)
            elif op_margin >= 0.05:
                parts.append(0.2)
            else:
                parts.append(0.0)

        return sum(parts) / len(parts) if parts else 0.0

    @staticmethod
    def _compute_growth(
        earnings_growth: float | None,
        revenue_growth: float | None,
    ) -> float:
        """Growth dimension: earnings & revenue growth. Returns 0~1."""
        parts: list[float] = []

        if earnings_growth is not None:
            if earnings_growth >= 0.30:
                parts.append(1.0)
            elif earnings_growth >= 0.15:
                parts.append(0.7)
            elif earnings_growth >= 0.05:
                parts.append(0.4)
            elif earnings_growth >= 0.0:
                parts.append(0.2)
            else:
                parts.append(0.0)

        if revenue_growth is not None:
            if revenue_growth >= 0.20:
                parts.append(1.0)
            elif revenue_growth >= 0.10:
                parts.append(0.7)
            elif revenue_growth >= 0.05:
                parts.append(0.4)
            elif revenue_growth >= 0.0:
                parts.append(0.2)
            else:
                parts.append(0.0)

        return sum(parts) / len(parts) if parts else 0.0


def _safe_round(val: float | None, digits: int = 2) -> float | None:
    if val is None:
        return None
    return round(val, digits)

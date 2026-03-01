"""Market data service - manages stock data retrieval and caching."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime

import pandas as pd
import yfinance as yf

from src.tools.korean_stock_api import KoreanStockAPITool
from src.tools.us_stock_api import USStockAPITool

logger = logging.getLogger(__name__)

# --- USD/KRW exchange rate (5-min cache) ---
_fx_cache: dict[str, float] = {}
_fx_cache_time: dict[str, float] = {}


def get_usd_krw_rate() -> float:
    """USD/KRW 환율 조회 (5분 캐시)."""
    now = time.time()
    if "USDKRW" in _fx_cache_time and now - _fx_cache_time["USDKRW"] < 300:
        return _fx_cache["USDKRW"]
    try:
        rate = float(yf.Ticker("USDKRW=X").history(period="1d")["Close"].iloc[-1])
    except Exception:
        rate = _fx_cache.get("USDKRW", 1350.0)
    _fx_cache["USDKRW"] = rate
    _fx_cache_time["USDKRW"] = now
    return rate


class MarketDataService:
    """Service for retrieving and caching market data."""

    def __init__(self):
        self.kr_api = KoreanStockAPITool()
        self.us_api = USStockAPITool()

    def get_ohlcv(self, ticker: str, market: str = "KOSPI", period: str = "3mo") -> pd.DataFrame:
        """Get OHLCV data as DataFrame."""
        if market in ("KOSPI", "KOSDAQ"):
            result = self.kr_api._run(json.dumps({"ticker": ticker, "action": "ohlcv", "period": "D"}))
        else:
            result = self.us_api._run(json.dumps({"ticker": ticker, "action": "ohlcv", "period": period}))

        try:
            data = json.loads(result) if isinstance(result, str) else result
            # KIS 에러 응답이면 yfinance fallback
            if isinstance(data, dict) and data.get("error"):
                return self._yfinance_ohlcv_fallback(ticker, market)
            if isinstance(data, list) and len(data) == 0:
                return self._yfinance_ohlcv_fallback(ticker, market)
            df = pd.DataFrame(data)
            if df.empty:
                return self._yfinance_ohlcv_fallback(ticker, market)
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"])
                df.set_index("date", inplace=True)
                df.sort_index(inplace=True)
            return df
        except Exception as e:
            logger.error(f"Failed to get OHLCV for {ticker}: {e}")
            return self._yfinance_ohlcv_fallback(ticker, market)

    def get_current_price(self, ticker: str, market: str = "KOSPI") -> dict:
        """Get current price info. Falls back to yfinance if KIS API fails."""
        if market in ("KOSPI", "KOSDAQ"):
            result = self.kr_api._run(json.dumps({"ticker": ticker, "action": "price"}))
        else:
            result = self.us_api._run(json.dumps({"ticker": ticker, "action": "price"}))

        try:
            data = json.loads(result) if isinstance(result, str) else result
        except Exception as e:
            logger.error(f"Failed to parse price for {ticker}: {e}")
            data = {"ticker": ticker, "current_price": 0}

        # Fallback to yfinance if primary API returned error or zero price
        if data.get("error") or not data.get("current_price"):
            data = self._yfinance_price_fallback(ticker, market, data)

        return data

    def _yfinance_ohlcv_fallback(self, ticker: str, market: str) -> pd.DataFrame:
        """yfinance로 OHLCV 데이터 조회 fallback."""
        try:
            yf_ticker = ticker
            if ticker.isdigit():
                suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
                yf_ticker = f"{ticker}{suffix}"
            df = yf.Ticker(yf_ticker).history(period="3mo")
            if not df.empty:
                df.columns = [c.lower() for c in df.columns]
                df.drop(columns=["stock splits", "dividends"], errors="ignore", inplace=True)
                df.index = pd.to_datetime(df.index).tz_localize(None)
                logger.info(f"yfinance OHLCV fallback success for {ticker}: {len(df)} rows")
                return df
        except Exception as e:
            logger.warning(f"yfinance OHLCV fallback failed for {ticker}: {e}")
        return pd.DataFrame()

    def _yfinance_price_fallback(
        self, ticker: str, market: str, original: dict
    ) -> dict:
        """Fetch current price from yfinance as fallback."""
        suffix = ".KS" if market == "KOSPI" else ".KQ" if market == "KOSDAQ" else ""
        yf_ticker = f"{ticker}{suffix}"
        try:
            info = yf.Ticker(yf_ticker).info
            price = info.get("regularMarketPrice") or info.get("currentPrice") or 0
            if price:
                logger.info(f"yfinance fallback success for {ticker}: {price}")
                return {
                    "ticker": ticker,
                    "current_price": float(price),
                    "change": float(info.get("regularMarketChange", 0)),
                    "change_pct": float(info.get("regularMarketChangePercent", 0)),
                    "volume": int(info.get("regularMarketVolume", 0)),
                    "high": float(info.get("regularMarketDayHigh", 0)),
                    "low": float(info.get("regularMarketDayLow", 0)),
                }
        except Exception as e:
            logger.warning(f"yfinance fallback also failed for {ticker}: {e}")
        return original

    def get_stock_info(self, ticker: str, market: str = "KOSPI") -> dict:
        """Get stock info."""
        if market in ("KOSPI", "KOSDAQ"):
            result = self.kr_api._run(json.dumps({"ticker": ticker, "action": "info"}))
        else:
            result = self.us_api._run(json.dumps({"ticker": ticker, "action": "info"}))

        try:
            return json.loads(result) if isinstance(result, str) else result
        except Exception as e:
            logger.error(f"Failed to get info for {ticker}: {e}")
            return {"ticker": ticker}

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
            data = json.loads(result) if isinstance(result, str) else eval(result)
            df = pd.DataFrame(data)
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"])
                df.set_index("date", inplace=True)
                df.sort_index(inplace=True)
            return df
        except Exception as e:
            logger.error(f"Failed to get OHLCV for {ticker}: {e}")
            return pd.DataFrame()

    def get_current_price(self, ticker: str, market: str = "KOSPI") -> dict:
        """Get current price info."""
        if market in ("KOSPI", "KOSDAQ"):
            result = self.kr_api._run(json.dumps({"ticker": ticker, "action": "price"}))
        else:
            result = self.us_api._run(json.dumps({"ticker": ticker, "action": "price"}))

        try:
            return json.loads(result) if isinstance(result, str) else eval(result)
        except Exception as e:
            logger.error(f"Failed to get price for {ticker}: {e}")
            return {"ticker": ticker, "current_price": 0}

    def get_stock_info(self, ticker: str, market: str = "KOSPI") -> dict:
        """Get stock info."""
        if market in ("KOSPI", "KOSDAQ"):
            result = self.kr_api._run(json.dumps({"ticker": ticker, "action": "info"}))
        else:
            result = self.us_api._run(json.dumps({"ticker": ticker, "action": "info"}))

        try:
            return json.loads(result) if isinstance(result, str) else eval(result)
        except Exception as e:
            logger.error(f"Failed to get info for {ticker}: {e}")
            return {"ticker": ticker}

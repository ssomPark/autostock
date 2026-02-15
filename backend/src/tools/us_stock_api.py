"""US stock API tool using yfinance.

Wraps yfinance for US market data (NYSE/NASDAQ).
"""

from __future__ import annotations

import json
import logging

import yfinance as yf
from crewai.tools import BaseTool

logger = logging.getLogger(__name__)


class USStockAPITool(BaseTool):
    name: str = "us_stock_api"
    description: str = (
        "yfinance를 사용하여 미국 주식 데이터를 조회합니다. "
        "input으로 티커와 조회 유형을 JSON으로 받습니다. "
        '예: {"ticker": "AAPL", "action": "price"} 또는 {"ticker": "AAPL", "action": "ohlcv", "period": "3mo"}'
    )

    def _run(self, input_str: str) -> str:
        try:
            params = json.loads(input_str)
        except json.JSONDecodeError:
            params = {"ticker": input_str, "action": "price"}

        ticker = params.get("ticker", "")
        action = params.get("action", "price")

        try:
            stock = yf.Ticker(ticker)
            if action == "price":
                return json.dumps(self._get_price(stock, ticker), default=str)
            elif action == "ohlcv":
                period = params.get("period", "3mo")
                return json.dumps(self._get_ohlcv(stock, period), default=str)
            elif action == "info":
                return json.dumps(self._get_info(stock, ticker), default=str)
            else:
                return json.dumps({"error": f"Unknown action: {action}"})
        except Exception as e:
            logger.error(f"yfinance error for {ticker}: {e}")
            return json.dumps({"error": str(e)})

    def _get_price(self, stock: yf.Ticker, ticker: str) -> dict:
        """Get current price info."""
        info = stock.info
        return {
            "ticker": ticker,
            "current_price": info.get("currentPrice") or info.get("regularMarketPrice", 0),
            "change": info.get("regularMarketChange", 0),
            "change_pct": info.get("regularMarketChangePercent", 0),
            "volume": info.get("regularMarketVolume", 0),
            "market_cap": info.get("marketCap", 0),
            "pe_ratio": info.get("trailingPE"),
        }

    def _get_ohlcv(self, stock: yf.Ticker, period: str = "3mo") -> list[dict]:
        """Get OHLCV data."""
        df = stock.history(period=period)
        ohlcv = []
        for date, row in df.iterrows():
            ohlcv.append({
                "date": str(date.date()),
                "open": round(row["Open"], 2),
                "high": round(row["High"], 2),
                "low": round(row["Low"], 2),
                "close": round(row["Close"], 2),
                "volume": int(row["Volume"]),
            })
        return ohlcv

    def _get_info(self, stock: yf.Ticker, ticker: str) -> dict:
        """Get detailed stock info."""
        info = stock.info
        return {
            "ticker": ticker,
            "name": info.get("shortName", ""),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "market_cap": info.get("marketCap", 0),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "dividend_yield": info.get("dividendYield"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
        }

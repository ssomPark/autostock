"""Analysis API routes."""

from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from src.analysis.candlestick_patterns import CandlestickDetector
from src.analysis.chart_patterns import ChartPatternDetector
from src.analysis.scoring_engine import ScoringEngine
from src.analysis.support_resistance import SupportResistanceDetector
from src.analysis.volume_analysis import VolumeAnalyzer
from src.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)

router = APIRouter()
market_service = MarketDataService()


def _sanitize(obj):
    """Convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def _kr_ticker_to_yf(ticker: str, market: str) -> str:
    """Convert Korean ticker to yfinance format (e.g. 005930 -> 005930.KS)."""
    if ticker.isdigit():
        suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
        return f"{ticker}{suffix}"
    return ticker


@router.get("/{ticker}/financials")
async def get_financials(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
):
    """Get financial data for a ticker using yfinance."""
    try:
        yf_ticker = _kr_ticker_to_yf(ticker, market)
        t = yf.Ticker(yf_ticker)
        info = t.info or {}

        name = info.get("shortName") or info.get("longName") or ticker
        sector = info.get("sector", "")
        industry = info.get("industry", "")
        market_cap = info.get("marketCap")
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = None
        if current_price and previous_close and previous_close != 0:
            change_pct = round((current_price - previous_close) / previous_close * 100, 2)

        pe_ratio = info.get("trailingPE")
        forward_pe = info.get("forwardPE")
        pb_ratio = info.get("priceToBook")
        dividend_yield = info.get("dividendYield")
        high_52w = info.get("fiftyTwoWeekHigh")
        low_52w = info.get("fiftyTwoWeekLow")
        roe = info.get("returnOnEquity")
        debt_to_equity = info.get("debtToEquity")
        if debt_to_equity is not None:
            debt_to_equity = round(debt_to_equity / 100, 2)

        revenue = []
        net_income = []
        operating_income = []
        fiscal_years = []

        try:
            inc = t.income_stmt
            if inc is not None and not inc.empty:
                for col in inc.columns[:3]:
                    year_label = str(col.year) if hasattr(col, "year") else str(col)[:4]
                    fiscal_years.append(year_label)
                    rev_row = inc.loc["Total Revenue"] if "Total Revenue" in inc.index else None
                    revenue.append(int(rev_row[col]) if rev_row is not None and pd.notna(rev_row[col]) else None)
                    ni_row = inc.loc["Net Income"] if "Net Income" in inc.index else None
                    net_income.append(int(ni_row[col]) if ni_row is not None and pd.notna(ni_row[col]) else None)
                    oi_row = inc.loc["Operating Income"] if "Operating Income" in inc.index else None
                    operating_income.append(int(oi_row[col]) if oi_row is not None and pd.notna(oi_row[col]) else None)
        except Exception as e:
            logger.warning(f"Failed to fetch income statement for {ticker}: {e}")

        result = {
            "ticker": ticker,
            "name": name,
            "sector": sector,
            "industry": industry,
            "market_cap": market_cap,
            "current_price": current_price,
            "change_pct": change_pct,
            "pe_ratio": pe_ratio,
            "forward_pe": forward_pe,
            "pb_ratio": pb_ratio,
            "dividend_yield": dividend_yield,
            "52w_high": high_52w,
            "52w_low": low_52w,
            "roe": roe,
            "debt_to_equity": debt_to_equity,
            "revenue": revenue,
            "net_income": net_income,
            "operating_income": operating_income,
            "fiscal_years": fiscal_years,
        }

        return {"success": True, "data": _sanitize(result)}

    except Exception as e:
        logger.error(f"Failed to fetch financials for {ticker}: {e}")
        return {"success": False, "message": str(e)}


@router.get("/{ticker}/score")
async def get_score(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
):
    """Get comprehensive scoring with enhanced confidence, targets, and risk/reward."""
    try:
        df = _get_ohlcv_with_fallback(ticker, market)
        if df.empty:
            return {"success": False, "message": f"No data available for {ticker}"}

        # Fetch fundamental data for confidence adjustment
        fundamentals = _get_fundamentals(ticker, market)
        result = _sanitize(ScoringEngine(df, fundamentals=fundamentals).compute())
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Scoring failed for {ticker}: {e}")
        return {"success": False, "message": str(e)}


def _get_fundamentals(ticker: str, market: str) -> dict:
    """Extract fundamental data from yfinance for confidence adjustment."""
    try:
        yf_ticker = _kr_ticker_to_yf(ticker, market)
        info = yf.Ticker(yf_ticker).info or {}
        return {
            "targetMeanPrice": info.get("targetMeanPrice"),
            "recommendationKey": info.get("recommendationKey"),
            "shortPercentOfFloat": info.get("shortPercentOfFloat"),
            "earningsGrowth": info.get("earningsGrowth"),
            "shortName": info.get("shortName") or info.get("longName"),
            "sector": info.get("sector"),
            "market": market,
        }
    except Exception as e:
        logger.warning(f"Failed to fetch fundamentals for {ticker}: {e}")
        return {}


def _get_ohlcv_with_fallback(ticker: str, market: str) -> pd.DataFrame:
    """Get OHLCV data with yfinance fallback when KIS API fails."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        try:
            yf_ticker = _kr_ticker_to_yf(ticker, market)
            yf_df = yf.Ticker(yf_ticker).history(period="3mo")
            if not yf_df.empty:
                yf_df.columns = [c.lower() for c in yf_df.columns]
                if "stock splits" in yf_df.columns:
                    yf_df.drop(columns=["stock splits", "dividends"], errors="ignore", inplace=True)
                yf_df.index = pd.to_datetime(yf_df.index).tz_localize(None)
                return yf_df
        except Exception as e:
            logger.warning(f"yfinance fallback failed for {ticker}: {e}")
    return df


@router.get("/{ticker}")
async def get_full_analysis(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
):
    """Run full technical analysis for a ticker."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": f"No data available for {ticker}"}

    candlestick = _sanitize(CandlestickDetector(df).get_signal())
    chart_pattern = _sanitize(ChartPatternDetector(df).get_signal())
    sr = _sanitize(SupportResistanceDetector(df).get_signal())
    volume = _sanitize(VolumeAnalyzer(df).get_signal())

    # Fetch company name
    fundamentals = _get_fundamentals(ticker, market)
    name = fundamentals.get("shortName") or ticker

    return {
        "success": True,
        "data": {
            "ticker": ticker,
            "name": name,
            "market": market,
            "candlestick": candlestick,
            "chart_pattern": chart_pattern,
            "support_resistance": sr,
            "volume": volume,
        },
    }


@router.get("/{ticker}/ohlcv")
async def get_ohlcv(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get raw OHLCV data for charting."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data", "data": []}

    records = []
    for idx, row in df.iterrows():
        ts = idx
        if isinstance(ts, pd.Timestamp):
            time_str = ts.strftime("%Y-%m-%d")
        else:
            time_str = str(ts)[:10]
        records.append({
            "time": time_str,
            "open": float(row.get("open", 0)),
            "high": float(row.get("high", 0)),
            "low": float(row.get("low", 0)),
            "close": float(row.get("close", 0)),
            "volume": float(row.get("volume", 0)),
        })

    records.sort(key=lambda x: x["time"])
    return {"success": True, "data": records}


@router.get("/{ticker}/candlestick")
async def get_candlestick_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get candlestick pattern analysis."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = _sanitize(CandlestickDetector(df).get_signal())
    return {"success": True, "data": result}


@router.get("/{ticker}/chart-pattern")
async def get_chart_pattern_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get chart pattern analysis."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = _sanitize(ChartPatternDetector(df).get_signal())
    return {"success": True, "data": result}


@router.get("/{ticker}/support-resistance")
async def get_sr_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get support/resistance analysis."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = _sanitize(SupportResistanceDetector(df).get_signal())
    return {"success": True, "data": result}


@router.get("/{ticker}/volume")
async def get_volume_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get volume analysis."""
    df = _get_ohlcv_with_fallback(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = _sanitize(VolumeAnalyzer(df).get_signal())
    return {"success": True, "data": result}

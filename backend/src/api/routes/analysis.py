"""Analysis API routes."""

from __future__ import annotations

import json

import pandas as pd
from fastapi import APIRouter, Query

from src.analysis.candlestick_patterns import CandlestickDetector
from src.analysis.chart_patterns import ChartPatternDetector
from src.analysis.support_resistance import SupportResistanceDetector
from src.analysis.volume_analysis import VolumeAnalyzer
from src.services.market_data_service import MarketDataService

router = APIRouter()
market_service = MarketDataService()


@router.get("/{ticker}")
async def get_full_analysis(
    ticker: str,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
):
    """Run full technical analysis for a ticker."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        return {"success": False, "message": f"No data available for {ticker}"}

    candlestick = CandlestickDetector(df).get_signal()
    chart_pattern = ChartPatternDetector(df).get_signal()
    sr = SupportResistanceDetector(df).get_signal()
    volume = VolumeAnalyzer(df).get_signal()

    return {
        "success": True,
        "data": {
            "ticker": ticker,
            "market": market,
            "candlestick": candlestick,
            "chart_pattern": chart_pattern,
            "support_resistance": sr,
            "volume": volume,
        },
    }


@router.get("/{ticker}/candlestick")
async def get_candlestick_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get candlestick pattern analysis."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = CandlestickDetector(df).get_signal()
    return {"success": True, "data": result}


@router.get("/{ticker}/chart-pattern")
async def get_chart_pattern_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get chart pattern analysis."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = ChartPatternDetector(df).get_signal()
    return {"success": True, "data": result}


@router.get("/{ticker}/support-resistance")
async def get_sr_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get support/resistance analysis."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = SupportResistanceDetector(df).get_signal()
    return {"success": True, "data": result}


@router.get("/{ticker}/volume")
async def get_volume_analysis(
    ticker: str,
    market: str = Query("KOSPI"),
):
    """Get volume analysis."""
    df = market_service.get_ohlcv(ticker, market)
    if df.empty:
        return {"success": False, "message": "No data"}
    result = VolumeAnalyzer(df).get_signal()
    return {"success": True, "data": result}

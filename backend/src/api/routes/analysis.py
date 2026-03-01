"""Analysis API routes."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.parse

import httpx
import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from src.analysis.candlestick_patterns import CandlestickDetector
from src.analysis.chart_patterns import ChartPatternDetector
from src.analysis.scoring_engine import ScoringEngine
from src.analysis.support_resistance import SupportResistanceDetector
from src.analysis.volume_analysis import VolumeAnalyzer
from src.auth.dependencies import get_current_user_optional
from src.config.settings import settings
from src.models.db_models import UserModel
from src.services.market_data_service import MarketDataService
from src.utils.rate_limiter import check_analysis_limit
from src.utils.redis_cache import cache_get_json, cache_set_json

logger = logging.getLogger(__name__)

router = APIRouter()
market_service = MarketDataService()

# Limit concurrent external API calls (yfinance, KIS) to prevent overwhelming upstream services
_api_semaphore = asyncio.Semaphore(10)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _check_rate_limit(request: Request, user: UserModel | None, ticker: str):
    """Check rate limit for anonymous users. Returns (headers, error_response).
    If error_response is not None, the request should be rejected.
    Tracks unique tickers per IP — same ticker doesn't count twice.
    """
    if user is not None:
        return {}, None  # Logged-in users have no limit

    ip = _get_client_ip(request)

    # Docker 내부 네트워크 (N8N, 기타 서비스) → rate limit 면제
    if ip.startswith(("172.", "10.", "192.168.", "127.")):
        return {}, None
    allowed, remaining, reset_seconds = await check_analysis_limit(ip, ticker)
    headers = {
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Limit": str(settings.analysis_rate_limit),
        "X-RateLimit-Reset": str(reset_seconds),
    }

    if not allowed:
        return headers, JSONResponse(
            status_code=429,
            content={
                "success": False,
                "message": "일일 무료 분석 횟수를 초과했습니다. 로그인하면 무제한 분석이 가능합니다.",
                "limit": settings.analysis_rate_limit,
                "remaining": 0,
                "reset_seconds": reset_seconds,
            },
            headers=headers,
        )

    return headers, None


@router.get("/search")
async def search_stocks(q: str = Query(..., min_length=1)):
    """종목명/코드 자동완성 검색. 네이버 주식 API 사용."""
    url = f"https://ac.stock.naver.com/ac?q={urllib.parse.quote(q)}&target=stock"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
                timeout=5,
            )
        data = resp.json()
    except Exception as e:
        logger.error(f"Stock search failed for '{q}': {e}")
        return {"results": []}

    results = []
    for item in data.get("items", []):
        if item.get("nationCode") not in ("KOR", "USA"):
            continue
        name = item.get("name", "")
        if "스팩" in name or "SPAC" in name:
            continue
        results.append({
            "ticker": item["code"],
            "name": name,
            "market": item.get("typeCode", ""),
        })
        if len(results) >= 10:
            break
    return {"results": results}


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
    request: Request,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
    user: UserModel | None = Depends(get_current_user_optional),
):
    """Get financial data for a ticker using yfinance."""
    rl_headers, rl_error = await _check_rate_limit(request, user, ticker)
    if rl_error is not None:
        return rl_error

    # Redis cache (1 hour TTL)
    cache_key = f"financials:{ticker}:{market}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return JSONResponse(content={"success": True, "data": cached}, headers=rl_headers)

    try:
        async with _api_semaphore:
            result = await asyncio.to_thread(_fetch_financials_sync, ticker, market)
        sanitized = _sanitize(result)
        await cache_set_json(cache_key, sanitized, ttl=3600)
        return JSONResponse(content={"success": True, "data": sanitized}, headers=rl_headers)

    except Exception as e:
        logger.error(f"Failed to fetch financials for {ticker}: {e}")
        return {"success": False, "message": "재무 데이터를 가져올 수 없습니다."}


def _fetch_financials_sync(ticker: str, market: str) -> dict:
    """Synchronous yfinance financials fetch (runs in thread pool)."""
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

    return {
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


@router.get("/{ticker}/score")
async def get_score(
    ticker: str,
    request: Request,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
    user: UserModel | None = Depends(get_current_user_optional),
):
    """Get comprehensive scoring with enhanced confidence, targets, and risk/reward."""
    rl_headers, rl_error = await _check_rate_limit(request, user, ticker)
    if rl_error is not None:
        return rl_error

    # Redis cache (10 min TTL)
    cache_key = f"score:{ticker}:{market}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return JSONResponse(content={"success": True, "data": cached}, headers=rl_headers)

    try:
        async with _api_semaphore:
            df = await asyncio.to_thread(_get_ohlcv_with_fallback, ticker, market)
            if df.empty:
                return {"success": False, "message": f"No data available for {ticker}"}
            fundamentals = await asyncio.to_thread(_get_fundamentals, ticker, market)
        result = _sanitize(ScoringEngine(df, fundamentals=fundamentals).compute())
        await cache_set_json(cache_key, result, ttl=600)
        return JSONResponse(content={"success": True, "data": result}, headers=rl_headers)
    except Exception as e:
        logger.error(f"Scoring failed for {ticker}: {e}")
        return {"success": False, "message": "종합 점수 산출에 실패했습니다."}


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
    request: Request,
    market: str = Query("KOSPI", description="Market: KOSPI, KOSDAQ, NYSE, NASDAQ"),
    user: UserModel | None = Depends(get_current_user_optional),
):
    """Run full technical analysis for a ticker."""
    rl_headers, rl_error = await _check_rate_limit(request, user, ticker)
    if rl_error is not None:
        return rl_error

    async with _api_semaphore:
        df = await asyncio.to_thread(_get_ohlcv_with_fallback, ticker, market)
        if df.empty:
            return {"success": False, "message": f"No data available for {ticker}"}
        fundamentals = await asyncio.to_thread(_get_fundamentals, ticker, market)

    candlestick = _sanitize(CandlestickDetector(df).get_signal())
    chart_pattern = _sanitize(ChartPatternDetector(df).get_signal())
    sr = _sanitize(SupportResistanceDetector(df).get_signal())
    volume = _sanitize(VolumeAnalyzer(df).get_signal())
    name = fundamentals.get("shortName") or ticker

    return JSONResponse(
        content={
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
        },
        headers=rl_headers,
    )


@router.get("/{ticker}/ohlcv")
async def get_ohlcv(
    ticker: str,
    request: Request,
    market: str = Query("KOSPI"),
    user: UserModel | None = Depends(get_current_user_optional),
):
    """Get raw OHLCV data for charting."""
    rl_headers, rl_error = await _check_rate_limit(request, user, ticker)
    if rl_error is not None:
        return rl_error

    # Redis cache (15 min TTL)
    cache_key = f"ohlcv:{ticker}:{market}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return JSONResponse(content={"success": True, "data": cached}, headers=rl_headers)

    async with _api_semaphore:
        df = await asyncio.to_thread(_get_ohlcv_with_fallback, ticker, market)
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
    await cache_set_json(cache_key, records, ttl=900)
    return JSONResponse(content={"success": True, "data": records}, headers=rl_headers)


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

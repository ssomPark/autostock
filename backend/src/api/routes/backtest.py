"""Backtesting API route."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import date, timedelta

import numpy as np
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.auth.dependencies import get_current_user
from src.models.db_models import UserModel
from src.services.backtest_engine import BacktestEngine
from src.utils.market_hours import is_market_open, seconds_until_next_open
from src.utils.redis_cache import cache_get_json, cache_set_json

logger = logging.getLogger(__name__)
router = APIRouter()


# --- numpy sanitizer (same as analysis.py) ---

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
    """Convert Korean ticker to yfinance format."""
    if ticker.isdigit():
        suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
        return f"{ticker}{suffix}"
    return ticker


class BacktestRequest(BaseModel):
    ticker: str
    market: str = "KOSPI"
    start_date: str = Field(description="YYYY-MM-DD")
    end_date: str = Field(description="YYYY-MM-DD")
    initial_capital: float = 10_000_000


@router.post("/run")
async def run_backtest(
    req: BacktestRequest,
    user: UserModel = Depends(get_current_user),
):
    """Run backtest for a ticker using ScoringEngine signals."""
    # Validate dates
    try:
        start = date.fromisoformat(req.start_date)
        end = date.fromisoformat(req.end_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")

    days = (end - start).days
    if days < 30:
        raise HTTPException(400, "최소 30일 이상의 기간을 설정해주세요.")
    if days > 365:
        raise HTTPException(400, "최대 365일까지 설정할 수 있습니다.")

    # Redis cache check
    cache_key = f"backtest:{req.ticker}:{req.market}:{req.start_date}:{req.end_date}:{int(req.initial_capital)}"
    try:
        cached = await cache_get_json(cache_key)
        if cached is not None:
            return {"success": True, "data": cached, "cached": True}
    except Exception:
        pass

    # Commission rate based on market
    is_kr = req.market.upper() in ("KOSPI", "KOSDAQ", "KR")
    commission = 0.00015 if is_kr else 0.0

    # Determine yfinance ticker
    yf_ticker = _kr_ticker_to_yf(req.ticker, req.market)

    # Fetch OHLCV (with lookback buffer)
    lookback_start = start - timedelta(days=120)  # ~60 trading days buffer

    try:
        df = await asyncio.to_thread(
            yf.download,
            yf_ticker,
            start=lookback_start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        logger.error(f"yfinance download failed for {yf_ticker}: {e}")
        raise HTTPException(500, "주가 데이터를 가져올 수 없습니다.")

    if df is None or df.empty or len(df) < BacktestEngine.MIN_LOOKBACK + 10:
        raise HTTPException(400, f"'{req.ticker}'의 데이터가 부족합니다. 다른 종목이나 기간을 시도해주세요.")

    # Flatten MultiIndex columns if present (yfinance sometimes returns MultiIndex)
    if hasattr(df.columns, 'levels'):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

    # Find trading start index (first date >= start_date)
    start_mask = df.index >= str(start)
    if not np.any(start_mask):
        raise HTTPException(400, "설정한 기간에 거래 데이터가 없습니다.")
    start_idx = int(np.argmax(start_mask))

    # Ensure enough lookback
    if start_idx < BacktestEngine.MIN_LOOKBACK:
        start_idx = BacktestEngine.MIN_LOOKBACK

    # Run backtest in thread
    engine = BacktestEngine(
        initial_capital=req.initial_capital,
        commission_rate=commission,
    )

    try:
        bt_result = await asyncio.to_thread(engine.run, df, start_idx)
    except Exception as e:
        logger.error(f"Backtest engine error: {e}")
        raise HTTPException(500, "백테스트 실행 중 오류가 발생했습니다.")

    result_dict = _sanitize(bt_result.to_dict())
    result_dict["ticker"] = req.ticker
    result_dict["market"] = req.market
    result_dict["period"] = {"start": req.start_date, "end": req.end_date}

    # Cache result — smart TTL based on market hours
    try:
        mtype = "KR" if req.market.upper() in ("KOSPI", "KOSDAQ", "KR") else "US"
        # 과거 데이터 백테스트는 결과 불변 → 장 닫혀 있으면 장기 캐싱
        if is_market_open(mtype):
            ttl = 3600
        else:
            until_open = seconds_until_next_open(mtype)
            ttl = min(until_open, 259200) if until_open > 0 else 3600
        await cache_set_json(cache_key, result_dict, ttl=ttl)
    except Exception:
        pass

    return {"success": True, "data": result_dict, "cached": False}

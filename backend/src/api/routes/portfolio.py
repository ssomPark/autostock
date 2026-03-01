"""Portfolio management and report generation routes."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import List

import httpx
import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.analysis.scoring_engine import ScoringEngine
from src.auth.dependencies import get_current_user
from src.config.settings import settings
from src.db.database import get_async_session
from src.models.db_models import UserModel, PortfolioModel, PortfolioHoldingModel
from src.services.market_data_service import MarketDataService, get_usd_krw_rate
from src.utils.redis_cache import _get_redis, cache_get_json, cache_set_json

logger = logging.getLogger(__name__)
router = APIRouter()

market_service = MarketDataService()
_api_semaphore = asyncio.Semaphore(10)


# --- Pydantic schemas ---

class CreatePortfolioIn(BaseModel):
    name: str = "내 포트폴리오"


class AddHoldingIn(BaseModel):
    ticker: str
    name: str
    market: str
    quantity: int
    avg_buy_price: float
    currency: str = "KRW"


class HoldingItem(BaseModel):
    ticker: str
    name: str
    market: str
    quantity: int
    avg_buy_price: float
    currency: str = "KRW"


class EnrichHoldingsIn(BaseModel):
    holdings: List[HoldingItem]


class AdhocReportIn(BaseModel):
    holdings: List[HoldingItem]


# --- Helpers ---

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
    if ticker.isdigit():
        suffix = ".KQ" if market.upper() == "KOSDAQ" else ".KS"
        return f"{ticker}{suffix}"
    return ticker


def _get_ohlcv_with_fallback(ticker: str, market: str) -> pd.DataFrame:
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


def _get_fundamentals(ticker: str, market: str) -> dict:
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


def _extract_confidence(conf) -> float:
    """ScoringEngine confidence는 dict(final, base 등). 숫자만 추출."""
    if isinstance(conf, dict):
        return round(conf.get("final", 0), 1)
    if isinstance(conf, (int, float)):
        return round(float(conf), 1)
    return 0


async def _invalidate_report_cache(portfolio_id: int):
    """종목 변경 시 리포트 캐시 삭제."""
    try:
        redis = await _get_redis()
        await redis.delete(f"portfolio_report_cache:{portfolio_id}")
    except Exception:
        pass


async def _verify_portfolio_owner(
    portfolio_id: int, user: UserModel, session: AsyncSession
) -> PortfolioModel:
    result = await session.execute(
        select(PortfolioModel).where(
            PortfolioModel.id == portfolio_id,
            PortfolioModel.user_id == user.id,
        )
    )
    portfolio = result.scalar_one_or_none()
    if portfolio is None:
        raise HTTPException(status_code=404, detail="포트폴리오를 찾을 수 없습니다.")
    return portfolio


async def _enrich_holding_prices(holdings) -> list[dict]:
    """Holdings에 현재가/환율/PnL을 붙여서 반환. holdings는 attr 접근 가능 객체 리스트."""

    async def _fetch_current(h) -> dict:
        current_price = 0.0
        try:
            price_data = await asyncio.to_thread(
                market_service.get_current_price, h.ticker, h.market
            )
            current_price = price_data.get("current_price", 0)
        except Exception:
            pass
        if not current_price or current_price <= 0:
            current_price = h.avg_buy_price

        is_us = h.market in ("NYSE", "NASDAQ")
        rate = None
        if is_us:
            rate = await asyncio.to_thread(get_usd_krw_rate)

        invested = h.quantity * h.avg_buy_price * (rate or 1)
        eval_amount = h.quantity * current_price * (rate or 1)
        pnl = eval_amount - invested
        pnl_pct = (pnl / invested * 100) if invested > 0 else 0.0

        return {
            "id": getattr(h, "id", 0),
            "ticker": h.ticker,
            "name": h.name,
            "market": h.market,
            "quantity": h.quantity,
            "avg_buy_price": h.avg_buy_price,
            "currency": getattr(h, "currency", "KRW"),
            "current_price": current_price,
            "exchange_rate": rate,
            "invested": round(invested, 0),
            "eval_amount": round(eval_amount, 0),
            "pnl": round(pnl, 0),
            "pnl_pct": round(pnl_pct, 2),
            "added_at": h.added_at.isoformat() if hasattr(h, "added_at") and h.added_at and hasattr(h.added_at, "isoformat") else None,
        }

    tasks = [_fetch_current(h) for h in holdings]
    return await asyncio.gather(*tasks)


async def _build_report(holdings, user_id: int, redis=None, cache_key: str | None = None, portfolio_id: int | None = None) -> dict:
    """공통 리포트 생성 로직. holdings는 attr 접근 가능 객체 리스트."""
    # 환율 조회
    has_us = any(h.market in ("NYSE", "NASDAQ") for h in holdings)
    exchange_rate = None
    if has_us:
        try:
            exchange_rate = await asyncio.to_thread(get_usd_krw_rate)
        except Exception:
            exchange_rate = 1350.0

    # 각 종목 병렬 분석
    async def _analyze_holding(h) -> dict:
        async with _api_semaphore:
            try:
                df = await asyncio.to_thread(_get_ohlcv_with_fallback, h.ticker, h.market)
                fundamentals = await asyncio.to_thread(_get_fundamentals, h.ticker, h.market)

                score_result = {}
                if not df.empty:
                    score_result = _sanitize(ScoringEngine(df, fundamentals=fundamentals).compute())

                current_price = 0.0
                try:
                    price_data = await asyncio.to_thread(
                        market_service.get_current_price, h.ticker, h.market
                    )
                    current_price = price_data.get("current_price", 0)
                except Exception:
                    pass
                if not current_price or current_price <= 0:
                    if not df.empty:
                        current_price = float(df["close"].iloc[-1])
                    else:
                        current_price = h.avg_buy_price

                is_us = h.market in ("NYSE", "NASDAQ")
                rate = exchange_rate if is_us else None
                invested = h.quantity * h.avg_buy_price * (rate or 1)
                eval_amount = h.quantity * current_price * (rate or 1)
                pnl = eval_amount - invested
                pnl_pct = (pnl / invested * 100) if invested > 0 else 0.0

                conf_raw = score_result.get("confidence", {})
                confidence_val = _extract_confidence(conf_raw)
                confidence_adjustments = []
                if isinstance(conf_raw, dict):
                    confidence_adjustments = conf_raw.get("adjustments", [])

                breakdown = score_result.get("signal_breakdown", {})
                top_factors = []
                for k, v in sorted(
                    breakdown.items(),
                    key=lambda x: abs(x[1].get("contribution", 0) if isinstance(x[1], dict) else 0),
                    reverse=True,
                ):
                    contrib = v.get("contribution", 0) if isinstance(v, dict) else 0
                    if abs(contrib) > 0.005:
                        top_factors.append({
                            "name": k,
                            "strength": v.get("strength", 0) if isinstance(v, dict) else 0,
                            "weight": v.get("weight", 0) if isinstance(v, dict) else 0,
                            "contribution": contrib,
                        })

                indicators = score_result.get("indicators", {})
                trend_info = indicators.get("trend", {})
                rsi_val = indicators.get("rsi", 50)
                summary_lines = score_result.get("summary", [])

                return {
                    "ticker": h.ticker,
                    "name": h.name,
                    "market": h.market,
                    "quantity": h.quantity,
                    "avg_buy_price": h.avg_buy_price,
                    "current_price": current_price,
                    "currency": getattr(h, "currency", "KRW"),
                    "exchange_rate": rate,
                    "invested": round(invested, 0),
                    "eval_amount": round(eval_amount, 0),
                    "pnl": round(pnl, 0),
                    "pnl_pct": round(pnl_pct, 2),
                    "grade": score_result.get("grade", "N/A"),
                    "total_score": score_result.get("total_score", 0),
                    "signal": score_result.get("signal", "HOLD"),
                    "confidence": confidence_val,
                    "sector": fundamentals.get("sector", ""),
                    "confidence_adjustments": confidence_adjustments,
                    "signal_factors": top_factors,
                    "rsi": round(rsi_val, 1),
                    "trend": trend_info.get("direction", "sideways"),
                    "trend_strength": trend_info.get("strength", 0),
                    "summary": summary_lines,
                }
            except Exception as e:
                logger.warning(f"Analysis failed for {h.ticker}: {e}")
                is_us = h.market in ("NYSE", "NASDAQ")
                rate = exchange_rate if is_us else None
                invested = h.quantity * h.avg_buy_price * (rate or 1)
                return {
                    "ticker": h.ticker,
                    "name": h.name,
                    "market": h.market,
                    "quantity": h.quantity,
                    "avg_buy_price": h.avg_buy_price,
                    "current_price": h.avg_buy_price,
                    "currency": getattr(h, "currency", "KRW"),
                    "exchange_rate": rate,
                    "invested": round(invested, 0),
                    "eval_amount": round(invested, 0),
                    "pnl": 0,
                    "pnl_pct": 0.0,
                    "grade": "N/A",
                    "total_score": 0,
                    "signal": "HOLD",
                    "confidence": 0,
                    "sector": "",
                    "confidence_adjustments": [],
                    "signal_factors": [],
                    "rsi": 50,
                    "trend": "sideways",
                    "trend_strength": 0,
                    "summary": [],
                }

    tasks = [_analyze_holding(h) for h in holdings]
    analyses = await asyncio.gather(*tasks)

    # 전체 지표
    total_invested = sum(a["invested"] for a in analyses)
    total_eval = sum(a["eval_amount"] for a in analyses)
    total_pnl = total_eval - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0.0

    grade_dist: dict[str, int] = {}
    signal_dist: dict[str, int] = {}
    sector_dist: dict[str, int] = {}
    for a in analyses:
        g = a["grade"]
        grade_dist[g] = grade_dist.get(g, 0) + 1
        s = a["signal"]
        signal_dist[s] = signal_dist.get(s, 0) + 1
        sec = a.get("sector") or "기타"
        sector_dist[sec] = sector_dist.get(sec, 0) + 1

    # LLM 코멘트
    holdings_detail = []
    for a in analyses:
        adj_summary = ""
        adjs = a.get("confidence_adjustments", [])
        if adjs:
            adj_parts = [f"{ad.get('factor','')}({ad.get('delta','')})" for ad in adjs[:5]]
            adj_summary = f"  신뢰도 근거: {', '.join(adj_parts)}"

        factors_summary = ""
        factors = a.get("signal_factors", [])
        if factors:
            fparts = [f"{f['name']}({f['contribution']:+.3f})" for f in factors[:4]]
            factors_summary = f"  신호 요인: {', '.join(fparts)}"

        line = (
            f"- {a['name']}({a['ticker']}): 등급 {a['grade']}, 신호 {a['signal']}, "
            f"신뢰도 {a['confidence']}%, 수익률 {a['pnl_pct']:+.1f}%, "
            f"RSI {a.get('rsi', 'N/A')}, 추세 {a.get('trend', 'N/A')}(강도 {a.get('trend_strength', 0):.0%})"
        )
        if adj_summary:
            line += "\n" + adj_summary
        if factors_summary:
            line += "\n" + factors_summary
        holdings_detail.append(line)

    holdings_text = "\n".join(holdings_detail)

    prompt = f"""당신은 주식 포트폴리오 분석 전문가입니다. 아래 포트폴리오를 분석하고 JSON으로 응답하세요.

중요 지침:
- 각 종목의 "신호"(BUY/SELL/HOLD)는 기술적 분석(차트 패턴, 추세, RSI 등) 기반입니다. 수익률과 신호는 별개입니다.
- 수익이 나고 있어도 기술적으로 하락 추세면 SELL 신호가 나올 수 있습니다. 이 경우 "이익 실현 타이밍" 관점에서 설명하세요.
- 신뢰도가 낮은 경우, 신뢰도 근거를 참고하여 왜 낮은지 구체적으로 설명하세요 (예: 신호 혼재, 역추세, 고변동성 등).
- 종목별로 구체적인 상황을 반영한 맞춤 코멘트를 작성하세요.

포트폴리오 현황:
- 보유 종목 수: {len(analyses)}개
- 총 투자금: {total_invested:,.0f}원
- 총 평가금: {total_eval:,.0f}원
- 총 수익률: {total_pnl_pct:+.1f}%
- 등급 분포: {json.dumps(grade_dist, ensure_ascii=False)}
- 신호 분포: {json.dumps(signal_dist, ensure_ascii=False)}

개별 종목 상세:
{holdings_text}

JSON 형식으로 응답하세요:
{{
  "overall_assessment": "포트폴리오 전체 평가 (3-4문장, 구체적 수치와 논리적 근거 포함)",
  "key_risks": ["구체적 리스크 (종목명/지표 언급)", "...", "..."],
  "action_items": ["구체적 조치 (종목명과 이유 포함)", "...", "..."],
  "holding_comments": {{
    "종목코드": "해당 종목에 대한 1-2문장 맞춤 코멘트 (신호 근거, 수익률 상황, 추천 행동)",
    ...
  }},
  "risk_level": "low|medium|high|very_high"
}}"""

    llm_comment = {
        "overall_assessment": "AI 분석을 사용할 수 없습니다.",
        "key_risks": [],
        "action_items": [],
        "risk_level": "medium",
    }

    if settings.openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.llm_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "response_format": {"type": "json_object"},
                        "max_tokens": 500,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                llm_comment = json.loads(content)
        except Exception as e:
            logger.warning(f"LLM comment generation failed: {e}")

    # 응답 조립
    report = {
        "portfolio_id": portfolio_id,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_invested": round(total_invested, 0),
            "total_eval": round(total_eval, 0),
            "total_pnl": round(total_pnl, 0),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "holding_count": len(analyses),
            "grade_distribution": grade_dist,
            "signal_distribution": signal_dist,
            "sector_distribution": sector_dist,
        },
        "holdings": analyses,
        "comment": llm_comment,
    }

    # 캐시 저장
    if redis and cache_key:
        await cache_set_json(cache_key, report, ttl=1800)

    return report


# --- Enrich & Adhoc (static paths MUST be before /{portfolio_id} patterns) ---

@router.post("/enrich-holdings")
async def enrich_holdings(body: EnrichHoldingsIn):
    """로컬 모드용: holdings에 현재가/환율/PnL 계산하여 반환 (비인증)."""
    if len(body.holdings) > 20:
        raise HTTPException(status_code=400, detail="종목은 최대 20개까지 가능합니다.")
    ns_holdings = [SimpleNamespace(**h.model_dump()) for h in body.holdings]
    return await _enrich_holding_prices(ns_holdings)


@router.post("/report-adhoc")
async def generate_adhoc_report(
    body: AdhocReportIn,
    user: UserModel = Depends(get_current_user),
):
    """로컬 모드용: body로 전달된 holdings로 리포트 생성 (인증 필수, 일 5회 제한)."""
    if not body.holdings:
        raise HTTPException(status_code=400, detail="보유 종목이 없습니다.")
    if len(body.holdings) > 20:
        raise HTTPException(status_code=400, detail="종목은 최대 20개까지 가능합니다.")

    redis = None
    try:
        redis = await _get_redis()
    except Exception:
        pass

    now_kst = datetime.now(timezone(timedelta(hours=9)))
    date_key = now_kst.strftime("%Y-%m-%d")
    limit_key = f"portfolio_report:{user.id}:{date_key}"

    if redis:
        count = await redis.get(limit_key)
        used = int(count) if count else 0
        if used >= 5:
            raise HTTPException(status_code=429, detail="일일 리포트 생성 횟수(5회)를 초과했습니다.")

    ns_holdings = [SimpleNamespace(**h.model_dump()) for h in body.holdings]
    report = await _build_report(ns_holdings, user.id, redis=redis)

    if redis:
        await redis.incr(limit_key)
        await redis.expire(limit_key, 86400)

    return {"success": True, "data": report, "cached": False}


@router.get("/report-limit")
async def get_report_limit(
    user: UserModel = Depends(get_current_user),
):
    """남은 리포트 생성 횟수 조회."""
    try:
        redis = await _get_redis()
    except Exception:
        return {"remaining": 5, "limit": 5}

    now_kst = datetime.now(timezone(timedelta(hours=9)))
    date_key = now_kst.strftime("%Y-%m-%d")
    key = f"portfolio_report:{user.id}:{date_key}"
    count = await redis.get(key)
    used = int(count) if count else 0
    return {"remaining": max(0, 5 - used), "limit": 5}


# --- Portfolio CRUD ---

@router.post("")
async def create_portfolio(
    body: CreatePortfolioIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    count = await session.scalar(
        select(func.count(PortfolioModel.id)).where(PortfolioModel.user_id == user.id)
    )
    if count >= 3:
        raise HTTPException(status_code=400, detail="포트폴리오는 최대 3개까지 생성할 수 있습니다.")

    portfolio = PortfolioModel(user_id=user.id, name=body.name)
    session.add(portfolio)
    await session.commit()
    await session.refresh(portfolio)
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "created_at": portfolio.created_at.isoformat() if portfolio.created_at else None,
    }


@router.get("")
async def list_portfolios(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(PortfolioModel)
        .where(PortfolioModel.user_id == user.id)
        .order_by(PortfolioModel.created_at.asc())
    )
    portfolios = result.scalars().all()
    items = []
    for p in portfolios:
        hcount = await session.scalar(
            select(func.count(PortfolioHoldingModel.id)).where(
                PortfolioHoldingModel.portfolio_id == p.id
            )
        )
        items.append({
            "id": p.id,
            "name": p.name,
            "holding_count": hcount or 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return items


@router.delete("/{portfolio_id}")
async def delete_portfolio(
    portfolio_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    portfolio = await _verify_portfolio_owner(portfolio_id, user, session)
    await session.delete(portfolio)
    await session.commit()
    return {"ok": True}


# --- Holdings CRUD ---

@router.post("/{portfolio_id}/holdings")
async def add_holding(
    portfolio_id: int,
    body: AddHoldingIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await _verify_portfolio_owner(portfolio_id, user, session)

    hcount = await session.scalar(
        select(func.count(PortfolioHoldingModel.id)).where(
            PortfolioHoldingModel.portfolio_id == portfolio_id
        )
    )

    # UPSERT: 기존 종목이면 업데이트
    result = await session.execute(
        select(PortfolioHoldingModel).where(
            PortfolioHoldingModel.portfolio_id == portfolio_id,
            PortfolioHoldingModel.ticker == body.ticker,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.quantity = body.quantity
        existing.avg_buy_price = body.avg_buy_price
        existing.name = body.name
        existing.market = body.market
        existing.currency = body.currency
        existing.updated_at = datetime.now()
        await session.commit()
        await _invalidate_report_cache(portfolio_id)
        return {
            "id": existing.id,
            "ticker": existing.ticker,
            "name": existing.name,
            "updated": True,
        }

    if hcount >= 20:
        raise HTTPException(status_code=400, detail="종목은 최대 20개까지 추가할 수 있습니다.")

    holding = PortfolioHoldingModel(
        portfolio_id=portfolio_id,
        ticker=body.ticker,
        name=body.name,
        market=body.market,
        quantity=body.quantity,
        avg_buy_price=body.avg_buy_price,
        currency=body.currency,
    )
    session.add(holding)
    await session.commit()
    await session.refresh(holding)
    await _invalidate_report_cache(portfolio_id)
    return {
        "id": holding.id,
        "ticker": holding.ticker,
        "name": holding.name,
        "updated": False,
    }


@router.delete("/{portfolio_id}/holdings/{holding_id}")
async def delete_holding(
    portfolio_id: int,
    holding_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await _verify_portfolio_owner(portfolio_id, user, session)
    result = await session.execute(
        select(PortfolioHoldingModel).where(
            PortfolioHoldingModel.id == holding_id,
            PortfolioHoldingModel.portfolio_id == portfolio_id,
        )
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다.")
    await session.delete(holding)
    await session.commit()
    await _invalidate_report_cache(portfolio_id)
    return {"ok": True}


@router.get("/{portfolio_id}/holdings")
async def get_holdings(
    portfolio_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await _verify_portfolio_owner(portfolio_id, user, session)
    result = await session.execute(
        select(PortfolioHoldingModel)
        .where(PortfolioHoldingModel.portfolio_id == portfolio_id)
        .order_by(PortfolioHoldingModel.added_at.asc())
    )
    holdings = result.scalars().all()
    if not holdings:
        return []
    return await _enrich_holding_prices(holdings)


# --- Report ---

@router.get("/{portfolio_id}/report")
async def get_cached_report(
    portfolio_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """캐시된 리포트 조회."""
    await _verify_portfolio_owner(portfolio_id, user, session)
    cache_key = f"portfolio_report_cache:{portfolio_id}"
    cached = await cache_get_json(cache_key)
    if cached:
        return {"success": True, "data": cached, "cached": True}
    return {"success": False, "message": "리포트가 없습니다. 새로 생성해주세요."}


@router.post("/{portfolio_id}/report")
async def generate_report(
    portfolio_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """포트폴리오 리포트 생성 (일 5회 제한, 30분 캐시)."""
    await _verify_portfolio_owner(portfolio_id, user, session)

    # 일일 한도 체크
    redis = None
    try:
        redis = await _get_redis()
    except Exception:
        pass

    now_kst = datetime.now(timezone(timedelta(hours=9)))
    date_key = now_kst.strftime("%Y-%m-%d")
    limit_key = f"portfolio_report:{user.id}:{date_key}"

    if redis:
        count = await redis.get(limit_key)
        used = int(count) if count else 0
        if used >= 5:
            raise HTTPException(status_code=429, detail="일일 리포트 생성 횟수(5회)를 초과했습니다.")

    # 캐시 확인 (30분)
    cache_key = f"portfolio_report_cache:{portfolio_id}"
    cached = await cache_get_json(cache_key)
    if cached:
        return {"success": True, "data": cached, "cached": True}

    # 보유 종목 조회
    result = await session.execute(
        select(PortfolioHoldingModel)
        .where(PortfolioHoldingModel.portfolio_id == portfolio_id)
        .order_by(PortfolioHoldingModel.added_at.asc())
    )
    holdings = result.scalars().all()
    if not holdings:
        raise HTTPException(status_code=400, detail="보유 종목이 없습니다.")

    report = await _build_report(
        holdings, user.id, redis=redis, cache_key=cache_key, portfolio_id=portfolio_id
    )

    # 일일 카운트 증가
    if redis:
        await redis.incr(limit_key)
        await redis.expire(limit_key, 86400)

    return {"success": True, "data": report, "cached": False}

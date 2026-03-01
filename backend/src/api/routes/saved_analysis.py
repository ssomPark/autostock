"""Saved analysis CRUD routes (authenticated)."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.db.database import get_async_session
from src.models.db_models import UserModel, SavedAnalysisModel
from src.models.schemas import BulkDeleteIn, UpdateMemoIn

logger = logging.getLogger(__name__)

router = APIRouter()


class SaveAnalysisIn(BaseModel):
    ticker: str
    name: str
    market: str
    signal: str = "HOLD"
    grade: str = ""
    confidence: float = 0.0
    current_price: float = 0.0
    total_score: float = 0.0
    score_data: dict[str, Any] = {}
    financials_data: dict[str, Any] = {}


def _serialize_analysis(item: SavedAnalysisModel) -> dict:
    """통일된 직렬화 헬퍼."""
    return {
        "id": item.id,
        "ticker": item.ticker,
        "name": item.name,
        "market": item.market,
        "signal": item.signal,
        "grade": item.grade,
        "confidence": item.confidence,
        "current_price": item.current_price,
        "total_score": item.total_score,
        "score_data": item.score_data,
        "financials_data": item.financials_data,
        "analyzed_at": item.analyzed_at.isoformat() if item.analyzed_at else None,
        "created_at": (item.created_at.isoformat() if hasattr(item, "created_at") and item.created_at else
                       item.analyzed_at.isoformat() if item.analyzed_at else None),
        "memo": getattr(item, "memo", None),
        "is_pinned": getattr(item, "is_pinned", False) or False,
    }


# ──────────────────────────────────────────────
# 1. GET "" — 목록 (필터/정렬/페이지네이션)
# ──────────────────────────────────────────────
@router.get("")
async def list_saved_analyses(
    search: Optional[str] = None,
    signal: Optional[str] = None,
    market: Optional[str] = None,
    grade: Optional[str] = None,
    pinned: Optional[bool] = None,
    sort_by: str = "analyzed_at",
    order: str = "desc",
    skip: int = 0,
    limit: int = 200,
    latest_only: bool = True,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    query = select(SavedAnalysisModel).where(SavedAnalysisModel.user_id == user.id)

    # 핀 필터
    if pinned is not None:
        query = query.where(SavedAnalysisModel.is_pinned == pinned)

    # latest_only: 종목당 최신 1건만
    if latest_only:
        sub = (
            select(func.max(SavedAnalysisModel.id).label("max_id"))
            .where(SavedAnalysisModel.user_id == user.id)
            .group_by(SavedAnalysisModel.ticker)
            .subquery()
        )
        query = query.where(SavedAnalysisModel.id.in_(select(sub.c.max_id)))

    if search:
        pattern = f"%{search}%"
        query = query.where(
            (SavedAnalysisModel.ticker.ilike(pattern)) |
            (SavedAnalysisModel.name.ilike(pattern))
        )
    if signal:
        query = query.where(SavedAnalysisModel.signal == signal.upper())
    if market:
        query = query.where(SavedAnalysisModel.market == market)
    if grade:
        query = query.where(SavedAnalysisModel.grade == grade)

    # 정렬
    sort_col = getattr(SavedAnalysisModel, sort_by, SavedAnalysisModel.analyzed_at)
    query = query.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    query = query.offset(skip).limit(limit)

    result = await session.execute(query)
    items = result.scalars().all()
    return [_serialize_analysis(item) for item in items]


# ──────────────────────────────────────────────
# 1b. GET "/pinned" — 핀 고정 종목 목록 (종목당 최신 1건)
# ──────────────────────────────────────────────
@router.get("/pinned")
async def list_pinned_analyses(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """핀 고정된 종목의 최신 분석만 반환."""
    sub = (
        select(func.max(SavedAnalysisModel.id).label("max_id"))
        .where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.is_pinned == True,
        )
        .group_by(SavedAnalysisModel.ticker)
        .subquery()
    )
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(SavedAnalysisModel.id.in_(select(sub.c.max_id)))
        .order_by(SavedAnalysisModel.analyzed_at.desc())
    )
    items = result.scalars().all()

    pinned_list = []
    for item in items:
        sc = item.score_data or {}
        entry = sc.get("entry_price", {})
        target = sc.get("target", {})
        stop_loss = sc.get("stop_loss", {})

        pinned_list.append({
            **_serialize_analysis(item),
            "entry_price": entry.get("consensus") if isinstance(entry, dict) else None,
            "target_price": target.get("consensus") if isinstance(target, dict) else None,
            "stop_loss": stop_loss.get("final") if isinstance(stop_loss, dict) else None,
            "risk_reward": sc.get("risk_reward_ratio"),
        })
    return pinned_list


# ──────────────────────────────────────────────
# 2. GET "/stats" — 통계
# ──────────────────────────────────────────────
@router.get("/stats")
async def get_analysis_stats(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    base = select(SavedAnalysisModel).where(SavedAnalysisModel.user_id == user.id)

    # 전체 수
    total_result = await session.execute(
        select(func.count(SavedAnalysisModel.id)).where(SavedAnalysisModel.user_id == user.id)
    )
    total = total_result.scalar() or 0

    # 고유 종목 수
    unique_result = await session.execute(
        select(func.count(func.distinct(SavedAnalysisModel.ticker)))
        .where(SavedAnalysisModel.user_id == user.id)
    )
    unique_tickers = unique_result.scalar() or 0

    # 신호별 카운트 (최신 레코드 기준)
    sub = (
        select(func.max(SavedAnalysisModel.id).label("max_id"))
        .where(SavedAnalysisModel.user_id == user.id)
        .group_by(SavedAnalysisModel.ticker)
        .subquery()
    )
    latest_result = await session.execute(
        select(SavedAnalysisModel.signal, func.count(SavedAnalysisModel.id))
        .where(SavedAnalysisModel.id.in_(select(sub.c.max_id)))
        .group_by(SavedAnalysisModel.signal)
    )
    signal_counts = {row[0]: row[1] for row in latest_result}

    # 평균 신뢰도 (최신 레코드 기준)
    avg_result = await session.execute(
        select(func.avg(SavedAnalysisModel.confidence))
        .where(SavedAnalysisModel.id.in_(select(sub.c.max_id)))
    )
    avg_confidence = avg_result.scalar()

    # 최다 분석 종목
    top_result = await session.execute(
        select(
            SavedAnalysisModel.ticker,
            SavedAnalysisModel.name,
            func.count(SavedAnalysisModel.id).label("cnt"),
        )
        .where(SavedAnalysisModel.user_id == user.id)
        .group_by(SavedAnalysisModel.ticker, SavedAnalysisModel.name)
        .order_by(func.count(SavedAnalysisModel.id).desc())
        .limit(5)
    )
    top_tickers = [{"ticker": r[0], "name": r[1], "count": r[2]} for r in top_result]

    return {
        "total_analyses": total,
        "unique_tickers": unique_tickers,
        "signal_counts": signal_counts,
        "avg_confidence": round(float(avg_confidence), 1) if avg_confidence else 0,
        "top_tickers": top_tickers,
    }


# ──────────────────────────────────────────────
# 3. GET "/history/{ticker}" — 종목별 전체 히스토리
# ──────────────────────────────────────────────
@router.get("/history/{ticker}")
async def get_analysis_history(
    ticker: str,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.ticker == ticker,
        )
        .order_by(SavedAnalysisModel.analyzed_at.desc())
    )
    items = result.scalars().all()
    return [_serialize_analysis(item) for item in items]


# ──────────────────────────────────────────────
# 4. GET "/performance" — 성과 추적
# ──────────────────────────────────────────────
@router.get("/performance")
async def get_analysis_performance(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    # 종목당 최신 분석만
    sub = (
        select(func.max(SavedAnalysisModel.id).label("max_id"))
        .where(SavedAnalysisModel.user_id == user.id)
        .group_by(SavedAnalysisModel.ticker)
        .subquery()
    )
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(SavedAnalysisModel.id.in_(select(sub.c.max_id)))
    )
    items = result.scalars().all()

    if not items:
        return {"items": [], "hit_rate": None, "avg_return": None}

    from src.services.market_data_service import MarketDataService
    svc = MarketDataService()
    sem = asyncio.Semaphore(5)

    async def _fetch_perf(item: SavedAnalysisModel) -> dict:
        async with sem:
            try:
                price_data = await asyncio.to_thread(
                    svc.get_current_price, item.ticker, item.market
                )
                live_price = price_data.get("current_price", 0)
            except Exception:
                live_price = 0

        saved_price = item.current_price or 0
        if saved_price > 0 and live_price > 0:
            return_pct = round((live_price - saved_price) / saved_price * 100, 2)
        else:
            return_pct = None

        # 적중 판정: BUY→상승=적중, SELL→하락=적중, HOLD→제외
        hit = None
        if return_pct is not None and item.signal in ("BUY", "SELL"):
            if item.signal == "BUY":
                hit = return_pct > 0
            else:
                hit = return_pct < 0

        return {
            **_serialize_analysis(item),
            "live_price": _sanitize_val(live_price),
            "return_pct": return_pct,
            "hit": hit,
        }

    tasks = [_fetch_perf(item) for item in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    perf_items = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning(f"Performance fetch error: {r}")
            continue
        perf_items.append(r)

    # 적중률 계산 (HOLD 제외)
    hit_items = [p for p in perf_items if p["hit"] is not None]
    hit_rate = round(sum(1 for p in hit_items if p["hit"]) / len(hit_items) * 100, 1) if hit_items else None

    # 평균 수익률
    return_items = [p["return_pct"] for p in perf_items if p["return_pct"] is not None]
    avg_return = round(sum(return_items) / len(return_items), 2) if return_items else None

    return {
        "items": perf_items,
        "hit_rate": hit_rate,
        "avg_return": avg_return,
    }


def _sanitize_val(val: Any) -> Any:
    """numpy 타입을 native Python으로 변환."""
    try:
        import numpy as np
        if isinstance(val, (np.integer,)):
            return int(val)
        if isinstance(val, (np.floating,)):
            return float(val)
        if isinstance(val, np.ndarray):
            return val.tolist()
    except ImportError:
        pass
    return val


# ──────────────────────────────────────────────
# 4b. PUT "/{ticker}/pin" — 핀 토글
# ──────────────────────────────────────────────
@router.put("/{ticker}/pin")
async def toggle_pin(
    ticker: str,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """해당 종목의 최신 분석 레코드의 is_pinned를 토글."""
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.ticker == ticker,
        )
        .order_by(SavedAnalysisModel.analyzed_at.desc())
        .limit(1)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="해당 종목의 분석 기록이 없습니다")

    item.is_pinned = not (item.is_pinned or False)
    await session.commit()
    return {"ticker": ticker, "is_pinned": item.is_pinned}


# ──────────────────────────────────────────────
# 5. GET "/{ticker}" — 단건 최신
# ──────────────────────────────────────────────
@router.get("/{ticker}")
async def get_saved_analysis(
    ticker: str,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """가장 최근 저장된 분석 결과 1건 반환."""
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.ticker == ticker,
        )
        .order_by(SavedAnalysisModel.analyzed_at.desc())
        .limit(1)
    )
    item = result.scalar_one_or_none()
    if item is None:
        return None
    return _serialize_analysis(item)


# ──────────────────────────────────────────────
# 6. POST "" — 스마트 히스토리 저장
# ──────────────────────────────────────────────
@router.post("")
async def save_analysis(
    body: SaveAnalysisIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    # 가장 최근 같은 종목 레코드 조회
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.ticker == body.ticker,
        )
        .order_by(SavedAnalysisModel.analyzed_at.desc())
        .limit(1)
    )
    existing = result.scalar_one_or_none()

    now = datetime.now()
    should_create_new = True

    if existing:
        signal_changed = existing.signal != body.signal
        grade_changed = existing.grade != body.grade
        time_elapsed = (now - existing.analyzed_at).total_seconds() > 86400 if existing.analyzed_at else True

        if signal_changed or grade_changed or time_elapsed:
            should_create_new = True
        else:
            # 동일 신호/등급, 24시간 이내 → 기존 레코드 업데이트
            should_create_new = False
            existing.name = body.name
            existing.market = body.market
            existing.signal = body.signal
            existing.grade = body.grade
            existing.confidence = body.confidence
            existing.current_price = body.current_price
            existing.total_score = body.total_score
            existing.score_data = body.score_data
            existing.financials_data = body.financials_data
            existing.analyzed_at = now
            await session.commit()
            return {"ok": True, "id": existing.id, "ticker": body.ticker, "action": "updated"}

    item = SavedAnalysisModel(
        user_id=user.id,
        ticker=body.ticker,
        name=body.name,
        market=body.market,
        signal=body.signal,
        grade=body.grade,
        confidence=body.confidence,
        current_price=body.current_price,
        total_score=body.total_score,
        score_data=body.score_data,
        financials_data=body.financials_data,
        analyzed_at=now,
        created_at=now,
    )
    session.add(item)
    await session.commit()
    return {"ok": True, "id": item.id, "ticker": body.ticker, "action": "created"}


# ──────────────────────────────────────────────
# 7. PUT "/{analysis_id}/memo" — 메모 수정
# ──────────────────────────────────────────────
@router.put("/{analysis_id}/memo")
async def update_memo(
    analysis_id: int,
    body: UpdateMemoIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(SavedAnalysisModel).where(
            SavedAnalysisModel.id == analysis_id,
            SavedAnalysisModel.user_id == user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="분석 기록을 찾을 수 없습니다")
    item.memo = body.memo
    await session.commit()
    return {"ok": True, "id": analysis_id}


# ──────────────────────────────────────────────
# 8. POST "/bulk-delete" — 일괄 삭제
# ──────────────────────────────────────────────
@router.post("/bulk-delete")
async def bulk_delete_analyses(
    body: BulkDeleteIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if not body.ids:
        return {"ok": True, "deleted": 0}
    await session.execute(
        delete(SavedAnalysisModel).where(
            SavedAnalysisModel.id.in_(body.ids),
            SavedAnalysisModel.user_id == user.id,
        )
    )
    await session.commit()
    return {"ok": True, "deleted": len(body.ids)}


# ──────────────────────────────────────────────
# 9. DELETE "/{analysis_id}" — 단건 삭제
# ──────────────────────────────────────────────
@router.delete("/{analysis_id}")
async def delete_saved_analysis(
    analysis_id: int,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    await session.execute(
        delete(SavedAnalysisModel).where(
            SavedAnalysisModel.id == analysis_id,
            SavedAnalysisModel.user_id == user.id,
        )
    )
    await session.commit()
    return {"ok": True}

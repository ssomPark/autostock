"""Saved analysis CRUD routes (authenticated)."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.db.database import get_async_session
from src.models.db_models import UserModel, SavedAnalysisModel

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


@router.get("")
async def list_saved_analyses(
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(SavedAnalysisModel)
        .where(SavedAnalysisModel.user_id == user.id)
        .order_by(SavedAnalysisModel.analyzed_at.desc())
    )
    items = result.scalars().all()
    return [
        {
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
        }
        for item in items
    ]


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
    }


@router.post("")
async def save_analysis(
    body: SaveAnalysisIn,
    user: UserModel = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    # Upsert: 같은 user+ticker가 있으면 업데이트, 없으면 생성
    result = await session.execute(
        select(SavedAnalysisModel).where(
            SavedAnalysisModel.user_id == user.id,
            SavedAnalysisModel.ticker == body.ticker,
        )
    )
    item = result.scalar_one_or_none()

    if item:
        item.name = body.name
        item.market = body.market
        item.signal = body.signal
        item.grade = body.grade
        item.confidence = body.confidence
        item.current_price = body.current_price
        item.total_score = body.total_score
        item.score_data = body.score_data
        item.financials_data = body.financials_data
        item.analyzed_at = datetime.now()
    else:
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
            analyzed_at=datetime.now(),
        )
        session.add(item)

    await session.commit()
    return {"ok": True, "id": item.id, "ticker": body.ticker}


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

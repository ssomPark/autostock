"""Admin dashboard API routes."""

import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, func, select, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.dependencies import get_admin_user
from src.config.settings import settings
from src.db.database import get_async_session
from src.models.db_models import (
    AdRewardLogModel,
    DailyMetricSnapshotModel,
    EventStockModel,
    MarketEventModel,
    PaperAccountModel,
    PaperTradeModel,
    PipelineRunModel,
    PortfolioModel,
    SavedAnalysisModel,
    SiteSettingModel,
    UpdatePostModel,
    UserModel,
    WatchlistItemModel,
)

logger = logging.getLogger(__name__)

_KST_OFFSET = timezone(timedelta(hours=9))

router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Admin dashboard summary cards."""
    now_kst = datetime.now(_KST_OFFSET)
    # KST midnight → naive UTC for DB comparison
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    now = now_kst.astimezone(timezone.utc).replace(tzinfo=None)

    total_users = (await session.execute(func.count(UserModel.id))).scalar() or 0
    new_users_today = (
        await session.execute(
            select(func.count(UserModel.id)).where(UserModel.created_at >= today_start)
        )
    ).scalar() or 0

    total_trades = (await session.execute(select(func.count(PaperTradeModel.id)))).scalar() or 0
    trades_today = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.executed_at >= today_start)
        )
    ).scalar() or 0

    total_rewards = (await session.execute(select(func.count(AdRewardLogModel.id)))).scalar() or 0
    rewards_today = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.created_at >= today_start)
        )
    ).scalar() or 0
    total_reward_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed"
            )
        )
    ).scalar() or 0

    active_events = (
        await session.execute(
            select(func.count(MarketEventModel.id)).where(MarketEventModel.is_active == True)
        )
    ).scalar() or 0

    pipeline_runs_week = (
        await session.execute(
            select(func.count(PipelineRunModel.id)).where(
                PipelineRunModel.started_at >= now - timedelta(days=7)
            )
        )
    ).scalar() or 0

    # Saved analyses stats
    total_analyses = (
        await session.execute(select(func.count(SavedAnalysisModel.id)))
    ).scalar() or 0
    analyses_unique_users = (
        await session.execute(select(func.count(func.distinct(SavedAnalysisModel.user_id))))
    ).scalar() or 0
    analyses_today = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(SavedAnalysisModel.created_at >= today_start)
        )
    ).scalar() or 0

    # Watchlist stats
    watchlist_total = (
        await session.execute(select(func.count(WatchlistItemModel.id)))
    ).scalar() or 0
    watchlist_unique_users = (
        await session.execute(select(func.count(func.distinct(WatchlistItemModel.user_id))))
    ).scalar() or 0

    # Realtime visitor data from Redis
    visitors = {"today_total": 0, "today_anon": 0, "today_logged_in": 0, "page_views": 0}
    try:
        from src.utils.redis_cache import _get_redis
        r = await _get_redis()
        today_str = now_kst.strftime("%Y-%m-%d")
        today_total = await r.scard(f"visitors:{today_str}:all") or 0
        today_anon = await r.scard(f"visitors:{today_str}:anon") or 0
        today_logged_in = await r.scard(f"visitors:{today_str}:users") or 0
        pv = int(await r.get(f"visitors:{today_str}:pv") or 0)
        visitors = {
            "today_total": today_total,
            "today_anon": today_anon,
            "today_logged_in": today_logged_in,
            "page_views": pv,
        }
    except Exception as e:
        logger.debug(f"Redis visitor read failed: {e}")

    return {
        "users": {"total": total_users, "today": new_users_today},
        "trades": {"total": total_trades, "today": trades_today},
        "ad_rewards": {"total": total_rewards, "today": rewards_today, "total_amount": total_reward_amount},
        "saved_analyses": {"total": total_analyses, "unique_users": analyses_unique_users, "today": analyses_today},
        "watchlist": {"total_items": watchlist_total, "unique_users": watchlist_unique_users},
        "events": {"active": active_events},
        "pipeline": {"runs_this_week": pipeline_runs_week},
        "visitors": visitors,
    }


@router.get("/users")
async def list_users(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    search: str = Query("", description="Search by name or email"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List users with pagination and search."""
    query = select(UserModel)
    count_query = select(func.count(UserModel.id))

    if search:
        pattern = f"%{search}%"
        query = query.where(UserModel.name.ilike(pattern) | UserModel.email.ilike(pattern))
        count_query = count_query.where(UserModel.name.ilike(pattern) | UserModel.email.ilike(pattern))

    total = (await session.execute(count_query)).scalar() or 0
    result = await session.execute(
        query.order_by(UserModel.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    users = result.scalars().all()

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "avatar_url": u.avatar_url,
                "provider": u.provider,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/saved-analyses/stats")
async def saved_analyses_stats(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Admin-level saved analyses aggregate statistics."""
    total = (
        await session.execute(select(func.count(SavedAnalysisModel.id)))
    ).scalar() or 0
    unique_tickers = (
        await session.execute(select(func.count(func.distinct(SavedAnalysisModel.ticker))))
    ).scalar() or 0

    # Signal distribution
    signal_rows = (
        await session.execute(
            select(SavedAnalysisModel.signal, func.count(SavedAnalysisModel.id))
            .group_by(SavedAnalysisModel.signal)
        )
    ).all()
    signal_counts = {row[0]: row[1] for row in signal_rows}

    # Grade distribution
    grade_rows = (
        await session.execute(
            select(SavedAnalysisModel.grade, func.count(SavedAnalysisModel.id))
            .group_by(SavedAnalysisModel.grade)
        )
    ).all()
    grade_distribution = {row[0]: row[1] for row in grade_rows}

    # Top analyzed tickers
    top_rows = (
        await session.execute(
            select(SavedAnalysisModel.ticker, SavedAnalysisModel.name, func.count(SavedAnalysisModel.id).label("cnt"))
            .group_by(SavedAnalysisModel.ticker, SavedAnalysisModel.name)
            .order_by(func.count(SavedAnalysisModel.id).desc())
            .limit(5)
        )
    ).all()
    top_analyzed_tickers = [{"ticker": r[0], "name": r[1], "count": r[2]} for r in top_rows]

    # Recent analyses (no user info for privacy)
    recent_rows = (
        await session.execute(
            select(SavedAnalysisModel)
            .order_by(SavedAnalysisModel.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    recent_analyses = [
        {
            "id": a.id,
            "ticker": a.ticker,
            "name": a.name,
            "market": a.market,
            "signal": a.signal,
            "grade": a.grade,
            "confidence": a.confidence,
            "analyzed_at": a.analyzed_at.isoformat() if a.analyzed_at else None,
        }
        for a in recent_rows
    ]

    return {
        "total": total,
        "unique_tickers": unique_tickers,
        "signal_counts": signal_counts,
        "grade_distribution": grade_distribution,
        "top_analyzed_tickers": top_analyzed_tickers,
        "recent_analyses": recent_analyses,
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: int,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """User detail with accounts, reward count, analysis count, and watchlist count."""
    result = await session.execute(
        select(UserModel).options(selectinload(UserModel.paper_accounts)).where(UserModel.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    reward_count = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.user_id == user_id)
        )
    ).scalar() or 0

    analysis_count = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(SavedAnalysisModel.user_id == user_id)
        )
    ).scalar() or 0

    watchlist_count = (
        await session.execute(
            select(func.count(WatchlistItemModel.id)).where(WatchlistItemModel.user_id == user_id)
        )
    ).scalar() or 0

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "provider": user.provider,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "cash_balance": a.cash_balance,
                "bonus_balance": a.bonus_balance,
                "initial_balance": a.initial_balance,
                "currency": a.currency,
                "is_active": a.is_active,
            }
            for a in user.paper_accounts
        ],
        "reward_count": reward_count,
        "analysis_count": analysis_count,
        "watchlist_count": watchlist_count,
    }


@router.get("/ad-rewards")
async def list_ad_rewards(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    status_filter: str = Query("", alias="status", description="Filter by status: pending/claimed/expired"),
    user_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
):
    """Ad reward logs with filtering."""
    query = select(AdRewardLogModel)
    count_query = select(func.count(AdRewardLogModel.id))

    if status_filter:
        query = query.where(AdRewardLogModel.status == status_filter)
        count_query = count_query.where(AdRewardLogModel.status == status_filter)
    if user_id is not None:
        query = query.where(AdRewardLogModel.user_id == user_id)
        count_query = count_query.where(AdRewardLogModel.user_id == user_id)

    total = (await session.execute(count_query)).scalar() or 0
    result = await session.execute(
        query.order_by(AdRewardLogModel.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "account_id": log.account_id,
                "user_id": log.user_id,
                "reward_amount": log.reward_amount,
                "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "claimed_at": log.claimed_at.isoformat() if log.claimed_at else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/ad-rewards/stats")
async def ad_reward_stats(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Ad reward aggregate statistics."""
    now_kst = datetime.now(_KST_OFFSET)
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)

    total_claimed = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(AdRewardLogModel.status == "claimed")
        )
    ).scalar() or 0

    total_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed"
            )
        )
    ).scalar() or 0

    today_count = (
        await session.execute(
            select(func.count(AdRewardLogModel.id)).where(
                AdRewardLogModel.created_at >= today_start
            )
        )
    ).scalar() or 0

    today_amount = (
        await session.execute(
            select(func.coalesce(func.sum(AdRewardLogModel.reward_amount), 0)).where(
                AdRewardLogModel.status == "claimed",
                AdRewardLogModel.created_at >= today_start,
            )
        )
    ).scalar() or 0

    avg_amount = total_amount / total_claimed if total_claimed > 0 else 0

    return {
        "total_claimed": total_claimed,
        "total_amount": total_amount,
        "today_count": today_count,
        "today_amount": today_amount,
        "avg_amount": round(avg_amount),
    }


@router.get("/ad-rewards/settings")
async def ad_reward_settings(
    _=Depends(get_admin_user),
):
    """Current ad reward settings."""
    return {
        "cooldown_seconds": settings.ad_reward_cooldown_seconds,
        "min_amount": settings.ad_reward_min_amount,
        "max_amount": settings.ad_reward_max_amount,
        "min_watch_seconds": settings.ad_reward_min_watch_seconds,
        "token_expire_seconds": settings.ad_reward_token_expire_seconds,
    }


@router.get("/paper-trading/stats")
async def paper_trading_stats(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Paper trading aggregate statistics."""
    total_accounts = (await session.execute(select(func.count(PaperAccountModel.id)))).scalar() or 0
    active_accounts = (
        await session.execute(
            select(func.count(PaperAccountModel.id)).where(PaperAccountModel.is_active == True)
        )
    ).scalar() or 0

    total_trades = (await session.execute(select(func.count(PaperTradeModel.id)))).scalar() or 0
    buy_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.side == "BUY")
        )
    ).scalar() or 0
    sell_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.side == "SELL")
        )
    ).scalar() or 0

    total_volume = (
        await session.execute(
            select(func.coalesce(func.sum(PaperTradeModel.total_amount), 0))
        )
    ).scalar() or 0

    return {
        "accounts": {"total": total_accounts, "active": active_accounts},
        "trades": {"total": total_trades, "buy": buy_count, "sell": sell_count},
        "total_volume": total_volume,
    }


@router.get("/events")
async def list_events_admin(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
):
    """List all events including inactive ones."""
    count_total = (await session.execute(select(func.count(MarketEventModel.id)))).scalar() or 0
    result = await session.execute(
        select(MarketEventModel)
        .options(selectinload(MarketEventModel.stocks))
        .order_by(MarketEventModel.event_date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    events = result.scalars().all()

    return {
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "description": e.description,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "category": e.category,
                "impact_level": e.impact_level,
                "is_active": e.is_active,
                "stock_count": len(e.stocks),
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
        "total": count_total,
        "page": page,
        "size": size,
    }


class AutoGenerateBody(BaseModel):
    year: int
    month: int
    market: str = "ALL"  # KR | US | ALL


@router.post("/events/auto-generate")
async def auto_generate_events(
    body: AutoGenerateBody,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """OpenAI를 호출하여 특정 월의 주요 시장 이벤트를 자동 생성."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=400, detail="OpenAI API 키가 설정되지 않았습니다.")

    market_label = {"KR": "한국", "US": "미국", "ALL": "한국 및 미국"}.get(body.market, "한국 및 미국")

    prompt = f"""당신은 주식 시장 이벤트 분석가입니다.
{body.year}년 {body.month}월 {market_label} 주식시장의 주요 이벤트를 분석해주세요.

## 필수 검증 규칙 (반드시 준수)

1. **IPO 이벤트**: 이미 상장된 기업을 IPO로 등록하지 마세요.
   - 카카오, 카카오페이, 카카오게임즈, 네이버, 핀터레스트, 쿠팡 등은 이미 상장된 기업입니다.
   - IPO 이벤트는 실제로 상장이 예정된 기업만 포함하세요.
   - 확실하지 않으면 IPO 카테고리를 아예 포함하지 마세요.

2. **FOMC 금리 결정**: 연 8회 고정 일정입니다. 해당 월에 FOMC가 없으면 포함하지 마세요.
   - 2026년 FOMC 예상 일정: 1/28, 3/18, 5/6, 6/17, 7/29, 9/16, 10/28, 12/16

3. **한국은행 금통위**: 연 8회 고정 일정입니다. 해당 월에 금통위가 없으면 포함하지 마세요.
   - 2026년 금통위 예상 일정: 1/15, 2/27, 4/9, 5/28, 7/9, 8/27, 10/15, 11/26

4. **미국 대선**: 4년 주기입니다. 2024년에 실시, 다음은 2028년. 2026년은 중간선거입니다.

5. **실적 발표**: 동일 기업의 같은 분기 실적을 중복 등록하지 마세요.
   - 삼성전자 잠정실적(4월 초)과 확정실적(4월 말)은 별개 이벤트로 가능하지만, 같은 것을 2번 넣지 마세요.

6. **컨퍼런스**: 실제 개최 시기를 확인하세요.
   - CES: 1월, MWC: 2-3월, Google I/O: 5월, WWDC: 6월, GTC: 3월

7. **구체성**: "주요 기업 IPO", "글로벌 경제 포럼" 같은 모호한 이벤트는 포함하지 마세요.
   기업명, 행사명 등 구체적인 이름이 있는 이벤트만 포함하세요.

## 카테고리
- policy: 정책/규제 (금리 결정, 정부 정책 등)
- earnings: 실적 발표 (주요 기업 분기 실적)
- product: 제품/서비스 출시
- conference: 컨퍼런스/행사
- ipo: IPO/상장 (실제 예정된 것만)
- dividend: 배당/주주환원
- global: 글로벌 이벤트 (정상회의, 경제지표 등)

## 수혜종목
각 이벤트에 대해 수혜종목 1~3개를 포함해주세요.
한국 종목은 6자리 숫자 종목코드, 미국 종목은 알파벳 티커를 사용하세요.

## 응답 형식 (JSON만)
{{
  "events": [
    {{
      "title": "구체적인 이벤트 제목",
      "description": "이벤트 설명 (1~2문장)",
      "event_date": "YYYY-MM-DD",
      "category": "policy|earnings|product|conference|ipo|dividend|global",
      "impact_level": "high|medium|low",
      "stocks": [
        {{
          "ticker": "종목코드",
          "name": "종목명",
          "market": "KR|US",
          "expected_impact": "positive|negative|neutral",
          "relation_type": "direct|indirect|sector",
          "reasoning": "수혜 사유 (1문장)"
        }}
      ]
    }}
  ]
}}

실제로 확인 가능한 이벤트를 기반으로, 8~12개의 이벤트를 생성하세요.
날짜는 {body.year}년 {body.month}월 내 날짜여야 합니다.
확실하지 않은 이벤트는 포함하지 마세요."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
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
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error("OpenAI API error: %s", e.response.text)
        raise HTTPException(status_code=502, detail=f"OpenAI API 오류: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error("OpenAI request failed: %s", e)
        raise HTTPException(status_code=502, detail="OpenAI API 연결 실패")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        events_data = parsed.get("events", [])
    except (KeyError, json.JSONDecodeError) as e:
        logger.error("Failed to parse OpenAI response: %s", e)
        raise HTTPException(status_code=502, detail="OpenAI 응답 파싱 실패")

    # 같은 월 내 기존 이벤트 title 조회 (중복 방지)
    existing_result = await session.execute(
        select(MarketEventModel.title).where(
            and_(
                extract("year", MarketEventModel.event_date) == body.year,
                extract("month", MarketEventModel.event_date) == body.month,
            )
        )
    )
    existing_titles = {row[0] for row in existing_result.all()}

    valid_categories = {"policy", "earnings", "product", "conference", "ipo", "dividend", "global"}
    valid_impacts = {"high", "medium", "low"}
    valid_expected = {"positive", "negative", "neutral"}
    valid_relations = {"direct", "indirect", "sector"}

    created_events = []
    for ev in events_data:
        title = ev.get("title", "").strip()
        if not title or title in existing_titles:
            continue

        category = ev.get("category", "global")
        if category not in valid_categories:
            category = "global"
        impact_level = ev.get("impact_level", "medium")
        if impact_level not in valid_impacts:
            impact_level = "medium"

        try:
            event_date = datetime.strptime(ev.get("event_date", ""), "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        event = MarketEventModel(
            title=title,
            description=ev.get("description", ""),
            event_date=event_date,
            category=category,
            impact_level=impact_level,
        )
        session.add(event)
        await session.flush()

        for stock in ev.get("stocks", []):
            ticker = stock.get("ticker", "").strip()
            name = stock.get("name", "").strip()
            market = stock.get("market", "KR").upper()
            if not ticker or not name:
                continue
            if market not in ("KR", "US"):
                market = "KR"

            expected_impact = stock.get("expected_impact", "positive")
            if expected_impact not in valid_expected:
                expected_impact = "positive"
            relation_type = stock.get("relation_type", "direct")
            if relation_type not in valid_relations:
                relation_type = "direct"

            es = EventStockModel(
                event_id=event.id,
                ticker=ticker,
                name=name,
                market=market,
                expected_impact=expected_impact,
                relation_type=relation_type,
                reasoning=stock.get("reasoning", ""),
            )
            session.add(es)

        existing_titles.add(title)
        created_events.append(event)

    await session.commit()

    # Reload with stocks
    result_events = []
    for event in created_events:
        stmt = (
            select(MarketEventModel)
            .options(selectinload(MarketEventModel.stocks))
            .where(MarketEventModel.id == event.id)
        )
        result = await session.execute(stmt)
        ev = result.scalar_one()
        result_events.append({
            "id": ev.id,
            "title": ev.title,
            "description": ev.description,
            "event_date": ev.event_date.isoformat() if ev.event_date else None,
            "category": ev.category,
            "impact_level": ev.impact_level,
            "is_active": ev.is_active,
            "stock_count": len(ev.stocks),
        })

    return {
        "success": True,
        "generated_count": len(result_events),
        "events": result_events,
    }


@router.patch("/events/{event_id}/toggle-active")
async def toggle_event_active(
    event_id: int,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Toggle event active/inactive status."""
    from fastapi import HTTPException

    result = await session.execute(
        select(MarketEventModel).where(MarketEventModel.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event.is_active = not event.is_active
    await session.commit()

    return {"id": event.id, "is_active": event.is_active}


# ─── Navigation Order Management ─────────────────────────────

DEFAULT_NAV_ORDER = [
    "/", "/search", "/my-analyses", "/recommendations",
    "/events", "/paper-trading", "/news", "/compare", "/admin",
]


class NavOrderBody(BaseModel):
    order: list[str]


@router.get("/navigation")
async def get_navigation_order(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """현재 메뉴 순서 반환 (DB에서 조회, 없으면 기본값)."""
    result = await session.execute(
        select(SiteSettingModel).where(SiteSettingModel.key == "nav_order")
    )
    setting = result.scalar_one_or_none()
    if setting:
        order = json.loads(setting.value)
    else:
        order = DEFAULT_NAV_ORDER
    return {"order": order}


@router.put("/navigation")
async def update_navigation_order(
    body: NavOrderBody,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """메뉴 순서 저장."""
    result = await session.execute(
        select(SiteSettingModel).where(SiteSettingModel.key == "nav_order")
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = json.dumps(body.order)
    else:
        session.add(SiteSettingModel(key="nav_order", value=json.dumps(body.order)))
    await session.commit()
    return {"ok": True, "order": body.order}


# ─── Metrics (핵심 지표) ──────────────────────────────────────


async def _collect_daily_snapshot(session: AsyncSession) -> dict:
    """오늘 날짜의 일일 지표 스냅샷을 수집하여 DB에 UPSERT."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    now_kst = datetime.now(_KST_OFFSET)
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    tomorrow_start = today_start + timedelta(days=1)

    # Total users
    total_users = (
        await session.execute(select(func.count(UserModel.id)))
    ).scalar() or 0

    # New users today
    new_users = (
        await session.execute(
            select(func.count(UserModel.id)).where(
                UserModel.created_at >= today_start,
                UserModel.created_at < tomorrow_start,
            )
        )
    ).scalar() or 0

    # Active users (DAU): logged in OR saved analysis OR traded today
    login_users = select(UserModel.id).where(
        UserModel.last_login_at >= today_start,
        UserModel.last_login_at < tomorrow_start,
    )
    analysis_users = select(SavedAnalysisModel.user_id).where(
        SavedAnalysisModel.created_at >= today_start,
        SavedAnalysisModel.created_at < tomorrow_start,
    )
    trade_users = (
        select(PaperAccountModel.user_id)
        .join(PaperTradeModel, PaperTradeModel.account_id == PaperAccountModel.id)
        .where(
            PaperTradeModel.executed_at >= today_start,
            PaperTradeModel.executed_at < tomorrow_start,
        )
    )
    union_q = login_users.union(analysis_users, trade_users).subquery()
    active_users = (
        await session.execute(select(func.count()).select_from(union_q))
    ).scalar() or 0

    # Analysis count today
    analysis_count = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(
                SavedAnalysisModel.created_at >= today_start,
                SavedAnalysisModel.created_at < tomorrow_start,
            )
        )
    ).scalar() or 0

    # Trade count today
    trade_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(
                PaperTradeModel.executed_at >= today_start,
                PaperTradeModel.executed_at < tomorrow_start,
            )
        )
    ).scalar() or 0

    # Pin count today
    pin_count = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(
                SavedAnalysisModel.is_pinned == True,
                SavedAnalysisModel.created_at >= today_start,
                SavedAnalysisModel.created_at < tomorrow_start,
            )
        )
    ).scalar() or 0

    # Portfolio count
    portfolio_count = (
        await session.execute(select(func.count(PortfolioModel.id)))
    ).scalar() or 0

    # Anonymous IPs + Visitor tracking from Redis
    anonymous_ips = 0
    page_views = 0
    unique_visitors = 0
    unique_visitors_anon = 0
    try:
        from src.utils.redis_cache import _get_redis
        r = await _get_redis()
        today_str = now_kst.strftime("%Y-%m-%d")

        # Legacy analysis_limit IP scan
        cursor, keys = 0, []
        while True:
            cursor, batch = await r.scan(cursor, match=f"analysis_limit:*:{today_str}", count=200)
            keys.extend(batch)
            if cursor == 0:
                break
        ips = set()
        for k in keys:
            parts = k.split(":")
            if len(parts) >= 3:
                ips.add(parts[1])
        anonymous_ips = len(ips)

        # Visitor tracking data
        page_views = int(await r.get(f"visitors:{today_str}:pv") or 0)
        unique_visitors = await r.scard(f"visitors:{today_str}:all") or 0
        unique_visitors_anon = await r.scard(f"visitors:{today_str}:anon") or 0
    except Exception as e:
        logger.debug(f"Redis visitor/anonymous read failed: {e}")

    # Pipeline runs today
    pipeline_runs = (
        await session.execute(
            select(func.count(PipelineRunModel.id)).where(
                PipelineRunModel.started_at >= today_start,
                PipelineRunModel.started_at < tomorrow_start,
            )
        )
    ).scalar() or 0

    snapshot_data = {
        "date": today_start,
        "total_users": total_users,
        "new_users": new_users,
        "active_users": active_users,
        "analysis_count": analysis_count,
        "trade_count": trade_count,
        "pin_count": pin_count,
        "portfolio_count": portfolio_count,
        "anonymous_ips": anonymous_ips,
        "pipeline_runs": pipeline_runs,
        "page_views": page_views,
        "unique_visitors": unique_visitors,
        "unique_visitors_anon": unique_visitors_anon,
    }

    # UPSERT
    stmt = pg_insert(DailyMetricSnapshotModel).values(**snapshot_data)
    stmt = stmt.on_conflict_do_update(
        index_elements=["date"],
        set_={k: v for k, v in snapshot_data.items() if k != "date"},
    )
    await session.execute(stmt)
    await session.commit()

    return snapshot_data


@router.post("/metrics/snapshot")
async def trigger_snapshot(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """수동으로 오늘 스냅샷 수집."""
    data = await _collect_daily_snapshot(session)
    return {"ok": True, "snapshot": {k: str(v) if isinstance(v, datetime) else v for k, v in data.items()}}


@router.get("/visitors/top-pages")
async def visitors_top_pages(
    _=Depends(get_admin_user),
):
    """오늘 인기 페이지 TOP 10 (Redis HASH에서 조회)."""
    try:
        from src.utils.redis_cache import _get_redis
        r = await _get_redis()
        now_kst = datetime.now(_KST_OFFSET)
        today_str = now_kst.strftime("%Y-%m-%d")
        paths = await r.hgetall(f"visitors:{today_str}:paths")
        sorted_paths = sorted(paths.items(), key=lambda x: int(x[1]), reverse=True)[:10]
        return {"pages": [{"path": p, "count": int(c)} for p, c in sorted_paths]}
    except Exception as e:
        logger.debug(f"Redis top-pages failed: {e}")
        return {"pages": []}


@router.get("/metrics")
async def get_metrics(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    period: int = Query(7, description="기간 (7/30/90일)"),
):
    """핵심 지표 조회."""
    if period not in (7, 30, 90):
        period = 7

    now_kst = datetime.now(_KST_OFFSET)
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    tomorrow_start = today_start + timedelta(days=1)
    period_start = today_start - timedelta(days=period)
    prev_period_start = period_start - timedelta(days=period)

    # ── Total users ──
    total_users = (
        await session.execute(select(func.count(UserModel.id)))
    ).scalar() or 0

    # ── New users in period ──
    new_users = (
        await session.execute(
            select(func.count(UserModel.id)).where(UserModel.created_at >= period_start)
        )
    ).scalar() or 0

    prev_new_users = (
        await session.execute(
            select(func.count(UserModel.id)).where(
                UserModel.created_at >= prev_period_start,
                UserModel.created_at < period_start,
            )
        )
    ).scalar() or 0

    growth_rate = ((new_users - prev_new_users) / prev_new_users * 100) if prev_new_users > 0 else 0.0

    # ── DAU (today, realtime) ──
    login_users = select(UserModel.id).where(
        UserModel.last_login_at >= today_start,
        UserModel.last_login_at < tomorrow_start,
    )
    analysis_users = select(SavedAnalysisModel.user_id).where(
        SavedAnalysisModel.created_at >= today_start,
        SavedAnalysisModel.created_at < tomorrow_start,
    )
    trade_users = (
        select(PaperAccountModel.user_id)
        .join(PaperTradeModel, PaperTradeModel.account_id == PaperAccountModel.id)
        .where(
            PaperTradeModel.executed_at >= today_start,
            PaperTradeModel.executed_at < tomorrow_start,
        )
    )
    union_q = login_users.union(analysis_users, trade_users).subquery()
    dau = (
        await session.execute(select(func.count()).select_from(union_q))
    ).scalar() or 0

    # ── MAU (30-day active) ──
    mau_start = today_start - timedelta(days=30)
    login_mau = select(UserModel.id).where(UserModel.last_login_at >= mau_start)
    analysis_mau = select(SavedAnalysisModel.user_id).where(SavedAnalysisModel.created_at >= mau_start)
    trade_mau = (
        select(PaperAccountModel.user_id)
        .join(PaperTradeModel, PaperTradeModel.account_id == PaperAccountModel.id)
        .where(PaperTradeModel.executed_at >= mau_start)
    )
    mau_union = login_mau.union(analysis_mau, trade_mau).subquery()
    mau = (
        await session.execute(select(func.count()).select_from(mau_union))
    ).scalar() or 0

    # ── Active users in period ──
    login_period = select(UserModel.id).where(UserModel.last_login_at >= period_start)
    analysis_period = select(SavedAnalysisModel.user_id).where(SavedAnalysisModel.created_at >= period_start)
    trade_period = (
        select(PaperAccountModel.user_id)
        .join(PaperTradeModel, PaperTradeModel.account_id == PaperAccountModel.id)
        .where(PaperTradeModel.executed_at >= period_start)
    )
    active_union = login_period.union(analysis_period, trade_period).subquery()
    active_users = (
        await session.execute(select(func.count()).select_from(active_union))
    ).scalar() or 0

    # ── Retention ──
    login_prev = select(UserModel.id).where(
        UserModel.last_login_at >= prev_period_start,
        UserModel.last_login_at < period_start,
    )
    analysis_prev = select(SavedAnalysisModel.user_id).where(
        SavedAnalysisModel.created_at >= prev_period_start,
        SavedAnalysisModel.created_at < period_start,
    )
    trade_prev = (
        select(PaperAccountModel.user_id)
        .join(PaperTradeModel, PaperTradeModel.account_id == PaperAccountModel.id)
        .where(
            PaperTradeModel.executed_at >= prev_period_start,
            PaperTradeModel.executed_at < period_start,
        )
    )
    prev_active_union = login_prev.union(analysis_prev, trade_prev).subquery()

    # Intersection: users active in BOTH periods
    curr_active_sub = login_period.union(analysis_period, trade_period).subquery()
    retained = (
        await session.execute(
            select(func.count()).select_from(
                select(prev_active_union.c[prev_active_union.c.keys()[0]])
                .where(prev_active_union.c[prev_active_union.c.keys()[0]].in_(
                    select(curr_active_sub.c[curr_active_sub.c.keys()[0]])
                ))
                .subquery()
            )
        )
    ).scalar() or 0
    prev_active_count = (
        await session.execute(select(func.count()).select_from(prev_active_union))
    ).scalar() or 0
    retention_rate = (retained / prev_active_count * 100) if prev_active_count > 0 else 0.0

    # ── Feature usage ──
    analyses_count = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(SavedAnalysisModel.created_at >= period_start)
        )
    ).scalar() or 0
    trades_count = (
        await session.execute(
            select(func.count(PaperTradeModel.id)).where(PaperTradeModel.executed_at >= period_start)
        )
    ).scalar() or 0
    pins_count = (
        await session.execute(
            select(func.count(SavedAnalysisModel.id)).where(
                SavedAnalysisModel.is_pinned == True,
                SavedAnalysisModel.created_at >= period_start,
            )
        )
    ).scalar() or 0

    # ── Engagement ──
    avg_analyses = (analyses_count / active_users) if active_users > 0 else 0.0
    avg_trades = (trades_count / active_users) if active_users > 0 else 0.0

    # ── Segmentation ──
    inactive = total_users - active_users

    # ── Daily trend: compute from raw tables + supplement with snapshots ──
    # Generate date range for the period
    date_range = []
    cursor_date = period_start
    while cursor_date <= today_start:
        date_range.append(cursor_date)
        cursor_date += timedelta(days=1)

    # New users per day (from raw table)
    new_users_rows = (
        await session.execute(
            select(
                cast(UserModel.created_at, Date).label("day"),
                func.count(UserModel.id),
            )
            .where(UserModel.created_at >= period_start, UserModel.created_at < tomorrow_start)
            .group_by(cast(UserModel.created_at, Date))
        )
    ).all()
    new_users_map = {row[0]: row[1] for row in new_users_rows}

    # Analyses per day (from raw table)
    analysis_rows = (
        await session.execute(
            select(
                cast(SavedAnalysisModel.created_at, Date).label("day"),
                func.count(SavedAnalysisModel.id),
            )
            .where(SavedAnalysisModel.created_at >= period_start, SavedAnalysisModel.created_at < tomorrow_start)
            .group_by(cast(SavedAnalysisModel.created_at, Date))
        )
    ).all()
    analysis_map = {row[0]: row[1] for row in analysis_rows}

    # Trades per day (from raw table)
    trades_rows = (
        await session.execute(
            select(
                cast(PaperTradeModel.executed_at, Date).label("day"),
                func.count(PaperTradeModel.id),
            )
            .where(PaperTradeModel.executed_at >= period_start, PaperTradeModel.executed_at < tomorrow_start)
            .group_by(cast(PaperTradeModel.executed_at, Date))
        )
    ).all()
    trades_map = {row[0]: row[1] for row in trades_rows}

    # Pipeline runs per day (from raw table)
    pipeline_rows = (
        await session.execute(
            select(
                cast(PipelineRunModel.started_at, Date).label("day"),
                func.count(PipelineRunModel.id),
            )
            .where(PipelineRunModel.started_at >= period_start, PipelineRunModel.started_at < tomorrow_start)
            .group_by(cast(PipelineRunModel.started_at, Date))
        )
    ).all()
    pipeline_map = {row[0]: row[1] for row in pipeline_rows}

    # Snapshots for active_users / pin_count / anonymous_ips (only available from snapshots)
    snapshots_result = await session.execute(
        select(DailyMetricSnapshotModel)
        .where(DailyMetricSnapshotModel.date >= period_start)
        .order_by(DailyMetricSnapshotModel.date.asc())
    )
    snapshots = snapshots_result.scalars().all()
    snapshot_map = {}
    for snap in snapshots:
        snap_date = snap.date.date() if isinstance(snap.date, datetime) else snap.date
        snapshot_map[snap_date] = snap

    # Build daily array
    daily = []
    for d in date_range:
        day_date = d.date() if isinstance(d, datetime) else d
        snap = snapshot_map.get(day_date)
        daily.append({
            "date": d.strftime("%m-%d"),
            "active_users": snap.active_users if snap else 0,
            "new_users": new_users_map.get(day_date, 0),
            "analysis_count": analysis_map.get(day_date, 0),
            "trade_count": trades_map.get(day_date, 0),
            "pin_count": snap.pin_count if snap else 0,
            "anonymous_ips": snap.anonymous_ips if snap else 0,
            "pipeline_runs": pipeline_map.get(day_date, 0),
            "page_views": getattr(snap, "page_views", 0) or 0,
            "unique_visitors": getattr(snap, "unique_visitors", 0) or 0,
            "unique_visitors_anon": getattr(snap, "unique_visitors_anon", 0) or 0,
        })

    # Compute avg visitors from snapshots
    visitor_values = [getattr(s, "unique_visitors", 0) or 0 for s in snapshots if (getattr(s, "unique_visitors", 0) or 0) > 0]
    avg_visitors = round(sum(visitor_values) / len(visitor_values), 1) if visitor_values else 0
    total_page_views = sum(getattr(s, "page_views", 0) or 0 for s in snapshots)

    return {
        "period": period,
        "summary": {
            "total_users": total_users,
            "new_users": new_users,
            "active_users": active_users,
            "dau": dau,
            "mau": mau,
            "growth_rate": round(growth_rate, 1),
            "retention_rate": round(retention_rate, 1),
            "avg_visitors": avg_visitors,
            "total_page_views": total_page_views,
        },
        "feature_usage": {
            "analyses": analyses_count,
            "trades": trades_count,
            "pins": pins_count,
        },
        "engagement": {
            "avg_analyses_per_user": round(avg_analyses, 2),
            "avg_trades_per_user": round(avg_trades, 2),
        },
        "segmentation": {
            "registered": total_users,
            "active_logged_in": active_users,
            "inactive": inactive,
        },
        "daily": daily,
    }


# ─── Update Posts (업데이트 게시판) ──────────────────────────

VALID_UPDATE_CATEGORIES = {"feature", "bugfix", "announcement", "maintenance"}


class UpdatePostBody(BaseModel):
    title: str
    content: str
    category: str = "announcement"
    is_published: bool = True


@router.get("/updates")
async def list_updates_admin(
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """관리자용 업데이트 목록 (전체)."""
    count_total = (await session.execute(select(func.count(UpdatePostModel.id)))).scalar() or 0
    result = await session.execute(
        select(UpdatePostModel)
        .order_by(UpdatePostModel.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    posts = result.scalars().all()

    return {
        "posts": [
            {
                "id": p.id,
                "title": p.title,
                "content": p.content,
                "category": p.category,
                "is_published": p.is_published,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in posts
        ],
        "total": count_total,
        "page": page,
        "size": size,
    }


@router.post("/updates")
async def create_update(
    body: UpdatePostBody,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """업데이트 게시글 생성."""
    category = body.category if body.category in VALID_UPDATE_CATEGORIES else "announcement"
    post = UpdatePostModel(
        title=body.title,
        content=body.content,
        category=category,
        is_published=body.is_published,
    )
    session.add(post)
    await session.commit()
    await session.refresh(post)

    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "category": post.category,
        "is_published": post.is_published,
        "created_at": post.created_at.isoformat() if post.created_at else None,
    }


@router.put("/updates/{post_id}")
async def update_update(
    post_id: int,
    body: UpdatePostBody,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """업데이트 게시글 수정."""
    result = await session.execute(
        select(UpdatePostModel).where(UpdatePostModel.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Update post not found")

    post.title = body.title
    post.content = body.content
    post.category = body.category if body.category in VALID_UPDATE_CATEGORIES else post.category
    post.is_published = body.is_published
    post.updated_at = datetime.now()
    await session.commit()

    return {
        "id": post.id,
        "title": post.title,
        "content": post.content,
        "category": post.category,
        "is_published": post.is_published,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
    }


@router.delete("/updates/{post_id}")
async def delete_update(
    post_id: int,
    _=Depends(get_admin_user),
    session: AsyncSession = Depends(get_async_session),
):
    """업데이트 게시글 삭제."""
    result = await session.execute(
        select(UpdatePostModel).where(UpdatePostModel.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Update post not found")

    await session.delete(post)
    await session.commit()
    return {"ok": True}

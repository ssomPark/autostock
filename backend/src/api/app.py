"""FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.config.settings import settings
from src.db.database import init_db, close_db
from src.api.routes import recommendations, analysis, news, pipeline, websocket, n8n, auth, watchlist, saved_analysis, prices, paper_trading, fundamental, events, admin, notifications, portfolio, community

logger = logging.getLogger(__name__)


_scheduler = None
_order_checker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global _scheduler, _order_checker
    logger.info("Starting TradeRadar API server...")
    try:
        await init_db()
        logger.info("Database connected successfully")
    except Exception as e:
        logger.warning(f"Database not available (running without DB): {e}")

    # Start daily scheduler (pipeline + metrics snapshot)
    try:
        from src.scheduler.daily_scheduler import DailyScheduler
        _scheduler = DailyScheduler()
        _scheduler.start()
    except Exception as e:
        logger.warning(f"Scheduler not started: {e}")

    # Start order checker (limit/stop-loss/scheduled order execution)
    try:
        from src.scheduler.order_checker import OrderChecker
        _order_checker = OrderChecker()
        _order_checker.start()
    except Exception as e:
        logger.warning(f"Order checker not started: {e}")

    yield

    logger.info("Shutting down TradeRadar API server...")
    if _order_checker:
        try:
            _order_checker.stop()
        except Exception:
            pass
    if _scheduler:
        try:
            _scheduler.stop()
        except Exception:
            pass
    try:
        await close_db()
    except Exception:
        pass


app = FastAPI(
    title="TradeRadar API",
    description="Multi-Agent Stock Analysis System API",
    version="0.1.0",
    lifespan=lifespan,
)

_cors_origins = [settings.frontend_url]
if "localhost" in settings.frontend_url or "127.0.0.1" in settings.frontend_url:
    # Dev mode: add extra local origins
    _cors_origins += ["http://localhost:3000", "http://localhost:3100"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Remaining", "X-RateLimit-Limit", "X-RateLimit-Reset"],
)

# SessionMiddleware for authlib OAuth state storage
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)

# Visitor tracking middleware (records all /api/* requests to Redis)
from src.middleware.visitor_tracking import VisitorTrackingMiddleware
app.add_middleware(VisitorTrackingMiddleware)

app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])
app.include_router(n8n.router, prefix="/api/n8n", tags=["n8n"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(saved_analysis.router, prefix="/api/saved-analyses", tags=["saved-analyses"])
app.include_router(prices.router, prefix="/api/prices", tags=["prices"])
app.include_router(paper_trading.router, prefix="/api/paper", tags=["paper-trading"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(fundamental.router, prefix="/api/fundamental", tags=["fundamental"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(community.router, prefix="/api/community", tags=["community"])


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "TradeRadar API"}


@app.get("/api/updates")
async def get_public_updates(limit: int = 10):
    """공개 업데이트 목록 (is_published=True, 최신순)."""
    from sqlalchemy import select
    from src.db.database import get_async_session
    from src.models.db_models import UpdatePostModel

    try:
        async for session in get_async_session():
            result = await session.execute(
                select(UpdatePostModel)
                .where(UpdatePostModel.is_published == True)
                .order_by(UpdatePostModel.created_at.desc())
                .limit(limit)
            )
            posts = result.scalars().all()
            return {
                "posts": [
                    {
                        "id": p.id,
                        "title": p.title,
                        "content": p.content,
                        "category": p.category,
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                    }
                    for p in posts
                ]
            }
    except Exception:
        return {"posts": []}


@app.get("/api/navigation")
async def get_public_navigation():
    """공개 메뉴 순서 API (사이드바 렌더링용)."""
    import json
    from src.db.database import get_async_session
    from src.models.db_models import SiteSettingModel
    from sqlalchemy import select

    default_order = [
        "/", "/search", "/my-analyses", "/recommendations",
        "/events", "/paper-trading", "/portfolio", "/news", "/community", "/compare", "/admin",
    ]
    try:
        async for session in get_async_session():
            result = await session.execute(
                select(SiteSettingModel).where(SiteSettingModel.key == "nav_order")
            )
            setting = result.scalar_one_or_none()
            if setting:
                return {"order": json.loads(setting.value)}
    except Exception:
        pass
    return {"order": default_order}

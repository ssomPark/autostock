"""FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from src.config.settings import settings
from src.db.database import init_db, close_db
from src.api.routes import recommendations, analysis, news, pipeline, websocket, n8n, auth, watchlist, saved_analysis, prices, paper_trading

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting AutoStock API server...")
    try:
        await init_db()
        logger.info("Database connected successfully")
    except Exception as e:
        logger.warning(f"Database not available (running without DB): {e}")
    yield
    logger.info("Shutting down AutoStock API server...")
    try:
        await close_db()
    except Exception:
        pass


app = FastAPI(
    title="AutoStock API",
    description="Multi-Agent Stock Analysis System API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SessionMiddleware for authlib OAuth state storage
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)

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


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "AutoStock API"}

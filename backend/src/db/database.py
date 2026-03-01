"""Database connection and session management."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session

from src.config.settings import settings
from src.models.db_models import Base


# Async engine (for FastAPI)
async_engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Sync engine (for Alembic / scripts)
sync_engine = create_engine(
    settings.database_url_sync,
    echo=False,
    pool_size=5,
)

SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False,
)


async def get_async_session():
    """FastAPI dependency for async DB sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_sync_session() -> Session:
    """Get a sync DB session."""
    return SyncSessionLocal()


async def init_db() -> None:
    """Create all tables and add new columns to existing tables."""
    from sqlalchemy import text

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns for fundamental screening (idempotent)
        for stmt in [
            "ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'news'",
            "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'news'",
            "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS fundamental_score FLOAT",
            "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS fundamental_category VARCHAR(20)",
            "ALTER TABLE paper_accounts ADD COLUMN IF NOT EXISTS bonus_balance FLOAT DEFAULT 0.0",
            # saved_analyses 히스토리 지원
            "ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS memo TEXT",
            "UPDATE saved_analyses SET created_at = analyzed_at WHERE created_at IS NULL",
            # 핀(즐겨찾기) 기능
            "ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
            "CREATE INDEX IF NOT EXISTS ix_saved_analyses_user_pinned ON saved_analyses(user_id, is_pinned)",
            # 기존 워치리스트 → is_pinned 마이그레이션
            """UPDATE saved_analyses sa
               SET is_pinned = true
               FROM (SELECT DISTINCT user_id, ticker FROM watchlist_items) w
               WHERE sa.user_id = w.user_id AND sa.ticker = w.ticker
               AND sa.id = (
                 SELECT id FROM saved_analyses
                 WHERE user_id = w.user_id AND ticker = w.ticker
                 ORDER BY analyzed_at DESC LIMIT 1
               ) AND sa.is_pinned = false""",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass  # Column already exists or DB not available


async def close_db() -> None:
    """Close database connections."""
    await async_engine.dispose()

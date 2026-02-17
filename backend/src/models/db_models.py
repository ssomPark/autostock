"""SQLAlchemy ORM models for AutoStock database."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class PipelineRunModel(Base):
    __tablename__ = "pipeline_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_type = Column(String(10), nullable=False, default="KR")
    status = Column(String(20), nullable=False, default="pending")
    started_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime, nullable=True)
    news_count = Column(Integer, default=0)
    keywords_count = Column(Integer, default=0)
    candidates_count = Column(Integer, default=0)
    recommendations_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    news_articles = relationship("NewsArticleModel", back_populates="pipeline_run")
    keywords = relationship("KeywordModel", back_populates="pipeline_run")
    candidates = relationship("CandidateStockModel", back_populates="pipeline_run")
    analyses = relationship("TechnicalAnalysisModel", back_populates="pipeline_run")
    recommendations = relationship("RecommendationModel", back_populates="pipeline_run")


class NewsArticleModel(Base):
    __tablename__ = "news_articles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    title = Column(String(500), nullable=False)
    summary = Column(Text, default="")
    content = Column(Text, default="")
    url = Column(String(1000), nullable=False)
    source = Column(String(100), nullable=False)
    published_at = Column(DateTime, nullable=True)
    relevance_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.now)

    pipeline_run = relationship("PipelineRunModel", back_populates="news_articles")

    __table_args__ = (
        Index("ix_news_articles_pipeline_run_id", "pipeline_run_id"),
        Index("ix_news_articles_source", "source"),
    )


class KeywordModel(Base):
    __tablename__ = "keywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    keyword = Column(String(200), nullable=False)
    frequency = Column(Integer, default=1)
    importance_score = Column(Float, default=0.0)
    sentiment = Column(String(20), default="neutral")
    related_articles = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.now)

    pipeline_run = relationship("PipelineRunModel", back_populates="keywords")

    __table_args__ = (
        Index("ix_keywords_pipeline_run_id", "pipeline_run_id"),
        Index("ix_keywords_keyword", "keyword"),
    )


class CandidateStockModel(Base):
    __tablename__ = "candidate_stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    current_price = Column(Float, nullable=False)
    market_cap = Column(Float, nullable=True)
    per = Column(Float, nullable=True)
    relevance_score = Column(Float, default=0.0)
    related_keywords = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.now)

    pipeline_run = relationship("PipelineRunModel", back_populates="candidates")

    __table_args__ = (
        Index("ix_candidate_stocks_pipeline_run_id", "pipeline_run_id"),
        Index("ix_candidate_stocks_ticker", "ticker"),
    )


class TechnicalAnalysisModel(Base):
    __tablename__ = "technical_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    current_price = Column(Float, nullable=False)
    candlestick_data = Column(JSONB, default=dict)
    chart_pattern_data = Column(JSONB, default=dict)
    support_resistance_data = Column(JSONB, default=dict)
    volume_data = Column(JSONB, default=dict)
    analyzed_at = Column(DateTime, default=datetime.now)

    pipeline_run = relationship("PipelineRunModel", back_populates="analyses")

    __table_args__ = (
        Index("ix_technical_analyses_pipeline_run_id", "pipeline_run_id"),
        Index("ix_technical_analyses_ticker", "ticker"),
    )


class RecommendationModel(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    current_price = Column(Float, nullable=False)
    action = Column(String(10), nullable=False)
    confidence = Column(Float, default=0.0)
    composite_score = Column(Float, default=0.0)
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    reasoning = Column(Text, default="")
    component_signals = Column(JSONB, default=dict)
    detected_patterns = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.now)

    pipeline_run = relationship("PipelineRunModel", back_populates="recommendations")

    __table_args__ = (
        Index("ix_recommendations_pipeline_run_id", "pipeline_run_id"),
        Index("ix_recommendations_ticker", "ticker"),
        Index("ix_recommendations_action", "action"),
    )


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    avatar_url = Column(String(1000), nullable=True)
    provider = Column(String(20), nullable=False)  # "google" / "github"
    provider_id = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    last_login_at = Column(DateTime, default=datetime.now)

    watchlist_items = relationship("WatchlistItemModel", back_populates="user", cascade="all, delete-orphan")
    saved_analyses = relationship("SavedAnalysisModel", back_populates="user", cascade="all, delete-orphan")
    paper_accounts = relationship("PaperAccountModel", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_users_provider_provider_id", "provider", "provider_id", unique=True),
    )


class WatchlistItemModel(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    action = Column(String(10), default="HOLD")
    grade = Column(String(5), default="")
    confidence = Column(Float, default=0.0)
    current_price = Column(Float, default=0.0)
    change_pct = Column(Float, nullable=True)
    entry_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    risk_reward = Column(Float, nullable=True)
    added_at = Column(DateTime, default=datetime.now)

    user = relationship("UserModel", back_populates="watchlist_items")

    __table_args__ = (
        Index("ix_watchlist_items_user_ticker", "user_id", "ticker", unique=True),
    )


class SavedAnalysisModel(Base):
    __tablename__ = "saved_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    signal = Column(String(10), default="HOLD")
    grade = Column(String(5), default="")
    confidence = Column(Float, default=0.0)
    current_price = Column(Float, default=0.0)
    total_score = Column(Float, default=0.0)
    score_data = Column(JSONB, default=dict)       # 전체 score API 응답
    financials_data = Column(JSONB, default=dict)   # 전체 financials API 응답
    analyzed_at = Column(DateTime, default=datetime.now)

    user = relationship("UserModel", back_populates="saved_analyses")

    __table_args__ = (
        Index("ix_saved_analyses_user_id", "user_id"),
        Index("ix_saved_analyses_user_ticker", "user_id", "ticker"),
    )


class PaperAccountModel(Base):
    __tablename__ = "paper_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False, default="기본 계좌")
    initial_balance = Column(Float, nullable=False, default=100_000_000)
    cash_balance = Column(Float, nullable=False, default=100_000_000)
    currency = Column(String(10), nullable=False, default="KRW")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    user = relationship("UserModel", back_populates="paper_accounts")
    positions = relationship("PaperPositionModel", back_populates="account", cascade="all, delete-orphan")
    trades = relationship("PaperTradeModel", back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_paper_accounts_user_id", "user_id"),
    )


class PaperPositionModel(Base):
    __tablename__ = "paper_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    avg_buy_price = Column(Float, nullable=False, default=0.0)
    total_invested = Column(Float, nullable=False, default=0.0)
    recommendation_id = Column(Integer, nullable=True)
    recommendation_action = Column(String(10), nullable=True)
    recommendation_confidence = Column(Float, nullable=True)
    recommendation_grade = Column(String(5), nullable=True)
    opened_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    account = relationship("PaperAccountModel", back_populates="positions")

    __table_args__ = (
        Index("ix_paper_positions_account_ticker", "account_id", "ticker", unique=True),
    )


class PaperTradeModel(Base):
    __tablename__ = "paper_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    side = Column(String(4), nullable=False)  # "BUY" / "SELL"
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    realized_pnl = Column(Float, nullable=True)
    realized_pnl_pct = Column(Float, nullable=True)
    source = Column(String(20), nullable=False, default="manual")  # "manual" / "recommendation"
    recommendation_id = Column(Integer, nullable=True)
    recommendation_action = Column(String(10), nullable=True)
    recommendation_confidence = Column(Float, nullable=True)
    recommendation_grade = Column(String(5), nullable=True)
    signal_weights_snapshot = Column(JSONB, nullable=True)
    executed_at = Column(DateTime, default=datetime.now)

    account = relationship("PaperAccountModel", back_populates="trades")

    __table_args__ = (
        Index("ix_paper_trades_account_id", "account_id"),
        Index("ix_paper_trades_ticker", "ticker"),
        Index("ix_paper_trades_executed_at", "executed_at"),
        Index("ix_paper_trades_source", "source"),
    )


class OHLCVCacheModel(Base):
    __tablename__ = "ohlcv_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(20), nullable=False)
    market = Column(String(10), nullable=False)
    date = Column(DateTime, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=datetime.now)

    __table_args__ = (
        Index("ix_ohlcv_cache_ticker_date", "ticker", "date", unique=True),
        Index("ix_ohlcv_cache_market", "market"),
    )

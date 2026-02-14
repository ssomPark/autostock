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

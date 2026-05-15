"""SQLAlchemy ORM models for TradeRadar database."""

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
    func,
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
    source = Column(String(20), nullable=False, default="news")  # "news" | "fundamental"

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
    source = Column(String(20), nullable=False, default="news")  # "news" | "fundamental"
    fundamental_score = Column(Float, nullable=True)  # 0~100
    fundamental_category = Column(String(20), nullable=True)  # "value"|"quality"|"growth"|"balanced"
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
    notifications = relationship("NotificationModel", back_populates="user", cascade="all, delete-orphan")
    portfolios = relationship("PortfolioModel", back_populates="user", cascade="all, delete-orphan")

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
    created_at = Column(DateTime, default=datetime.now)
    memo = Column(Text, nullable=True)
    is_pinned = Column(Boolean, default=False, server_default="false")

    user = relationship("UserModel", back_populates="saved_analyses")

    __table_args__ = (
        Index("ix_saved_analyses_user_id", "user_id"),
        Index("ix_saved_analyses_user_ticker", "user_id", "ticker"),
        Index("ix_saved_analyses_user_ticker_analyzed", "user_id", "ticker", "analyzed_at"),
        Index("ix_saved_analyses_user_pinned", "user_id", "is_pinned"),
    )


class PaperAccountModel(Base):
    __tablename__ = "paper_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False, default="기본 계좌")
    initial_balance = Column(Float, nullable=False, default=100_000_000)
    cash_balance = Column(Float, nullable=False, default=100_000_000)
    bonus_balance = Column(Float, nullable=False, default=0.0)  # 광고 보상 누적
    currency = Column(String(10), nullable=False, default="KRW")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    user = relationship("UserModel", back_populates="paper_accounts")
    positions = relationship("PaperPositionModel", back_populates="account", cascade="all, delete-orphan")
    trades = relationship("PaperTradeModel", back_populates="account", cascade="all, delete-orphan")
    orders = relationship("PaperOrderModel", back_populates="account", cascade="all, delete-orphan")

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
    exchange_rate = Column(Float, nullable=True)  # USD/KRW rate at trade time
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


class PaperOrderModel(Base):
    """모의 투자 예약/지정가/손절 주문."""
    __tablename__ = "paper_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False)
    order_type = Column(String(20), nullable=False)  # "limit_sell" | "stop_loss" | "scheduled"
    target_price = Column(Float, nullable=True)  # limit_sell: 이 가격 이상이면 매도
    stop_price = Column(Float, nullable=True)  # stop_loss: 이 가격 이하이면 매도
    scheduled_at = Column(DateTime, nullable=True)  # scheduled: 이 시각에 매도
    oco_group_id = Column(String(50), nullable=True)  # OCO 그룹 (한쪽 체결 시 나머지 취소)
    status = Column(String(20), nullable=False, default="pending")  # "pending" | "executed" | "cancelled"
    executed_price = Column(Float, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    trade_id = Column(Integer, nullable=True)
    cancel_reason = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    account = relationship("PaperAccountModel")

    __table_args__ = (
        Index("ix_paper_orders_account_id", "account_id"),
        Index("ix_paper_orders_status", "status"),
        Index("ix_paper_orders_user_status", "user_id", "status"),
        Index("ix_paper_orders_ticker_status", "ticker", "status"),
        Index("ix_paper_orders_oco_group", "oco_group_id"),
    )


class MarketEventModel(Base):
    """시장 이벤트 (이벤트 드리븐 투자용)."""
    __tablename__ = "market_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    event_date = Column(DateTime, nullable=False)
    category = Column(String(30), nullable=False)  # policy/earnings/product/conference/ipo/dividend/global
    impact_level = Column(String(10), nullable=False, default="medium")  # high/medium/low
    source_url = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    stocks = relationship("EventStockModel", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_market_events_date", "event_date"),
        Index("ix_market_events_category", "category"),
        Index("ix_market_events_active", "is_active"),
    )


class EventStockModel(Base):
    """이벤트-종목 매핑 (수혜주/피해주)."""
    __tablename__ = "event_stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("market_events.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    relation_type = Column(String(20), nullable=False, default="direct")  # direct/indirect/sector
    expected_impact = Column(String(10), nullable=False, default="positive")  # positive/negative/neutral
    reasoning = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.now)

    event = relationship("MarketEventModel", back_populates="stocks")

    __table_args__ = (
        Index("ix_event_stocks_event_id", "event_id"),
        Index("ix_event_stocks_ticker", "ticker"),
    )


class AdRewardLogModel(Base):
    """광고 보상 로그."""
    __tablename__ = "ad_reward_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("paper_accounts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reward_token = Column(String(100), unique=True, nullable=False)
    reward_amount = Column(Float, nullable=True)
    status = Column(String(20), default="pending")  # pending → claimed / expired
    created_at = Column(DateTime, default=datetime.now)
    claimed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_ad_reward_logs_user_id", "user_id"),
        Index("ix_ad_reward_logs_account_id", "account_id"),
        Index("ix_ad_reward_logs_token", "reward_token"),
    )


class NotificationModel(Base):
    """사용자 알림."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)  # recommendation / system / price_alert
    title = Column(String(300), nullable=False)
    message = Column(Text, default="")
    link = Column(String(500), nullable=True)  # 클릭 시 이동할 경로
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("UserModel", back_populates="notifications")

    __table_args__ = (
        Index("ix_notifications_user_id", "user_id"),
        Index("ix_notifications_user_read", "user_id", "is_read"),
        Index("ix_notifications_created_at", "created_at"),
    )


class SiteSettingModel(Base):
    """범용 사이트 설정 (key-value)."""
    __tablename__ = "site_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)  # JSON string
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


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


class PortfolioModel(Base):
    """사용자 포트폴리오."""
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False, default="내 포트폴리오")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    user = relationship("UserModel", back_populates="portfolios")
    holdings = relationship("PortfolioHoldingModel", back_populates="portfolio", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_portfolios_user_id", "user_id"),
    )


class PortfolioHoldingModel(Base):
    """포트폴리오 보유 종목."""
    __tablename__ = "portfolio_holdings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    market = Column(String(10), nullable=False)
    quantity = Column(Float, nullable=False, default=0)
    avg_buy_price = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), nullable=False, default="KRW")
    added_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    portfolio = relationship("PortfolioModel", back_populates="holdings")

    __table_args__ = (
        Index("ix_portfolio_holdings_portfolio_ticker", "portfolio_id", "ticker", unique=True),
    )


class UpdatePostModel(Base):
    """사이트 업데이트 게시판."""
    __tablename__ = "update_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(20), nullable=False, default="announcement")  # feature/bugfix/announcement/maintenance
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index("ix_update_posts_created", "created_at"),
    )


class UserFollowModel(Base):
    """사용자 팔로우 관계."""
    __tablename__ = "user_follows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    follower = relationship("UserModel", foreign_keys=[follower_id])
    following = relationship("UserModel", foreign_keys=[following_id])

    __table_args__ = (
        Index("ix_user_follows_unique", "follower_id", "following_id", unique=True),
        Index("ix_user_follows_following", "following_id"),
    )


class DailyMetricSnapshotModel(Base):
    """일일 지표 스냅샷 (매일 자정 KST 기준 집계)."""
    __tablename__ = "daily_metric_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(DateTime, nullable=False, unique=True)
    total_users = Column(Integer, default=0)
    new_users = Column(Integer, default=0)
    active_users = Column(Integer, default=0)
    analysis_count = Column(Integer, default=0)
    trade_count = Column(Integer, default=0)
    pin_count = Column(Integer, default=0)
    portfolio_count = Column(Integer, default=0)
    anonymous_ips = Column(Integer, default=0)
    pipeline_runs = Column(Integer, default=0)
    page_views = Column(Integer, default=0)
    unique_visitors = Column(Integer, default=0)
    unique_visitors_anon = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)

    __table_args__ = (
        Index("ix_daily_metric_snapshots_date", "date"),
    )

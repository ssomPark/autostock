"""Pydantic schemas for TradeRadar data models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---

class Market(str, Enum):
    KOSPI = "KOSPI"
    KOSDAQ = "KOSDAQ"
    NYSE = "NYSE"
    NASDAQ = "NASDAQ"


class Sentiment(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class SignalDirection(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class SignalStrength(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"


class PatternType(str, Enum):
    SINGLE_CANDLE = "single_candle"
    DOUBLE_CANDLE = "double_candle"
    MULTI_CANDLE = "multi_candle"
    CHART_PATTERN = "chart_pattern"


class PipelineStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# --- News ---

class NewsArticle(BaseModel):
    title: str
    summary: str
    url: str
    source: str
    published_at: datetime
    relevance_score: float = Field(ge=0, le=1)
    content: str = ""


class Keyword(BaseModel):
    keyword: str
    frequency: int = 1
    importance_score: float = Field(ge=0, le=1)
    sentiment: Sentiment = Sentiment.NEUTRAL
    related_articles: list[str] = Field(default_factory=list)


# --- Stock ---

class OHLCV(BaseModel):
    date: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class CandidateStock(BaseModel):
    ticker: str
    name: str
    market: Market
    current_price: float
    market_cap: Optional[float] = None
    per: Optional[float] = None
    relevance_score: float = Field(ge=0, le=1)
    related_keywords: list[str] = Field(default_factory=list)


# --- Analysis ---

class DetectedPattern(BaseModel):
    pattern_name: str
    pattern_korean: str = ""
    pattern_type: PatternType
    direction: SignalDirection
    confidence: float = Field(ge=0, le=100)
    description: str = ""
    detected_at: Optional[datetime] = None


class CandlestickAnalysis(BaseModel):
    ticker: str
    detected_patterns: list[DetectedPattern] = Field(default_factory=list)
    overall_signal: SignalDirection = SignalDirection.HOLD
    signal_strength: float = Field(ge=-1, le=1, default=0)


class ChartPatternAnalysis(BaseModel):
    ticker: str
    detected_patterns: list[DetectedPattern] = Field(default_factory=list)
    overall_signal: SignalDirection = SignalDirection.HOLD
    signal_strength: float = Field(ge=-1, le=1, default=0)
    target_price: Optional[float] = None


class SupportResistanceLevel(BaseModel):
    price: float
    strength: int = Field(ge=1, description="Number of touches")
    level_type: str = Field(description="support or resistance")


class SupportResistanceAnalysis(BaseModel):
    ticker: str
    support_levels: list[SupportResistanceLevel] = Field(default_factory=list)
    resistance_levels: list[SupportResistanceLevel] = Field(default_factory=list)
    nearest_support: Optional[float] = None
    nearest_resistance: Optional[float] = None
    support_distance_pct: Optional[float] = None
    resistance_distance_pct: Optional[float] = None
    role_reversals: list[dict] = Field(default_factory=list)
    overall_signal: SignalDirection = SignalDirection.HOLD
    signal_strength: float = Field(ge=-1, le=1, default=0)


class VolumeAnalysis(BaseModel):
    ticker: str
    volume_trend: str = ""
    avg_volume_20d: Optional[float] = None
    current_vs_avg_ratio: Optional[float] = None
    abnormal_volume: bool = False
    obv_signal: SignalDirection = SignalDirection.HOLD
    price_volume_divergence: bool = False
    overall_signal: SignalDirection = SignalDirection.HOLD
    signal_strength: float = Field(ge=-1, le=1, default=0)


class TechnicalAnalysis(BaseModel):
    ticker: str
    name: str
    market: Market
    current_price: float
    candlestick: CandlestickAnalysis
    chart_pattern: ChartPatternAnalysis
    support_resistance: SupportResistanceAnalysis
    volume: VolumeAnalysis
    analyzed_at: datetime = Field(default_factory=datetime.now)


# --- Recommendation ---

class ComponentSignals(BaseModel):
    news_sentiment: float = Field(ge=-1, le=1, default=0)
    candlestick: float = Field(ge=-1, le=1, default=0)
    chart_pattern: float = Field(ge=-1, le=1, default=0)
    support_resistance: float = Field(ge=-1, le=1, default=0)
    volume: float = Field(ge=-1, le=1, default=0)


class Recommendation(BaseModel):
    ticker: str
    name: str
    market: Market
    current_price: float
    action: SignalDirection
    confidence: float = Field(ge=0, le=1)
    composite_score: float = Field(ge=-1, le=1)
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    reasoning: str = ""
    component_signals: ComponentSignals = Field(default_factory=ComponentSignals)
    detected_patterns: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)


# --- Pipeline ---

class PipelineRun(BaseModel):
    id: Optional[int] = None
    market_type: str = "KR"
    status: PipelineStatus = PipelineStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    news_count: int = 0
    keywords_count: int = 0
    candidates_count: int = 0
    recommendations_count: int = 0
    error_message: Optional[str] = None


# --- API Response ---

class APIResponse(BaseModel):
    success: bool = True
    data: Optional[dict | list] = None
    message: str = ""
    timestamp: datetime = Field(default_factory=datetime.now)


class DashboardSummary(BaseModel):
    total_recommendations: int = 0
    buy_count: int = 0
    sell_count: int = 0
    hold_count: int = 0
    latest_pipeline: Optional[PipelineRun] = None
    top_recommendations: list[Recommendation] = Field(default_factory=list)
    recent_news: list[NewsArticle] = Field(default_factory=list)

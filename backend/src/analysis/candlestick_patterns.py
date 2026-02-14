"""Candlestick pattern detection using ta library.

Detects single, double, and multi-candle patterns from OHLCV data.
Based on reference images showing Korean candlestick analysis patterns.
"""

import numpy as np
import pandas as pd


# Pattern definitions from reference images
SINGLE_PATTERNS = {
    "hammer": {"korean": "해머형 (망치형)", "direction": "bullish"},
    "inverted_hammer": {"korean": "역해머형 (역망치형)", "direction": "bullish"},
    "hanging_man": {"korean": "교수형 (행잉맨)", "direction": "bearish"},
    "shooting_star": {"korean": "유성형", "direction": "bearish"},
    "doji": {"korean": "도지", "direction": "neutral"},
    "dragonfly_doji": {"korean": "잠자리형 도지", "direction": "bullish"},
    "gravestone_doji": {"korean": "잠석형 도지", "direction": "bearish"},
    "marubozu_bull": {"korean": "장대양봉", "direction": "bullish"},
    "marubozu_bear": {"korean": "장대음봉", "direction": "bearish"},
    "spinning_top": {"korean": "스피닝탑", "direction": "neutral"},
    "high_wave": {"korean": "하이웨이봉", "direction": "neutral"},
}

DOUBLE_PATTERNS = {
    "bullish_harami": {"korean": "상승 잉태형", "direction": "bullish", "confidence": 53},
    "bearish_harami": {"korean": "하락 잉태형", "direction": "bearish", "confidence": 53},
    "bullish_engulfing": {"korean": "상승 장악형", "direction": "bullish", "confidence": 63},
    "bearish_engulfing": {"korean": "하락 장악형", "direction": "bearish", "confidence": 63},
    "high_point_reversal": {"korean": "고점일치 약세 반전", "direction": "bearish", "confidence": 64},
    "low_point_reversal": {"korean": "저점일치 강세 반전", "direction": "bullish", "confidence": 64},
}

MULTI_PATTERNS = {
    "morning_star": {"korean": "샛별 (모닝스타)", "direction": "bullish", "confidence": 70},
    "evening_star": {"korean": "별 (이브닝스타)", "direction": "bearish", "confidence": 70},
    "three_white_soldiers": {"korean": "적삼병", "direction": "bullish", "confidence": 75},
    "three_black_crows": {"korean": "흑삼병", "direction": "bearish", "confidence": 75},
}


class CandlestickDetector:
    """Detects candlestick patterns from OHLCV DataFrame."""

    def __init__(self, df: pd.DataFrame):
        """Initialize with OHLCV DataFrame.

        Args:
            df: DataFrame with columns: open, high, low, close, volume
        """
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self._compute_candle_features()

    def _compute_candle_features(self) -> None:
        """Pre-compute candle body, shadow, and ratio features."""
        df = self.df
        df["body"] = abs(df["close"] - df["open"])
        df["upper_shadow"] = df["high"] - df[["open", "close"]].max(axis=1)
        df["lower_shadow"] = df[["open", "close"]].min(axis=1) - df["low"]
        df["total_range"] = df["high"] - df["low"]
        df["body_ratio"] = df["body"] / df["total_range"].replace(0, np.nan)
        df["is_bullish"] = df["close"] > df["open"]
        df["is_bearish"] = df["close"] < df["open"]
        df["is_doji"] = df["body_ratio"] < 0.05

    def detect_all(self) -> list[dict]:
        """Run all pattern detections and return results."""
        patterns = []
        patterns.extend(self._detect_single_patterns())
        patterns.extend(self._detect_double_patterns())
        patterns.extend(self._detect_multi_patterns())
        return patterns

    def _detect_single_patterns(self) -> list[dict]:
        """Detect single-candle patterns on the most recent candles."""
        patterns = []
        df = self.df
        if len(df) < 5:
            return patterns

        for i in range(max(len(df) - 5, 1), len(df)):
            row = df.iloc[i]
            prev_rows = df.iloc[max(0, i - 5):i]
            trend = self._get_trend(prev_rows)

            # Hammer: bullish after downtrend, long lower shadow, small body at top
            if (trend == "down" and row["lower_shadow"] > 2 * row["body"]
                    and row["upper_shadow"] < row["body"] * 0.3
                    and row["body_ratio"] < 0.4):
                patterns.append(self._make_pattern(
                    "hammer", "single_candle", 65, i))

            # Inverted Hammer: bullish after downtrend, long upper shadow
            if (trend == "down" and row["upper_shadow"] > 2 * row["body"]
                    and row["lower_shadow"] < row["body"] * 0.3
                    and row["body_ratio"] < 0.4):
                patterns.append(self._make_pattern(
                    "inverted_hammer", "single_candle", 60, i))

            # Hanging Man: bearish after uptrend, same shape as hammer
            if (trend == "up" and row["lower_shadow"] > 2 * row["body"]
                    and row["upper_shadow"] < row["body"] * 0.3
                    and row["body_ratio"] < 0.4):
                patterns.append(self._make_pattern(
                    "hanging_man", "single_candle", 60, i))

            # Shooting Star: bearish after uptrend, long upper shadow
            if (trend == "up" and row["upper_shadow"] > 2 * row["body"]
                    and row["lower_shadow"] < row["body"] * 0.3
                    and row["body_ratio"] < 0.4):
                patterns.append(self._make_pattern(
                    "shooting_star", "single_candle", 65, i))

            # Doji
            if row["is_doji"] and row["total_range"] > 0:
                if row["lower_shadow"] > 3 * row["upper_shadow"] and row["lower_shadow"] > 0:
                    patterns.append(self._make_pattern(
                        "dragonfly_doji", "single_candle", 60, i))
                elif row["upper_shadow"] > 3 * row["lower_shadow"] and row["upper_shadow"] > 0:
                    patterns.append(self._make_pattern(
                        "gravestone_doji", "single_candle", 60, i))
                else:
                    patterns.append(self._make_pattern(
                        "doji", "single_candle", 50, i))

            # Marubozu: very small or no shadows
            if row["body_ratio"] > 0.9 and row["total_range"] > 0:
                key = "marubozu_bull" if row["is_bullish"] else "marubozu_bear"
                patterns.append(self._make_pattern(key, "single_candle", 70, i))

            # Spinning Top: small body, moderate shadows
            if (0.1 < row["body_ratio"] < 0.3
                    and row["upper_shadow"] > row["body"]
                    and row["lower_shadow"] > row["body"]):
                patterns.append(self._make_pattern(
                    "spinning_top", "single_candle", 40, i))

            # High Wave: very small body, very long shadows
            if (row["body_ratio"] < 0.15
                    and row["upper_shadow"] > 2 * row["body"]
                    and row["lower_shadow"] > 2 * row["body"]
                    and row["total_range"] > 0):
                patterns.append(self._make_pattern(
                    "high_wave", "single_candle", 45, i))

        return patterns

    def _detect_double_patterns(self) -> list[dict]:
        """Detect two-candle patterns."""
        patterns = []
        df = self.df
        if len(df) < 2:
            return patterns

        for i in range(max(len(df) - 3, 1), len(df)):
            if i < 1:
                continue
            prev = df.iloc[i - 1]
            curr = df.iloc[i]

            # Bullish Engulfing
            if (prev["is_bearish"] and curr["is_bullish"]
                    and curr["open"] <= prev["close"]
                    and curr["close"] >= prev["open"]
                    and curr["body"] > prev["body"]):
                patterns.append(self._make_pattern(
                    "bullish_engulfing", "double_candle", 63, i))

            # Bearish Engulfing
            if (prev["is_bullish"] and curr["is_bearish"]
                    and curr["open"] >= prev["close"]
                    and curr["close"] <= prev["open"]
                    and curr["body"] > prev["body"]):
                patterns.append(self._make_pattern(
                    "bearish_engulfing", "double_candle", 63, i))

            # Bullish Harami
            if (prev["is_bearish"] and curr["is_bullish"]
                    and curr["body"] < prev["body"]
                    and curr["open"] > prev["close"]
                    and curr["close"] < prev["open"]):
                patterns.append(self._make_pattern(
                    "bullish_harami", "double_candle", 53, i))

            # Bearish Harami
            if (prev["is_bullish"] and curr["is_bearish"]
                    and curr["body"] < prev["body"]
                    and curr["open"] < prev["close"]
                    and curr["close"] > prev["open"]):
                patterns.append(self._make_pattern(
                    "bearish_harami", "double_candle", 53, i))

            # High-point Reversal (고점일치)
            if (abs(prev["high"] - curr["high"]) / max(prev["high"], 0.01) < 0.005
                    and prev["is_bullish"] and curr["is_bearish"]):
                patterns.append(self._make_pattern(
                    "high_point_reversal", "double_candle", 64, i))

            # Low-point Reversal (저점일치)
            if (abs(prev["low"] - curr["low"]) / max(prev["low"], 0.01) < 0.005
                    and prev["is_bearish"] and curr["is_bullish"]):
                patterns.append(self._make_pattern(
                    "low_point_reversal", "double_candle", 64, i))

        return patterns

    def _detect_multi_patterns(self) -> list[dict]:
        """Detect three-candle patterns."""
        patterns = []
        df = self.df
        if len(df) < 3:
            return patterns

        for i in range(max(len(df) - 3, 2), len(df)):
            c1, c2, c3 = df.iloc[i - 2], df.iloc[i - 1], df.iloc[i]

            # Morning Star
            if (c1["is_bearish"] and c1["body_ratio"] > 0.5
                    and c2["body_ratio"] < 0.2
                    and c3["is_bullish"] and c3["body_ratio"] > 0.5
                    and c3["close"] > (c1["open"] + c1["close"]) / 2):
                patterns.append(self._make_pattern(
                    "morning_star", "multi_candle", 70, i))

            # Evening Star
            if (c1["is_bullish"] and c1["body_ratio"] > 0.5
                    and c2["body_ratio"] < 0.2
                    and c3["is_bearish"] and c3["body_ratio"] > 0.5
                    and c3["close"] < (c1["open"] + c1["close"]) / 2):
                patterns.append(self._make_pattern(
                    "evening_star", "multi_candle", 70, i))

            # Three White Soldiers
            if (c1["is_bullish"] and c2["is_bullish"] and c3["is_bullish"]
                    and c2["close"] > c1["close"] and c3["close"] > c2["close"]
                    and c1["body_ratio"] > 0.5 and c2["body_ratio"] > 0.5
                    and c3["body_ratio"] > 0.5):
                patterns.append(self._make_pattern(
                    "three_white_soldiers", "multi_candle", 75, i))

            # Three Black Crows
            if (c1["is_bearish"] and c2["is_bearish"] and c3["is_bearish"]
                    and c2["close"] < c1["close"] and c3["close"] < c2["close"]
                    and c1["body_ratio"] > 0.5 and c2["body_ratio"] > 0.5
                    and c3["body_ratio"] > 0.5):
                patterns.append(self._make_pattern(
                    "three_black_crows", "multi_candle", 75, i))

        return patterns

    def _get_trend(self, rows: pd.DataFrame) -> str:
        if len(rows) < 2:
            return "neutral"
        sma = rows["close"].mean()
        if rows.iloc[-1]["close"] > sma * 1.01:
            return "up"
        elif rows.iloc[-1]["close"] < sma * 0.99:
            return "down"
        return "neutral"

    def _make_pattern(self, name: str, ptype: str, confidence: float, idx: int) -> dict:
        all_patterns = {**SINGLE_PATTERNS, **DOUBLE_PATTERNS, **MULTI_PATTERNS}
        info = all_patterns.get(name, {})
        return {
            "pattern_name": name,
            "pattern_korean": info.get("korean", name),
            "pattern_type": ptype,
            "direction": info.get("direction", "neutral"),
            "confidence": confidence,
            "bar_index": idx,
            "date": str(self.df.index[idx]) if hasattr(self.df.index[idx], "strftime") else str(idx),
        }

    def get_signal(self) -> dict:
        """Get aggregated signal from all detected patterns."""
        patterns = self.detect_all()
        if not patterns:
            return {"signal": "HOLD", "strength": 0.0, "patterns": []}

        score = 0.0
        total_weight = 0.0
        for p in patterns:
            weight = p["confidence"] / 100
            if p["direction"] == "bullish":
                score += weight
            elif p["direction"] == "bearish":
                score -= weight
            total_weight += weight

        if total_weight > 0:
            normalized = score / total_weight
        else:
            normalized = 0.0

        if normalized > 0.2:
            signal = "BUY"
        elif normalized < -0.2:
            signal = "SELL"
        else:
            signal = "HOLD"

        return {
            "signal": signal,
            "strength": round(normalized, 4),
            "patterns": patterns,
        }

"""Chart pattern detection using scipy.signal.

Detects geometric patterns: Double Top/Bottom, Head & Shoulders,
Triangles, Flags, Wedges, etc. Based on reference image confidence levels.
"""

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema


# Confidence levels from reference images
CHART_PATTERN_CONFIDENCE = {
    # SELL patterns
    "double_top": {"confidence": 100, "direction": "bearish", "korean": "쌍봉", "action": "폭락에 대비"},
    "triple_top": {"confidence": 90, "direction": "bearish", "korean": "삼중천정", "action": "폭락에 대비"},
    "bear_flag": {"confidence": 80, "direction": "bearish", "korean": "하락깃발", "action": "빨리 팔아"},
    "rising_wedge": {"confidence": 75, "direction": "bearish", "korean": "상승쐐기형", "action": "빨리 팔아"},
    "descending_diamond": {"confidence": 65, "direction": "bearish", "korean": "하락다이아몬드", "action": "천천히 내려감"},
    "head_shoulders": {"confidence": 85, "direction": "bearish", "korean": "머리어깨형", "action": "빨리 팔아"},
    "inverse_v": {"confidence": 70, "direction": "bearish", "korean": "역V자전환", "action": "빨리 팔아"},
    "three_peaks_top": {"confidence": 80, "direction": "bearish", "korean": "쓰리아웃탑", "action": "빨리 팔아"},
    # WAIT/NEUTRAL patterns
    "symmetrical_triangle": {"confidence": 50, "direction": "neutral", "korean": "대칭삼각형", "action": "건들지마"},
    "box_range": {"confidence": 50, "direction": "neutral", "korean": "박스권", "action": "건들지마"},
    # BUY patterns
    "ascending_triangle": {"confidence": 65, "direction": "bullish", "korean": "상승삼각형", "action": "급하게 사"},
    "inverse_head_shoulders": {"confidence": 65, "direction": "bullish", "korean": "역머리어깨형", "action": "급하게 사"},
    "bull_flag": {"confidence": 80, "direction": "bullish", "korean": "상승깃발", "action": "급하게 사"},
    "ascending_wedge": {"confidence": 100, "direction": "bullish", "korean": "상승배기형", "action": "폭등에 대비"},
    "double_bottom": {"confidence": 90, "direction": "bullish", "korean": "쌍바닥", "action": "폭등에 대비"},
    "triple_bottom": {"confidence": 95, "direction": "bullish", "korean": "트리플바닥", "action": "폭등에 대비"},
}


class ChartPatternDetector:
    """Detects chart patterns from price data using peak/trough analysis."""

    def __init__(self, df: pd.DataFrame, order: int = 5):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.order = order
        self.close = self.df["close"].values
        self.high = self.df["high"].values
        self.low = self.df["low"].values
        self._find_extrema()

    def _find_extrema(self) -> None:
        """Find local peaks and troughs."""
        self.peak_indices = argrelextrema(self.high, np.greater, order=self.order)[0]
        self.trough_indices = argrelextrema(self.low, np.less, order=self.order)[0]
        self.peaks = self.high[self.peak_indices]
        self.troughs = self.low[self.trough_indices]

    def detect_all(self) -> list[dict]:
        """Run all pattern detectors."""
        patterns = []
        patterns.extend(self._detect_double_top())
        patterns.extend(self._detect_double_bottom())
        patterns.extend(self._detect_triple_top())
        patterns.extend(self._detect_triple_bottom())
        patterns.extend(self._detect_head_shoulders())
        patterns.extend(self._detect_inverse_head_shoulders())
        patterns.extend(self._detect_ascending_triangle())
        patterns.extend(self._detect_symmetrical_triangle())
        patterns.extend(self._detect_bull_flag())
        patterns.extend(self._detect_bear_flag())
        patterns.extend(self._detect_rising_wedge())
        patterns.extend(self._detect_box_range())
        return patterns

    def _detect_double_top(self) -> list[dict]:
        """Detect double top (쌍봉) pattern."""
        results = []
        if len(self.peaks) < 2:
            return results
        for i in range(len(self.peaks) - 1):
            p1, p2 = self.peaks[i], self.peaks[i + 1]
            tolerance = p1 * 0.02
            if abs(p1 - p2) < tolerance:
                # Find trough between peaks
                idx1, idx2 = self.peak_indices[i], self.peak_indices[i + 1]
                between = self.low[idx1:idx2 + 1]
                neckline = np.min(between)
                if self.close[-1] < neckline:
                    target = neckline - (max(p1, p2) - neckline)
                    results.append(self._make_pattern(
                        "double_top", idx2, target_price=target))
        return results

    def _detect_double_bottom(self) -> list[dict]:
        """Detect double bottom (쌍바닥) pattern."""
        results = []
        if len(self.troughs) < 2:
            return results
        for i in range(len(self.troughs) - 1):
            t1, t2 = self.troughs[i], self.troughs[i + 1]
            tolerance = t1 * 0.02
            if abs(t1 - t2) < tolerance:
                idx1, idx2 = self.trough_indices[i], self.trough_indices[i + 1]
                between = self.high[idx1:idx2 + 1]
                neckline = np.max(between)
                if self.close[-1] > neckline:
                    target = neckline + (neckline - min(t1, t2))
                    results.append(self._make_pattern(
                        "double_bottom", idx2, target_price=target))
        return results

    def _detect_triple_top(self) -> list[dict]:
        """Detect triple top (삼중천정) pattern."""
        results = []
        if len(self.peaks) < 3:
            return results
        for i in range(len(self.peaks) - 2):
            p1, p2, p3 = self.peaks[i], self.peaks[i + 1], self.peaks[i + 2]
            avg = (p1 + p2 + p3) / 3
            tolerance = avg * 0.025
            if abs(p1 - avg) < tolerance and abs(p2 - avg) < tolerance and abs(p3 - avg) < tolerance:
                idx3 = self.peak_indices[i + 2]
                results.append(self._make_pattern("triple_top", idx3))
        return results

    def _detect_triple_bottom(self) -> list[dict]:
        """Detect triple bottom (트리플바닥) pattern."""
        results = []
        if len(self.troughs) < 3:
            return results
        for i in range(len(self.troughs) - 2):
            t1, t2, t3 = self.troughs[i], self.troughs[i + 1], self.troughs[i + 2]
            avg = (t1 + t2 + t3) / 3
            tolerance = avg * 0.025
            if abs(t1 - avg) < tolerance and abs(t2 - avg) < tolerance and abs(t3 - avg) < tolerance:
                idx3 = self.trough_indices[i + 2]
                results.append(self._make_pattern("triple_bottom", idx3))
        return results

    def _detect_head_shoulders(self) -> list[dict]:
        """Detect head and shoulders (머리어깨형) pattern."""
        results = []
        if len(self.peaks) < 3:
            return results
        for i in range(len(self.peaks) - 2):
            left, head, right = self.peaks[i], self.peaks[i + 1], self.peaks[i + 2]
            if head > left and head > right:
                shoulder_diff = abs(left - right) / max(left, right)
                if shoulder_diff < 0.05:
                    results.append(self._make_pattern(
                        "head_shoulders", self.peak_indices[i + 2]))
        return results

    def _detect_inverse_head_shoulders(self) -> list[dict]:
        """Detect inverse head and shoulders (역머리어깨형) pattern."""
        results = []
        if len(self.troughs) < 3:
            return results
        for i in range(len(self.troughs) - 2):
            left, head, right = self.troughs[i], self.troughs[i + 1], self.troughs[i + 2]
            if head < left and head < right:
                shoulder_diff = abs(left - right) / max(left, right)
                if shoulder_diff < 0.05:
                    results.append(self._make_pattern(
                        "inverse_head_shoulders", self.trough_indices[i + 2]))
        return results

    def _detect_ascending_triangle(self) -> list[dict]:
        """Detect ascending triangle (상승삼각형): rising lows, flat highs."""
        results = []
        if len(self.peaks) < 2 and len(self.troughs) < 2:
            return results
        if len(self.peaks) >= 2 and len(self.troughs) >= 2:
            peak_slope = np.polyfit(range(len(self.peaks)), self.peaks, 1)[0]
            trough_slope = np.polyfit(range(len(self.troughs)), self.troughs, 1)[0]
            avg_range = np.mean(self.high - self.low)
            if abs(peak_slope) < avg_range * 0.05 and trough_slope > avg_range * 0.02:
                results.append(self._make_pattern(
                    "ascending_triangle", len(self.close) - 1))
        return results

    def _detect_symmetrical_triangle(self) -> list[dict]:
        """Detect symmetrical triangle (대칭삼각형 수렴)."""
        results = []
        if len(self.peaks) < 3 and len(self.troughs) < 3:
            return results
        if len(self.peaks) >= 3 and len(self.troughs) >= 3:
            peak_slope = np.polyfit(range(len(self.peaks)), self.peaks, 1)[0]
            trough_slope = np.polyfit(range(len(self.troughs)), self.troughs, 1)[0]
            if peak_slope < 0 and trough_slope > 0:
                results.append(self._make_pattern(
                    "symmetrical_triangle", len(self.close) - 1))
        return results

    def _detect_bull_flag(self) -> list[dict]:
        """Detect bull flag (상승깃발): strong rise then slight pullback."""
        results = []
        n = len(self.close)
        if n < 20:
            return results
        pole = self.close[:n // 2]
        flag = self.close[n // 2:]
        pole_return = (pole[-1] - pole[0]) / max(pole[0], 0.01)
        flag_return = (flag[-1] - flag[0]) / max(flag[0], 0.01)
        if pole_return > 0.05 and -0.05 < flag_return < 0.01:
            results.append(self._make_pattern("bull_flag", n - 1))
        return results

    def _detect_bear_flag(self) -> list[dict]:
        """Detect bear flag (하락깃발): strong drop then slight bounce."""
        results = []
        n = len(self.close)
        if n < 20:
            return results
        pole = self.close[:n // 2]
        flag = self.close[n // 2:]
        pole_return = (pole[-1] - pole[0]) / max(pole[0], 0.01)
        flag_return = (flag[-1] - flag[0]) / max(flag[0], 0.01)
        if pole_return < -0.05 and -0.01 < flag_return < 0.05:
            results.append(self._make_pattern("bear_flag", n - 1))
        return results

    def _detect_rising_wedge(self) -> list[dict]:
        """Detect rising wedge (상승쐐기형): converging upward channel."""
        results = []
        if len(self.peaks) < 3 and len(self.troughs) < 3:
            return results
        if len(self.peaks) >= 3 and len(self.troughs) >= 3:
            peak_slope = np.polyfit(range(len(self.peaks)), self.peaks, 1)[0]
            trough_slope = np.polyfit(range(len(self.troughs)), self.troughs, 1)[0]
            if peak_slope > 0 and trough_slope > 0 and trough_slope > peak_slope:
                results.append(self._make_pattern(
                    "rising_wedge", len(self.close) - 1))
        return results

    def _detect_box_range(self) -> list[dict]:
        """Detect box range (박스권): horizontal support/resistance channel."""
        results = []
        if len(self.close) < 20:
            return results
        recent = self.close[-20:]
        price_range = (np.max(recent) - np.min(recent)) / np.mean(recent)
        if price_range < 0.06:
            results.append(self._make_pattern("box_range", len(self.close) - 1))
        return results

    def _make_pattern(self, name: str, bar_index: int,
                      target_price: float | None = None) -> dict:
        info = CHART_PATTERN_CONFIDENCE.get(name, {})
        return {
            "pattern_name": name,
            "pattern_korean": info.get("korean", name),
            "pattern_type": "chart_pattern",
            "direction": info.get("direction", "neutral"),
            "confidence": info.get("confidence", 50),
            "action": info.get("action", ""),
            "bar_index": bar_index,
            "target_price": target_price,
        }

    def get_signal(self) -> dict:
        """Get aggregated signal from all detected chart patterns."""
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

        normalized = score / total_weight if total_weight > 0 else 0.0

        if normalized > 0.2:
            signal = "BUY"
        elif normalized < -0.2:
            signal = "SELL"
        else:
            signal = "HOLD"

        target = None
        for p in patterns:
            if p.get("target_price"):
                target = p["target_price"]
                break

        return {
            "signal": signal,
            "strength": round(normalized, 4),
            "patterns": patterns,
            "target_price": target,
        }

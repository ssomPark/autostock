"""Breakout-pullback pattern detection.

From reference image: 돌파구간 → 조정구간 차트파동
Patterns: Rectangle, Flag, Double Bottom, H&S, Wedge, Dome
Rule: 돌파 이후의 되돌림 형태가 이번 돌파가 진짜 강한지 가짜인지 결정합니다.
"""

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema


class BreakoutPullbackDetector:
    """Detects breakout-pullback wave patterns."""

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.close = self.df["close"].values
        self.high = self.df["high"].values
        self.low = self.df["low"].values
        self.volume = self.df["volume"].values

    def detect_all(self) -> list[dict]:
        """Detect all breakout-pullback patterns."""
        patterns = []
        patterns.extend(self._detect_breakout_pullback())
        return patterns

    def _detect_breakout_pullback(self) -> list[dict]:
        """Detect generic breakout followed by pullback and continuation."""
        results = []
        n = len(self.close)
        if n < 30:
            return results

        # Find recent significant high (potential breakout level)
        lookback = min(60, n)
        recent = self.close[-lookback:]

        peaks = argrelextrema(np.array(recent), np.greater, order=5)[0]
        troughs = argrelextrema(np.array(recent), np.less, order=5)[0]

        if len(peaks) < 2 or len(troughs) < 1:
            return results

        # Look for: price breaks above resistance -> pulls back -> holds above
        for i in range(1, len(peaks)):
            breakout_level = recent[peaks[i - 1]]
            current = recent[-1]

            if recent[peaks[i]] > breakout_level * 1.02:
                # Breakout detected - check for pullback
                post_breakout = recent[peaks[i]:]
                if len(post_breakout) < 3:
                    continue

                pullback_low = np.min(post_breakout)
                pullback_pct = (recent[peaks[i]] - pullback_low) / recent[peaks[i]]

                # Healthy pullback: retraces 30-60% of breakout move
                if 0.1 < pullback_pct < 0.6 and current > breakout_level:
                    # Volume confirmation
                    avg_vol = np.mean(self.volume[-lookback:])
                    breakout_vol = self.volume[-(lookback - peaks[i])] if peaks[i] < lookback else avg_vol

                    confidence = 60
                    if breakout_vol > avg_vol * 1.5:
                        confidence += 15
                    if pullback_pct < 0.38:  # Fibonacci
                        confidence += 10
                    if current > recent[peaks[i]] * 0.98:
                        confidence += 10

                    results.append({
                        "pattern_name": "breakout_pullback",
                        "pattern_korean": "돌파-되돌림 파동",
                        "breakout_level": round(float(breakout_level), 2),
                        "pullback_low": round(float(pullback_low), 2),
                        "pullback_pct": round(pullback_pct * 100, 1),
                        "direction": "bullish",
                        "confidence": min(confidence, 95),
                        "is_valid": current > breakout_level,
                        "volume_confirmed": breakout_vol > avg_vol * 1.5 if avg_vol > 0 else False,
                    })

        return results

    def get_signal(self) -> dict:
        """Get signal from breakout-pullback analysis."""
        patterns = self.detect_all()
        if not patterns:
            return {"signal": "HOLD", "strength": 0.0, "patterns": []}

        valid_patterns = [p for p in patterns if p.get("is_valid")]
        if not valid_patterns:
            return {"signal": "HOLD", "strength": 0.0, "patterns": patterns}

        best = max(valid_patterns, key=lambda x: x["confidence"])
        strength = best["confidence"] / 100
        if best["direction"] == "bearish":
            strength = -strength

        signal = "BUY" if strength > 0.2 else "SELL" if strength < -0.2 else "HOLD"

        return {
            "signal": signal,
            "strength": round(strength, 4),
            "patterns": patterns,
        }

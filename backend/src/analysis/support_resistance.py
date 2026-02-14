"""Support and resistance level detection.

Based on reference image rules:
- Support: price level where stock bounces up (2+ touches)
- Resistance: price level where stock bounces down (2+ touches)
- Role reversal: broken support becomes resistance and vice versa
- Key rule: draw lines where price bounces 2+ times (수평선의 요령은 2번 이상 반등하는 곳에 선을 긋다)
"""

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema


class SupportResistanceDetector:
    """Detects support and resistance levels from price data."""

    def __init__(self, df: pd.DataFrame, tolerance_pct: float = 0.015, min_touches: int = 2):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.tolerance_pct = tolerance_pct
        self.min_touches = min_touches
        self.close = self.df["close"].values
        self.high = self.df["high"].values
        self.low = self.df["low"].values

    def detect_levels(self) -> dict:
        """Detect support and resistance levels."""
        pivot_highs = argrelextrema(self.high, np.greater, order=5)[0]
        pivot_lows = argrelextrema(self.low, np.less, order=5)[0]

        candidate_levels = []
        for idx in pivot_highs:
            candidate_levels.append(self.high[idx])
        for idx in pivot_lows:
            candidate_levels.append(self.low[idx])

        if not candidate_levels:
            return self._empty_result()

        # Cluster nearby levels
        levels = self._cluster_levels(sorted(candidate_levels))

        current_price = self.close[-1]
        support_levels = []
        resistance_levels = []

        for level_price, touches in levels:
            if touches >= self.min_touches:
                if level_price < current_price:
                    support_levels.append({
                        "price": round(level_price, 2),
                        "strength": touches,
                        "level_type": "support",
                    })
                else:
                    resistance_levels.append({
                        "price": round(level_price, 2),
                        "strength": touches,
                        "level_type": "resistance",
                    })

        support_levels.sort(key=lambda x: x["price"], reverse=True)
        resistance_levels.sort(key=lambda x: x["price"])

        nearest_support = support_levels[0]["price"] if support_levels else None
        nearest_resistance = resistance_levels[0]["price"] if resistance_levels else None

        support_dist = None
        resistance_dist = None
        if nearest_support:
            support_dist = round((current_price - nearest_support) / current_price * 100, 2)
        if nearest_resistance:
            resistance_dist = round((nearest_resistance - current_price) / current_price * 100, 2)

        role_reversals = self._detect_role_reversals(levels, current_price)

        return {
            "support_levels": support_levels,
            "resistance_levels": resistance_levels,
            "nearest_support": nearest_support,
            "nearest_resistance": nearest_resistance,
            "support_distance_pct": support_dist,
            "resistance_distance_pct": resistance_dist,
            "role_reversals": role_reversals,
            "current_price": round(current_price, 2),
        }

    def _cluster_levels(self, prices: list[float]) -> list[tuple[float, int]]:
        """Cluster nearby price levels together."""
        if not prices:
            return []
        clusters: list[list[float]] = [[prices[0]]]
        for price in prices[1:]:
            if abs(price - np.mean(clusters[-1])) / np.mean(clusters[-1]) < self.tolerance_pct:
                clusters[-1].append(price)
            else:
                clusters.append([price])
        return [(np.mean(c), len(c)) for c in clusters]

    def _detect_role_reversals(self, levels: list[tuple[float, int]],
                                current_price: float) -> list[dict]:
        """Detect support-resistance role reversals."""
        reversals = []
        for level_price, touches in levels:
            if touches < 3:
                continue
            crossings = 0
            last_side = None
            for price in self.close:
                current_side = "above" if price > level_price else "below"
                if last_side and current_side != last_side:
                    crossings += 1
                last_side = current_side
            if crossings >= 2:
                reversals.append({
                    "price": round(level_price, 2),
                    "crossings": crossings,
                    "current_role": "resistance" if current_price < level_price else "support",
                })
        return reversals

    def _empty_result(self) -> dict:
        return {
            "support_levels": [],
            "resistance_levels": [],
            "nearest_support": None,
            "nearest_resistance": None,
            "support_distance_pct": None,
            "resistance_distance_pct": None,
            "role_reversals": [],
            "current_price": round(self.close[-1], 2) if len(self.close) > 0 else 0,
        }

    def get_signal(self) -> dict:
        """Get trading signal based on S/R analysis."""
        result = self.detect_levels()
        current = result["current_price"]
        s_dist = result["support_distance_pct"]
        r_dist = result["resistance_distance_pct"]

        signal = "HOLD"
        strength = 0.0

        if s_dist is not None and r_dist is not None:
            if s_dist < 2.0:
                signal = "BUY"
                strength = min(0.8, (2.0 - s_dist) / 2.0)
            elif r_dist < 2.0:
                signal = "SELL"
                strength = -min(0.8, (2.0 - r_dist) / 2.0)
            else:
                ratio = s_dist / (s_dist + r_dist)
                strength = (0.5 - ratio) * 2
                if strength > 0.2:
                    signal = "BUY"
                elif strength < -0.2:
                    signal = "SELL"
        elif s_dist is not None and s_dist < 3.0:
            signal = "BUY"
            strength = 0.3
        elif r_dist is not None and r_dist < 3.0:
            signal = "SELL"
            strength = -0.3

        result["signal"] = signal
        result["strength"] = round(strength, 4)
        return result

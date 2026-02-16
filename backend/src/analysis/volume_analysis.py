"""Volume analysis module.

Analyzes volume patterns to confirm price movements:
- Volume trend analysis
- Abnormal volume detection
- OBV (On-Balance Volume)
- Price-volume divergence
"""

import numpy as np
import pandas as pd


class VolumeAnalyzer:
    """Analyzes volume data relative to price movements."""

    def __init__(self, df: pd.DataFrame, lookback: int = 20):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.lookback = lookback

    def analyze(self) -> dict:
        """Run full volume analysis."""
        df = self.df
        if len(df) < self.lookback:
            return self._empty_result()

        volume = df["volume"].values
        close = df["close"].values

        avg_volume = np.mean(volume[-self.lookback:])
        current_volume = volume[-1]
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0

        # Volume trend
        recent_vol = volume[-self.lookback:]
        vol_slope = np.polyfit(range(len(recent_vol)), recent_vol, 1)[0]
        if vol_slope > avg_volume * 0.02:
            volume_trend = "increasing"
        elif vol_slope < -avg_volume * 0.02:
            volume_trend = "decreasing"
        else:
            volume_trend = "stable"

        # Abnormal volume (>2x average)
        abnormal = volume_ratio > 2.0

        # OBV
        obv = self._compute_obv(close, volume)
        obv_signal = self._obv_signal(obv)

        # Price-volume divergence
        divergence = self._detect_divergence(close, volume)

        return {
            "volume_trend": volume_trend,
            "avg_volume_20d": round(avg_volume, 0),
            "current_volume": int(current_volume),
            "current_vs_avg_ratio": round(volume_ratio, 2),
            "abnormal_volume": abnormal,
            "obv_signal": obv_signal,
            "price_volume_divergence": divergence,
        }

    def _compute_obv(self, close: np.ndarray, volume: np.ndarray) -> np.ndarray:
        """Compute On-Balance Volume."""
        obv = np.zeros(len(close))
        for i in range(1, len(close)):
            if close[i] > close[i - 1]:
                obv[i] = obv[i - 1] + volume[i]
            elif close[i] < close[i - 1]:
                obv[i] = obv[i - 1] - volume[i]
            else:
                obv[i] = obv[i - 1]
        return obv

    def _obv_signal(self, obv: np.ndarray) -> str:
        """Get signal from OBV trend."""
        if len(obv) < 10:
            return "HOLD"
        recent = obv[-10:]
        slope = np.polyfit(range(len(recent)), recent, 1)[0]
        obv_range = np.max(np.abs(obv[-20:])) if len(obv) >= 20 else 1.0
        normalized_slope = slope / max(obv_range, 1.0)
        if normalized_slope > 0.01:
            return "BUY"
        elif normalized_slope < -0.01:
            return "SELL"
        return "HOLD"

    def _detect_divergence(self, close: np.ndarray, volume: np.ndarray) -> bool:
        """Detect price-volume divergence."""
        if len(close) < 10:
            return False
        recent_close = close[-10:]
        recent_vol = volume[-10:]
        price_slope = np.polyfit(range(len(recent_close)), recent_close, 1)[0]
        vol_slope = np.polyfit(range(len(recent_vol)), recent_vol, 1)[0]
        price_dir = 1 if price_slope > 0 else -1
        vol_dir = 1 if vol_slope > 0 else -1
        return price_dir != vol_dir

    def _empty_result(self) -> dict:
        return {
            "volume_trend": "unknown",
            "avg_volume_20d": 0,
            "current_volume": 0,
            "current_vs_avg_ratio": 0,
            "abnormal_volume": False,
            "obv_signal": "HOLD",
            "price_volume_divergence": False,
        }

    def get_signal(self) -> dict:
        """Get trading signal based on volume analysis."""
        result = self.analyze()

        score = 0.0
        if result["obv_signal"] == "BUY":
            score += 0.4
        elif result["obv_signal"] == "SELL":
            score -= 0.4

        if result["abnormal_volume"]:
            score *= 1.5

        if result["price_volume_divergence"]:
            score *= 0.5

        if result["volume_trend"] == "increasing":
            score += 0.1
        elif result["volume_trend"] == "decreasing":
            score -= 0.1

        score = max(-1.0, min(1.0, score))

        if score > 0.2:
            signal = "BUY"
        elif score < -0.2:
            signal = "SELL"
        else:
            signal = "HOLD"

        result["signal"] = signal
        result["strength"] = round(score, 4)
        return result

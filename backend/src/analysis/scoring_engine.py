"""Comprehensive scoring engine for stock analysis.

Combines all technical signals (candlestick, chart pattern, S/R, volume)
with additional indicators (ATR, RSI, EMA trend, Fibonacci) to produce:
- Enhanced confidence with multi-factor confirmation
- Multi-method target prices (S/R, ATR, Fibonacci, pattern)
- ATR-based stop loss
- Risk/Reward ratio
- Letter grade (A+ ~ F)
"""

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema

from src.analysis.candlestick_patterns import CandlestickDetector
from src.analysis.chart_patterns import ChartPatternDetector
from src.analysis.support_resistance import SupportResistanceDetector
from src.analysis.volume_analysis import VolumeAnalyzer


class ScoringEngine:
    """Produces a comprehensive score from OHLCV data."""

    SIGNAL_WEIGHTS = {
        "candlestick": 0.15,
        "chart_pattern": 0.25,
        "support_resistance": 0.20,
        "volume": 0.10,
        "trend": 0.15,
        "rsi": 0.15,
    }

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.close = self.df["close"].values.astype(float)
        self.high = self.df["high"].values.astype(float)
        self.low = self.df["low"].values.astype(float)
        self.volume = self.df["volume"].values.astype(float)
        self.current_price = self.close[-1]

    # ------------------------------------------------------------------
    # Technical Indicators
    # ------------------------------------------------------------------

    def calculate_atr(self, period: int = 14) -> float:
        """Average True Range — measures volatility."""
        if len(self.close) < period + 1:
            return float(self.high[-1] - self.low[-1])

        highs = self.high
        lows = self.low
        closes = self.close

        tr = np.maximum(
            highs[1:] - lows[1:],
            np.maximum(
                np.abs(highs[1:] - closes[:-1]),
                np.abs(lows[1:] - closes[:-1]),
            ),
        )
        if len(tr) < period:
            return float(np.mean(tr))
        return float(np.mean(tr[-period:]))

    def calculate_rsi(self, period: int = 14) -> float:
        """Relative Strength Index (0-100)."""
        if len(self.close) < period + 1:
            return 50.0

        deltas = np.diff(self.close)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)

        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])

        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return float(100.0 - (100.0 / (1.0 + rs)))

    def calculate_ema(self, period: int) -> np.ndarray:
        """Exponential Moving Average."""
        series = pd.Series(self.close)
        return series.ewm(span=period, adjust=False).mean().values

    def detect_trend(self) -> dict:
        """Detect trend via EMA-20/50 crossover + price position."""
        ema20 = self.calculate_ema(20)
        ema50 = self.calculate_ema(50)

        current_ema20 = ema20[-1]
        current_ema50 = ema50[-1]

        # Trend direction
        if current_ema20 > current_ema50 * 1.005:
            direction = "uptrend"
            strength = min((current_ema20 / current_ema50 - 1) * 20, 1.0)
        elif current_ema20 < current_ema50 * 0.995:
            direction = "downtrend"
            strength = min((1 - current_ema20 / current_ema50) * 20, 1.0)
        else:
            direction = "sideways"
            strength = 0.0

        # Price above/below EMAs
        price_vs_ema20 = (self.current_price - current_ema20) / current_ema20
        price_vs_ema50 = (self.current_price - current_ema50) / current_ema50

        return {
            "direction": direction,
            "strength": round(strength, 4),
            "ema_20": round(current_ema20, 2),
            "ema_50": round(current_ema50, 2),
            "price_vs_ema20_pct": round(price_vs_ema20 * 100, 2),
            "price_vs_ema50_pct": round(price_vs_ema50 * 100, 2),
        }

    def calculate_fibonacci_levels(self) -> dict:
        """Fibonacci retracement & extension from recent swing high/low."""
        order = min(5, max(2, len(self.close) // 10))
        if len(self.close) < order * 2 + 1:
            return {"swing_high": None, "swing_low": None, "levels": {}}

        peak_idx = argrelextrema(self.high, np.greater, order=order)[0]
        trough_idx = argrelextrema(self.low, np.less, order=order)[0]

        swing_high = float(np.max(self.high[peak_idx])) if len(peak_idx) > 0 else float(np.max(self.high))
        swing_low = float(np.min(self.low[trough_idx])) if len(trough_idx) > 0 else float(np.min(self.low))

        diff = swing_high - swing_low
        if diff <= 0:
            return {"swing_high": swing_high, "swing_low": swing_low, "levels": {}}

        # Retracement levels (from high)
        levels = {
            "0.0": round(swing_high, 2),
            "0.236": round(swing_high - diff * 0.236, 2),
            "0.382": round(swing_high - diff * 0.382, 2),
            "0.5": round(swing_high - diff * 0.5, 2),
            "0.618": round(swing_high - diff * 0.618, 2),
            "0.786": round(swing_high - diff * 0.786, 2),
            "1.0": round(swing_low, 2),
        }
        # Extension levels (above swing high)
        levels["ext_1.272"] = round(swing_low + diff * 1.272, 2)
        levels["ext_1.618"] = round(swing_low + diff * 1.618, 2)

        return {
            "swing_high": round(swing_high, 2),
            "swing_low": round(swing_low, 2),
            "levels": levels,
        }

    # ------------------------------------------------------------------
    # Target / Stop-loss / Risk-Reward
    # ------------------------------------------------------------------

    def _calculate_targets(
        self,
        signal: str,
        sr_data: dict,
        chart_pattern_data: dict,
        atr: float,
        fib: dict,
    ) -> dict:
        """Calculate target prices from multiple methods and produce consensus."""
        price = self.current_price
        methods = []

        # Method 1: Support / Resistance
        sr_target = None
        if signal in ("BUY", "HOLD"):
            sr_target = sr_data.get("nearest_resistance")
        else:
            sr_target = sr_data.get("nearest_support")
        if sr_target and sr_target > 0:
            methods.append({"method": "S/R", "price": round(sr_target, 2)})

        # Method 2: ATR-based (2× ATR projection)
        if atr > 0:
            if signal == "SELL":
                atr_target = price - 2.0 * atr
            else:
                atr_target = price + 2.0 * atr
            methods.append({"method": "ATR(2x)", "price": round(atr_target, 2)})

        # Method 3: Fibonacci extension / retracement
        fib_levels = fib.get("levels", {})
        if signal in ("BUY", "HOLD"):
            ext = fib_levels.get("ext_1.272")
            if ext and ext > price:
                methods.append({"method": "Fib 1.272", "price": round(ext, 2)})
            elif fib_levels.get("0.0") and fib_levels["0.0"] > price:
                methods.append({"method": "Fib 0.0 (Swing High)", "price": round(fib_levels["0.0"], 2)})
        else:
            ret618 = fib_levels.get("0.618")
            if ret618 and ret618 < price:
                methods.append({"method": "Fib 0.618", "price": round(ret618, 2)})

        # Method 4: Chart pattern target
        cp_target = chart_pattern_data.get("target_price")
        if cp_target and cp_target > 0:
            methods.append({"method": "Pattern", "price": round(cp_target, 2)})

        # Consensus: median of all methods
        if methods:
            prices = [m["price"] for m in methods]
            consensus = round(float(np.median(prices)), 2)
        else:
            # Fallback: ATR-based if no methods
            consensus = round(price + (2.0 * atr if signal != "SELL" else -2.0 * atr), 2)

        return {
            "methods": methods,
            "consensus": consensus,
            "primary": methods[0]["price"] if methods else consensus,
        }

    def _calculate_stop_loss(
        self,
        signal: str,
        sr_data: dict,
        atr: float,
    ) -> dict:
        """ATR-based stop loss + S/R confirmation."""
        price = self.current_price

        # ATR-based stop (1.5× ATR)
        if signal == "SELL":
            atr_stop = price + 1.5 * atr
        else:
            atr_stop = price - 1.5 * atr

        # S/R-based stop
        sr_stop = None
        if signal in ("BUY", "HOLD"):
            sr_stop = sr_data.get("nearest_support")
        else:
            sr_stop = sr_data.get("nearest_resistance")

        # Choose the more conservative (closer to current price)
        if sr_stop and sr_stop > 0:
            if signal == "SELL":
                stop = min(atr_stop, sr_stop)  # tighter stop for SELL = lower value
            else:
                stop = max(atr_stop, sr_stop)  # tighter stop for BUY = higher value
        else:
            stop = atr_stop

        return {
            "atr_stop": round(atr_stop, 2),
            "sr_stop": round(sr_stop, 2) if sr_stop else None,
            "final": round(stop, 2),
        }

    def _calculate_entry_price(
        self,
        signal: str,
        sr_data: dict,
        atr: float,
        trend: dict,
        fib: dict,
    ) -> dict:
        """Calculate recommended entry (buy) price from multiple methods.

        Methods:
        1. S/R — nearest support level (buy at bounce)
        2. ATR pullback — current price minus 1× ATR (normal correction)
        3. EMA20 — 20-day EMA retest
        4. Fibonacci — nearest fib level below current price
        """
        price = self.current_price
        methods = []

        # Method 1: Nearest support
        nearest_support = sr_data.get("nearest_support")
        if nearest_support and 0 < nearest_support < price:
            methods.append({
                "method": "지지선",
                "price": round(nearest_support, 2),
                "rationale": "가격이 지지선까지 눌릴 때 매수",
            })

        # Method 2: ATR pullback (price - 1× ATR)
        if atr > 0:
            atr_entry = price - atr
            if atr_entry > 0:
                methods.append({
                    "method": "ATR 풀백",
                    "price": round(atr_entry, 2),
                    "rationale": f"1일 평균 변동폭({round(atr, 0)}) 만큼 조정 시 매수",
                })

        # Method 3: EMA20
        ema20 = trend.get("ema_20")
        if ema20 and 0 < ema20 < price:
            methods.append({
                "method": "EMA20",
                "price": round(ema20, 2),
                "rationale": "20일 이동평균선 리테스트 시 매수",
            })

        # Method 4: Fibonacci — closest level below current price
        fib_levels = fib.get("levels", {})
        best_fib = None
        best_fib_name = None
        for name in ("0.236", "0.382", "0.5", "0.618"):
            level = fib_levels.get(name)
            if level and 0 < level < price:
                if best_fib is None or level > best_fib:
                    best_fib = level
                    best_fib_name = name
        if best_fib is not None:
            methods.append({
                "method": f"Fib {best_fib_name}",
                "price": round(best_fib, 2),
                "rationale": f"피보나치 {best_fib_name} 되돌림 레벨에서 매수",
            })

        # For SELL signal, entry price = much lower (deeper correction needed)
        if signal == "SELL" and atr > 0:
            deep_entry = price - 2.0 * atr
            if deep_entry > 0:
                methods = [{
                    "method": "심층 조정",
                    "price": round(deep_entry, 2),
                    "rationale": "매도 신호 — 2× ATR 이상 하락 후 재평가",
                }]
                # Also add deeper fib level
                fib618 = fib_levels.get("0.618")
                if fib618 and 0 < fib618 < price:
                    methods.append({
                        "method": "Fib 0.618",
                        "price": round(fib618, 2),
                        "rationale": "피보나치 0.618 되돌림까지 대기",
                    })

        if methods:
            prices = [m["price"] for m in methods]
            consensus = round(float(np.median(prices)), 2)
        else:
            # Fallback: 3% below current price
            consensus = round(price * 0.97, 2)
            methods = [{
                "method": "기본 할인",
                "price": consensus,
                "rationale": "기술적 지지 없음 — 현재가 대비 3% 할인",
            }]

        # Discount rate from current price
        discount_pct = round((price - consensus) / price * 100, 2) if price > 0 else 0

        return {
            "methods": methods,
            "consensus": consensus,
            "discount_pct": discount_pct,
        }

    @staticmethod
    def _calculate_risk_reward(
        price: float, target: float, stop: float
    ) -> float | None:
        """Risk/Reward ratio. > 1.0 means reward > risk."""
        reward = abs(target - price)
        risk = abs(price - stop)
        if risk == 0:
            return None
        return round(reward / risk, 2)

    # ------------------------------------------------------------------
    # Enhanced Confidence
    # ------------------------------------------------------------------

    def _enhanced_confidence(
        self,
        base_score: float,
        trend: dict,
        rsi: float,
        volume_data: dict,
        signal: str,
    ) -> dict:
        """Multi-factor confidence with confirmation bonuses/penalties."""
        base_confidence = min(abs(base_score) * 100, 100)
        adjustments = []

        # --- Trend alignment ---
        trend_dir = trend["direction"]
        if signal == "BUY" and trend_dir == "uptrend":
            bonus = min(trend["strength"] * 12, 10)
            base_confidence += bonus
            adjustments.append({"factor": "추세 정렬 (상승)", "delta": f"+{bonus:.0f}"})
        elif signal == "SELL" and trend_dir == "downtrend":
            bonus = min(trend["strength"] * 12, 10)
            base_confidence += bonus
            adjustments.append({"factor": "추세 정렬 (하락)", "delta": f"+{bonus:.0f}"})
        elif signal == "BUY" and trend_dir == "downtrend":
            penalty = min(trend["strength"] * 10, 8)
            base_confidence -= penalty
            adjustments.append({"factor": "역추세 매수", "delta": f"-{penalty:.0f}"})
        elif signal == "SELL" and trend_dir == "uptrend":
            penalty = min(trend["strength"] * 10, 8)
            base_confidence -= penalty
            adjustments.append({"factor": "역추세 매도", "delta": f"-{penalty:.0f}"})

        # --- RSI confirmation ---
        if signal == "BUY" and rsi < 30:
            base_confidence += 8
            adjustments.append({"factor": f"RSI 과매도 ({rsi:.0f})", "delta": "+8"})
        elif signal == "BUY" and rsi > 70:
            base_confidence -= 6
            adjustments.append({"factor": f"RSI 과매수 ({rsi:.0f})", "delta": "-6"})
        elif signal == "SELL" and rsi > 70:
            base_confidence += 8
            adjustments.append({"factor": f"RSI 과매수 ({rsi:.0f})", "delta": "+8"})
        elif signal == "SELL" and rsi < 30:
            base_confidence -= 6
            adjustments.append({"factor": f"RSI 과매도 ({rsi:.0f})", "delta": "-6"})

        # --- Volume confirmation ---
        vol_ratio = volume_data.get("current_vs_avg_ratio", 1.0)
        obv_signal = volume_data.get("obv_signal", "HOLD")
        if obv_signal == signal and vol_ratio > 1.3:
            bonus = min((vol_ratio - 1) * 5, 8)
            base_confidence += bonus
            adjustments.append({"factor": f"거래량 확인 ({vol_ratio:.1f}x)", "delta": f"+{bonus:.0f}"})
        elif volume_data.get("price_volume_divergence"):
            base_confidence -= 5
            adjustments.append({"factor": "가격-거래량 다이버전스", "delta": "-5"})

        final_confidence = max(5, min(95, base_confidence))

        return {
            "base": round(min(abs(base_score) * 100, 100), 1),
            "final": round(final_confidence, 1),
            "adjustments": adjustments,
        }

    # ------------------------------------------------------------------
    # Grade Assignment
    # ------------------------------------------------------------------

    @staticmethod
    def _assign_grade(confidence: float, rr_ratio: float | None) -> str:
        """Assign letter grade from confidence + R:R."""
        score = confidence
        if rr_ratio is not None:
            if rr_ratio >= 3.0:
                score += 10
            elif rr_ratio >= 2.0:
                score += 5
            elif rr_ratio < 1.0:
                score -= 10

        if score >= 80:
            return "A+"
        if score >= 70:
            return "A"
        if score >= 60:
            return "B+"
        if score >= 50:
            return "B"
        if score >= 40:
            return "C"
        if score >= 25:
            return "D"
        return "F"

    # ------------------------------------------------------------------
    # Main Entry Point
    # ------------------------------------------------------------------

    def compute(self) -> dict:
        """Run full scoring pipeline and return comprehensive result."""
        # 1. Run individual detectors
        candlestick = CandlestickDetector(self.df).get_signal()
        chart_pattern = ChartPatternDetector(self.df).get_signal()
        sr = SupportResistanceDetector(self.df).get_signal()
        volume = VolumeAnalyzer(self.df).get_signal()

        # 2. Additional indicators
        atr = self.calculate_atr()
        rsi = self.calculate_rsi()
        trend = self.detect_trend()
        fib = self.calculate_fibonacci_levels()

        # 3. Trend strength as a signal component
        trend_strength = trend["strength"]
        if trend["direction"] == "uptrend":
            trend_score = trend_strength
        elif trend["direction"] == "downtrend":
            trend_score = -trend_strength
        else:
            trend_score = 0.0

        # 4. RSI as a signal component
        rsi_score = 0.0
        if rsi < 30:
            rsi_score = (30 - rsi) / 30  # 0 ~ 1 (oversold = bullish)
        elif rsi > 70:
            rsi_score = -(rsi - 70) / 30  # -1 ~ 0 (overbought = bearish)

        # 5. Weighted score
        signals = {
            "candlestick": candlestick.get("strength", 0),
            "chart_pattern": chart_pattern.get("strength", 0),
            "support_resistance": sr.get("strength", 0),
            "volume": volume.get("strength", 0),
            "trend": trend_score,
            "rsi": rsi_score,
        }

        total_score = sum(
            signals[k] * self.SIGNAL_WEIGHTS[k] for k in self.SIGNAL_WEIGHTS
        )

        if total_score > 0.08:
            signal = "BUY"
        elif total_score < -0.08:
            signal = "SELL"
        else:
            signal = "HOLD"

        # 6. Targets, stop-loss, entry price, R:R
        targets = self._calculate_targets(signal, sr, chart_pattern, atr, fib)
        stop_loss = self._calculate_stop_loss(signal, sr, atr)
        entry_price = self._calculate_entry_price(signal, sr, atr, trend, fib)
        rr_ratio = self._calculate_risk_reward(
            self.current_price, targets["consensus"], stop_loss["final"]
        )

        # 7. Enhanced confidence
        confidence = self._enhanced_confidence(total_score, trend, rsi, volume, signal)

        # 8. Grade
        grade = self._assign_grade(confidence["final"], rr_ratio)

        return {
            "signal": signal,
            "grade": grade,
            "confidence": confidence,
            "current_price": round(self.current_price, 2),
            "entry_price": entry_price,
            "target": targets,
            "stop_loss": stop_loss,
            "risk_reward_ratio": rr_ratio,
            "indicators": {
                "atr": round(atr, 2),
                "atr_pct": round(atr / self.current_price * 100, 2),
                "rsi": round(rsi, 1),
                "trend": trend,
                "fibonacci": fib,
            },
            "signal_breakdown": {
                k: {
                    "strength": round(signals[k], 4),
                    "weight": self.SIGNAL_WEIGHTS[k],
                    "contribution": round(signals[k] * self.SIGNAL_WEIGHTS[k], 4),
                }
                for k in self.SIGNAL_WEIGHTS
            },
            "total_score": round(total_score, 4),
            "details": {
                "candlestick": candlestick,
                "chart_pattern": chart_pattern,
                "support_resistance": sr,
                "volume": volume,
            },
        }

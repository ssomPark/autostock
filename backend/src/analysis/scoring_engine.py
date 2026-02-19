"""Comprehensive scoring engine for stock analysis.

Combines all technical signals (candlestick, chart pattern, S/R, volume)
with additional indicators (ATR, RSI, EMA trend, Fibonacci) to produce:
- Enhanced confidence with multi-factor confirmation
- Multi-method target prices (S/R, ATR, Fibonacci, pattern)
- ATR-based stop loss
- Risk/Reward ratio
- Letter grade (A+ ~ F)
"""

import math

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

    def __init__(self, df: pd.DataFrame, fundamentals: dict | None = None):
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self.close = self.df["close"].values.astype(float)
        self.high = self.df["high"].values.astype(float)
        self.low = self.df["low"].values.astype(float)
        self.volume = self.df["volume"].values.astype(float)
        self.current_price = self.close[-1]
        self.fundamentals = fundamentals or {}

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
        base_price: float | None = None,
    ) -> dict:
        """Calculate target prices (always upside from base).

        BUY/HOLD: base = current_price (상승 목표).
        SELL: base = entry_price (매수 후 수익 실현 목표).
        """
        price = base_price if base_price is not None else self.current_price
        methods = []

        # Method 1: nearest resistance above base
        sr_target = sr_data.get("nearest_resistance")
        if sr_target and sr_target > price:
            methods.append({"method": "S/R", "price": round(sr_target, 2)})

        # Method 2: ATR-based (2× ATR upside from base)
        if atr > 0:
            atr_target = price + 2.0 * atr
            methods.append({"method": "ATR(2x)", "price": round(atr_target, 2)})

        # Method 3: Fibonacci
        fib_levels = fib.get("levels", {})
        if base_price is not None:
            # SELL: nearest fib level above entry (conservative recovery target)
            best_fib, best_name = None, None
            for name in ("0.236", "0.382", "0.5", "0.618"):
                level = fib_levels.get(name)
                if level and level > price:
                    if best_fib is None or level < best_fib:
                        best_fib, best_name = level, name
            if best_fib:
                methods.append({"method": f"Fib {best_name}", "price": round(best_fib, 2)})
        else:
            # BUY/HOLD: extension levels
            ext = fib_levels.get("ext_1.272")
            if ext and ext > price:
                methods.append({"method": "Fib 1.272", "price": round(ext, 2)})
            elif fib_levels.get("0.0") and fib_levels["0.0"] > price:
                methods.append({"method": "Fib 0.0 (Swing High)", "price": round(fib_levels["0.0"], 2)})

        # Method 4: Chart pattern target (above base)
        cp_target = chart_pattern_data.get("target_price")
        if cp_target and cp_target > price:
            methods.append({"method": "Pattern", "price": round(cp_target, 2)})

        # Consensus: median of all methods
        if methods:
            prices = [m["price"] for m in methods]
            consensus = round(float(np.median(prices)), 2)
        else:
            consensus = round(price + 2.0 * atr, 2)

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
        base_price: float | None = None,
    ) -> dict:
        """ATR-based stop loss + S/R confirmation (always below base).

        BUY/HOLD: base = current_price.
        SELL: base = entry_price (매수 후 추가 하락 시 손절).
        """
        price = base_price if base_price is not None else self.current_price

        atr_stop = price - 1.5 * atr
        sr_stop = sr_data.get("nearest_support")

        if sr_stop and 0 < sr_stop < price:
            stop = max(atr_stop, sr_stop)  # 더 보수적 (base에 가까운 쪽)
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
        entry: float, target: float, stop: float
    ) -> float | None:
        """Risk/Reward ratio from buyer's perspective. > 1.0 means reward > risk.

        Always: reward = target - entry (upside), risk = entry - stop (downside).
        """
        reward = abs(target - entry)
        risk = abs(entry - stop)
        if risk == 0:
            return None
        return round(reward / risk, 2)

    # ------------------------------------------------------------------
    # Enhanced Confidence
    # ------------------------------------------------------------------

    @staticmethod
    def _sigmoid_confidence(x: float, k: float = 8.0, midpoint: float = 0.3) -> float:
        """Sigmoid-based base confidence mapping.

        Maps total_score (typically 0~0.6) to confidence (0~100)
        with an S-curve centred at *midpoint*.
        """
        return 100.0 / (1.0 + math.exp(-k * (abs(x) - midpoint)))

    def _enhanced_confidence(
        self,
        base_score: float,
        trend: dict,
        rsi: float,
        volume_data: dict,
        signal: str,
        signals: dict,
        atr: float,
    ) -> dict:
        """Multi-factor confidence with confirmation bonuses/penalties."""
        base_confidence = self._sigmoid_confidence(base_score)
        sigmoid_base = base_confidence  # remember for display
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

        # --- RSI confirmation (extended neutral zone) ---
        if signal == "BUY" and rsi < 30:
            base_confidence += 8
            adjustments.append({"factor": f"RSI 과매도 ({rsi:.0f})", "delta": "+8"})
        elif signal == "BUY" and 30 <= rsi <= 45:
            bonus = round((45 - rsi) / 15 * 5, 1)
            if bonus >= 0.5:
                base_confidence += bonus
                adjustments.append({"factor": f"RSI 과매도 접근 ({rsi:.0f})", "delta": f"+{bonus:.0f}"})
        elif signal == "BUY" and 60 <= rsi <= 70:
            penalty = round((rsi - 60) / 10 * 4, 1)
            if penalty >= 0.5:
                base_confidence -= penalty
                adjustments.append({"factor": f"RSI 과매수 접근 ({rsi:.0f})", "delta": f"-{penalty:.0f}"})
        elif signal == "BUY" and rsi > 70:
            base_confidence -= 6
            adjustments.append({"factor": f"RSI 과매수 ({rsi:.0f})", "delta": "-6"})
        elif signal == "SELL" and rsi > 70:
            base_confidence += 8
            adjustments.append({"factor": f"RSI 과매수 ({rsi:.0f})", "delta": "+8"})
        elif signal == "SELL" and 55 <= rsi <= 70:
            bonus = round((rsi - 55) / 15 * 5, 1)
            if bonus >= 0.5:
                base_confidence += bonus
                adjustments.append({"factor": f"RSI 과매수 접근 ({rsi:.0f})", "delta": f"+{bonus:.0f}"})
        elif signal == "SELL" and 30 <= rsi <= 40:
            penalty = round((40 - rsi) / 10 * 4, 1)
            if penalty >= 0.5:
                base_confidence -= penalty
                adjustments.append({"factor": f"RSI 과매도 접근 ({rsi:.0f})", "delta": f"-{penalty:.0f}"})
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

        # --- Signal Consensus (신호 일치도) ---
        core_keys = ["candlestick", "chart_pattern", "support_resistance", "volume"]
        core_strengths = [signals.get(k, 0) for k in core_keys]
        non_zero = [s for s in core_strengths if s != 0]
        if len(non_zero) >= 2:
            if signal == "BUY":
                aligned = sum(1 for s in non_zero if s > 0)
            elif signal == "SELL":
                aligned = sum(1 for s in non_zero if s < 0)
            else:
                aligned = 0
            ratio = aligned / len(non_zero) if non_zero else 0

            if len(non_zero) >= 3 and ratio >= 1.0:
                base_confidence += 12
                adjustments.append({"factor": f"신호 전원 일치 ({aligned}/{len(non_zero)})", "delta": "+12"})
            elif len(non_zero) >= 3 and ratio >= 0.75:
                base_confidence += 7
                adjustments.append({"factor": f"신호 수렴 ({aligned}/{len(non_zero)})", "delta": "+7"})
            elif len(non_zero) >= 2 and ratio >= 0.75:
                base_confidence += 4
                adjustments.append({"factor": f"신호 일치 ({aligned}/{len(non_zero)})", "delta": "+4"})
            elif ratio < 0.5:
                base_confidence -= 5
                adjustments.append({"factor": "신호 혼재", "delta": "-5"})

        # --- ATR-based volatility adjustment ---
        atr_pct = (atr / self.current_price * 100) if self.current_price > 0 else 0
        if atr_pct > 5.0:
            penalty = min(round((atr_pct - 5.0) / 3.0 * 8, 1), 8)
            base_confidence -= penalty
            adjustments.append({"factor": f"고변동성 ({atr_pct:.1f}%)", "delta": f"-{penalty:.0f}"})
        elif atr_pct > 3.0:
            penalty = min(round((atr_pct - 3.0) / 2.0 * 3, 1), 3)
            base_confidence -= penalty
            adjustments.append({"factor": f"변동성 주의 ({atr_pct:.1f}%)", "delta": f"-{penalty:.0f}"})
        elif atr_pct < 1.0:
            bonus = min(round((1.0 - atr_pct) * 4, 1), 4)
            if bonus >= 0.5:
                base_confidence += bonus
                adjustments.append({"factor": f"저변동성 ({atr_pct:.1f}%)", "delta": f"+{bonus:.0f}"})

        # --- Fundamental adjustment ---
        fund_adj = self._fundamental_adjustment(signal)
        for adj in fund_adj:
            base_confidence += adj["value"]
            sign = "+" if adj["value"] > 0 else ""
            adjustments.append({"factor": adj["factor"], "delta": f"{sign}{adj['value']:.0f}"})

        final_confidence = max(5, min(95, base_confidence))

        return {
            "base": round(sigmoid_base, 1),
            "final": round(final_confidence, 1),
            "adjustments": adjustments,
        }

    # ------------------------------------------------------------------
    # Fundamental Adjustment
    # ------------------------------------------------------------------

    def _fundamental_adjustment(self, signal: str) -> list[dict]:
        """Adjust confidence based on fundamental data (optional)."""
        if not self.fundamentals:
            return []

        adjustments = []
        f = self.fundamentals

        # --- Analyst target price ---
        target_mean = f.get("targetMeanPrice")
        if target_mean and target_mean > 0 and self.current_price > 0:
            upside = (target_mean - self.current_price) / self.current_price
            if signal == "BUY" and upside >= 0.15:
                bonus = min(round(upside / 0.15 * 8, 1), 8)
                adjustments.append({"factor": f"목표가 상방 ({upside * 100:.0f}%)", "value": bonus})
            elif signal == "BUY" and upside <= -0.15:
                penalty = min(round(abs(upside) / 0.15 * 6, 1), 6)
                adjustments.append({"factor": f"목표가 하방 ({upside * 100:.0f}%)", "value": -penalty})
            elif signal == "SELL" and upside <= -0.15:
                bonus = min(round(abs(upside) / 0.15 * 8, 1), 8)
                adjustments.append({"factor": f"목표가 하방 ({upside * 100:.0f}%)", "value": bonus})
            elif signal == "SELL" and upside >= 0.15:
                penalty = min(round(upside / 0.15 * 6, 1), 6)
                adjustments.append({"factor": f"목표가 상방 ({upside * 100:.0f}%)", "value": -penalty})

        # --- Analyst recommendation ---
        rec = (f.get("recommendationKey") or "").lower()
        if rec:
            buy_recs = ("strong_buy", "buy")
            sell_recs = ("strong_sell", "sell", "underperform")
            if signal == "BUY" and rec in buy_recs:
                adjustments.append({"factor": f"애널리스트 추천 일치 ({rec})", "value": 5})
            elif signal == "BUY" and rec in sell_recs:
                adjustments.append({"factor": f"애널리스트 추천 불일치 ({rec})", "value": -4})
            elif signal == "SELL" and rec in sell_recs:
                adjustments.append({"factor": f"애널리스트 추천 일치 ({rec})", "value": 5})
            elif signal == "SELL" and rec in buy_recs:
                adjustments.append({"factor": f"애널리스트 추천 불일치 ({rec})", "value": -4})

        # --- Earnings growth ---
        earnings_growth = f.get("earningsGrowth")
        if earnings_growth is not None:
            if signal == "BUY" and earnings_growth >= 0.10:
                bonus = min(round(earnings_growth / 0.10 * 5, 1), 5)
                adjustments.append({"factor": f"이익 성장 ({earnings_growth * 100:.0f}%)", "value": bonus})
            elif signal == "BUY" and earnings_growth <= -0.10:
                penalty = min(round(abs(earnings_growth) / 0.10 * 4, 1), 4)
                adjustments.append({"factor": f"이익 감소 ({earnings_growth * 100:.0f}%)", "value": -penalty})
            elif signal == "SELL" and earnings_growth <= -0.10:
                bonus = min(round(abs(earnings_growth) / 0.10 * 5, 1), 5)
                adjustments.append({"factor": f"이익 감소 ({earnings_growth * 100:.0f}%)", "value": bonus})
            elif signal == "SELL" and earnings_growth >= 0.10:
                penalty = min(round(earnings_growth / 0.10 * 4, 1), 4)
                adjustments.append({"factor": f"이익 성장 ({earnings_growth * 100:.0f}%)", "value": -penalty})

        # --- Short interest ---
        short_pct = f.get("shortPercentOfFloat")
        if short_pct is not None and short_pct >= 0.10:
            if signal == "BUY":
                adjustments.append({"factor": f"공매도 비율 높음 ({short_pct * 100:.0f}%)", "value": 5})

        return adjustments

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
    # Summary Generation
    # ------------------------------------------------------------------

    def _generate_summary(
        self,
        signal: str,
        trend: dict,
        rsi: float,
        atr: float,
        entry_price: dict,
        targets: dict,
        stop_loss: dict,
        rr_ratio: float | None,
        candlestick: dict,
        chart_pattern: dict,
        volume: dict,
        signals: dict,
    ) -> list[str]:
        """Generate Korean narrative summary from analysis results."""
        f = self.fundamentals
        price = self.current_price
        name = f.get("shortName") or "종목"
        sector = f.get("sector")
        is_kr = f.get("market", "").upper().startswith("KOS")
        currency = "원" if is_kr else "달러"

        def fmt(p):
            if p is None or p == 0:
                return "-"
            if is_kr:
                return f"{p:,.0f}{currency}"
            return f"{p:,.2f}{currency}"

        lines = []

        # ── P1: 현황 ──
        name_part = f"{name}({sector})" if sector else name
        trend_dir = trend["direction"]
        trend_str = trend["strength"]

        if trend_dir == "uptrend":
            adj = "강한 " if trend_str >= 0.7 else ""
            trend_desc = f"{adj}상승 추세(강도 {trend_str * 100:.0f}%)에 있습니다"
        elif trend_dir == "downtrend":
            adj = "강한 " if trend_str >= 0.7 else ""
            trend_desc = f"{adj}하락 추세(강도 {trend_str * 100:.0f}%)에 있습니다"
        else:
            trend_desc = "횡보 추세입니다"

        ema20_pct = trend["price_vs_ema20_pct"]
        ema50_pct = trend["price_vs_ema50_pct"]
        e20 = f"{'+'if ema20_pct >= 0 else ''}{ema20_pct}%"
        e50 = f"{'+'if ema50_pct >= 0 else ''}{ema50_pct}%"

        if ema20_pct >= 0 and ema50_pct >= 0:
            ema_desc = f"EMA20({e20})과 EMA50({e50}) 위에서 거래되고 있습니다."
        elif ema20_pct < 0 and ema50_pct < 0:
            ema_desc = f"EMA20({e20})과 EMA50({e50}) 아래에서 약세를 보이고 있습니다."
        else:
            ema_desc = f"EMA20({e20}), EMA50({e50}) 부근에서 거래되고 있습니다."

        lines.append(
            f"{name_part}는 현재 {fmt(price)}에 거래 중이며, {trend_desc}. {ema_desc}"
        )

        # ── P2: 기술적 신호 ──
        all_patterns = []
        for p in candlestick.get("patterns") or []:
            pn = p.get("pattern_korean") or p.get("pattern_name", "")
            all_patterns.append(f"{pn}({p.get('confidence', 0)}%)")
        for p in chart_pattern.get("patterns") or []:
            pn = p.get("pattern_korean") or p.get("pattern_name", "")
            all_patterns.append(f"{pn}({p.get('confidence', 0)}%)")

        parts = []
        if all_patterns:
            pat_str = ", ".join(all_patterns[:4])
            if len(all_patterns) > 4:
                pat_str += f" 외 {len(all_patterns) - 4}건"
            if signal == "BUY":
                parts.append(f"{pat_str} 패턴이 감지되어 매수 신호를 형성하고 있습니다")
            elif signal == "SELL":
                parts.append(f"{pat_str} 패턴이 감지되어 강한 매도 신호를 형성하고 있습니다")
            else:
                parts.append(f"{pat_str} 패턴이 감지되었습니다")

        vol_signal = volume.get("obv_signal", "HOLD")
        if vol_signal == signal and signal != "HOLD":
            dir_kr = "매수" if signal == "BUY" else "매도"
            parts.append(f"거래량도 {dir_kr} 방향을 지지합니다")

        # Signal consensus
        core_keys = ["candlestick", "chart_pattern", "support_resistance", "volume"]
        non_zero = [signals.get(k, 0) for k in core_keys if signals.get(k, 0) != 0]
        if len(non_zero) >= 3:
            if signal == "BUY":
                aligned = sum(1 for s in non_zero if s > 0)
            elif signal == "SELL":
                aligned = sum(1 for s in non_zero if s < 0)
            else:
                aligned = 0
            if aligned == len(non_zero) and aligned >= 3:
                dir_kr = "상승" if signal == "BUY" else "하락"
                parts.append(f"{aligned}개 핵심 신호가 전원 {dir_kr} 방향으로 일치합니다")

        # Warnings
        warnings = []
        if 65 <= rsi <= 70:
            warnings.append(f"RSI({rsi:.0f})가 과매수 구간에 접근 중")
        elif rsi > 70:
            warnings.append(f"RSI({rsi:.0f})가 과매수 구간")
        elif 30 <= rsi <= 35:
            warnings.append(f"RSI({rsi:.0f})가 과매도 구간에 접근 중")
        elif rsi < 30:
            warnings.append(f"RSI({rsi:.0f})가 과매도 구간")

        if volume.get("price_volume_divergence"):
            warnings.append("가격-거래량 다이버전스가 관찰")

        atr_pct = (atr / price * 100) if price > 0 else 0
        if atr_pct > 5.0:
            warnings.append(f"변동성({atr_pct:.1f}%)이 매우 높아 주의 필요")
        elif atr_pct > 3.0:
            warnings.append(f"변동성({atr_pct:.1f}%)이 다소 높아 주의 필요")

        p2 = ""
        if parts:
            p2 = ". ".join(parts)
            if warnings:
                p2 += f". 다만 {'이며 '.join(warnings[:2])}되어 단기 조정 가능성에 유의하세요."
            else:
                p2 += "."
        elif warnings:
            p2 = f"{'이며 '.join(warnings[:2])}되어 주의가 필요합니다."
        else:
            p2 = "특별한 기술적 신호가 감지되지 않았습니다."

        lines.append(p2)

        # ── P3: 펀더멘탈 (optional) ──
        fund_parts = []
        eg = f.get("earningsGrowth")
        if eg is not None:
            eg_pct = eg * 100
            if eg_pct >= 50:
                fund_parts.append(f"이익 성장률 {eg_pct:.0f}%로 강한 실적 개선이 확인됩니다")
            elif eg_pct >= 10:
                fund_parts.append(f"이익 성장률 {eg_pct:.0f}%로 실적 개선이 확인됩니다")
            elif eg_pct <= -10:
                fund_parts.append(f"이익 성장률 {eg_pct:.0f}%로 실적 악화가 우려됩니다")

        rec = f.get("recommendationKey", "")
        if rec:
            rec_lower = rec.lower()
            buy_recs = ("strong_buy", "buy")
            sell_recs = ("strong_sell", "sell", "underperform")
            if signal == "BUY" and rec_lower in sell_recs:
                fund_parts.append(f"애널리스트 추천은 {rec}로 기술적 신호와 불일치합니다")
            elif signal == "SELL" and rec_lower in buy_recs:
                # Earnings context — combine into one sentence to avoid duplication
                if eg is not None and eg > 0:
                    fund_parts = [p for p in fund_parts if "이익 성장률" not in p]
                    fund_parts.append(
                        f"애널리스트 추천은 {rec}로 기술적 신호와 불일치하며, "
                        f"이익 성장률 {eg * 100:.0f}%에도 불구하고 차트상 하락 압력이 우세합니다"
                    )
                else:
                    fund_parts.append(f"애널리스트 추천은 {rec}로 기술적 신호와 불일치합니다")

        target_mean = f.get("targetMeanPrice")
        if target_mean and target_mean > 0 and price > 0:
            upside = (target_mean - price) / price * 100
            if abs(upside) >= 10:
                fund_parts.append(f"애널리스트 목표가 {fmt(target_mean)}(괴리율 {upside:+.0f}%)")

        if fund_parts:
            lines.append(". ".join(fund_parts) + ".")

        # ── P4: 매매 가이드 ──
        entry = entry_price.get("consensus")
        target_p = targets.get("consensus")
        stop = stop_loss.get("final")
        disc = entry_price.get("discount_pct", 0)

        p4 = []
        if entry:
            p4.append(f"추천 진입가 {fmt(entry)}(-{disc}%)")
        if target_p:
            p4.append(f"목표가 {fmt(target_p)}")
        if stop:
            p4.append(f"손절가 {fmt(stop)}")
        if rr_ratio is not None:
            # Append R:R to last item
            rr_str = f"(R:R {rr_ratio}:1)"
            if p4:
                p4[-1] = f"{p4[-1]} {rr_str}"
            else:
                p4.append(rr_str)

        if p4:
            lines.append(", ".join(p4) + ".")

        return lines

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

        # 6. Entry price first, then targets/stop
        entry_price = self._calculate_entry_price(signal, sr, atr, trend, fib)
        entry_consensus = entry_price["consensus"]

        if signal == "SELL":
            # SELL: 매수 추천가 기준으로 목표/손절 계산 (매수자 관점)
            targets = self._calculate_targets(
                signal, sr, chart_pattern, atr, fib, base_price=entry_consensus
            )
            stop_loss = self._calculate_stop_loss(
                signal, sr, atr, base_price=entry_consensus
            )
            rr_ratio = self._calculate_risk_reward(
                entry_consensus, targets["consensus"], stop_loss["final"]
            )
        else:
            # BUY/HOLD: 현재가 기준 (기존 로직)
            targets = self._calculate_targets(signal, sr, chart_pattern, atr, fib)
            stop_loss = self._calculate_stop_loss(signal, sr, atr)
            rr_ratio = self._calculate_risk_reward(
                self.current_price, targets["consensus"], stop_loss["final"]
            )

        # 7. Enhanced confidence
        confidence = self._enhanced_confidence(
            total_score, trend, rsi, volume, signal,
            signals=signals, atr=atr,
        )

        # 8. Grade
        grade = self._assign_grade(confidence["final"], rr_ratio)

        # 9. Summary
        summary = self._generate_summary(
            signal=signal,
            trend=trend,
            rsi=rsi,
            atr=atr,
            entry_price=entry_price,
            targets=targets,
            stop_loss=stop_loss,
            rr_ratio=rr_ratio,
            candlestick=candlestick,
            chart_pattern=chart_pattern,
            volume=volume,
            signals=signals,
        )

        return {
            "signal": signal,
            "grade": grade,
            "confidence": confidence,
            "current_price": round(self.current_price, 2),
            "entry_price": entry_price,
            "target": targets,
            "stop_loss": stop_loss,
            "risk_reward_ratio": rr_ratio,
            "summary": summary,
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

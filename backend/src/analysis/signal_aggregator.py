"""Signal aggregation module.

Combines all analysis signals with weighted scoring:
- News sentiment: 20%
- Candlestick patterns: 20%
- Chart patterns: 25%
- Support/Resistance: 20%
- Volume: 15%
"""

from dataclasses import dataclass


DEFAULT_WEIGHTS = {
    "news_sentiment": 0.20,
    "candlestick": 0.20,
    "chart_pattern": 0.25,
    "support_resistance": 0.20,
    "volume": 0.15,
}

THRESHOLDS = {
    "strong_buy": 0.7,
    "buy": 0.3,
    "hold_upper": 0.3,
    "hold_lower": -0.3,
    "sell": -0.3,
    "strong_sell": -0.7,
}


@dataclass
class ComponentSignal:
    name: str
    signal: str  # BUY/SELL/HOLD
    strength: float  # -1.0 to 1.0
    confidence: float = 0.0  # 0 to 1.0
    details: dict | None = None


class SignalAggregator:
    """Aggregates multiple analysis signals into a final recommendation."""

    def __init__(self, weights: dict[str, float] | None = None,
                 thresholds: dict[str, float] | None = None):
        self.weights = weights or DEFAULT_WEIGHTS
        self.thresholds = thresholds or THRESHOLDS

    def aggregate(self, signals: dict[str, ComponentSignal]) -> dict:
        """Aggregate component signals into a final recommendation.

        Args:
            signals: Dict mapping signal name to ComponentSignal

        Returns:
            Dict with action, confidence, composite_score, reasoning, component_signals
        """
        composite_score = 0.0
        total_weight = 0.0
        component_scores = {}

        for name, weight in self.weights.items():
            if name in signals:
                sig = signals[name]
                composite_score += sig.strength * weight
                total_weight += weight
                component_scores[name] = round(sig.strength, 4)
            else:
                component_scores[name] = 0.0

        if total_weight > 0 and total_weight < 1.0:
            composite_score = composite_score / total_weight

        composite_score = max(-1.0, min(1.0, composite_score))

        action = self._determine_action(composite_score)
        confidence = self._compute_confidence(signals, composite_score)
        reasoning = self._generate_reasoning(signals, action, composite_score)

        return {
            "action": action,
            "confidence": round(confidence, 4),
            "composite_score": round(composite_score, 4),
            "component_signals": component_scores,
            "reasoning": reasoning,
        }

    def _determine_action(self, score: float) -> str:
        if score >= self.thresholds["strong_buy"]:
            return "STRONG_BUY"
        elif score >= self.thresholds["buy"]:
            return "BUY"
        elif score <= self.thresholds["strong_sell"]:
            return "STRONG_SELL"
        elif score <= self.thresholds["sell"]:
            return "SELL"
        return "HOLD"

    def _compute_confidence(self, signals: dict[str, ComponentSignal],
                             composite: float) -> float:
        if not signals:
            return 0.0

        # Agreement factor: how much do signals agree?
        directions = []
        for sig in signals.values():
            if sig.strength > 0.1:
                directions.append(1)
            elif sig.strength < -0.1:
                directions.append(-1)
            else:
                directions.append(0)

        if not directions:
            return 0.0

        agreement = abs(sum(directions)) / len(directions)
        magnitude = abs(composite)
        confidence = (agreement * 0.5 + magnitude * 0.5)
        return min(1.0, confidence)

    def _generate_reasoning(self, signals: dict[str, ComponentSignal],
                             action: str, composite: float) -> str:
        korean_names = {
            "news_sentiment": "뉴스 감성",
            "candlestick": "캔들스틱",
            "chart_pattern": "차트 패턴",
            "support_resistance": "지지/저항",
            "volume": "거래량",
        }

        parts = []
        for name, sig in signals.items():
            kr_name = korean_names.get(name, name)
            if sig.strength > 0.2:
                parts.append(f"{kr_name}: 매수 신호 (강도 {sig.strength:.1%})")
            elif sig.strength < -0.2:
                parts.append(f"{kr_name}: 매도 신호 (강도 {abs(sig.strength):.1%})")
            else:
                parts.append(f"{kr_name}: 중립")

        action_kr = {
            "STRONG_BUY": "강력 매수",
            "BUY": "매수",
            "HOLD": "관망",
            "SELL": "매도",
            "STRONG_SELL": "강력 매도",
        }

        summary = f"종합 판정: {action_kr.get(action, action)} (점수: {composite:.2f})"
        details = " | ".join(parts)
        return f"{summary}\n분석: {details}"

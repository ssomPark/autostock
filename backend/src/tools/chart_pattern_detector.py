"""CrewAI tool wrapper for chart pattern detection."""

from __future__ import annotations

import json
import logging

import pandas as pd
from crewai.tools import BaseTool

from src.analysis.chart_patterns import ChartPatternDetector

logger = logging.getLogger(__name__)


class ChartPatternDetectorTool(BaseTool):
    name: str = "chart_pattern_detector"
    description: str = (
        "가격 데이터에서 차트 패턴(쌍봉, 쌍바닥, 삼각형, 깃발형 등)을 탐지합니다. "
        "input으로 OHLCV JSON 배열을 받습니다."
    )

    def _run(self, ohlcv_json: str) -> str:
        try:
            data = json.loads(ohlcv_json)
            df = pd.DataFrame(data)
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"])
                df.set_index("date", inplace=True)

            detector = ChartPatternDetector(df)
            result = detector.get_signal()
            return json.dumps(result, ensure_ascii=False, default=str)
        except Exception as e:
            logger.error(f"Chart pattern detection error: {e}")
            return json.dumps({"error": str(e), "signal": "HOLD", "strength": 0})

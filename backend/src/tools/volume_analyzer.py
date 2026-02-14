"""CrewAI tool wrapper for volume analysis."""

from __future__ import annotations

import json
import logging

import pandas as pd
from crewai.tools import BaseTool

from src.analysis.volume_analysis import VolumeAnalyzer

logger = logging.getLogger(__name__)


class VolumeAnalyzerTool(BaseTool):
    name: str = "volume_analyzer"
    description: str = (
        "거래량 데이터를 분석하여 가격 움직임의 신뢰도를 검증합니다. "
        "input으로 OHLCV JSON 배열을 받습니다."
    )

    def _run(self, ohlcv_json: str) -> str:
        try:
            data = json.loads(ohlcv_json)
            df = pd.DataFrame(data)
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"])
                df.set_index("date", inplace=True)

            analyzer = VolumeAnalyzer(df)
            result = analyzer.get_signal()
            return json.dumps(result, ensure_ascii=False, default=str)
        except Exception as e:
            logger.error(f"Volume analysis error: {e}")
            return json.dumps({"error": str(e), "signal": "HOLD", "strength": 0})

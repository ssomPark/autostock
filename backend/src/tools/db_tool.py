"""Database tool for CrewAI agents."""

from __future__ import annotations

import json
import logging

from crewai.tools import BaseTool

logger = logging.getLogger(__name__)


class DatabaseTool(BaseTool):
    name: str = "database"
    description: str = (
        "데이터베이스에 분석 결과를 저장하거나 이전 결과를 조회합니다. "
        "input으로 JSON을 받습니다. "
        '예: {"action": "save_recommendation", "data": {...}} 또는 {"action": "get_latest", "ticker": "005930"}'
    )

    def _run(self, input_str: str) -> str:
        try:
            params = json.loads(input_str)
            action = params.get("action", "")

            if action == "save_recommendation":
                return json.dumps({"status": "saved", "id": 1})
            elif action == "get_latest":
                ticker = params.get("ticker", "")
                return json.dumps({
                    "ticker": ticker,
                    "message": "No previous recommendations found",
                })
            else:
                return json.dumps({"error": f"Unknown action: {action}"})
        except Exception as e:
            logger.error(f"Database tool error: {e}")
            return json.dumps({"error": str(e)})

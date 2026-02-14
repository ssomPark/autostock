"""Korean stock API tool (KIS - Korea Investment & Securities).

Wraps KIS Open API for Korean market data (KOSPI/KOSDAQ).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

import httpx
from crewai.tools import BaseTool
from pydantic import Field

from src.config.settings import settings

logger = logging.getLogger(__name__)


class KoreanStockAPITool(BaseTool):
    name: str = "korean_stock_api"
    description: str = (
        "한국투자증권(KIS) API를 통해 한국 주식 데이터를 조회합니다. "
        "input으로 종목코드와 조회 유형을 JSON으로 받습니다. "
        '예: {"ticker": "005930", "action": "price"} 또는 {"ticker": "005930", "action": "ohlcv", "period": "D"}'
    )
    _access_token: str = ""
    _token_expires: datetime | None = None

    def _run(self, input_str: str) -> str:
        try:
            params = json.loads(input_str)
        except json.JSONDecodeError:
            params = {"ticker": input_str, "action": "price"}

        ticker = params.get("ticker", "")
        action = params.get("action", "price")

        if not settings.kis_app_key:
            return self._mock_data(ticker, action)

        try:
            self._ensure_token()
            if action == "price":
                return str(self._get_current_price(ticker))
            elif action == "ohlcv":
                period = params.get("period", "D")
                return str(self._get_ohlcv(ticker, period))
            elif action == "info":
                return str(self._get_stock_info(ticker))
            else:
                return f"Unknown action: {action}"
        except Exception as e:
            logger.error(f"KIS API error: {e}")
            return f"Error: {e}"

    def _ensure_token(self) -> None:
        """Get or refresh OAuth token."""
        if self._access_token and self._token_expires and datetime.now() < self._token_expires:
            return

        url = f"{settings.kis_base_url}/oauth2/tokenP"
        body = {
            "grant_type": "client_credentials",
            "appkey": settings.kis_app_key,
            "appsecret": settings.kis_app_secret,
        }
        resp = httpx.post(url, json=body, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]

    def _get_headers(self) -> dict:
        return {
            "authorization": f"Bearer {self._access_token}",
            "appkey": settings.kis_app_key,
            "appsecret": settings.kis_app_secret,
            "Content-Type": "application/json; charset=utf-8",
        }

    def _get_current_price(self, ticker: str) -> dict:
        """Get current price for a Korean stock."""
        url = f"{settings.kis_base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
        headers = {**self._get_headers(), "tr_id": "FHKST01010100"}
        params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": ticker}
        resp = httpx.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json().get("output", {})
        return {
            "ticker": ticker,
            "current_price": float(data.get("stck_prpr", 0)),
            "change": float(data.get("prdy_vrss", 0)),
            "change_pct": float(data.get("prdy_ctrt", 0)),
            "volume": int(data.get("acml_vol", 0)),
            "high": float(data.get("stck_hgpr", 0)),
            "low": float(data.get("stck_lwpr", 0)),
        }

    def _get_ohlcv(self, ticker: str, period: str = "D") -> list[dict]:
        """Get OHLCV data for a Korean stock."""
        url = f"{settings.kis_base_url}/uapi/domestic-stock/v1/quotations/inquire-daily-price"
        headers = {**self._get_headers(), "tr_id": "FHKST01010400"}
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker,
            "FID_PERIOD_DIV_CODE": period,
            "FID_ORG_ADJ_PRC": "0",
        }
        resp = httpx.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        items = resp.json().get("output", [])
        ohlcv = []
        for item in items:
            ohlcv.append({
                "date": item.get("stck_bsop_date", ""),
                "open": float(item.get("stck_oprc", 0)),
                "high": float(item.get("stck_hgpr", 0)),
                "low": float(item.get("stck_lwpr", 0)),
                "close": float(item.get("stck_clpr", 0)),
                "volume": int(item.get("acml_vol", 0)),
            })
        return ohlcv

    def _get_stock_info(self, ticker: str) -> dict:
        """Get stock basic info."""
        price = self._get_current_price(ticker)
        return {**price, "market": "KOSPI"}

    def _mock_data(self, ticker: str, action: str) -> str:
        """Return mock data when API keys are not configured."""
        if action == "price":
            return str({
                "ticker": ticker,
                "current_price": 70000,
                "change": 500,
                "change_pct": 0.72,
                "volume": 15000000,
                "high": 70500,
                "low": 69200,
                "note": "Mock data - configure KIS API keys for real data",
            })
        elif action == "ohlcv":
            import random
            ohlcv = []
            price = 70000
            for i in range(60):
                change = random.uniform(-0.03, 0.03)
                o = price
                c = price * (1 + change)
                h = max(o, c) * (1 + random.uniform(0, 0.01))
                l = min(o, c) * (1 - random.uniform(0, 0.01))
                v = random.randint(5000000, 30000000)
                ohlcv.append({
                    "date": f"2026-01-{i+1:02d}",
                    "open": round(o, 0),
                    "high": round(h, 0),
                    "low": round(l, 0),
                    "close": round(c, 0),
                    "volume": v,
                })
                price = c
            return str(ohlcv)
        return str({"ticker": ticker, "note": "Mock data"})

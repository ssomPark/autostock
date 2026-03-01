"""Korean stock API tool (KIS - Korea Investment & Securities).

Wraps KIS Open API for Korean market data (KOSPI/KOSDAQ).
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timedelta

import httpx
from crewai.tools import BaseTool
from pydantic import Field

from src.config.settings import settings

logger = logging.getLogger(__name__)

# --- KIS OAuth token singleton ---
_kis_token: str = ""
_kis_token_expires: datetime | None = None
_kis_token_lock = threading.Lock()
_kis_token_fail_until: datetime | None = None  # cooldown after failure


def _ensure_kis_token() -> str:
    """Get or refresh KIS OAuth token (shared across all instances)."""
    global _kis_token, _kis_token_expires, _kis_token_fail_until

    # Fast path: valid token (lock-free)
    if _kis_token and _kis_token_expires and datetime.now() < _kis_token_expires:
        return _kis_token

    with _kis_token_lock:
        # Double-check after acquiring lock
        if _kis_token and _kis_token_expires and datetime.now() < _kis_token_expires:
            return _kis_token

        # Cooldown check inside lock
        if _kis_token_fail_until and datetime.now() < _kis_token_fail_until:
            raise RuntimeError("KIS token unavailable (cooldown)")

        url = f"{settings.kis_base_url}/oauth2/tokenP"
        body = {
            "grant_type": "client_credentials",
            "appkey": settings.kis_app_key,
            "appsecret": settings.kis_app_secret,
        }
        try:
            resp = httpx.post(url, json=body, timeout=10)
            resp.raise_for_status()
        except Exception as e:
            _kis_token_fail_until = datetime.now() + timedelta(seconds=10)
            logger.warning(f"KIS token request failed, cooldown 10s: {e}")
            raise

        data = resp.json()
        _kis_token = data["access_token"]
        _kis_token_expires = datetime.now() + timedelta(hours=23)
        _kis_token_fail_until = None
        logger.info("KIS OAuth token issued successfully")
        return _kis_token


class KoreanStockAPITool(BaseTool):
    name: str = "korean_stock_api"
    description: str = (
        "한국투자증권(KIS) API를 통해 한국 주식 데이터를 조회합니다. "
        "input으로 종목코드와 조회 유형을 JSON으로 받습니다. "
        '예: {"ticker": "005930", "action": "price"} 또는 {"ticker": "005930", "action": "ohlcv", "period": "D"}'
    )

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
            _ensure_kis_token()
            if action == "price":
                return json.dumps(self._get_current_price(ticker), default=str)
            elif action == "ohlcv":
                period = params.get("period", "D")
                return json.dumps(self._get_ohlcv(ticker, period), default=str)
            elif action == "info":
                return json.dumps(self._get_stock_info(ticker), default=str)
            else:
                return json.dumps({"error": f"Unknown action: {action}"})
        except Exception as e:
            logger.error(f"KIS API error: {e}")
            return json.dumps({"error": str(e)})

    def _get_headers(self) -> dict:
        return {
            "authorization": f"Bearer {_kis_token}",
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
        # KIS API returns data in reverse chronological order (newest first).
        # Sort ascending by date so that iloc[-1] is the most recent.
        ohlcv.sort(key=lambda x: x["date"])
        return ohlcv

    def _get_stock_info(self, ticker: str) -> dict:
        """Get stock basic info."""
        price = self._get_current_price(ticker)
        return {**price, "market": "KOSPI"}

    def _mock_data(self, ticker: str, action: str) -> str:
        """Return mock data when API keys are not configured."""
        if action == "price":
            return json.dumps({
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
            price = 70000.0
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
            return json.dumps(ohlcv)
        return json.dumps({"ticker": ticker, "note": "Mock data"})

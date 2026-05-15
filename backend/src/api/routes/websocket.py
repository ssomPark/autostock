"""WebSocket routes for real-time updates."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)

active_connections: set[WebSocket] = set()
subscriptions: dict[WebSocket, set[str]] = {}  # ws -> set of "TICKER:MARKET"

# 구독 제한
MAX_SUBS_PER_CONNECTION = 10  # 연결당 최대 구독 수
MAX_TOTAL_CONNECTIONS = 200  # 전역 최대 연결 수
VALID_MARKETS = {"KOSPI", "KOSDAQ", "NASDAQ", "NYSE", "AMEX"}
# 티커 형식 검증: 한국(숫자 6자리) 또는 미국(영문 1-5자리)
_TICKER_RE = re.compile(r"^(\d{6}|[A-Z]{1,5}(-[A-Z])?)$")


@router.websocket("/live")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time pipeline updates + price subscriptions."""
    # 전역 연결 수 제한
    if len(active_connections) >= MAX_TOTAL_CONNECTIONS:
        await websocket.close(code=1013, reason="server busy")
        return

    await websocket.accept()
    active_connections.add(websocket)
    subscriptions[websocket] = set()
    logger.info(f"WebSocket connected. Total: {len(active_connections)}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                logger.warning("WebSocket: invalid JSON received, ignoring")
                continue
            msg_type = message.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "subscribe":
                ticker = str(message.get("ticker", "")).upper().strip()
                market = str(message.get("market", "KOSPI")).upper().strip()
                # 티커/마켓 검증
                if not ticker or not _TICKER_RE.match(ticker):
                    await websocket.send_json({"type": "error", "message": "invalid ticker"})
                    continue
                if market not in VALID_MARKETS:
                    await websocket.send_json({"type": "error", "message": "invalid market"})
                    continue
                # 연결당 구독 상한
                if len(subscriptions[websocket]) >= MAX_SUBS_PER_CONNECTION:
                    await websocket.send_json({"type": "error", "message": "subscription limit reached"})
                    continue
                key = f"{ticker}:{market}"
                subscriptions[websocket].add(key)
                await websocket.send_json({"type": "subscribed", "ticker": ticker, "market": market})
            elif msg_type == "unsubscribe":
                ticker = str(message.get("ticker", "")).upper().strip()
                market = str(message.get("market", "KOSPI")).upper().strip()
                key = f"{ticker}:{market}"
                subscriptions[websocket].discard(key)
                await websocket.send_json({"type": "unsubscribed", "ticker": ticker, "market": market})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally.")
    except Exception:
        logger.exception("WebSocket unexpected error")
    finally:
        active_connections.discard(websocket)
        subscriptions.pop(websocket, None)
        logger.info(f"WebSocket cleaned up. Total: {len(active_connections)}")


async def broadcast_message(message: dict) -> None:
    """Broadcast message to all connected WebSocket clients."""
    disconnected = set()
    for ws in active_connections:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.add(ws)
    active_connections.difference_update(disconnected)

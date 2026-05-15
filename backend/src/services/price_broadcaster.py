"""실시간 가격 브로드캐스터 — WebSocket 구독 종목 가격 주기 전송."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)


class PriceBroadcaster:
    """15초 주기로 구독 종목의 현재가를 WebSocket으로 전송."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("PriceBroadcaster started")

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("PriceBroadcaster stopped")

    async def _loop(self) -> None:
        from src.api.routes.websocket import active_connections, subscriptions

        while self._running:
            try:
                await asyncio.sleep(15)

                if not active_connections:
                    continue

                # Collect unique tickers from all subscriptions
                all_tickers: dict[str, str] = {}  # ticker -> market
                for ws, subs in list(subscriptions.items()):
                    if ws not in active_connections:
                        continue
                    for sub in subs:
                        # sub format: "TICKER:MARKET"
                        parts = sub.split(":")
                        if len(parts) == 2:
                            all_tickers[parts[0]] = parts[1]

                if not all_tickers:
                    continue

                # Check market hours
                from src.utils.market_hours import is_market_open

                prices = await self._fetch_prices(all_tickers, is_market_open)
                if not prices:
                    continue

                # Send to subscribed clients
                disconnected = set()
                for ws, subs in list(subscriptions.items()):
                    if ws not in active_connections:
                        continue
                    ws_prices = {}
                    for sub in subs:
                        parts = sub.split(":")
                        if parts[0] in prices:
                            ws_prices[parts[0]] = prices[parts[0]]
                    if ws_prices:
                        try:
                            await ws.send_json({
                                "type": "price_update",
                                "data": ws_prices,
                            })
                        except Exception:
                            disconnected.add(ws)

                for ws in disconnected:
                    active_connections.discard(ws)
                    subscriptions.pop(ws, None)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"PriceBroadcaster error: {e}")
                await asyncio.sleep(5)

    async def _fetch_prices(
        self,
        tickers: dict[str, str],
        is_market_open_fn,
    ) -> dict:
        """종목별 현재가 조회. 장 마감 시 해당 시장 건너뜀."""
        from src.services.market_data_service import MarketDataService

        svc = MarketDataService()
        results: dict = {}

        kr_tickers = {t: m for t, m in tickers.items() if m in ("KOSPI", "KOSDAQ")}
        us_tickers = {t: m for t, m in tickers.items() if m not in ("KOSPI", "KOSDAQ")}

        async def _fetch_one(ticker: str, market: str) -> None:
            try:
                data = await asyncio.to_thread(svc.get_current_price, ticker, market)
                if data and data.get("current_price"):
                    results[ticker] = {
                        "price": float(data["current_price"]),
                        "change_pct": float(data.get("change_pct", 0)),
                        "volume": int(data.get("volume", 0)),
                    }
            except Exception as e:
                logger.debug(f"Price fetch failed for {ticker}: {e}")

        tasks = []
        if kr_tickers and is_market_open_fn("KR"):
            for t, m in kr_tickers.items():
                tasks.append(_fetch_one(t, m))
        if us_tickers and is_market_open_fn("US"):
            for t, m in us_tickers.items():
                tasks.append(_fetch_one(t, m))

        if tasks:
            await asyncio.gather(*tasks)

        return results

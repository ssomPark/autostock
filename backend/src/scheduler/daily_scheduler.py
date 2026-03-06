"""Daily scheduler for automated tasks.

Uses asyncio-based scheduling to avoid APScheduler v3/v4 API incompatibility.

Schedule (KST):
- 23:55: Daily metrics snapshot
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


class DailyScheduler:
    """Lightweight asyncio-based daily scheduler."""

    def __init__(self):
        self._task: asyncio.Task | None = None

    async def _run_daily_metrics(self) -> None:
        """Collect and save daily metrics snapshot."""
        logger.info("[Scheduler] Collecting daily metrics snapshot")
        try:
            from src.db.database import get_async_session
            from src.api.routes.admin import _collect_daily_snapshot

            async for session in get_async_session():
                data = await _collect_daily_snapshot(session)
                logger.info(
                    f"[Scheduler] Daily metrics snapshot saved: "
                    f"DAU={data['active_users']}, new={data['new_users']}"
                )
                break
        except Exception as e:
            logger.error(f"[Scheduler] Daily metrics snapshot failed: {e}")

    def _seconds_until(self, hour: int, minute: int) -> float:
        """Seconds until next occurrence of HH:MM KST."""
        now = datetime.now(KST)
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        return (target - now).total_seconds()

    async def _loop(self) -> None:
        """Main scheduler loop."""
        while True:
            try:
                wait = self._seconds_until(23, 55)
                logger.info(f"[Scheduler] Next metrics snapshot in {wait:.0f}s")
                await asyncio.sleep(wait)
                await self._run_daily_metrics()
                # Sleep 60s to avoid re-trigger in the same minute
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[Scheduler] Loop error: {e}")
                await asyncio.sleep(300)

    def start(self) -> None:
        """Start the scheduler as a background task."""
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._loop())
        logger.info("[Scheduler] Daily scheduler started (metrics snapshot at 23:55 KST)")

    def stop(self) -> None:
        """Stop the scheduler."""
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("[Scheduler] Daily scheduler stopped")

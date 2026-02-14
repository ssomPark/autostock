"""Daily scheduler for automated pipeline execution.

Schedule (KST):
- 06:00: Korean market pipeline
- 21:00: US market pipeline
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.flows.daily_pipeline import DailyPipeline

logger = logging.getLogger(__name__)


class DailyScheduler:
    """Manages scheduled pipeline runs."""

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self._setup_jobs()

    def _setup_jobs(self) -> None:
        """Set up scheduled jobs."""
        # Korean market: 06:00 KST (before 09:00 open)
        self.scheduler.add_job(
            self._run_kr_pipeline,
            CronTrigger(hour=6, minute=0, timezone="Asia/Seoul"),
            id="kr_pipeline",
            name="Korean Market Daily Pipeline",
            replace_existing=True,
        )

        # US market: 21:00 KST (before 23:30 KST / 09:30 EST open)
        self.scheduler.add_job(
            self._run_us_pipeline,
            CronTrigger(hour=21, minute=0, timezone="Asia/Seoul"),
            id="us_pipeline",
            name="US Market Daily Pipeline",
            replace_existing=True,
        )

    async def _run_kr_pipeline(self) -> None:
        """Run Korean market pipeline."""
        logger.info("[Scheduler] Starting Korean market pipeline")
        try:
            pipeline = DailyPipeline(market_type="KR")
            result = pipeline.kickoff()
            logger.info(f"[Scheduler] KR pipeline completed: {result}")
        except Exception as e:
            logger.error(f"[Scheduler] KR pipeline failed: {e}")

    async def _run_us_pipeline(self) -> None:
        """Run US market pipeline."""
        logger.info("[Scheduler] Starting US market pipeline")
        try:
            pipeline = DailyPipeline(market_type="US")
            result = pipeline.kickoff()
            logger.info(f"[Scheduler] US pipeline completed: {result}")
        except Exception as e:
            logger.error(f"[Scheduler] US pipeline failed: {e}")

    def start(self) -> None:
        """Start the scheduler."""
        self.scheduler.start()
        logger.info("[Scheduler] Daily scheduler started")
        jobs = self.scheduler.get_jobs()
        for job in jobs:
            logger.info(f"  - {job.name}: {job.trigger}")

    def stop(self) -> None:
        """Stop the scheduler."""
        self.scheduler.shutdown()
        logger.info("[Scheduler] Daily scheduler stopped")

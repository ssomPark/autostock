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

        # Fundamental scan KR: 09:30 KST (after market open, data available)
        self.scheduler.add_job(
            self._run_fundamental_kr,
            CronTrigger(hour=9, minute=30, timezone="Asia/Seoul"),
            id="fundamental_kr",
            name="KR Fundamental Screening",
            replace_existing=True,
        )

        # Fundamental scan US: 00:00 KST (after US market open, ~10:00 EST)
        self.scheduler.add_job(
            self._run_fundamental_us,
            CronTrigger(hour=0, minute=0, timezone="Asia/Seoul"),
            id="fundamental_us",
            name="US Fundamental Screening",
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

    async def _run_fundamental_kr(self) -> None:
        """Run KR fundamental screening pipeline."""
        logger.info("[Scheduler] Starting KR fundamental screening")
        try:
            from src.services.fundamental_pipeline import FundamentalPipeline
            pipeline = FundamentalPipeline()
            result = await pipeline.run(market="KR")
            logger.info(f"[Scheduler] KR fundamental screening completed: {result}")
        except Exception as e:
            logger.error(f"[Scheduler] KR fundamental screening failed: {e}")

    async def _run_fundamental_us(self) -> None:
        """Run US fundamental screening pipeline."""
        logger.info("[Scheduler] Starting US fundamental screening")
        try:
            from src.services.fundamental_pipeline import FundamentalPipeline
            pipeline = FundamentalPipeline()
            result = await pipeline.run(market="US")
            logger.info(f"[Scheduler] US fundamental screening completed: {result}")
        except Exception as e:
            logger.error(f"[Scheduler] US fundamental screening failed: {e}")

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

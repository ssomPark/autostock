"""Redis-based rate limiter for anonymous analysis requests.

Tracks unique tickers per IP per day (KST) using a Redis SET,
so analyzing one ticker only counts once regardless of
how many endpoints are called for it.
Resets at midnight KST (UTC+9) for all users.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

import redis.asyncio as aioredis

from src.config.settings import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None

KST = timezone(timedelta(hours=9))


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _seconds_until_midnight_kst() -> int:
    """Return seconds remaining until midnight KST."""
    now = datetime.now(KST)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return int((midnight - now).total_seconds())


async def check_analysis_limit(ip: str, ticker: str) -> tuple[bool, int, int]:
    """Check if the anonymous IP is within the daily analysis limit.

    Uses a Redis SET to track unique tickers analyzed per IP per day (KST).
    Analyzing the same ticker multiple times (or hitting multiple endpoints
    for it) only counts as one analysis.

    Returns (allowed, remaining, reset_seconds).
    reset_seconds: seconds until midnight KST when the limit resets.
    """
    try:
        r = await _get_redis()
        today_kst = datetime.now(KST).strftime("%Y-%m-%d")
        key = f"analysis_limit:{ip}:{today_kst}"
        reset_seconds = _seconds_until_midnight_kst()

        # Check if this ticker was already counted
        already_counted = await r.sismember(key, ticker)
        if already_counted:
            count = await r.scard(key)
            return True, settings.analysis_rate_limit - count, reset_seconds

        # New ticker — check if adding it would exceed the limit
        count = await r.scard(key)
        limit = settings.analysis_rate_limit
        if count >= limit:
            return False, 0, reset_seconds

        # Add the ticker to the set, expire at midnight KST
        await r.sadd(key, ticker)
        await r.expire(key, reset_seconds)

        return True, limit - count - 1, reset_seconds
    except Exception as e:
        logger.warning(f"Rate limiter redis error (allowing request): {e}")
        return True, settings.analysis_rate_limit, _seconds_until_midnight_kst()

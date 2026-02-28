"""Redis-based rate limiter for anonymous analysis requests.

Tracks unique tickers per IP per day using a Redis SET,
so analyzing one ticker only counts once regardless of
how many endpoints are called for it.
"""

from __future__ import annotations

import logging
from datetime import date

import redis.asyncio as aioredis

from src.config.settings import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def check_analysis_limit(ip: str, ticker: str) -> tuple[bool, int, int]:
    """Check if the anonymous IP is within the daily analysis limit.

    Uses a Redis SET to track unique tickers analyzed per IP per day.
    Analyzing the same ticker multiple times (or hitting multiple endpoints
    for it) only counts as one analysis.

    Returns (allowed, remaining, reset_seconds).
    reset_seconds: seconds until the limit resets (TTL of the Redis key).
    """
    try:
        r = await _get_redis()
        key = f"analysis_limit:{ip}:{date.today().isoformat()}"

        # Check if this ticker was already counted
        already_counted = await r.sismember(key, ticker)
        if already_counted:
            count = await r.scard(key)
            ttl = await r.ttl(key)
            return True, settings.analysis_rate_limit - count, max(ttl, 0)

        # New ticker — check if adding it would exceed the limit
        count = await r.scard(key)
        limit = settings.analysis_rate_limit
        if count >= limit:
            ttl = await r.ttl(key)
            return False, 0, max(ttl, 0)

        # Add the ticker to the set
        await r.sadd(key, ticker)
        await r.expire(key, 86400)

        ttl = await r.ttl(key)
        return True, limit - count - 1, max(ttl, 0)
    except Exception as e:
        logger.warning(f"Rate limiter redis error (allowing request): {e}")
        return True, settings.analysis_rate_limit, 86400

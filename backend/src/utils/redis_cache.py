"""Redis cache utility for market data.

Provides in-memory-like caching backed by Redis
for OHLCV data, current prices, and stock info.
Uses the same Redis singleton as rate_limiter.
"""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis

from src.config.settings import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def cache_get(key: str) -> str | None:
    """Get a value from Redis cache. Returns None on miss or error."""
    try:
        r = await _get_redis()
        return await r.get(key)
    except Exception as e:
        logger.debug(f"Redis cache get error: {e}")
        return None


async def cache_set(key: str, value: str, ttl: int = 900) -> None:
    """Set a value in Redis cache with TTL (default 15 min)."""
    try:
        r = await _get_redis()
        await r.set(key, value, ex=ttl)
    except Exception as e:
        logger.debug(f"Redis cache set error: {e}")


async def cache_get_json(key: str) -> dict | list | None:
    """Get and JSON-decode a cached value."""
    raw = await cache_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def cache_set_json(key: str, data: dict | list, ttl: int = 900) -> None:
    """JSON-encode and cache a value."""
    try:
        await cache_set(key, json.dumps(data, default=str), ttl)
    except (TypeError, ValueError) as e:
        logger.debug(f"Redis cache JSON encode error: {e}")

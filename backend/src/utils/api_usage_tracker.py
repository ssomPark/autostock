"""API usage tracking via Redis Hash (TTL 90 days).

Tracks OpenAI and KIS API call counts, token usage, and estimated costs.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

import redis.asyncio as aioredis

from src.config.settings import settings

logger = logging.getLogger(__name__)

_TTL_DAYS = 90
_TTL_SECONDS = _TTL_DAYS * 86400

# gpt-4o-mini pricing (USD per 1M tokens)
_PRICING = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


# ── OpenAI tracking ──────────────────────────────────────────

async def track_openai_usage(feature: str, input_tokens: int, output_tokens: int) -> None:
    """Fire-and-forget: record OpenAI call with token counts."""
    try:
        r = await _get_redis()
        key = f"api_usage:openai:{date.today().isoformat()}"
        pipe = r.pipeline()
        pipe.hincrby(key, f"{feature}:calls", 1)
        pipe.hincrby(key, f"{feature}:input_tokens", input_tokens)
        pipe.hincrby(key, f"{feature}:output_tokens", output_tokens)
        pipe.expire(key, _TTL_SECONDS)
        await pipe.execute()
    except Exception as e:
        logger.debug(f"OpenAI usage tracking error: {e}")


async def get_openai_usage(days: int = 7) -> dict:
    """Return daily + by-feature aggregated OpenAI usage."""
    try:
        r = await _get_redis()
    except Exception:
        return {"daily": [], "by_feature": {}, "total": _empty_total()}

    daily = []
    by_feature: dict[str, dict] = {}
    total = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}

    today = date.today()
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        key = f"api_usage:openai:{d.isoformat()}"
        try:
            h = await r.hgetall(key)
        except Exception:
            h = {}

        day_calls = 0
        day_input = 0
        day_output = 0

        features_seen: set[str] = set()
        for field, val in h.items():
            parts = field.rsplit(":", 1)
            if len(parts) != 2:
                continue
            feat, metric = parts
            v = int(val)
            features_seen.add(feat)

            if feat not in by_feature:
                by_feature[feat] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}

            if metric == "calls":
                day_calls += v
                by_feature[feat]["calls"] += v
            elif metric == "input_tokens":
                day_input += v
                by_feature[feat]["input_tokens"] += v
            elif metric == "output_tokens":
                day_output += v
                by_feature[feat]["output_tokens"] += v

        daily.append({
            "date": d.strftime("%m-%d"),
            "total_calls": day_calls,
            "total_input": day_input,
            "total_output": day_output,
        })
        total["calls"] += day_calls
        total["input_tokens"] += day_input
        total["output_tokens"] += day_output

    # Compute costs
    model = settings.llm_model
    pricing = _PRICING.get(model, _PRICING["gpt-4o-mini"])
    total["cost_usd"] = round(
        total["input_tokens"] / 1_000_000 * pricing["input"]
        + total["output_tokens"] / 1_000_000 * pricing["output"],
        4,
    )
    for feat_data in by_feature.values():
        feat_data["cost_usd"] = round(
            feat_data["input_tokens"] / 1_000_000 * pricing["input"]
            + feat_data["output_tokens"] / 1_000_000 * pricing["output"],
            4,
        )

    return {"daily": daily, "by_feature": by_feature, "total": total}


def _empty_total():
    return {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}


# ── KIS tracking (sync helper for threaded code) ────────────

_sync_redis = None


def _get_sync_redis():
    global _sync_redis
    if _sync_redis is None:
        import redis
        _sync_redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _sync_redis


def track_kis_usage(action: str) -> None:
    """Sync: record a KIS API call."""
    try:
        r = _get_sync_redis()
        key = f"api_usage:kis:{date.today().isoformat()}"
        r.hincrby(key, f"{action}:calls", 1)
        r.expire(key, _TTL_SECONDS)
    except Exception as e:
        logger.debug(f"KIS usage tracking error: {e}")


async def get_kis_usage(days: int = 7) -> dict:
    """Return daily + totals for KIS API usage."""
    try:
        r = await _get_redis()
    except Exception:
        return {"daily": [], "totals": {}}

    daily = []
    totals: dict[str, int] = {}

    today = date.today()
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        key = f"api_usage:kis:{d.isoformat()}"
        try:
            h = await r.hgetall(key)
        except Exception:
            h = {}

        day_calls = 0
        for field, val in h.items():
            parts = field.rsplit(":", 1)
            if len(parts) != 2:
                continue
            action, metric = parts
            if metric == "calls":
                v = int(val)
                day_calls += v
                totals[action] = totals.get(action, 0) + v

        daily.append({"date": d.strftime("%m-%d"), "total_calls": day_calls})

    return {"daily": daily, "totals": totals}

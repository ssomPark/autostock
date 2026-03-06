"""Visitor tracking middleware — records all /api/* requests to Redis."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

_KST_OFFSET = timezone(timedelta(hours=9))

# Paths to exclude from tracking
_EXCLUDE_PREFIXES = ("/api/health", "/api/admin/", "/docs", "/openapi.json", "/ws")


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _extract_user_id(request: Request) -> int | None:
    """Try to extract user_id from JWT in Authorization header (best-effort)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        from src.auth.jwt import decode_token
        payload = decode_token(token)
        if payload and "sub" in payload:
            return int(payload["sub"])
    except Exception:
        pass
    return None


import re

# Patterns to normalize dynamic path segments into readable groups
_PATH_PATTERNS = [
    (re.compile(r"^/api/analysis/([^/]+)/score$"), "/api/analysis/*/score"),
    (re.compile(r"^/api/analysis/([^/]+)/ohlcv$"), "/api/analysis/*/ohlcv"),
    (re.compile(r"^/api/analysis/([^/]+)/financials$"), "/api/analysis/*/financials"),
    (re.compile(r"^/api/analysis/([^/]+)/candlestick$"), "/api/analysis/*/candlestick"),
    (re.compile(r"^/api/analysis/([^/]+)/chart-pattern$"), "/api/analysis/*/chart-pattern"),
    (re.compile(r"^/api/analysis/([^/]+)/support-resistance$"), "/api/analysis/*/support-resistance"),
    (re.compile(r"^/api/analysis/([^/]+)/volume$"), "/api/analysis/*/volume"),
    (re.compile(r"^/api/analysis/([^/]+)$"), "/api/analysis/*"),
    (re.compile(r"^/api/community/posts/\d+/comments$"), "/api/community/posts/*/comments"),
    (re.compile(r"^/api/community/posts/\d+$"), "/api/community/posts/*"),
    (re.compile(r"^/api/events/\d+"), "/api/events/*"),
    (re.compile(r"^/api/paper/positions/\d+$"), "/api/paper/positions/*"),
    (re.compile(r"^/api/paper/trades/\d+$"), "/api/paper/trades/*"),
    (re.compile(r"^/api/paper/summary/\d+$"), "/api/paper/summary/*"),
    (re.compile(r"^/api/paper/orders/\d+$"), "/api/paper/orders/*"),
    (re.compile(r"^/api/paper/accounts/\d+"), "/api/paper/accounts/*"),
    (re.compile(r"^/api/portfolio/\d+/report$"), "/api/portfolio/*/report"),
    (re.compile(r"^/api/portfolio/\d+/holdings"), "/api/portfolio/*/holdings"),
    (re.compile(r"^/api/portfolio/\d+$"), "/api/portfolio/*"),
    (re.compile(r"^/api/saved-analyses/history/"), "/api/saved-analyses/history/*"),
    (re.compile(r"^/api/saved-analyses/[^/]+/pin$"), "/api/saved-analyses/*/pin"),
    (re.compile(r"^/api/saved-analyses/[^/]+/memo$"), "/api/saved-analyses/*/memo"),
    (re.compile(r"^/api/saved-analyses/\d+$"), "/api/saved-analyses/*"),
    (re.compile(r"^/api/notifications/\d+"), "/api/notifications/*"),
    (re.compile(r"^/api/n8n/"), "/api/n8n/*"),
    (re.compile(r"^/api/prices/"), "/api/prices/*"),
]


def _normalize_path(path: str) -> str:
    """Collapse dynamic path segments into * for aggregation."""
    for pattern, replacement in _PATH_PATTERNS:
        if pattern.match(path):
            return replacement
    return path


class VisitorTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Process request first — never delay the response
        response = await call_next(request)

        path = request.url.path
        if not path.startswith("/api/") or any(path.startswith(p) for p in _EXCLUDE_PREFIXES):
            return response

        # Fire-and-forget Redis recording
        ip = _get_client_ip(request)
        user_id = _extract_user_id(request)
        asyncio.create_task(_record_visit(ip, user_id, path))

        return response


async def _record_visit(ip: str, user_id: int | None, path: str):
    """Record visit data to Redis (non-blocking)."""
    try:
        from src.utils.redis_cache import _get_redis
        r = await _get_redis()

        now_kst = datetime.now(_KST_OFFSET)
        date_str = now_kst.strftime("%Y-%m-%d")
        ttl = 48 * 3600  # 48 hours

        pipe = r.pipeline(transaction=False)

        # Total unique visitors (IP-based)
        key_all = f"visitors:{date_str}:all"
        pipe.sadd(key_all, ip)
        pipe.expire(key_all, ttl)

        # Anonymous vs logged-in
        if user_id is None:
            key_anon = f"visitors:{date_str}:anon"
            pipe.sadd(key_anon, ip)
            pipe.expire(key_anon, ttl)
        else:
            key_users = f"visitors:{date_str}:users"
            pipe.sadd(key_users, str(user_id))
            pipe.expire(key_users, ttl)

        # Page views counter
        key_pv = f"visitors:{date_str}:pv"
        pipe.incr(key_pv)
        pipe.expire(key_pv, ttl)

        # Path-level counts
        # Normalize: strip query params, collapse dynamic segments
        clean_path = _normalize_path(path.split("?")[0])
        key_paths = f"visitors:{date_str}:paths"
        pipe.hincrby(key_paths, clean_path, 1)
        pipe.expire(key_paths, ttl)

        await pipe.execute()
    except Exception as e:
        logger.debug(f"Visitor tracking error: {e}")

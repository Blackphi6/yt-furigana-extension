"""Simple in-memory rate limit for public demo Spaces."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def _limit() -> int:
    raw = os.environ.get("YT_FURIGANA_RATE_LIMIT_PER_MIN", "30")
    try:
        return max(1, int(raw))
    except ValueError:
        return 30


def _get_limit() -> int:
    """Higher ceiling for cacheable GET (shared pack)."""
    raw = os.environ.get("YT_FURIGANA_RATE_LIMIT_GET_PER_MIN", "120")
    try:
        return max(1, int(raw))
    except ValueError:
        return 120


def client_ip_from_request(request: Request) -> str:
    """
    Prefer the rightmost X-Forwarded-For hop.

    Proxies (Render etc.) append the connecting peer; spoofed left-most values
    must not become the rate-limit key.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-1]
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window for public / admin endpoints."""

    def __init__(
        self,
        app,
        mutate_prefixes: tuple[str, ...] | None = None,
        get_prefixes: tuple[str, ...] | None = None,
    ):
        super().__init__(app)
        self.mutate_prefixes = mutate_prefixes or (
            "/v1/readings",
            "/v1/contributions",
            "/v1/admin",
            "/v1/billing/checkout",
            "/v1/license/verify",
        )
        self.get_prefixes = get_prefixes or (
            "/v1/shared-readings",
            "/v1/billing/order",
        )
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_ip(self, request: Request) -> str:
        return client_ip_from_request(request)

    def _over_limit(self, ip: str, limit: int) -> bool:
        now = time.monotonic()
        window = 60.0
        with self._lock:
            q = self._hits[ip]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return True
            q.append(now)
            return False

    async def dispatch(self, request, call_next):
        path = request.url.path
        mutating = request.method in ("POST", "PUT", "PATCH", "DELETE")
        limit = None
        if mutating and any(path.startswith(p) for p in self.mutate_prefixes):
            limit = _limit()
        elif request.method == "GET" and any(
            path.startswith(p) for p in self.get_prefixes
        ):
            limit = _get_limit()

        if limit is not None:
            ip = self._client_ip(request)
            if self._over_limit(ip, limit):
                return JSONResponse(
                    {
                        "detail": f"rate_limit_exceeded ({limit}/min). Retry shortly."
                    },
                    status_code=429,
                )
        return await call_next(request)

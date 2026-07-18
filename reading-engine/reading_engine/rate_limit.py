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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window for POST /v1/readings."""

    def __init__(self, app, path_prefix: str = "/v1/readings"):
        super().__init__(app)
        self.path_prefix = path_prefix
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip() or "unknown"
        if request.client:
            return request.client.host or "unknown"
        return "unknown"

    async def dispatch(self, request, call_next):
        if request.method == "POST" and request.url.path.startswith(self.path_prefix):
            ip = self._client_ip(request)
            now = time.monotonic()
            window = 60.0
            limit = _limit()
            with self._lock:
                q = self._hits[ip]
                while q and now - q[0] > window:
                    q.popleft()
                if len(q) >= limit:
                    return JSONResponse(
                        {
                            "detail": f"rate_limit_exceeded ({limit}/min). Retry shortly."
                        },
                        status_code=429,
                    )
                q.append(now)
        return await call_next(request)

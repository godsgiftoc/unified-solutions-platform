"""Lightweight in-process rate limiting.

A sliding-window counter per client IP, used to throttle login attempts
(brute-force protection). This is per-process; when running multiple instances
behind a load balancer, back this with Redis so the window is shared. Kept
deliberately small and safe — only applied to login, not normal API traffic.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_login(request: Request) -> None:
    """FastAPI dependency: allow at most ``login_rate_limit`` attempts per
    ``login_rate_window_s`` seconds per client IP, else 429."""
    limit = settings.login_rate_limit
    window = settings.login_rate_window_s
    if limit <= 0:
        return
    key = _client_ip(request)
    now = time.monotonic()
    with _lock:
        dq = _hits[key]
        while dq and dq[0] <= now - window:
            dq.popleft()
        if len(dq) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many sign-in attempts. Please wait a moment and try again.",
            )
        dq.append(now)
        if not dq:
            _hits.pop(key, None)

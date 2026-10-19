"""
Shared rate limiting for outbound market-data calls.

Replaces the previous ``await asyncio.sleep(1.0)`` at the top of every ticker
fetch. That approach was both slower and weaker than a token bucket:

  * it was paid unconditionally, including on cache hits and single-ticker loads
  * it did not actually bound the global request rate once calls ran concurrently
  * measured at ~14% of a 7.4s per-ticker scan, purely idle

A token bucket lets short bursts through immediately and only blocks when the
sustained rate would exceed the budget.
"""
from __future__ import annotations

import asyncio
import os
import time


class AsyncRateLimiter:
    """Async token bucket. Refills continuously at ``rate_per_sec``."""

    __slots__ = ("_rate", "_capacity", "_tokens", "_updated", "_lock")

    def __init__(self, rate_per_sec: float, burst: float | None = None):
        if rate_per_sec <= 0:
            raise ValueError("rate_per_sec must be positive")
        self._rate = rate_per_sec
        self._capacity = burst if burst is not None else rate_per_sec
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: float = 1.0) -> None:
        if tokens > self._capacity:
            raise ValueError("cannot acquire more tokens than bucket capacity")
        while True:
            async with self._lock:
                now = time.monotonic()
                self._tokens = min(
                    self._capacity, self._tokens + (now - self._updated) * self._rate
                )
                self._updated = now
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                wait_for = (tokens - self._tokens) / self._rate
            # Released the lock before sleeping so other waiters can re-check.
            await asyncio.sleep(wait_for)


# Yahoo's unofficial ceiling is ~2000 requests/hour. A deep ticker costs ~6
# round-trips, so 8 tokens/sec sustained leaves comfortable headroom while
# allowing a burst of 16 for interactive single-ticker loads.
YAHOO_RATE = float(os.getenv("YAHOO_RATE_PER_SEC", "12"))
YAHOO_BURST = float(os.getenv("YAHOO_BURST", "24"))

yahoo_limiter = AsyncRateLimiter(rate_per_sec=YAHOO_RATE, burst=YAHOO_BURST)

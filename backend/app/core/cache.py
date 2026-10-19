"""
In-process TTL + LRU cache for raw provider bundles.

Deliberately separate from ``cache_service`` (Redis). Provider bundles contain
pandas DataFrames, which would need pickling or parquet encoding to survive a
round-trip through Redis; that cost can rival the fetch it avoids. So:

  * this module  -> raw bundles (DataFrames), process-local, zero serialization
  * cache_service -> computed analysis JSON, cross-process, already serializable
  * quotes_service -> live prices only, ~20s TTL (never reuse the bundle Close)

Financial statements move quarterly, so a 12-hour TTL is safe for fundamentals.
Prices are NOT served from this cache — callers overlay ``quotes_service``.
"""
from __future__ import annotations

import os
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple


class TTLCache:
    """Thread-safe LRU cache with per-entry expiry.

    The lock matters: entries are written from executor threads during scans.
    """

    def __init__(self, maxsize: int = 512):
        self._maxsize = maxsize
        self._data: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                self._misses += 1
                return None
            expires_at, value = entry
            if time.monotonic() > expires_at:
                del self._data[key]
                self._misses += 1
                return None
            self._data.move_to_end(key)
            self._hits += 1
            return value

    def set(self, key: str, value: Any, ttl: float) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            return {
                "entries": len(self._data),
                "maxsize": self._maxsize,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total, 3) if total else 0.0,
            }


BUNDLE_TTL = float(os.getenv("BUNDLE_CACHE_TTL", str(12 * 3600)))
BUNDLE_MAXSIZE = int(os.getenv("BUNDLE_CACHE_MAXSIZE", "512"))

bundle_cache = TTLCache(maxsize=BUNDLE_MAXSIZE)

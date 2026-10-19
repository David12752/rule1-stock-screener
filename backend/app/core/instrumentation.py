"""
Lightweight timing instrumentation for the data-fetch path.

Every property access on a yfinance ``Ticker`` is a separate HTTP round-trip, so
the only way to know where scan time actually goes is to time each one. Enable
with ``RULE1_TRACE_TIMING=1``; when disabled the helpers reduce to no-ops cheap
enough to leave in production code.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Dict, Iterator, List, Tuple

logger = logging.getLogger(__name__)

TRACE_ENABLED = os.getenv("RULE1_TRACE_TIMING", "0").lower() in ("1", "true", "yes")


class TimingReport:
    """Collects named step durations for a single logical operation."""

    __slots__ = ("name", "_steps", "_started")

    def __init__(self, name: str):
        self.name = name
        self._steps: List[Tuple[str, float]] = []
        self._started = time.perf_counter()

    @contextmanager
    def step(self, label: str) -> Iterator[None]:
        if not TRACE_ENABLED:
            yield
            return
        begin = time.perf_counter()
        try:
            yield
        finally:
            self._steps.append((label, time.perf_counter() - begin))

    @property
    def total(self) -> float:
        return time.perf_counter() - self._started

    def as_dict(self) -> Dict[str, float]:
        return dict(self._steps)

    def summary(self) -> str:
        total = self.total
        if not self._steps:
            return f"[timing] {self.name} total={total:.2f}s"
        # Slowest first: the point of the report is to find the hot call.
        parts = " ".join(
            f"{label}={dur:.2f}s"
            for label, dur in sorted(self._steps, key=lambda kv: kv[1], reverse=True)
        )
        return f"[timing] {self.name} total={total:.2f}s | {parts}"

    def log(self, level: int = logging.INFO) -> None:
        if TRACE_ENABLED:
            logger.log(level, self.summary())

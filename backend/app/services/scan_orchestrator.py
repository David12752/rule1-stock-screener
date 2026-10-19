"""
Bounded-concurrency scan execution.

Previously ``/scan`` fanned out via Starlette ``BackgroundTasks``, which awaits
its queue strictly in order:

    for task in self.tasks:
        await task()

so every scan ran one ticker at a time. Measured at 7.35s per ticker, a 500-name
universe took roughly an hour. Rate limiting is handled by the token bucket in
``app.core.rate_limit``, so concurrency here is purely about keeping the pipeline
busy rather than idling on network latency.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Awaitable, Callable, Iterable, List, Optional

logger = logging.getLogger(__name__)

SCAN_CONCURRENCY = int(os.getenv("SCAN_CONCURRENCY", "12"))


async def run_bounded(
    tickers: Iterable[str],
    worker: Callable[[str], Awaitable[None]],
    *,
    concurrency: Optional[int] = None,
    on_error: Optional[Callable[[str, BaseException], None]] = None,
) -> None:
    """Apply ``worker`` to every ticker, at most ``concurrency`` at a time.

    One failing ticker must never abort the scan, so exceptions are logged and
    reported rather than propagated.
    """
    limit = concurrency or SCAN_CONCURRENCY
    items: List[str] = list(tickers)
    if not items:
        return

    sem = asyncio.Semaphore(limit)

    async def guarded(ticker: str) -> None:
        async with sem:
            try:
                await worker(ticker)
            except asyncio.CancelledError:
                raise
            except BaseException as exc:  # noqa: BLE001 - one bad ticker must not kill the scan
                logger.exception("[scan] %s failed", ticker)
                if on_error is not None:
                    try:
                        on_error(ticker, exc)
                    except Exception:
                        logger.exception("[scan] on_error handler failed for %s", ticker)

    logger.info(
        "[scan] starting %d tickers with concurrency=%d", len(items), limit
    )
    await asyncio.gather(*(guarded(t) for t in items))
    logger.info("[scan] finished %d tickers", len(items))

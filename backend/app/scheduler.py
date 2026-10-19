"""
Daily Auto-Scan Scheduler — R1 Screener
==========================================
Runs a nightly background scan of the full stock universe (Rule #1 library +
pattern timing) and persists the results so they are immediately available.

On backend startup, `api.kickoff_automatic_scans` also runs (when enabled) so
users do not need to click Scan in the UI.

Integration with FastAPI lifespan:
------------------------------------
    from app.scheduler import start_scheduler, stop_scheduler

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await start_scheduler()
        yield
        await stop_scheduler()

The scheduler triggers at 02:00 UTC (market closed for US equities).
The scan window can be overridden via the SCANNER_CRON_HOUR /
SCANNER_CRON_MINUTE environment variables.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────

# Default: run at 02:00 UTC
_CRON_HOUR = int(os.getenv("SCANNER_CRON_HOUR", "2"))
_CRON_MINUTE = int(os.getenv("SCANNER_CRON_MINUTE", "0"))

# ── Scheduler State ───────────────────────────────────────────

_scheduler_task: Optional[asyncio.Task] = None
_running = False


def _seconds_until_next_run(hour: int, minute: int) -> float:
    """
    Return the number of seconds until the next occurrence of
    HH:MM UTC.  Minimum delay is 60 s to avoid immediate re-fires.
    """
    now = datetime.now(timezone.utc)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        target += timedelta(days=1)
    delta = (target - now).total_seconds()
    return max(60.0, delta)


async def _run_nightly_scan() -> None:
    """
    Execute the automatic library + pattern pipeline via api helpers so
    in-memory state (and the live UI) stay in sync.
    """
    logger.info("[Scheduler] Nightly scan starting…")
    try:
        from app.api import kickoff_automatic_scans

        result = await kickoff_automatic_scans(source="nightly", force=True)
        logger.info(f"[Scheduler] Nightly kickoff result: {result}")
    except asyncio.CancelledError:
        logger.info("[Scheduler] Nightly scan was cancelled.")
        raise
    except Exception as exc:
        logger.error(f"[Scheduler] Nightly scan failed: {exc}", exc_info=True)


async def _scheduler_loop() -> None:
    """
    Infinite loop that sleeps until the next scheduled run time,
    fires the scan, then sleeps again.
    """
    global _running
    logger.info(
        f"[Scheduler] Started — nightly scan scheduled at "
        f"{_CRON_HOUR:02d}:{_CRON_MINUTE:02d} UTC"
    )
    while _running:
        wait_secs = _seconds_until_next_run(_CRON_HOUR, _CRON_MINUTE)
        next_run = datetime.now(timezone.utc) + timedelta(seconds=wait_secs)
        logger.info(
            f"[Scheduler] Next nightly scan: {next_run.strftime('%Y-%m-%d %H:%M UTC')} "
            f"(in {wait_secs / 3600:.1f} h)"
        )
        try:
            await asyncio.sleep(wait_secs)
        except asyncio.CancelledError:
            logger.info("[Scheduler] Sleep interrupted — shutting down.")
            break

        if _running:
            await _run_nightly_scan()


async def start_scheduler() -> None:
    """Start the background scheduler task. Call once at app startup."""
    global _scheduler_task, _running

    if _scheduler_task is not None and not _scheduler_task.done():
        logger.warning("[Scheduler] Already running — ignoring start request.")
        return

    _running = True
    _scheduler_task = asyncio.create_task(_scheduler_loop(), name="nightly_scanner")
    logger.info("[Scheduler] Background task created.")


async def stop_scheduler() -> None:
    """Cancel the scheduler task gracefully. Call at app shutdown."""
    global _scheduler_task, _running
    _running = False

    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("[Scheduler] Stopped.")

    _scheduler_task = None


async def trigger_now() -> None:
    """
    Manually trigger the nightly scan immediately (e.g. from an admin endpoint).
    Does NOT interfere with the scheduled loop.
    """
    await _run_nightly_scan()


def get_next_run_info() -> dict:
    """Return metadata about the next scheduled run."""
    wait = _seconds_until_next_run(_CRON_HOUR, _CRON_MINUTE)
    next_run = datetime.now(timezone.utc) + timedelta(seconds=wait)
    return {
        "scheduled_hour_utc": _CRON_HOUR,
        "scheduled_minute_utc": _CRON_MINUTE,
        "next_run_utc": next_run.isoformat(),
        "seconds_until_next_run": round(wait),
        "is_running": _scheduler_task is not None and not (
            _scheduler_task.done() if _scheduler_task else True
        ),
    }

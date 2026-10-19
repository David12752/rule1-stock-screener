#!/usr/bin/env python3
"""
Time a Rule #1 scan end-to-end against a running backend.

Used to compare before/after the Phase 1 performance work, so the changes are
justified by measurement rather than assumption.

Usage:
    python scripts/bench_scan.py                      # default 6 tickers
    python scripts/bench_scan.py AAPL MSFT NVDA
    python scripts/bench_scan.py --label "after" AAPL MSFT
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

API = "http://localhost:8000"
DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META"]
POLL_INTERVAL = 0.25
TIMEOUT = 600.0


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    with urllib.request.urlopen(API + path, timeout=60) as resp:
        return json.loads(resp.read())


def _delete(path: str) -> None:
    req = urllib.request.Request(API + path, method="DELETE")
    try:
        urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError:
        pass


def is_settled(status: str) -> bool:
    return status == "complete" or status.startswith("error")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tickers", nargs="*", default=None)
    parser.add_argument("--label", default="baseline")
    args = parser.parse_args()

    tickers = [t.upper() for t in (args.tickers or DEFAULT_TICKERS)]

    try:
        _get("/market/status")
    except Exception as exc:
        print(f"Backend not reachable at {API}: {exc}")
        return 1

    # Clear prior state so the run measures real work, not a cache replay.
    _delete("/scan")

    print(f"[{args.label}] scanning {len(tickers)} tickers: {', '.join(tickers)}")
    started = time.perf_counter()
    _post("/scan", {"tickers": tickers})

    first_complete_at: float | None = None
    settled: dict[str, float] = {}

    while True:
        elapsed = time.perf_counter() - started
        if elapsed > TIMEOUT:
            print(f"TIMEOUT after {elapsed:.1f}s")
            return 1

        progress = _get("/results").get("progress", {})
        for ticker, status in progress.items():
            if ticker not in settled and is_settled(str(status)):
                settled[ticker] = elapsed
                if first_complete_at is None:
                    first_complete_at = elapsed
                print(f"  {elapsed:7.2f}s  {ticker:<6} {status}")

        if len(settled) >= len(tickers):
            break
        time.sleep(POLL_INTERVAL)

    total = time.perf_counter() - started
    per_ticker = total / len(tickers)

    print()
    print(f"[{args.label}] RESULTS")
    print(f"  tickers            : {len(tickers)}")
    print(f"  total wall clock   : {total:.2f}s")
    print(f"  mean per ticker    : {per_ticker:.2f}s")
    print(f"  time to first done : {first_complete_at:.2f}s")

    # Sequential pipelines settle tickers one by one, so the gap between the
    # first and last completion approaches the total. Concurrent ones cluster.
    spread = total - (first_complete_at or 0.0)
    print(f"  first-to-last gap  : {spread:.2f}s")
    print(
        "  concurrency        : "
        + ("SEQUENTIAL (gap ~= total)" if spread > total * 0.5 else "CONCURRENT (clustered)")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

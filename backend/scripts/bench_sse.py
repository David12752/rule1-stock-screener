"""Measure the scanner SSE stream: frame count, bytes and payload shape.

Starts a pattern scan and consumes /scanner/events to completion, reporting how
much data the stream pushes. Used to verify the delta protocol replaced the old
"resend everything every second" behaviour.

Usage: python scripts/bench_sse.py [TICKER ...]
"""

import json
import sys
import threading
import time

import requests

BASE = "http://localhost:8000"

PATTERNS = [
    "cup_and_handle",
    "inverse_head_and_shoulders",
    "double_bottom",
    "ascending_triangle",
    "bull_flag",
    "head_and_shoulders",
    "double_top",
    "descending_triangle",
    "bear_flag",
]


def consume(stats: dict) -> None:
    started = time.perf_counter()
    with requests.get(f"{BASE}/scanner/events", stream=True, timeout=300) as resp:
        for raw in resp.iter_lines(decode_unicode=True):
            if raw is None:
                continue
            if raw.startswith(":"):
                stats["keepalives"] += 1
                continue
            if not raw.startswith("data: "):
                continue

            body = raw[len("data: "):]
            stats["frames"] += 1
            stats["bytes"] += len(body.encode("utf-8"))

            try:
                msg = json.loads(body)
            except json.JSONDecodeError:
                stats["bad_frames"] += 1
                continue

            appended = len(msg.get("results_append") or [])
            stats["appended_rows"] += appended
            if "results" in msg:
                stats["legacy_full_payload_frames"] += 1
            stats["last"] = {k: v for k, v in msg.items() if k != "results_append"}

            if msg.get("type") == "done":
                break

    stats["seconds"] = time.perf_counter() - started


def main() -> None:
    tickers = [t.upper() for t in sys.argv[1:]] or [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "KO", "PEP",
    ]

    stats = {
        "frames": 0,
        "bytes": 0,
        "keepalives": 0,
        "appended_rows": 0,
        "bad_frames": 0,
        "legacy_full_payload_frames": 0,
        "last": None,
        "seconds": 0.0,
    }

    reader = threading.Thread(target=consume, args=(stats,), daemon=True)
    reader.start()
    time.sleep(0.5)

    payload = {
        "tickers": tickers,
        "patterns": PATTERNS,
        "min_confidence": 0.5,
        "timeframe": "1y",
        "detection_model": "zigzag_balanced",
        "require_rule1_quality": False,
        "filters": {
            "require_rule1_quality": False,
            "min_confidence": 0.5,
            "timeframe": "1y",
            "detection_model": "zigzag_balanced",
        },
    }
    requests.post(f"{BASE}/scanner/scan", json=payload, timeout=60)

    reader.join(timeout=300)

    print(f"tickers          : {len(tickers)}")
    print(f"wall time        : {stats['seconds']:.2f}s")
    print(f"data frames      : {stats['frames']}")
    print(f"keepalives       : {stats['keepalives']}")
    print(f"total bytes      : {stats['bytes']:,}")
    print(f"rows appended    : {stats['appended_rows']}")
    print(f"full-payload frames (should be 0): {stats['legacy_full_payload_frames']}")
    print(f"malformed frames : {stats['bad_frames']}")
    print(f"final frame      : {json.dumps(stats['last'], ensure_ascii=False)}")

    results = requests.get(f"{BASE}/scanner/results", timeout=60).json()
    print(f"server results   : {len(results.get('results') or [])}")


if __name__ == "__main__":
    main()

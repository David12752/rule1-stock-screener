#!/usr/bin/env python3
"""Merge selected universes into existing stock_index.json without wiping others."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stock-search" / "scripts"))

from build_stock_index import _FETCHERS, _UNIVERSE_LABELS  # noqa: E402


def merge_universes(universes: list[str]) -> None:
    import pandas as pd
    import requests

    out_path = ROOT / "backend" / ".tmp" / "stock_index.json"
    existing = []
    if out_path.exists():
        existing = json.loads(out_path.read_text(encoding="utf-8"))

    by_symbol = {r["symbol"]: r for r in existing}
    session = requests.Session()
    session.headers.update({"User-Agent": "Rule1Screener/1.0"})

    for key in universes:
        if key not in _FETCHERS:
            print(f"Unknown universe {key}")
            continue
        try:
            records = _FETCHERS[key](session, pd)
        except Exception as exc:
            print(f"ERROR {key}: {exc}")
            continue
        added = 0
        for r in records:
            sym = r["symbol"]
            if not sym:
                continue
            if sym not in by_symbol:
                by_symbol[sym] = r
                added += 1
            else:
                existing_rec = by_symbol[sym]
                extras = existing_rec.get("universe_extra", [])
                if key != existing_rec.get("universe") and key not in extras:
                    extras.append(key)
                    existing_rec["universe_extra"] = extras
        print(f"{_UNIVERSE_LABELS.get(key, key)}: +{added} (fetcher returned {len(records)})")

    all_records = list(by_symbol.values())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_records, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Total unique symbols: {len(all_records)} -> {out_path}")


if __name__ == "__main__":
    merge_universes(sys.argv[1:] or ["nikkei225", "hangseng"])

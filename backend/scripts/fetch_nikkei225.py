#!/usr/bin/env python3
"""Fetch Nikkei 225 constituents from indexes.nikkei.co.jp and print/merge samples."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
INDEX_PATH = ROOT / "backend" / ".tmp" / "stock_index.json"


def fetch_nikkei_records() -> list[dict]:
    url = "https://indexes.nikkei.co.jp/en/nkave/index/component?idx=nk225"
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 Rule1Screener/1.0"}, timeout=60)
    resp.raise_for_status()
    html = resp.text

    # Official page uses rows with 4-digit codes; match sequences near company cells.
    raw_codes = re.findall(r"(?:^|>|\s)(\d{4})(?:<|\s)", html)
    # Also catch HTML like code=7203
    raw_codes += re.findall(r"code[=:\"]+(\d{4})", html, flags=re.I)
    codes = sorted({c for c in raw_codes if c.isdigit() and len(c) == 4})

    # Filter out obvious non-tickers (years etc.) — Nikkei codes are usually known ranges
    # Keep all 4-digit appearances that look like table cells with company names nearby.
    # Prefer structured scrape: company links often contain nk225 code patterns.
    structured = re.findall(
        r"(\d{4})\s*</a>\s*</td>\s*<td[^>]*>\s*([^<]{2,80})",
        html,
        flags=re.I | re.S,
    )
    records: list[dict] = []
    seen = set()

    if structured:
        for code, name in structured:
            if code in seen:
                continue
            seen.add(code)
            records.append(
                {
                    "symbol": f"{int(code)}.T",
                    "name": re.sub(r"\s+", " ", name).strip(),
                    "sector": "",
                    "sub_industry": "",
                    "universe": "nikkei225",
                    "exchange": "TSE",
                    "currency": "JPY",
                    "country": "Japan",
                }
            )
    else:
        # Fallback: use unique codes + placeholder names (still usable for scanning)
        for code in codes:
            if code.startswith("20") and int(code) >= 2000 and int(code) <= 2030:
                # likely years
                continue
            records.append(
                {
                    "symbol": f"{int(code)}.T",
                    "name": f"Nikkei {code}",
                    "sector": "",
                    "sub_industry": "",
                    "universe": "nikkei225",
                    "exchange": "TSE",
                    "currency": "JPY",
                    "country": "Japan",
                }
            )

    return records


def merge(records: list[dict]) -> int:
    existing = json.loads(INDEX_PATH.read_text(encoding="utf-8")) if INDEX_PATH.exists() else []
    by_symbol = {r["symbol"]: r for r in existing}
    added = 0
    for r in records:
        sym = r["symbol"]
        if sym not in by_symbol:
            by_symbol[sym] = r
            added += 1
        else:
            rec = by_symbol[sym]
            extras = rec.get("universe_extra", [])
            if rec.get("universe") != "nikkei225" and "nikkei225" not in extras:
                extras.append("nikkei225")
                rec["universe_extra"] = extras
            if r.get("name") and (not rec.get("name") or rec["name"].startswith("Nikkei ")):
                rec["name"] = r["name"]
    INDEX_PATH.write_text(
        json.dumps(list(by_symbol.values()), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return added


def main() -> None:
    print("Fetching Nikkei 225 constituents…")
    records = fetch_nikkei_records()
    print(f"Parsed {len(records)} records; sample: {[r['symbol'] for r in records[:8]]}")
    if "--merge" in sys.argv:
        added = merge(records)
        print(f"Merged +{added}; index now at {INDEX_PATH}")
    else:
        print("Pass --merge to write into stock_index.json")


if __name__ == "__main__":
    main()

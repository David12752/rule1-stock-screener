"""Recover truncated library_results.json by decoding ticker entries one-by-one."""
from __future__ import annotations

import json
import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / ".tmp" / "library_results.json"
raw = p.read_text(encoding="utf-8")
print(f"len={len(raw)}")

m = re.search(r'"results"\s*:\s*\{', raw)
if not m:
    raise SystemExit("no results key")

pos = m.end()  # first char inside results object
dec = json.JSONDecoder()
results: dict = {}
errors = 0

# Skip whitespace / optional leading content
while pos < len(raw):
    while pos < len(raw) and raw[pos] in " \t\r\n,":
        pos += 1
    if pos >= len(raw) or raw[pos] == "}":
        break
    # Expect "TICKER"
    if raw[pos] != '"':
        print(f"unexpected at {pos}: {raw[pos:pos+40]!r}")
        break
    try:
        key, key_end = dec.raw_decode(raw, pos)
    except json.JSONDecodeError as e:
        print(f"key decode failed at {pos}: {e}")
        break
    pos = key_end
    while pos < len(raw) and raw[pos] in " \t\r\n":
        pos += 1
    if pos >= len(raw) or raw[pos] != ":":
        print(f"expected ':' after key {key!r} at {pos}")
        break
    pos += 1
    while pos < len(raw) and raw[pos] in " \t\r\n":
        pos += 1
    try:
        value, val_end = dec.raw_decode(raw, pos)
    except json.JSONDecodeError as e:
        print(f"value decode failed for {key!r} at {pos}: {e}")
        errors += 1
        break
    results[key] = value
    pos = val_end

print(f"recovered {len(results)} tickers (stopped with {errors} value errors)")
if len(results) < 10:
    raise SystemExit("too few recovered")

# Backup corrupt file then write recovered
bak = p.with_suffix(".json.corrupt")
if not bak.exists():
    bak.write_bytes(p.read_bytes())
    print(f"backed up corrupt file -> {bak.name}")

tmp = p.with_suffix(".json.tmp")
payload = json.dumps({"results": results, "timestamp": 0}, ensure_ascii=False)
tmp.write_text(payload, encoding="utf-8")
tmp.replace(p)
print(f"saved {p.name} size={p.stat().st_size}")
print("sample", list(results.keys())[:10])

#!/usr/bin/env python3
"""One-shot: normalize dirty symbols in backend/.tmp/stock_index.json"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.symbol_utils import normalize_yahoo_symbol  # noqa: E402


def main() -> None:
    path = ROOT / ".tmp" / "stock_index.json"
    items = json.loads(path.read_text(encoding="utf-8"))
    fixed = 0
    for item in items:
        old = item.get("symbol", "")
        new = normalize_yahoo_symbol(old)
        if new and new != old:
            item["symbol"] = new
            fixed += 1
    path.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
    hk = [i["symbol"] for i in items if i.get("universe") == "hangseng"]
    print(f"Fixed {fixed} symbols. Hang Seng samples: {hk[:8]} (n={len(hk)})")


if __name__ == "__main__":
    main()

"""
Performance summary for Rule #1 workflow — verdict mix, archives, portfolio snapshot.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from app.persistence import list_archives, list_latest_analyses

logger = logging.getLogger(__name__)


def build_performance_summary(
    *,
    library_results: Optional[Dict[str, Dict[str, Any]]] = None,
    scanner_results: Optional[List[Dict[str, Any]]] = None,
    portfolio_rows: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    library_results = library_results or {}
    scanner_results = scanner_results or []
    portfolio_rows = portfolio_rows or []

    verdicts = Counter()
    incomplete = 0
    buy_ready = 0
    undervalued = 0
    splits_applied = 0

    for row in library_results.values():
        v = row.get("verdict") or "UNKNOWN"
        verdicts[v] += 1
        dq = row.get("data_quality") or {}
        if dq.get("incomplete") or (row.get("verdict_details") or {}).get("incomplete_data"):
            incomplete += 1
        if v == "BUY":
            buy_ready += 1
        vd = row.get("verdict_details") or {}
        if vd.get("undervalued"):
            undervalued += 1
        sa = row.get("split_adjustment") or {}
        if sa.get("applied"):
            splits_applied += 1

    # Also fold DB-persisted analyses if library is thinner
    db_analyses = list_latest_analyses(limit=1000)
    db_verdicts = Counter((a.get("verdict") or "UNKNOWN") for a in db_analyses)

    archives = list_archives(limit=20)
    archive_kinds = Counter(a.get("kind") or "?" for a in archives)

    # Portfolio crude P&L if cost/qty present
    invested = 0.0
    market_value = 0.0
    for h in portfolio_rows:
        try:
            shares = float(h.get("shares") or h.get("quantity") or 0)
            cost = float(h.get("avg_cost") or h.get("cost_basis") or 0)
            price = float(h.get("price") or h.get("current_price") or cost)
            invested += shares * cost
            market_value += shares * price
        except (TypeError, ValueError):
            continue
    pnl = market_value - invested
    pnl_pct = (pnl / invested * 100.0) if invested > 0 else None

    pattern_hits = len(scanner_results)
    both_candidates = 0
    # Approximate overlap: pattern symbols that have non-DISQUALIFIED library verdict
    lib_pass = {
        str(s.get("symbol", "")).upper()
        for s in library_results.values()
        if s.get("verdict") and s.get("verdict") != "DISQUALIFIED"
    }
    for r in scanner_results:
        sym = str(r.get("symbol", "")).upper()
        if sym in lib_pass:
            both_candidates += 1

    total_lib = len(library_results)
    return {
        "library": {
            "analyzed": total_lib,
            "verdicts": dict(verdicts),
            "buy_count": buy_ready,
            "undervalued_count": undervalued,
            "incomplete_count": incomplete,
            "incomplete_pct": round(incomplete / total_lib * 100, 1) if total_lib else 0,
            "splits_applied_count": splits_applied,
        },
        "database": {
            "persisted_analyses": len(db_analyses),
            "verdicts": dict(db_verdicts),
            "archives": len(archives),
            "archive_kinds": dict(archive_kinds),
            "recent_archives": archives[:8],
        },
        "scanner": {
            "pattern_hits": pattern_hits,
            "overlap_with_quality": both_candidates,
        },
        "portfolio": {
            "positions": len(portfolio_rows),
            "invested": round(invested, 2),
            "market_value": round(market_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
        },
        "pipeline_health": {
            "quality_to_timing_ready": both_candidates,
            "notes": [
                "BUY never emitted when Incomplete Data is flagged",
                "Overlap = pattern hits that also passed Rule #1 quality screen",
            ],
        },
    }

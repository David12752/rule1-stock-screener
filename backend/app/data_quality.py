"""
Data quality checks + split-adjustment for per-share metrics.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


INCOMPLETE_MISSING_THRESHOLD = 0.20
MIN_YEARS_COMPLETE = 5
MIN_YEARS_USABLE = 3


def assess_data_quality(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Flag incomplete fundamentals / thin history.
    incomplete=True when >20% cells missing OR <3 fiscal years.
    """
    issues: List[str] = []
    details: Dict[str, Any] = {}

    years = int(raw_data.get("years_count") or 0)
    details["years_count"] = years
    if years < MIN_YEARS_USABLE:
        issues.append(f"only {years} fiscal years (need ≥{MIN_YEARS_USABLE})")
    elif years < MIN_YEARS_COMPLETE:
        issues.append(f"only {years} fiscal years (ideal ≥{MIN_YEARS_COMPLETE})")

    missing_parts: Dict[str, float] = {}
    for key in ("financials", "balance_sheet", "cashflow"):
        df = raw_data.get(key, pd.DataFrame())
        if df is None or getattr(df, "empty", True):
            missing_parts[key] = 1.0
            issues.append(f"{key}: no data")
            continue
        total = df.shape[0] * df.shape[1]
        if total <= 0:
            missing_parts[key] = 1.0
            issues.append(f"{key}: empty")
            continue
        miss = float(df.isnull().sum().sum()) / float(total)
        missing_parts[key] = round(miss, 4)
        if miss > INCOMPLETE_MISSING_THRESHOLD:
            issues.append(f"{key}: {miss:.0%} missing (>{INCOMPLETE_MISSING_THRESHOLD:.0%})")

    details["missing_pct"] = missing_parts
    avg_missing = (
        sum(missing_parts.values()) / len(missing_parts) if missing_parts else 1.0
    )
    details["avg_missing_pct"] = round(avg_missing, 4)

    hist = raw_data.get("history", pd.DataFrame())
    hist_len = 0 if hist is None or getattr(hist, "empty", True) else len(hist)
    details["history_bars"] = hist_len
    if hist_len < 250:
        issues.append(f"history: only {hist_len} bars (expected 250+)")

    splits = raw_data.get("splits", pd.Series(dtype=float))
    split_count = 0 if splits is None or getattr(splits, "empty", True) else len(splits)
    details["split_events"] = split_count

    incomplete = (
        years < MIN_YEARS_USABLE
        or avg_missing > INCOMPLETE_MISSING_THRESHOLD
        or any(v > INCOMPLETE_MISSING_THRESHOLD for v in missing_parts.values())
        or any(k.endswith(": no data") or k.endswith(": empty") for k in issues if "fiscal" not in k and "history" not in k)
    )
    # Recompute incomplete more cleanly:
    incomplete = years < MIN_YEARS_USABLE or avg_missing > INCOMPLETE_MISSING_THRESHOLD
    for v in missing_parts.values():
        if v > INCOMPLETE_MISSING_THRESHOLD:
            incomplete = True
            break

    return {
        "incomplete": incomplete,
        "issues": issues,
        "details": details,
        "threshold_missing": INCOMPLETE_MISSING_THRESHOLD,
        "min_years_usable": MIN_YEARS_USABLE,
        "min_years_complete": MIN_YEARS_COMPLETE,
    }


def normalize_splits_naive(splits: Any) -> Dict[pd.Timestamp, float]:
    out: Dict[pd.Timestamp, float] = {}
    if splits is None or getattr(splits, "empty", True):
        return out
    for split_date, ratio in splits.items():
        try:
            sd = pd.Timestamp(split_date)
            if sd.tzinfo is not None:
                sd = sd.tz_convert("UTC").tz_localize(None)
            ratio_f = float(ratio)
            if ratio_f > 0:
                out[sd] = ratio_f
        except Exception:
            continue
    return out


def apply_split_adjustment(
    dates: List[Any],
    series_map: Dict[str, pd.Series],
    splits: Any,
) -> Tuple[Dict[str, pd.Series], Dict[str, Any]]:
    """
    Adjust per-share series for post-period splits (cumulative factor).
    Returns adjusted series map + metadata.
    """
    split_map = normalize_splits_naive(splits)
    meta = {
        "applied": False,
        "split_events": len(split_map),
        "adjusted_rows": 0,
        "max_factor": 1.0,
        "fields": list(series_map.keys()),
    }
    if not split_map:
        return series_map, meta

    adjusted = {k: s.copy() for k, s in series_map.items()}
    rows_touched = 0
    max_factor = 1.0

    for idx, fin_date in enumerate(dates):
        try:
            fin_ts = pd.Timestamp(fin_date)
            if fin_ts.tzinfo is not None:
                fin_ts = fin_ts.tz_convert("UTC").tz_localize(None)
        except Exception:
            continue

        cumulative = 1.0
        for split_date, ratio in split_map.items():
            if split_date > fin_ts:
                cumulative *= ratio

        if cumulative > 1.0:
            rows_touched += 1
            max_factor = max(max_factor, cumulative)
            for key, s in adjusted.items():
                try:
                    s.iloc[idx] = float(s.iloc[idx]) / cumulative
                except Exception:
                    pass

    meta["applied"] = rows_touched > 0
    meta["adjusted_rows"] = rows_touched
    meta["max_factor"] = round(max_factor, 4)
    return adjusted, meta

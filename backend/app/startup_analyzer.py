"""
Small-cap / startup pre-breakout scoring.

A candidate is a stock with:
  - market cap in [$50M, $2B]
  - listing age ≤ 7 years
  - a bullish pattern still forming or near breakout (not already broken)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

PROFILE_ID = "startup_pre_breakout"

MIN_MARKET_CAP = 50_000_000.0
MAX_MARKET_CAP = 2_000_000_000.0
MAX_LISTING_AGE_YEARS = 7.0

PRE_BREAKOUT_PATTERNS = (
    "ascending_triangle",
    "bull_flag",
    "cup_and_handle",
    "inverse_head_and_shoulders",
    "double_bottom",
)

# Labels that typically mark resistance / neckline / rim for bullish setups.
_RESISTANCE_LABELS = (
    "rim",
    "right rim",
    "left rim",
    "neckline",
    "neckline left",
    "neckline right",
    "resistance",
    "peak",
    "upper",
    "flag high",
    "triangle high",
)


def listing_age_years_from_info(info: dict) -> Optional[float]:
    """Years since first trade from yfinance info fields."""
    import time

    epoch = info.get("firstTradeDateEpochUtc") or info.get("firstTradeDateEpoch")
    if epoch is None:
        return None
    try:
        age = (time.time() - float(epoch)) / (365.25 * 24 * 3600)
        if age < 0 or age > 80:
            return None
        return round(age, 2)
    except (TypeError, ValueError):
        return None


def resistance_level(pattern: dict) -> Optional[float]:
    """Best resistance estimate from key_points labels, else target_price fallback."""
    points = pattern.get("key_points") or []
    labeled: List[float] = []
    highs: List[float] = []
    for kp in points:
        price = kp.get("price")
        if price is None:
            continue
        try:
            p = float(price)
        except (TypeError, ValueError):
            continue
        highs.append(p)
        label = str(kp.get("label") or "").lower()
        if any(tag in label for tag in _RESISTANCE_LABELS):
            labeled.append(p)
    if labeled:
        return max(labeled)
    # Double bottom: peak between troughs is often unlabeled resistance.
    if pattern.get("pattern_type") == "double_bottom" and highs:
        return max(highs)
    target = pattern.get("target_price")
    if target is not None:
        try:
            return float(target)
        except (TypeError, ValueError):
            return None
    return max(highs) if highs else None


def breakout_phase(current_price: float, pattern: dict) -> str:
    """
    forming  — price still below resistance
    near     — within 0–2% below or at resistance
    broken   — >2% above resistance
    """
    level = resistance_level(pattern)
    if level is None or level <= 0 or current_price <= 0:
        return "forming"
    ratio = current_price / level
    if ratio > 1.02:
        return "broken"
    if ratio >= 0.98:
        return "near"
    return "forming"


def _cap_in_band(market_cap: float) -> bool:
    return market_cap > 0 and MIN_MARKET_CAP <= market_cap <= MAX_MARKET_CAP


def compute_startup_score(
    *,
    market_cap: float,
    listing_age_years: Optional[float],
    pattern: dict,
    phase: str,
) -> int:
    """Composite 0–100 score for a single top pattern."""
    conf = float(pattern.get("confidence") or 0)
    score = conf * 45.0  # up to 45

    if phase == "near":
        score += 25.0
    elif phase == "forming":
        score += 15.0
    # broken contributes 0 (and is normally filtered out)

    if listing_age_years is not None and listing_age_years <= MAX_LISTING_AGE_YEARS:
        # Younger → higher; linear from 7y→0 bonus to 0y→20
        youth = max(0.0, (MAX_LISTING_AGE_YEARS - listing_age_years) / MAX_LISTING_AGE_YEARS)
        score += 20.0 * youth
    elif listing_age_years is None:
        score -= 5.0  # unknown age
    else:
        score -= 10.0  # too old (normally filtered before scoring)

    if _cap_in_band(market_cap):
        # Prefer mid-small (~$300M–$1B) slightly over micro/edge
        mid = (MIN_MARKET_CAP * MAX_MARKET_CAP) ** 0.5  # geometric mid ≈ $316M
        dist = abs(market_cap - mid) / mid
        score += max(0.0, 15.0 * (1.0 - min(dist, 1.0)))
    else:
        score -= 15.0

    return int(max(0, min(100, round(score))))


def enrich_scanner_result(
    result_dict: dict,
    *,
    listing_age_years: Optional[float] = None,
) -> Optional[dict]:
    """
    Filter + enrich a scanner result dict for the startup profile.
    Returns None if the name is not a pre-breakout startup candidate.
    """
    market_cap = float(result_dict.get("market_cap") or 0)
    age = listing_age_years
    if age is None:
        age = result_dict.get("listing_age_years")

    if not _cap_in_band(market_cap):
        return None
    # Known-old listings are out; missing age is allowed with a score penalty
    # (Yahoo often omits firstTradeDateEpochUtc).
    if age is not None and float(age) > MAX_LISTING_AGE_YEARS:
        return None

    patterns = [
        p
        for p in (result_dict.get("patterns") or [])
        if p.get("pattern_type") in PRE_BREAKOUT_PATTERNS
    ]
    if not patterns:
        return None

    scored: List[Tuple[int, str, dict]] = []
    for p in patterns:
        phase = breakout_phase(float(result_dict.get("current_price") or 0), p)
        if phase == "broken":
            continue
        s = compute_startup_score(
            market_cap=market_cap,
            listing_age_years=float(age) if age is not None else None,
            pattern=p,
            phase=phase,
        )
        scored.append((s, phase, p))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_phase, best_pattern = scored[0]

    out = dict(result_dict)
    if age is not None:
        out["listing_age_years"] = float(age)
    out["patterns"] = [p for _, _, p in scored]  # only non-broken pre-breakout
    out["startup_score"] = best_score
    out["breakout_phase"] = best_phase
    out["is_startup_candidate"] = True
    out["top_pattern"] = best_pattern.get("pattern_type")
    return out


def apply_profile_defaults(patterns: List[str], filters: dict) -> Tuple[List[str], dict]:
    """Fill patterns + cap filters when profile is startup_pre_breakout."""
    f = dict(filters or {})
    f["profile"] = PROFILE_ID
    f.setdefault("min_market_cap", MIN_MARKET_CAP)
    f.setdefault("max_market_cap", MAX_MARKET_CAP)
    f.setdefault("max_listing_age_years", MAX_LISTING_AGE_YEARS)
    # Prefer an explicit multi-pattern subset from the client; otherwise use the
    # full pre-breakout set (ScannerRequest defaults to a single pattern).
    incoming = [p for p in (patterns or []) if p in PRE_BREAKOUT_PATTERNS]
    pats = incoming if len(incoming) >= 2 else list(PRE_BREAKOUT_PATTERNS)
    return pats, f

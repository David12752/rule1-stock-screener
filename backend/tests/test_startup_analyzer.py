"""Unit tests for startup pre-breakout analyzer."""

from app.startup_analyzer import (
    breakout_phase,
    compute_startup_score,
    enrich_scanner_result,
    apply_profile_defaults,
    PRE_BREAKOUT_PATTERNS,
)


def test_breakout_phase_forming_near_broken():
    pattern = {
        "pattern_type": "cup_and_handle",
        "key_points": [{"label": "Right Rim", "price": 100.0}],
        "confidence": 0.8,
    }
    assert breakout_phase(90.0, pattern) == "forming"
    assert breakout_phase(99.0, pattern) == "near"
    assert breakout_phase(103.0, pattern) == "broken"


def test_enrich_filters_broken_and_large_cap():
    base = {
        "symbol": "XYZ",
        "company_name": "Test",
        "sector": "Tech",
        "current_price": 50.0,
        "market_cap": 500_000_000,
        "avg_volume": 1e6,
        "patterns": [
            {
                "pattern_type": "bull_flag",
                "confidence": 0.7,
                "key_points": [{"label": "Flag High", "price": 55.0}],
            }
        ],
    }
    ok = enrich_scanner_result(dict(base), listing_age_years=3.0)
    assert ok is not None
    assert ok["is_startup_candidate"] is True
    assert ok["startup_score"] > 0
    assert ok["breakout_phase"] in ("forming", "near")

    broken = dict(base)
    broken["current_price"] = 60.0  # >2% above 55
    assert enrich_scanner_result(broken, listing_age_years=3.0) is None

    mega = dict(base)
    mega["market_cap"] = 50_000_000_000
    assert enrich_scanner_result(mega, listing_age_years=2.0) is None

    old = dict(base)
    assert enrich_scanner_result(old, listing_age_years=12.0) is None

    # Missing age still qualifies (with score penalty)
    no_age = enrich_scanner_result(dict(base), listing_age_years=None)
    assert no_age is not None
    assert no_age["is_startup_candidate"] is True


def test_score_prefers_near_and_young():
    pattern = {"pattern_type": "ascending_triangle", "confidence": 0.8, "key_points": []}
    near = compute_startup_score(
        market_cap=400_000_000, listing_age_years=2.0, pattern=pattern, phase="near"
    )
    forming = compute_startup_score(
        market_cap=400_000_000, listing_age_years=2.0, pattern=pattern, phase="forming"
    )
    older = compute_startup_score(
        market_cap=400_000_000, listing_age_years=6.5, pattern=pattern, phase="near"
    )
    assert near > forming
    assert near > older


def test_apply_profile_defaults():
    pats, filters = apply_profile_defaults([], {})
    assert filters["profile"] == "startup_pre_breakout"
    assert filters["min_market_cap"] == 50_000_000
    assert filters["max_market_cap"] == 2_000_000_000
    assert set(pats) == set(PRE_BREAKOUT_PATTERNS)

    # Single default pattern expands to the full pre-breakout set
    pats1, _ = apply_profile_defaults(["cup_and_handle"], {})
    assert set(pats1) == set(PRE_BREAKOUT_PATTERNS)

    pats2, _ = apply_profile_defaults(
        ["cup_and_handle", "bull_flag", "bear_flag"], {}
    )
    assert "bear_flag" not in pats2
    assert set(pats2) == {"cup_and_handle", "bull_flag"}

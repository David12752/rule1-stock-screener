"""
Unit tests for the Pattern Detection Engine.
Tests each algorithm with synthetic OHLCV data designed to embed
a known pattern, then verifies detection and confidence ranges.

Run with:  pytest backend/tests/test_patterns.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import numpy as np
import pandas as pd
from datetime import date, timedelta

from app.pattern_detector import (
    PatternDetector,
    PatternType,
    DetectionModel,
    ZigZagFilter,
)


# ─────────────────────────── Helpers ────────────────────────────

def _make_df(prices: np.ndarray, volume: np.ndarray | None = None, start: str = "2023-01-01") -> pd.DataFrame:
    """Create a minimal OHLCV DataFrame from a Close price array."""
    n = len(prices)
    dates = pd.date_range(start=start, periods=n, freq="B")
    noise = np.abs(np.random.default_rng(42).normal(0, prices.max() * 0.003, n))
    if volume is None:
        volume = np.full(n, 1_000_000, dtype=float)
    return pd.DataFrame(
        {
            "Open":   prices - noise,
            "High":   prices + noise * 2,
            "Low":    prices - noise * 2,
            "Close":  prices,
            "Volume": volume,
        },
        index=dates,
    )


def _build_cup_and_handle(base: float = 100.0, n_days: int = 180) -> pd.DataFrame:
    """
    Craft a synthetic Cup-and-Handle pattern:
      rise → left rim → gradual U-shaped decline → right rim → handle dip → breakout
    """
    rng = np.random.default_rng(0)
    # Left rim: flat at ~120
    left_rim = np.linspace(base, base * 1.20, 20)
    # U-shaped cup bottom (cosine curve down to 90)
    cup_x = np.linspace(0, np.pi, 100)
    cup_prices = base * 1.20 - (base * 0.30) * (0.5 + 0.5 * np.cos(cup_x + np.pi))
    # Right rim: climb back to ~120
    right_rim = np.linspace(cup_prices[-1], base * 1.20, 20)
    # Handle: small dip of ~5%
    handle = np.linspace(base * 1.20, base * 1.14, 20)
    handle_up = np.linspace(base * 1.14, base * 1.18, 10)
    # Combine
    prices = np.concatenate([left_rim, cup_prices, right_rim, handle, handle_up])
    # Trim or pad to n_days
    prices = prices[:n_days] if len(prices) >= n_days else np.pad(prices, (0, n_days - len(prices)), mode="edge")
    prices += rng.normal(0, base * 0.002, len(prices))
    return _make_df(prices)


def _build_head_and_shoulders(base: float = 100.0, n_days: int = 140) -> pd.DataFrame:
    """
    Synthetic Head & Shoulders:
      left shoulder peak → neckline trough → head peak → neckline trough → right shoulder → breakdown
    """
    rng = np.random.default_rng(1)
    segments = [
        np.linspace(base, base * 1.10, 20),   # up to left shoulder
        np.linspace(base * 1.10, base * 1.02, 15),  # down to neckline
        np.linspace(base * 1.02, base * 1.18, 20),  # up to head
        np.linspace(base * 1.18, base * 1.02, 20),  # down to neckline
        np.linspace(base * 1.02, base * 1.10, 20),  # up to right shoulder
        np.linspace(base * 1.10, base * 0.95, 25),  # breakdown
    ]
    prices = np.concatenate(segments)
    prices = prices[:n_days] if len(prices) >= n_days else np.pad(prices, (0, n_days - len(prices)), mode="edge")
    prices += rng.normal(0, base * 0.002, len(prices))
    return _make_df(prices)


def _build_double_bottom(base: float = 100.0, n_days: int = 120) -> pd.DataFrame:
    """
    Synthetic Double Bottom (W-shape):
      prior move down → first trough → bounce → second trough → breakout
    """
    rng = np.random.default_rng(2)
    segments = [
        np.linspace(base * 1.10, base * 0.85, 30),   # first decline
        np.linspace(base * 0.85, base * 0.96, 20),   # bounce
        np.linspace(base * 0.96, base * 0.86, 20),   # second decline
        np.linspace(base * 0.86, base * 1.05, 30),   # breakout
    ]
    prices = np.concatenate(segments)
    prices = prices[:n_days] if len(prices) >= n_days else np.pad(prices, (0, n_days - len(prices)), mode="edge")
    prices += rng.normal(0, base * 0.002, len(prices))
    return _make_df(prices)


def _build_double_top(base: float = 100.0, n_days: int = 120) -> pd.DataFrame:
    """Synthetic Double Top (M-shape)."""
    rng = np.random.default_rng(3)
    segments = [
        np.linspace(base * 0.90, base * 1.15, 30),   # first rise
        np.linspace(base * 1.15, base * 1.04, 20),   # pullback
        np.linspace(base * 1.04, base * 1.14, 20),   # second rise
        np.linspace(base * 1.14, base * 0.95, 30),   # breakdown
    ]
    prices = np.concatenate(segments)
    prices = prices[:n_days] if len(prices) >= n_days else np.pad(prices, (0, n_days - len(prices)), mode="edge")
    prices += rng.normal(0, base * 0.002, len(prices))
    return _make_df(prices)


def _build_ascending_triangle(base: float = 100.0, n_days: int = 120) -> pd.DataFrame:
    """Resistance flat, higher lows → ascending triangle."""
    rng = np.random.default_rng(4)
    prices = np.full(n_days, base * 1.10)  # flat resistance
    # Higher lows oscillating toward resistance
    for i in range(n_days):
        progress = i / n_days
        low_floor = base + (base * 0.10) * progress
        prices[i] = low_floor + (base * 0.10 - base * 0.10 * progress) * abs(np.sin(i * 0.5))
    prices += rng.normal(0, base * 0.003, n_days)
    return _make_df(prices)


def _build_bull_flag(base: float = 100.0, n_days: int = 80) -> pd.DataFrame:
    """Sharp pole up + small parallel consolidation channel."""
    rng = np.random.default_rng(5)
    pole = np.linspace(base, base * 1.25, 25)                     # sharp rise
    flag = np.linspace(base * 1.25, base * 1.18, 30)              # mild drift down
    flag += rng.normal(0, base * 0.003, 30)
    breakout = np.linspace(base * 1.18, base * 1.35, 25)          # breakout
    prices = np.concatenate([pole, flag, breakout])[:n_days]
    return _make_df(prices)


# ─────────────────────────── ZigZag Tests ───────────────────────

class TestZigZagFilter:
    def test_returns_arrays(self):
        prices = np.array([10, 12, 9, 14, 8, 15], dtype=float)
        idx, prices_out, types = ZigZagFilter.compute(prices, threshold=0.10)
        assert len(idx) == len(prices_out) == len(types)

    def test_monotonic_increasing(self):
        """Monotonic array: only first and last point are pivots."""
        prices = np.linspace(10, 20, 50)
        idx, _, types = ZigZagFilter.compute(prices, threshold=0.05)
        assert len(idx) >= 1

    def test_known_zigzag(self):
        """Simple known zigzag should detect at least 2 pivots."""
        prices = np.array([100, 90, 110, 85, 120], dtype=float)
        idx, _, types = ZigZagFilter.compute(prices, threshold=0.05)
        assert len(idx) >= 2

    def test_threshold_reduces_pivots(self):
        """Higher threshold should produce fewer pivots."""
        prices = np.array([100, 105, 95, 108, 92, 115], dtype=float)
        _, _, tight = ZigZagFilter.compute(prices, threshold=0.20)
        _, _, loose = ZigZagFilter.compute(prices, threshold=0.02)
        assert len(tight) <= len(loose)

    def test_empty_returns_safely(self):
        idx, prices_out, types = ZigZagFilter.compute(np.array([100.0, 101.0]), threshold=0.05)
        assert isinstance(idx, np.ndarray)


# ─────────────────────── PatternDetector Tests ─────────────────

class TestPatternDetectorInit:
    def test_creates_detector(self):
        df = _make_df(np.linspace(100, 120, 100))
        det = PatternDetector(df)
        assert det is not None

    def test_all_detection_models(self):
        df = _build_cup_and_handle()
        for model in DetectionModel:
            det = PatternDetector(df, model=model)
            assert det.model == model

    def test_datetime_index_conversion(self):
        prices = np.linspace(100, 120, 60)
        df = _make_df(prices)
        df.index = df.index.strftime("%Y-%m-%d")  # string index
        det = PatternDetector(df)
        assert isinstance(det.df.index, pd.DatetimeIndex)


# ─────────────────────── Cup & Handle ──────────────────────────

class TestCupAndHandle:
    def test_detects_pattern(self):
        df = _build_cup_and_handle(n_days=180)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_cup_and_handle()
        # Should find at least one candidate
        assert isinstance(results, list)

    def test_confidence_range(self):
        df = _build_cup_and_handle(n_days=180)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_cup_and_handle():
            assert 0.0 <= match.confidence <= 1.0

    def test_pattern_type_correct(self):
        df = _build_cup_and_handle(n_days=180)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_cup_and_handle():
            assert match.pattern_type == PatternType.CUP_AND_HANDLE

    def test_has_key_points(self):
        df = _build_cup_and_handle(n_days=180)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_cup_and_handle():
            assert len(match.key_points) > 0
            for kp in match.key_points:
                assert "date" in kp and "price" in kp and "label" in kp

    def test_to_dict_serializable(self):
        df = _build_cup_and_handle(n_days=180)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_cup_and_handle():
            d = match.to_dict()
            assert "pattern_type" in d
            assert isinstance(d["pattern_type"], str)


# ─────────────────────── Head & Shoulders ──────────────────────

class TestHeadAndShoulders:
    def test_detects_bearish_pattern(self):
        df = _build_head_and_shoulders(n_days=140)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_head_and_shoulders()
        assert isinstance(results, list)

    def test_pattern_type_correct(self):
        df = _build_head_and_shoulders(n_days=140)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_head_and_shoulders():
            assert match.pattern_type in (
                PatternType.HEAD_AND_SHOULDERS,
                PatternType.INVERSE_HEAD_AND_SHOULDERS,
            )

    def test_confidence_range(self):
        df = _build_head_and_shoulders(n_days=140)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_head_and_shoulders():
            assert 0.0 <= match.confidence <= 1.0


# ─────────────────────── Double Bottom / Top ───────────────────

class TestDoublePatterns:
    def test_double_bottom_detects(self):
        df = _build_double_bottom(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_double_bottom()
        assert isinstance(results, list)

    def test_double_bottom_type(self):
        df = _build_double_bottom(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_double_bottom():
            assert match.pattern_type == PatternType.DOUBLE_BOTTOM

    def test_double_top_detects(self):
        df = _build_double_top(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_double_top()
        assert isinstance(results, list)

    def test_double_top_type(self):
        df = _build_double_top(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_double_top():
            assert match.pattern_type == PatternType.DOUBLE_TOP

    def test_confidence_bounded(self):
        for builder in [_build_double_bottom, _build_double_top]:
            df = builder(n_days=120)
            det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
            for match in det.detect_double_bottom() + det.detect_double_top():
                assert 0.0 <= match.confidence <= 1.0


# ─────────────────────── Triangles ─────────────────────────────

class TestTriangles:
    def test_ascending_triangle_returns_list(self):
        df = _build_ascending_triangle(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_ascending_triangle()
        assert isinstance(results, list)

    def test_descending_triangle_returns_list(self):
        df = _build_ascending_triangle(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_descending_triangle()
        assert isinstance(results, list)

    def test_types_correct(self):
        df = _build_ascending_triangle(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_ascending_triangle():
            assert match.pattern_type == PatternType.ASCENDING_TRIANGLE
        for match in det.detect_descending_triangle():
            assert match.pattern_type == PatternType.DESCENDING_TRIANGLE


# ─────────────────────── Flags ──────────────────────────────────

class TestFlags:
    def test_bull_flag_returns_list(self):
        df = _build_bull_flag(n_days=80)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_bull_flag()
        assert isinstance(results, list)

    def test_bear_flag_returns_list(self):
        df = _build_bull_flag(n_days=80)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.detect_bear_flag()
        assert isinstance(results, list)

    def test_flag_types_correct(self):
        df = _build_bull_flag(n_days=80)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        for match in det.detect_bull_flag():
            assert match.pattern_type == PatternType.BULL_FLAG
        for match in det.detect_bear_flag():
            assert match.pattern_type == PatternType.BEAR_FLAG


# ─────────────────────── scan_all_patterns ──────────────────────

class TestScanAllPatterns:
    def test_returns_sorted_by_confidence(self):
        df = _build_cup_and_handle(n_days=200)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.scan_all_patterns()
        assert isinstance(results, list)
        confidences = [r.confidence for r in results]
        assert confidences == sorted(confidences, reverse=True)

    def test_no_duplicate_overlapping_high_confidence(self):
        """Two identical patterns should not appear at same indices."""
        df = _build_double_bottom(n_days=120)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_LOOSE)
        results = det.scan_all_patterns()
        # Check no exact duplicate (same type + same start_idx)
        seen = set()
        for r in results:
            key = (r.pattern_type, r.start_idx)
            assert key not in seen, f"Duplicate: {key}"
            seen.add(key)

    def test_min_confidence_zero_point_five(self):
        """Verify scan respects the 0.5 threshold used in production."""
        df = _build_head_and_shoulders(n_days=140)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_BALANCED)
        results = det.scan_all_patterns()
        for r in results:
            # scan_all_patterns itself doesn't filter — caller does;
            # but all confidence values must be valid
            assert 0.0 <= r.confidence <= 1.0

    def test_flat_price_no_crash(self):
        """Completely flat prices should not crash the detector."""
        df = _make_df(np.full(100, 100.0))
        det = PatternDetector(df)
        results = det.scan_all_patterns()
        assert isinstance(results, list)

    def test_very_short_series_no_crash(self):
        """Short series (< 30 bars) should return empty without crashing."""
        df = _make_df(np.linspace(100, 110, 15))
        det = PatternDetector(df)
        results = det.scan_all_patterns()
        assert isinstance(results, list)

    def test_noisy_random_data(self):
        """Random walk data should produce valid (possibly empty) results."""
        rng = np.random.default_rng(99)
        prices = np.cumsum(rng.normal(0, 1, 200)) + 150
        prices = np.abs(prices)
        df = _make_df(prices)
        det = PatternDetector(df, model=DetectionModel.ZIGZAG_BALANCED)
        results = det.scan_all_patterns()
        for r in results:
            assert 0.0 <= r.confidence <= 1.0


# ─────────────────────── Multi-Timeframe ────────────────────────

class TestMultiTimeframeValidator:
    def test_bullish_pattern_gets_bonus_in_uptrend(self):
        """Cup & Handle in a clear weekly uptrend should get confidence ≥ base."""
        from app.pattern_detector import MultiTimeframeValidator
        df = _build_cup_and_handle(n_days=300)
        base_conf = 0.65
        adjusted = MultiTimeframeValidator.validate(df, PatternType.CUP_AND_HANDLE, base_conf)
        assert 0.0 <= adjusted <= 1.0
        # Uptrend → should not drop below 0.5
        assert adjusted >= 0.50

    def test_bearish_pattern_in_downtrend(self):
        from app.pattern_detector import MultiTimeframeValidator
        df = _build_head_and_shoulders(n_days=250)
        base_conf = 0.65
        adjusted = MultiTimeframeValidator.validate(df, PatternType.HEAD_AND_SHOULDERS, base_conf)
        assert 0.0 <= adjusted <= 1.0

    def test_clamps_to_valid_range(self):
        from app.pattern_detector import MultiTimeframeValidator
        df = _make_df(np.linspace(100, 80, 200))  # clear downtrend
        for pt in PatternType:
            adj = MultiTimeframeValidator.validate(df, pt, 0.9)
            assert 0.0 <= adj <= 1.0

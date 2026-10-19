"""
Pattern Detection Engine — R1 Screener
========================================
Detects chart patterns (Cup & Handle, Head & Shoulders, Double Bottom/Top,
Triangles, Flags) using a ZigZag-filtered approach on OHLCV data.

Uses only MIT/BSD licensed libraries: numpy, scipy, pandas.
"""

import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Tuple, Dict, Any
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# ── Enums & Data Classes ──────────────────────────────────────

class PatternType(str, Enum):
    CUP_AND_HANDLE = "cup_and_handle"
    HEAD_AND_SHOULDERS = "head_and_shoulders"
    INVERSE_HEAD_AND_SHOULDERS = "inverse_head_and_shoulders"
    DOUBLE_BOTTOM = "double_bottom"
    DOUBLE_TOP = "double_top"
    ASCENDING_TRIANGLE = "ascending_triangle"
    DESCENDING_TRIANGLE = "descending_triangle"
    BULL_FLAG = "bull_flag"
    BEAR_FLAG = "bear_flag"


class DetectionModel(str, Enum):
    """
    Controls the pivot-detection algorithm used by PatternDetector.

    ZIGZAG_BALANCED  – ZigZag 5% threshold · well-balanced (default)
    ZIGZAG_LOOSE     – ZigZag 3% threshold · earlier / more signals
    ZIGZAG_STRICT    – ZigZag 8% threshold · only major confirmed swings
    PEAK_BASED       – scipy find_peaks directly (no ZigZag smoothing)
    """
    ZIGZAG_BALANCED = "zigzag_balanced"
    ZIGZAG_LOOSE    = "zigzag_loose"
    ZIGZAG_STRICT   = "zigzag_strict"
    PEAK_BASED      = "peak_based"


# Model → (zigzag_threshold, confidence_multiplier)
_MODEL_PARAMS: Dict[DetectionModel, Tuple[float, float]] = {
    DetectionModel.ZIGZAG_BALANCED: (0.05, 1.00),
    DetectionModel.ZIGZAG_LOOSE:    (0.03, 0.90),  # more patterns, slight confidence discount
    DetectionModel.ZIGZAG_STRICT:   (0.08, 1.10),  # fewer patterns, confidence bonus
    DetectionModel.PEAK_BASED:      (0.05, 0.95),  # uses scipy find_peaks; threshold unused
}


@dataclass
class PatternMatch:
    pattern_type: PatternType
    confidence: float           # 0.0 – 1.0
    start_date: str
    end_date: str
    start_idx: int
    end_idx: int
    key_points: List[Dict[str, Any]] = field(default_factory=list)
    target_price: Optional[float] = None
    description: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["pattern_type"] = self.pattern_type.value
        # Sanitize numpy scalar types → plain Python so json.dumps never crashes
        import numpy as _np
        def _clean(v):
            if isinstance(v, _np.integer):  return int(v)
            if isinstance(v, _np.floating):
                f = float(v)
                return None if (f != f or f == float('inf') or f == float('-inf')) else f
            if isinstance(v, _np.ndarray): return v.tolist()
            return v
        for k in ("confidence", "start_idx", "end_idx", "target_price"):
            if k in d:
                d[k] = _clean(d[k])
        return d


# ── ZigZag Filtering ──────────────────────────────────────────

class ZigZagFilter:
    """
    ZigZag algorithm: smooths price noise by keeping only moves
    larger than `threshold` (as a fraction of price, e.g. 0.05 = 5%).
    Returns indices of significant turning points.
    """

    @staticmethod
    def compute(
        prices: np.ndarray,
        threshold: float = 0.05,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Returns:
            pivot_indices: indices in the original array of ZigZag pivots
            pivot_prices:  prices at those pivots
            pivot_types:   +1 for peak, -1 for trough
        """
        if len(prices) < 3:
            return np.array([]), np.array([]), np.array([])

        pivots_idx: List[int] = [0]
        pivots_type: List[int] = [0]  # 0 = unknown initial

        # Find initial direction
        direction = 0  # 1 = up, -1 = down
        for i in range(1, len(prices)):
            change = (prices[i] - prices[0]) / prices[0]
            if change > threshold:
                direction = 1
                pivots_type[0] = -1  # first pivot was a trough
                break
            elif change < -threshold:
                direction = -1
                pivots_type[0] = 1   # first pivot was a peak
                break

        if direction == 0:
            return np.array([0]), np.array([prices[0]]), np.array([0])

        last_pivot_price = prices[pivots_idx[-1]]

        for i in range(1, len(prices)):
            price = prices[i]

            if direction == 1:  # Looking for a peak
                if price > last_pivot_price:
                    # Update the current peak candidate
                    if pivots_type[-1] == 1:
                        pivots_idx[-1] = i
                        last_pivot_price = price
                    else:
                        pivots_idx.append(i)
                        pivots_type.append(1)
                        last_pivot_price = price
                elif (last_pivot_price - price) / last_pivot_price >= threshold:
                    # Reversal detected → confirm the peak, switch to looking for trough
                    direction = -1
                    pivots_idx.append(i)
                    pivots_type.append(-1)
                    last_pivot_price = price
            else:  # direction == -1, looking for a trough
                if price < last_pivot_price:
                    if pivots_type[-1] == -1:
                        pivots_idx[-1] = i
                        last_pivot_price = price
                    else:
                        pivots_idx.append(i)
                        pivots_type.append(-1)
                        last_pivot_price = price
                elif (price - last_pivot_price) / last_pivot_price >= threshold:
                    direction = 1
                    pivots_idx.append(i)
                    pivots_type.append(1)
                    last_pivot_price = price

        return (
            np.array(pivots_idx),
            np.array([prices[i] for i in pivots_idx]),
            np.array(pivots_type),
        )


# ── Confidence Scoring ────────────────────────────────────────

class ConfidenceCalculator:
    """Score patterns based on geometric symmetry and volume confirmation."""

    @staticmethod
    def symmetry_score(left_val: float, right_val: float) -> float:
        """How symmetric are two values? 1.0 = perfect match."""
        if left_val == 0 and right_val == 0:
            return 1.0
        avg = (abs(left_val) + abs(right_val)) / 2
        if avg == 0:
            return 0.0
        diff = abs(left_val - right_val) / avg
        return max(0.0, 1.0 - diff)

    @staticmethod
    def volume_confirmation(
        formation_volume: np.ndarray,
        breakout_volume: float,
    ) -> float:
        """
        Breakout should have higher volume than formation average.
        Returns 0.0–1.0
        """
        if len(formation_volume) == 0:
            return 0.5
        avg_formation = np.mean(formation_volume)
        if avg_formation == 0:
            return 0.5
        ratio = breakout_volume / avg_formation
        # ratio > 1.5 is ideal, < 0.8 is bad
        return min(1.0, max(0.0, (ratio - 0.5) / 1.5))

    @staticmethod
    def roundedness_score(prices: np.ndarray) -> float:
        """
        How 'round' is a curve? V-shapes score low, U-shapes score high.
        Uses the ratio of actual area under the curve vs a V-shape.
        """
        if len(prices) < 5:
            return 0.0

        n = len(prices)
        # Normalize prices: min = 0, max = 1
        pmin, pmax = np.min(prices), np.max(prices)
        if pmax == pmin:
            return 0.5
        normed = (prices - pmin) / (pmax - pmin)

        # Area under the actual curve
        actual_area = np.trapz(normed)

        # Area under a V-shape (straight line from start to min to end)
        min_idx = np.argmin(normed)
        v_shape = np.concatenate([
            np.linspace(normed[0], normed[min_idx], min_idx + 1),
            np.linspace(normed[min_idx], normed[-1], n - min_idx)[1:]
        ])
        v_area = np.trapz(v_shape)

        if v_area == 0:
            return 0.5

        # If actual area > V area → more rounded (U-shape)
        ratio = actual_area / v_area
        # Clamp: ratio near 1.0 = V-shape, ratio > 1.3 = nicely rounded
        return min(1.0, max(0.0, (ratio - 0.9) / 0.5))

    @staticmethod
    def depth_score(cup_depth_pct: float) -> float:
        """
        Ideal cup depth: 12-35%. Too shallow (<7%) or too deep (>50%) = low score.
        """
        if 0.12 <= cup_depth_pct <= 0.35:
            return 1.0
        elif 0.07 <= cup_depth_pct < 0.12:
            return 0.6
        elif 0.35 < cup_depth_pct <= 0.50:
            return 0.6
        elif cup_depth_pct > 0.50:
            return 0.2
        else:
            return 0.3

    @staticmethod
    def combine_scores(scores: Dict[str, float], weights: Dict[str, float]) -> float:
        """Weighted average of multiple scores."""
        total_weight = sum(weights.get(k, 0) for k in scores)
        if total_weight == 0:
            return 0.0
        return sum(scores[k] * weights.get(k, 0) for k in scores) / total_weight


# ── Multi-Timeframe Validation ────────────────────────────────

class MultiTimeframeValidator:
    """
    Validates patterns found in daily timeframe against weekly trends.
    A bullish daily pattern in a weekly downtrend gets confidence penalty.
    """

    @staticmethod
    def resample_to_weekly(df: pd.DataFrame) -> pd.DataFrame:
        """Resample daily OHLCV to weekly."""
        weekly = df.resample("W").agg({
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum",
        }).dropna()
        return weekly

    @staticmethod
    def weekly_trend(weekly_df: pd.DataFrame, lookback: int = 10) -> str:
        """Determine weekly trend: 'bullish', 'bearish', or 'neutral'."""
        if len(weekly_df) < lookback:
            return "neutral"

        closes = weekly_df["Close"].tail(lookback).values
        # Simple linear regression slope
        x = np.arange(len(closes))
        slope = np.polyfit(x, closes, 1)[0]
        # Normalize by average price
        avg_price = np.mean(closes)
        if avg_price == 0:
            return "neutral"
        normalized_slope = slope / avg_price

        if normalized_slope > 0.005:
            return "bullish"
        elif normalized_slope < -0.005:
            return "bearish"
        return "neutral"

    @staticmethod
    def weekly_rsi(weekly_df: pd.DataFrame, period: int = 14) -> Optional[float]:
        """Calculate RSI on weekly closes."""
        if len(weekly_df) < period + 1:
            return None
        closes = weekly_df["Close"]
        delta = closes.diff()
        gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
        if loss.iloc[-1] == 0:
            return 100.0
        rs = gain.iloc[-1] / loss.iloc[-1]
        return 100.0 - (100.0 / (1.0 + rs))

    @classmethod
    def validate(
        cls,
        df_daily: pd.DataFrame,
        pattern_type: PatternType,
        base_confidence: float,
    ) -> float:
        """
        Adjust confidence based on multi-timeframe alignment.
        Bullish pattern + bullish weekly = bonus.
        Bullish pattern + bearish weekly = penalty.
        """
        try:
            context = cls.build_context(df_daily)
            return cls.validate_with_context(context, pattern_type, base_confidence)

        except Exception as e:
            logger.warning(f"Multi-timeframe validation failed: {e}")
            return base_confidence

    @classmethod
    def build_context(cls, df_daily: pd.DataFrame) -> Dict[str, Any]:
        """Precompute weekly trend/RSI once and reuse across validations."""
        weekly = cls.resample_to_weekly(df_daily)
        return {
            "trend": cls.weekly_trend(weekly),
            "rsi": cls.weekly_rsi(weekly),
        }

    @classmethod
    def validate_with_context(
        cls,
        context: Dict[str, Any],
        pattern_type: PatternType,
        base_confidence: float,
    ) -> float:
        """Adjust confidence using precomputed weekly trend/RSI context."""
        try:
            trend = context.get("trend", "neutral")
            rsi = context.get("rsi")

            is_bullish_pattern = pattern_type in [
                PatternType.CUP_AND_HANDLE,
                PatternType.INVERSE_HEAD_AND_SHOULDERS,
                PatternType.DOUBLE_BOTTOM,
                PatternType.ASCENDING_TRIANGLE,
                PatternType.BULL_FLAG,
            ]

            adjustment = 0.0

            if is_bullish_pattern:
                if trend == "bullish":
                    adjustment += 0.10   # Weekly confirms daily
                elif trend == "bearish":
                    adjustment -= 0.15   # Weekly contradicts → penalty

                if rsi is not None:
                    if rsi > 50:
                        adjustment += 0.05
                    elif rsi < 30:
                        adjustment -= 0.10  # Weekly oversold → risky for longs
            else:
                # Bearish patterns
                if trend == "bearish":
                    adjustment += 0.10
                elif trend == "bullish":
                    adjustment -= 0.15

                if rsi is not None:
                    if rsi < 50:
                        adjustment += 0.05
                    elif rsi > 70:
                        adjustment -= 0.10

            return max(0.0, min(1.0, base_confidence + adjustment))

        except Exception as e:
            logger.warning(f"Multi-timeframe validation failed: {e}")
            return base_confidence


# ── Main Pattern Detector ─────────────────────────────────────

class PatternDetector:
    """
    Core engine for detecting chart patterns using ZigZag-filtered
    geometric analysis on OHLCV data.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        zigzag_threshold: float = 0.05,
        model: DetectionModel = DetectionModel.ZIGZAG_BALANCED,
    ):
        """
        Args:
            df: DataFrame with DatetimeIndex and columns:
                Open, High, Low, Close, Volume
            zigzag_threshold: minimum % move for ZigZag (default 5%).
                Overridden when `model` is provided.
            model: DetectionModel controlling the pivot algorithm and
                confidence scaling. When not ZIGZAG_BALANCED the
                zigzag_threshold argument is ignored in favour of the
                model's built-in threshold.
        """
        self.df = df.copy()
        if not isinstance(df.index, pd.DatetimeIndex):
            self.df.index = pd.to_datetime(df.index)

        self.close = self.df["Close"].values.astype(float)
        self.high = self.df["High"].values.astype(float)
        self.low = self.df["Low"].values.astype(float)
        self.volume = self.df["Volume"].values.astype(float)
        self.dates = self.df.index

        # Resolve model parameters
        self.model = model
        threshold, self.confidence_multiplier = _MODEL_PARAMS.get(
            model, (zigzag_threshold, 1.0)
        )
        # Explicit zigzag_threshold arg wins only for the default model
        if model == DetectionModel.ZIGZAG_BALANCED:
            threshold = zigzag_threshold
        self.zigzag_threshold = threshold

        self.confidence_calc = ConfidenceCalculator()
        self.mtf_validator = MultiTimeframeValidator()
        self._mtf_context = self.mtf_validator.build_context(self.df)

        # Pre-compute pivots according to the selected model
        if model == DetectionModel.PEAK_BASED:
            self.zz_idx, self.zz_prices, self.zz_types = self._compute_peak_based_pivots()
        else:
            self.zz_idx, self.zz_prices, self.zz_types = ZigZagFilter.compute(
                self.close, threshold=self.zigzag_threshold
            )

    # ── Peak-based pivot computation (PEAK_BASED model) ──────

    def _compute_peak_based_pivots(
        self,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Use scipy find_peaks directly (with prominence + distance guards)
        rather than ZigZag smoothing.  Fills the same zz_idx / zz_prices /
        zz_types arrays so all downstream pattern detectors work unchanged.
        """
        n = len(self.close)
        if n < 10:
            return np.array([]), np.array([]), np.array([])

        std_val = float(np.std(self.close))
        prominence = max(std_val * 0.25, 0.01)
        min_dist = max(5, n // 40)

        peaks_idx, _  = find_peaks( self.close, distance=min_dist, prominence=prominence)
        troughs_idx, _ = find_peaks(-self.close, distance=min_dist, prominence=prominence)

        if len(peaks_idx) == 0 and len(troughs_idx) == 0:
            return np.array([]), np.array([]), np.array([])

        all_idx   = np.concatenate([peaks_idx, troughs_idx]).astype(int)
        all_types = np.concatenate([
            np.ones(len(peaks_idx), dtype=int),
            -np.ones(len(troughs_idx), dtype=int),
        ])

        sort_order  = np.argsort(all_idx)
        all_idx     = all_idx[sort_order]
        all_types   = all_types[sort_order]
        all_prices  = self.close[all_idx]

        return all_idx, all_prices, all_types

    def _date_str(self, idx: int) -> str:
        """Convert array index to date string."""
        if idx < 0 or idx >= len(self.dates):
            return ""
        return str(self.dates[idx].date())

    def _make_key_point(self, idx: int, label: str) -> dict:
        return {
            "date": self._date_str(idx),
            "price": float(self.close[idx]),
            "index": int(idx),
            "label": label,
        }

    # ── Find Peaks/Troughs (scipy fallback + ZigZag primary) ──

    def find_peaks_troughs(
        self, window: int = 20
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Find peaks and troughs using scipy (used as supplementary
        to ZigZag when ZigZag returns too few points).
        """
        std_val = np.std(self.close)
        prominence = max(std_val * 0.3, 0.01)
        peaks, _ = find_peaks(self.close, distance=window, prominence=prominence)
        troughs, _ = find_peaks(-self.close, distance=window, prominence=prominence)
        return peaks, troughs

    def _get_zigzag_peaks_troughs(
        self,
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> Tuple[List[int], List[int]]:
        """
        Extract peaks and troughs from pre-computed ZigZag within range.
        Returns (peak_indices, trough_indices) in original array space.
        """
        if end_idx is None:
            end_idx = len(self.close) - 1

        mask = (self.zz_idx >= start_idx) & (self.zz_idx <= end_idx)
        filtered_idx = self.zz_idx[mask]
        filtered_types = self.zz_types[mask]

        peaks = filtered_idx[filtered_types == 1].tolist()
        troughs = filtered_idx[filtered_types == -1].tolist()
        return peaks, troughs

    # ── Cup & Handle ──────────────────────────────────────────

    def detect_cup_and_handle(self, lookback: int = 200) -> List[PatternMatch]:
        """
        Detect Cup & Handle pattern.

        Algorithm:
        1. Using ZigZag pivots, find: Peak → Trough → Peak sequence
        2. The two peaks (rims) should be at similar levels (~5% tolerance)
        3. The trough (cup bottom) should be 12-50% below rim level
        4. The cup should be rounded (U-shape, not V-shape)
        5. After the right rim, look for a handle: small pullback (< 50% of cup depth)
           with declining volume
        6. Breakout above rim level confirms the pattern
        """
        results: List[PatternMatch] = []
        data_len = len(self.close)
        start = max(0, data_len - lookback)

        peaks, troughs = self._get_zigzag_peaks_troughs(start)

        if len(peaks) < 2 or len(troughs) < 1:
            return results

        # Try all combinations: left_rim (peak) → bottom (trough) → right_rim (peak)
        for i, left_rim_idx in enumerate(peaks):
            left_rim_price = self.close[left_rim_idx]

            for bottom_idx in troughs:
                if bottom_idx <= left_rim_idx:
                    continue

                bottom_price = self.close[bottom_idx]
                cup_depth_pct = (left_rim_price - bottom_price) / left_rim_price

                # Cup depth must be 7-55%
                if cup_depth_pct < 0.07 or cup_depth_pct > 0.55:
                    continue

                # Look for right rim peak after the bottom
                for right_rim_idx in peaks:
                    if right_rim_idx <= bottom_idx:
                        continue

                    right_rim_price = self.close[right_rim_idx]

                    # Right rim should be within 5% of left rim
                    rim_symmetry = self.confidence_calc.symmetry_score(
                        left_rim_price, right_rim_price
                    )
                    if rim_symmetry < 0.90:
                        continue

                    # Cup duration: at least 20 bars, ideally 30-150
                    cup_duration = right_rim_idx - left_rim_idx
                    if cup_duration < 20:
                        continue

                    # Check roundedness of the cup
                    cup_prices = self.close[left_rim_idx : right_rim_idx + 1]
                    # Invert for roundedness (we want U-shape from bottom)
                    round_score = self.confidence_calc.roundedness_score(cup_prices)

                    # Handle detection: look after right rim
                    handle_end_idx = min(
                        right_rim_idx + max(15, cup_duration // 4),
                        data_len - 1,
                    )
                    handle_prices = self.close[right_rim_idx : handle_end_idx + 1]

                    handle_score = 0.5  # default
                    handle_low_idx = right_rim_idx
                    if len(handle_prices) >= 3:
                        handle_low_local = np.argmin(handle_prices)
                        handle_low_idx = right_rim_idx + handle_low_local
                        handle_low_price = handle_prices[handle_low_local]
                        handle_depth = (right_rim_price - handle_low_price) / right_rim_price

                        # Handle should retrace < 50% of cup depth, ideally < 33%
                        if handle_depth < cup_depth_pct * 0.50:
                            handle_score = 0.8
                            if handle_depth < cup_depth_pct * 0.33:
                                handle_score = 1.0
                        else:
                            handle_score = 0.3

                        # Volume during handle should be lower than cup formation
                        cup_vol = self.volume[left_rim_idx : right_rim_idx + 1]
                        handle_vol = self.volume[right_rim_idx : handle_end_idx + 1]
                        if len(handle_vol) > 0 and np.mean(cup_vol) > 0:
                            vol_ratio = np.mean(handle_vol) / np.mean(cup_vol)
                            if vol_ratio < 0.7:
                                handle_score = min(1.0, handle_score + 0.1)
                            elif vol_ratio > 1.2:
                                handle_score = max(0.0, handle_score - 0.2)

                    # Volume confirmation at breakout area
                    breakout_zone_start = max(0, handle_end_idx - 3)
                    breakout_vol = float(np.mean(self.volume[breakout_zone_start:handle_end_idx + 1]))
                    formation_vol = self.volume[left_rim_idx : right_rim_idx + 1]
                    vol_score = self.confidence_calc.volume_confirmation(formation_vol, breakout_vol)

                    # Depth score
                    depth_sc = self.confidence_calc.depth_score(cup_depth_pct)

                    # Combine scores
                    scores = {
                        "rim_symmetry": rim_symmetry,
                        "roundedness": round_score,
                        "handle": handle_score,
                        "volume": vol_score,
                        "depth": depth_sc,
                    }
                    weights = {
                        "rim_symmetry": 0.20,
                        "roundedness": 0.25,
                        "handle": 0.25,
                        "volume": 0.15,
                        "depth": 0.15,
                    }
                    raw_confidence = self.confidence_calc.combine_scores(scores, weights)

                    # Multi-timeframe validation
                    confidence = self.mtf_validator.validate_with_context(
                        self._mtf_context, PatternType.CUP_AND_HANDLE, raw_confidence
                    )

                    if confidence < 0.40:
                        continue

                    # Target price: rim level + cup depth
                    rim_level = max(left_rim_price, right_rim_price)
                    target = rim_level + (rim_level - bottom_price)

                    results.append(PatternMatch(
                        pattern_type=PatternType.CUP_AND_HANDLE,
                        confidence=round(confidence, 3),
                        start_date=self._date_str(left_rim_idx),
                        end_date=self._date_str(handle_end_idx),
                        start_idx=left_rim_idx,
                        end_idx=handle_end_idx,
                        key_points=[
                            self._make_key_point(left_rim_idx, "Left Rim"),
                            self._make_key_point(bottom_idx, "Cup Bottom"),
                            self._make_key_point(right_rim_idx, "Right Rim"),
                            self._make_key_point(handle_low_idx, "Handle Low"),
                        ],
                        target_price=round(target, 2),
                        description=(
                            f"Cup depth: {cup_depth_pct*100:.1f}%, "
                            f"Duration: {cup_duration} bars, "
                            f"Roundedness: {round_score:.2f}, "
                            f"Handle quality: {handle_score:.2f}"
                        ),
                    ))

        # De-duplicate overlapping patterns, keep highest confidence
        results = self._deduplicate(results)
        return results

    # ── Head & Shoulders ──────────────────────────────────────

    def detect_head_and_shoulders(self, lookback: int = 200) -> List[PatternMatch]:
        """
        Detect Head & Shoulders (bearish) and Inverse H&S (bullish).

        Algorithm:
        1. Find 3 peaks and 2 troughs in between (or inverse)
        2. Middle peak (head) must be the highest
        3. Shoulders should be roughly symmetrical
        4. Neckline: line connecting the two troughs
        5. Volume typically decreases from left shoulder → head → right shoulder
        """
        results: List[PatternMatch] = []
        data_len = len(self.close)
        start = max(0, data_len - lookback)

        peaks, troughs = self._get_zigzag_peaks_troughs(start)

        # Standard H&S (bearish) — 3 peaks, middle highest
        results.extend(self._find_hs_pattern(peaks, troughs, inverse=False))

        # Inverse H&S (bullish) — 3 troughs, middle lowest
        results.extend(self._find_hs_pattern(troughs, peaks, inverse=True))

        results = self._deduplicate(results)
        return results

    def _find_hs_pattern(
        self,
        main_points: List[int],  # peaks for standard, troughs for inverse
        secondary_points: List[int],  # troughs for standard, peaks for inverse
        inverse: bool = False,
    ) -> List[PatternMatch]:
        """Find H&S or Inverse H&S patterns."""
        results: List[PatternMatch] = []

        if len(main_points) < 3 or len(secondary_points) < 2:
            return results

        for i in range(len(main_points) - 2):
            ls_idx = main_points[i]      # left shoulder
            head_idx = main_points[i + 1]  # head
            rs_idx = main_points[i + 2]    # right shoulder

            ls_price = self.close[ls_idx]
            head_price = self.close[head_idx]
            rs_price = self.close[rs_idx]

            # Head must be the most extreme
            if not inverse:
                if not (head_price > ls_price and head_price > rs_price):
                    continue
            else:
                if not (head_price < ls_price and head_price < rs_price):
                    continue

            # Shoulders should be roughly symmetric (within 10%)
            shoulder_sym = self.confidence_calc.symmetry_score(ls_price, rs_price)
            if shoulder_sym < 0.85:
                continue

            # Head should be significantly beyond shoulders
            if not inverse:
                head_prominence = (head_price - max(ls_price, rs_price)) / max(ls_price, rs_price)
            else:
                head_prominence = (min(ls_price, rs_price) - head_price) / min(ls_price, rs_price)

            if head_prominence < 0.03:  # At least 3% beyond
                continue

            # Find neckline troughs between shoulders
            neckline_points = [
                sp for sp in secondary_points
                if ls_idx < sp < head_idx or head_idx < sp < rs_idx
            ]
            if len(neckline_points) < 2:
                continue

            nl_left = neckline_points[0]
            nl_right = neckline_points[-1]
            nl_left_price = self.close[nl_left]
            nl_right_price = self.close[nl_right]

            neckline_sym = self.confidence_calc.symmetry_score(nl_left_price, nl_right_price)

            # Volume analysis: decreasing from LS → Head → RS
            vol_ls = float(np.mean(self.volume[max(0, ls_idx - 5) : ls_idx + 5]))
            vol_head = float(np.mean(self.volume[max(0, head_idx - 5) : head_idx + 5]))
            vol_rs = float(np.mean(self.volume[max(0, rs_idx - 5) : rs_idx + 5]))

            vol_declining = 0.5
            if vol_ls > 0:
                if vol_head < vol_ls and vol_rs < vol_head:
                    vol_declining = 1.0
                elif vol_rs < vol_ls:
                    vol_declining = 0.7

            # Duration check
            total_duration = rs_idx - ls_idx
            if total_duration < 20:
                continue

            # Symmetry of left half vs right half duration
            left_half = head_idx - ls_idx
            right_half = rs_idx - head_idx
            duration_sym = self.confidence_calc.symmetry_score(float(left_half), float(right_half))

            # Combine scores
            scores = {
                "shoulder_symmetry": shoulder_sym,
                "neckline_symmetry": neckline_sym,
                "volume_declining": vol_declining,
                "duration_symmetry": duration_sym,
                "head_prominence": min(1.0, head_prominence / 0.10),
            }
            weights = {
                "shoulder_symmetry": 0.25,
                "neckline_symmetry": 0.15,
                "volume_declining": 0.20,
                "duration_symmetry": 0.15,
                "head_prominence": 0.25,
            }
            raw_conf = self.confidence_calc.combine_scores(scores, weights)

            pattern_type = (
                PatternType.INVERSE_HEAD_AND_SHOULDERS
                if inverse
                else PatternType.HEAD_AND_SHOULDERS
            )
            confidence = self.mtf_validator.validate_with_context(self._mtf_context, pattern_type, raw_conf)

            if confidence < 0.40:
                continue

            # Target: neckline ± head-to-neckline distance
            neckline_avg = (nl_left_price + nl_right_price) / 2
            if not inverse:
                target = neckline_avg - (head_price - neckline_avg)
            else:
                target = neckline_avg + (neckline_avg - head_price)

            results.append(PatternMatch(
                pattern_type=pattern_type,
                confidence=round(confidence, 3),
                start_date=self._date_str(ls_idx),
                end_date=self._date_str(rs_idx),
                start_idx=ls_idx,
                end_idx=rs_idx,
                key_points=[
                    self._make_key_point(ls_idx, "Left Shoulder"),
                    self._make_key_point(nl_left, "Neckline Left"),
                    self._make_key_point(head_idx, "Head"),
                    self._make_key_point(nl_right, "Neckline Right"),
                    self._make_key_point(rs_idx, "Right Shoulder"),
                ],
                target_price=round(target, 2),
                description=(
                    f"Shoulder symmetry: {shoulder_sym:.2f}, "
                    f"Head prominence: {head_prominence*100:.1f}%, "
                    f"Volume declining: {vol_declining:.2f}"
                ),
            ))

        return results

    # ── Double Bottom / Top ───────────────────────────────────

    def detect_double_bottom(self, lookback: int = 150) -> List[PatternMatch]:
        """
        Double Bottom (bullish reversal).
        Two troughs at roughly the same level with a peak between them.
        """
        return self._detect_double_pattern(lookback, is_bottom=True)

    def detect_double_top(self, lookback: int = 150) -> List[PatternMatch]:
        """
        Double Top (bearish reversal).
        Two peaks at roughly the same level with a trough between them.
        """
        return self._detect_double_pattern(lookback, is_bottom=False)

    def _detect_double_pattern(
        self, lookback: int, is_bottom: bool
    ) -> List[PatternMatch]:
        results: List[PatternMatch] = []
        data_len = len(self.close)
        start = max(0, data_len - lookback)

        peaks, troughs = self._get_zigzag_peaks_troughs(start)

        if is_bottom:
            main_points = troughs
            between_points = peaks
            pattern_type = PatternType.DOUBLE_BOTTOM
        else:
            main_points = peaks
            between_points = troughs
            pattern_type = PatternType.DOUBLE_TOP

        if len(main_points) < 2 or len(between_points) < 1:
            return results

        for i in range(len(main_points) - 1):
            first_idx = main_points[i]
            second_idx = main_points[i + 1]

            first_price = self.close[first_idx]
            second_price = self.close[second_idx]

            # Two points should be at similar levels (within 3%)
            sym = self.confidence_calc.symmetry_score(first_price, second_price)
            if sym < 0.93:
                continue

            # Must have a significant peak/trough between them
            between = [
                bp for bp in between_points
                if first_idx < bp < second_idx
            ]
            if not between:
                continue

            between_idx = between[0]
            between_price = self.close[between_idx]

            # The between point must be at least 5% away from the two main points
            if is_bottom:
                prominence = (between_price - max(first_price, second_price)) / max(first_price, second_price)
            else:
                prominence = (min(first_price, second_price) - between_price) / min(first_price, second_price)

            if prominence < 0.05:
                continue

            # Duration check
            duration = second_idx - first_idx
            if duration < 15:
                continue

            # Volume on second touch should be lower than first (divergence)
            vol_first = float(np.mean(self.volume[max(0, first_idx - 3):first_idx + 3]))
            vol_second = float(np.mean(self.volume[max(0, second_idx - 3):second_idx + 3]))
            vol_divergence = 0.5
            if vol_first > 0:
                ratio = vol_second / vol_first
                if ratio < 0.8:
                    vol_divergence = 1.0  # bullish divergence for bottoms
                elif ratio < 1.0:
                    vol_divergence = 0.7

            scores = {
                "level_symmetry": sym,
                "prominence": min(1.0, prominence / 0.10),
                "volume_divergence": vol_divergence,
            }
            weights = {
                "level_symmetry": 0.35,
                "prominence": 0.35,
                "volume_divergence": 0.30,
            }
            raw_conf = self.confidence_calc.combine_scores(scores, weights)
            confidence = self.mtf_validator.validate_with_context(self._mtf_context, pattern_type, raw_conf)

            if confidence < 0.40:
                continue

            # Target
            if is_bottom:
                target = between_price + (between_price - min(first_price, second_price))
            else:
                target = between_price - (max(first_price, second_price) - between_price)

            results.append(PatternMatch(
                pattern_type=pattern_type,
                confidence=round(confidence, 3),
                start_date=self._date_str(first_idx),
                end_date=self._date_str(second_idx),
                start_idx=first_idx,
                end_idx=second_idx,
                key_points=[
                    self._make_key_point(first_idx, "First " + ("Bottom" if is_bottom else "Top")),
                    self._make_key_point(between_idx, "Middle " + ("Peak" if is_bottom else "Trough")),
                    self._make_key_point(second_idx, "Second " + ("Bottom" if is_bottom else "Top")),
                ],
                target_price=round(target, 2),
                description=(
                    f"Level symmetry: {sym:.2f}, "
                    f"Prominence: {prominence*100:.1f}%, "
                    f"Duration: {duration} bars"
                ),
            ))

        results = self._deduplicate(results)
        return results

    # ── Ascending / Descending Triangles ──────────────────────

    def detect_ascending_triangle(self, lookback: int = 120) -> List[PatternMatch]:
        """Horizontal resistance + rising support (higher lows)."""
        return self._detect_triangle(lookback, ascending=True)

    def detect_descending_triangle(self, lookback: int = 120) -> List[PatternMatch]:
        """Horizontal support + falling resistance (lower highs)."""
        return self._detect_triangle(lookback, ascending=False)

    def _detect_triangle(self, lookback: int, ascending: bool) -> List[PatternMatch]:
        results: List[PatternMatch] = []
        data_len = len(self.close)
        start = max(0, data_len - lookback)

        peaks, troughs = self._get_zigzag_peaks_troughs(start)

        if len(peaks) < 2 or len(troughs) < 2:
            return results

        pattern_type = (
            PatternType.ASCENDING_TRIANGLE if ascending
            else PatternType.DESCENDING_TRIANGLE
        )

        if ascending:
            # Check: highs are roughly flat, lows are rising
            peak_prices = [self.close[p] for p in peaks[-4:]]
            trough_prices = [self.close[t] for t in troughs[-4:]]

            if len(peak_prices) < 2 or len(trough_prices) < 2:
                return results

            # Flat resistance: max variation < 3%
            avg_peak = np.mean(peak_prices)
            peak_variation = (max(peak_prices) - min(peak_prices)) / avg_peak if avg_peak > 0 else 1.0
            if peak_variation > 0.03:
                return results

            # Rising support: each trough higher than previous
            rising = all(trough_prices[i] < trough_prices[i + 1] for i in range(len(trough_prices) - 1))
            if not rising:
                return results

            flat_score = max(0.0, 1.0 - peak_variation / 0.03)
            slope_score = 1.0 if rising else 0.0
        else:
            # Check: lows are roughly flat, highs are falling
            peak_prices = [self.close[p] for p in peaks[-4:]]
            trough_prices = [self.close[t] for t in troughs[-4:]]

            if len(peak_prices) < 2 or len(trough_prices) < 2:
                return results

            avg_trough = np.mean(trough_prices)
            trough_variation = (max(trough_prices) - min(trough_prices)) / avg_trough if avg_trough > 0 else 1.0
            if trough_variation > 0.03:
                return results

            falling = all(peak_prices[i] > peak_prices[i + 1] for i in range(len(peak_prices) - 1))
            if not falling:
                return results

            flat_score = max(0.0, 1.0 - trough_variation / 0.03)
            slope_score = 1.0 if falling else 0.0

        # How many touches on the flat side?
        n_touches = len(peak_prices) if ascending else len(trough_prices)
        touch_score = min(1.0, (n_touches - 1) / 3)

        scores = {
            "flat_line": flat_score,
            "slope": slope_score,
            "touches": touch_score,
        }
        weights = {"flat_line": 0.35, "slope": 0.35, "touches": 0.30}
        raw_conf = self.confidence_calc.combine_scores(scores, weights)
        confidence = self.mtf_validator.validate_with_context(self._mtf_context, pattern_type, raw_conf)

        if confidence < 0.40:
            return results

        all_indices = sorted(peaks[-4:] + troughs[-4:])
        start_pt = all_indices[0]
        end_pt = all_indices[-1]

        # Target: height of triangle projected from breakout
        if ascending:
            resistance = np.mean(peak_prices)
            support_start = trough_prices[0]
            target = resistance + (resistance - support_start)
        else:
            support = np.mean(trough_prices)
            resistance_start = peak_prices[0]
            target = support - (resistance_start - support)

        key_pts = []
        for p in peaks[-4:]:
            key_pts.append(self._make_key_point(p, "Resistance"))
        for t in troughs[-4:]:
            key_pts.append(self._make_key_point(t, "Support"))

        results.append(PatternMatch(
            pattern_type=pattern_type,
            confidence=round(confidence, 3),
            start_date=self._date_str(start_pt),
            end_date=self._date_str(end_pt),
            start_idx=start_pt,
            end_idx=end_pt,
            key_points=sorted(key_pts, key=lambda x: x["index"]),
            target_price=round(target, 2),
            description=f"Flat line score: {flat_score:.2f}, Slope: {slope_score:.2f}, {n_touches} touches",
        ))

        return results

    # ── Bull / Bear Flags ─────────────────────────────────────

    def detect_bull_flag(self, lookback: int = 80) -> List[PatternMatch]:
        """Sharp rally (pole) → gentle downward channel (flag) → breakout up."""
        return self._detect_flag(lookback, bullish=True)

    def detect_bear_flag(self, lookback: int = 80) -> List[PatternMatch]:
        """Sharp decline (pole) → gentle upward channel (flag) → breakdown."""
        return self._detect_flag(lookback, bullish=False)

    def _detect_flag(self, lookback: int, bullish: bool) -> List[PatternMatch]:
        results: List[PatternMatch] = []
        data_len = len(self.close)
        start = max(0, data_len - lookback)
        pattern_type = PatternType.BULL_FLAG if bullish else PatternType.BEAR_FLAG

        # Find the "pole": a strong move (>10% in < 20 bars)
        for pole_start in range(start, data_len - 25):
            for pole_len in range(8, min(25, data_len - pole_start)):
                pole_end = pole_start + pole_len
                pole_start_price = self.close[pole_start]
                pole_end_price = self.close[pole_end]

                if pole_start_price == 0:
                    continue

                move_pct = (pole_end_price - pole_start_price) / pole_start_price

                if bullish and move_pct < 0.10:
                    continue
                if not bullish and move_pct > -0.10:
                    continue

                # Flag: gentle counter-trend (should retrace 20-50% of pole)
                flag_end = min(pole_end + max(10, pole_len), data_len - 1)
                if flag_end <= pole_end + 5:
                    continue

                flag_prices = self.close[pole_end:flag_end + 1]
                if len(flag_prices) < 5:
                    continue

                if bullish:
                    flag_low = np.min(flag_prices)
                    retrace = (pole_end_price - flag_low) / (pole_end_price - pole_start_price)
                else:
                    flag_high = np.max(flag_prices)
                    retrace = (flag_high - pole_end_price) / (pole_start_price - pole_end_price)

                if retrace < 0.15 or retrace > 0.55:
                    continue

                # Flag should be relatively tight (low volatility)
                flag_std = np.std(flag_prices) / np.mean(flag_prices)
                pole_prices = self.close[pole_start:pole_end+1]
                pole_std = np.std(pole_prices) / np.mean(pole_prices) if np.mean(pole_prices) > 0 else 1.0

                if flag_std > pole_std * 0.7:
                    continue  # Flag should be calmer than pole

                # Volume should decrease during flag
                pole_vol = np.mean(self.volume[pole_start:pole_end+1])
                flag_vol = np.mean(self.volume[pole_end:flag_end+1])
                vol_score = 0.5
                if pole_vol > 0:
                    vol_ratio = flag_vol / pole_vol
                    vol_score = min(1.0, max(0.0, 1.0 - vol_ratio))

                retrace_score = 1.0 - abs(retrace - 0.33) / 0.33  # 33% retrace is ideal
                retrace_score = max(0.0, retrace_score)

                scores = {
                    "pole_strength": min(1.0, abs(move_pct) / 0.20),
                    "retrace_quality": retrace_score,
                    "volume": vol_score,
                    "flag_tightness": max(0.0, 1.0 - flag_std / 0.05),
                }
                weights = {
                    "pole_strength": 0.30,
                    "retrace_quality": 0.25,
                    "volume": 0.25,
                    "flag_tightness": 0.20,
                }
                raw_conf = self.confidence_calc.combine_scores(scores, weights)
                confidence = self.mtf_validator.validate_with_context(self._mtf_context, pattern_type, raw_conf)

                if confidence < 0.45:
                    continue

                # Target: pole height projected from flag breakout
                pole_height = abs(pole_end_price - pole_start_price)
                if bullish:
                    target = pole_end_price + pole_height
                else:
                    target = pole_end_price - pole_height

                results.append(PatternMatch(
                    pattern_type=pattern_type,
                    confidence=round(confidence, 3),
                    start_date=self._date_str(pole_start),
                    end_date=self._date_str(flag_end),
                    start_idx=pole_start,
                    end_idx=flag_end,
                    key_points=[
                        self._make_key_point(pole_start, "Pole Start"),
                        self._make_key_point(pole_end, "Pole End / Flag Start"),
                        self._make_key_point(flag_end, "Flag End"),
                    ],
                    target_price=round(target, 2),
                    description=(
                        f"Pole move: {move_pct*100:.1f}%, "
                        f"Retrace: {retrace*100:.1f}%, "
                        f"Flag volatility ratio: {flag_std/pole_std:.2f}"
                    ),
                ))

                # Found a flag from this pole, skip to next pole start
                break

        results = self._deduplicate(results)
        return results

    # ── Scan All ──────────────────────────────────────────────

    def _apply_confidence_multiplier(
        self, patterns: List[PatternMatch]
    ) -> List[PatternMatch]:
        """Scale confidence scores according to the active detection model."""
        if self.confidence_multiplier == 1.0:
            return patterns
        for p in patterns:
            p.confidence = min(1.0, max(0.0, p.confidence * self.confidence_multiplier))
        return patterns

    def scan_all_patterns(self) -> List[PatternMatch]:
        """Run all pattern detection algorithms and return sorted results."""
        results: List[PatternMatch] = []

        detectors = [
            self.detect_cup_and_handle,
            self.detect_head_and_shoulders,
            self.detect_double_bottom,
            self.detect_double_top,
            self.detect_ascending_triangle,
            self.detect_descending_triangle,
            self.detect_bull_flag,
            self.detect_bear_flag,
        ]

        for detector in detectors:
            try:
                found = detector()
                results.extend(found)
            except Exception as e:
                logger.error(f"Pattern detection error in {detector.__name__}: {e}")

        results = self._apply_confidence_multiplier(results)
        results.sort(key=lambda x: x.confidence, reverse=True)
        return results

    def scan_specific_patterns(
        self, pattern_types: List[PatternType]
    ) -> List[PatternMatch]:
        """Scan for specific patterns only."""
        detector_map = {
            PatternType.CUP_AND_HANDLE: self.detect_cup_and_handle,
            PatternType.HEAD_AND_SHOULDERS: self.detect_head_and_shoulders,
            PatternType.INVERSE_HEAD_AND_SHOULDERS: self.detect_head_and_shoulders,
            PatternType.DOUBLE_BOTTOM: self.detect_double_bottom,
            PatternType.DOUBLE_TOP: self.detect_double_top,
            PatternType.ASCENDING_TRIANGLE: self.detect_ascending_triangle,
            PatternType.DESCENDING_TRIANGLE: self.detect_descending_triangle,
            PatternType.BULL_FLAG: self.detect_bull_flag,
            PatternType.BEAR_FLAG: self.detect_bear_flag,
        }

        results: List[PatternMatch] = []
        seen_detectors = set()

        for pt in pattern_types:
            detector = detector_map.get(pt)
            if detector and detector.__name__ not in seen_detectors:
                seen_detectors.add(detector.__name__)
                try:
                    found = detector()
                    # Filter to only requested types
                    results.extend([p for p in found if p.pattern_type in pattern_types])
                except Exception as e:
                    logger.error(f"Pattern detection error for {pt}: {e}")

        results = self._apply_confidence_multiplier(results)
        results.sort(key=lambda x: x.confidence, reverse=True)
        return results

    # ── Utility ───────────────────────────────────────────────

    @staticmethod
    def _deduplicate(
        patterns: List[PatternMatch], overlap_pct: float = 0.50
    ) -> List[PatternMatch]:
        """
        Remove overlapping patterns of the same type, keeping highest confidence.
        Two patterns overlap if their index ranges overlap by more than overlap_pct.
        """
        if not patterns:
            return patterns

        # Sort by confidence descending
        patterns.sort(key=lambda x: x.confidence, reverse=True)
        kept: List[PatternMatch] = []

        for p in patterns:
            is_overlap = False
            for k in kept:
                if p.pattern_type != k.pattern_type:
                    continue
                # Calculate overlap
                overlap_start = max(p.start_idx, k.start_idx)
                overlap_end = min(p.end_idx, k.end_idx)
                if overlap_end < overlap_start:
                    continue
                overlap_len = overlap_end - overlap_start
                p_len = p.end_idx - p.start_idx
                if p_len > 0 and overlap_len / p_len > overlap_pct:
                    is_overlap = True
                    break
            if not is_overlap:
                kept.append(p)

        return kept

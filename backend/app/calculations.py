import polars as pl
import numpy as np

from typing import Dict, Optional, Tuple, List, Any
import math

# Rule #1 Constants
MIN_GROWTH_RATE_THRESHOLD = 0.10  # 10%
MAX_ESTIMATED_GROWTH_RATE = 0.24  # 24% Cap for projection
MIN_RATE_OF_RETURN = 0.15         # 15% discount rate
MARGIN_OF_SAFETY_FACTOR = 0.50    # 50% Margin of Safety

from pydantic import BaseModel

class CAGRMetrics(BaseModel):
    cagr_1y: Optional[float] = None
    cagr_3y: Optional[float] = None
    cagr_5y: Optional[float] = None
    cagr_10y: Optional[float] = None
    consistent_growth: bool = False

    # Most recent absolute value of the metric.
    #
    # For ROIC and ROE this is the thing Rule #1 actually tests (the ratio must be
    # >= 10%), yet it used to be computed and thrown away, leaving the API with
    # only the year-over-year *deltas*. The UI therefore displayed "ROIC 0.0%" for
    # a company earning 23% - the delta, not the level. `unit` tells the client how
    # to render it without having to special-case metric names.
    latest_value: Optional[float] = None
    unit: Optional[str] = None  # "ratio" (0.234 = 23.4%) or "absolute"


def calculate_cagr(start_val: float, end_val: float, years: int) -> Optional[float]:
    """
    Calculate Compound Annual Growth Rate.
    Formula: (End / Start)^(1/n) - 1
    """
    if start_val is None or end_val is None or start_val <= 0 or years <= 0:
        return None
    try:
        return (end_val / start_val) ** (1 / years) - 1
    except ZeroDivisionError:
        return None

def analyze_metric_growth(series: pl.Series) -> CAGRMetrics:
    """
    Analyze historical growth for a specific metric (ROIC, EPS, etc.)
    Expects a Polars Series sorted by date (oldest to newest).
    """
    if series.len() < 2:
        return CAGRMetrics(
            cagr_1y=None, 
            cagr_3y=None, 
            cagr_5y=None, 
            cagr_10y=None, 
            consistent_growth=False
        )

    current_val = series[-1]
    
    def get_hist_val(years_back: int) -> Optional[float]:
        idx = series.len() - 1 - years_back
        if idx >= 0:
            return series[idx]
        return None

    val_1y = get_hist_val(1)
    val_3y = get_hist_val(3)
    val_5y = get_hist_val(5)
    val_10y = get_hist_val(10)

    cagr_1y = calculate_cagr(val_1y, current_val, 1)
    cagr_3y = calculate_cagr(val_3y, current_val, 3)
    cagr_5y = calculate_cagr(val_5y, current_val, 5)
    cagr_10y = calculate_cagr(val_10y, current_val, 10)

    # Check consistency: focus on long-term CAGRs (10y/5y).
    # Short-term volatility (1y dips) should not disqualify an otherwise strong company.
    long_term = [c for c in [cagr_10y, cagr_5y] if c is not None]

    if not long_term:
        # No long-term data — fall back to 3y if available
        medium_term = [c for c in [cagr_3y] if c is not None]
        consistent = bool(medium_term) and all(c >= MIN_GROWTH_RATE_THRESHOLD for c in medium_term)
    else:
        # Require the average long-term CAGR to be >= 10%
        avg_long = sum(long_term) / len(long_term)
        consistent = avg_long >= MIN_GROWTH_RATE_THRESHOLD
            
    return CAGRMetrics(
        cagr_1y=cagr_1y, 
        cagr_3y=cagr_3y, 
        cagr_5y=cagr_5y, 
        cagr_10y=cagr_10y, 
        consistent_growth=consistent,
        latest_value=float(current_val) if current_val is not None else None,
        unit="absolute",
    )

def analyze_roic_metric(series: pl.Series) -> CAGRMetrics:
    """
    ROIC/ROE are already ratio values (e.g. 0.15 = 15%).
    Rule #1 requires ROIC >= 10% consistently — we check the absolute level,
    NOT the CAGR of the ratio (which would be near-zero for a stable 15% ROIC).
    """
    if series.len() < 1:
        return CAGRMetrics(consistent_growth=False)

    raw = series.to_list()
    values = [float(v) for v in raw if v is not None and not (isinstance(v, float) and (v != v)) and abs(float(v)) > 0.001]
    if not values:
        return CAGRMetrics(consistent_growth=False)

    # Safely get the last non-null value as current
    last_raw = raw[-1]
    current_val: Optional[float] = float(last_raw) if last_raw is not None else (values[-1] if values else None)
    if current_val is None:
        return CAGRMetrics(consistent_growth=False)

    # Use average of last 3 available years for robustness
    recent = values[-min(3, len(values)):]
    avg_recent = sum(recent) / len(recent)

    # Rule #1: ROIC should be >= 10% (0.10) on average over recent years
    consistent = avg_recent >= MIN_GROWTH_RATE_THRESHOLD  # 0.10

    # Compute year-over-year changes (delta) for the cagr fields — these are
    # meaningful to display even if the threshold logic differs
    def delta(years_back: int) -> Optional[float]:
        if series.len() > years_back:
            prev_raw = raw[-(years_back + 1)]
            if prev_raw is None:
                return None
            return current_val - float(prev_raw)
        return None

    return CAGRMetrics(
        cagr_1y=delta(1),
        cagr_3y=delta(3),
        cagr_5y=delta(5),
        cagr_10y=delta(10),
        consistent_growth=consistent,
        # The level Rule #1 tests, not the delta. `avg_recent` (mean of the last
        # up-to-3 years) is exactly what `consistent` is derived from, so showing
        # it keeps the number and its pass/fail badge consistent.
        latest_value=avg_recent,
        unit="ratio",
    )


def analyze_big_5(df: pl.DataFrame) -> Dict[str, CAGRMetrics]:
    """
    Analyze the "Big 5" metrics from historical data.
    DataFrame must have columns: ['roic', 'equity', 'eps', 'sales', 'fcf']
    and be sorted chronologically.
    """
    metrics = ['roic', 'equity', 'eps', 'sales', 'fcf', 'roe']
    results = {}

    for metric in metrics:
        if metric in df.columns:
            # ROIC and ROE are already ratios (e.g. 0.15 = 15%).
            # Rule #1 checks if the LEVEL is >= 10%, NOT the growth-rate of the ratio.
            # Using analyze_metric_growth on a ratio series produces near-zero CAGR
            # for a stable 15% ROIC, wrongly flagging it as failing.
            if metric in ('roic', 'roe'):
                results[metric] = analyze_roic_metric(df[metric])
            else:
                results[metric] = analyze_metric_growth(df[metric])
        else:
            results[metric] = CAGRMetrics(
                cagr_1y=None,
                cagr_3y=None,
                cagr_5y=None,
                cagr_10y=None,
                consistent_growth=False
            )

    return results

def calculate_payback_time(total_debt: float, fcf_measure: float) -> float:
    """
    Calculate Debt Payback Time (Years).
    Rule: Should be < 3 years.
    Formula: Total Debt / Free Cash Flow
    """
    if fcf_measure <= 0:
        return 999.9  # Indefinite if FCF is negative
    
    return total_debt / fcf_measure


def calculate_sticker_price(
    current_eps: float,
    current_equity: float,
    historic_equity_growth: Optional[float],
    analyst_growth_estimate: Optional[float],
    historic_pe_mean: float,
    eps_growth_estimate: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calculate Rule #1 Sticker Price and Margin of Safety.
    Growth is estimated as the MINIMUM of available positive growth rates (conservative Rule #1).
    Negative growth rates are ignored — they indicate unusual periods and don't produce
    a meaningful sticker price.

    Never invents a 10% default — if no positive growth inputs exist, returns error.
    """

    # 1. Determine Estimated Growth Rate
    # Collect named candidates but only keep POSITIVE ones.
    # Negative equity CAGR (common in buyback-heavy companies) must not zero-out the sticker price.
    named = [
        ("eps_cagr", eps_growth_estimate),
        ("equity_cagr", historic_equity_growth),
        ("analyst", analyst_growth_estimate),
    ]
    growth_candidates = [(name, g) for name, g in named if g is not None and g > 0.01]

    if not growth_candidates:
        return {
            "error": "No positive growth data available",
            "sticker_price": 0.0,
            "mos_price": 0.0,
            "estimated_growth": 0.0,
            "growth_source": None,
            "growth_capped": False,
        }

    # Rule #1: be conservative — use the MINIMUM of available positive estimates
    growth_source, estimated_growth = min(growth_candidates, key=lambda x: x[1])
    growth_capped = estimated_growth > MAX_ESTIMATED_GROWTH_RATE

    # Cap at 24%
    estimated_growth = min(estimated_growth, MAX_ESTIMATED_GROWTH_RATE)

    # 2. Calculate Future EPS (10 years out)
    future_eps = current_eps * ((1 + estimated_growth) ** 10)

    # 3. Calculate Future P/E
    # Rule #1: default P/E is 2 * growth_rate * 100
    default_future_pe = 2 * (estimated_growth * 100)

    # If historic_pe_mean is invalid/zero/negative, rely on default or cap?
    # Usually we take the Minimum of (Default, Historic)
    pe_candidates = [default_future_pe]
    if historic_pe_mean and historic_pe_mean > 0:
        pe_candidates.append(historic_pe_mean)

    future_pe = min(pe_candidates)

    # 4. Calculate Future Stock Price
    future_stock_price = future_eps * future_pe

    # 5. Sticker Price (Discount back to present at 15%)
    # Formula: Sticker Price = Future Price / (1.15^10)
    sticker_price = future_stock_price / ((1 + MIN_RATE_OF_RETURN) ** 10)

    # 6. Margin of Safety
    mos_price = sticker_price * MARGIN_OF_SAFETY_FACTOR

    return {
        "current_eps": round(current_eps, 2),
        "estimated_growth": estimated_growth,
        "growth_source": growth_source,
        "growth_capped": growth_capped,
        "future_eps": round(future_eps, 2),
        "future_pe": round(future_pe, 2),
        "future_price": round(future_stock_price, 2),
        "sticker_price": round(sticker_price, 2),
        "mos_price": round(mos_price, 2),
    }

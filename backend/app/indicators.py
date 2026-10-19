import pandas_ta as ta
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional

def calculate_three_tools(df_history: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculate Rule #1 'Three Tools': MACD, Stochastic, MA.
    DF must be indexed by Date.
    """
    if df_history.empty:
        return {"signal": "Red", "details": "No data"}

    # 1. MACD (8, 17, 9)
    macd = df_history.ta.macd(fast=8, slow=17, signal=9)
    # Check if MACD line > Signal line (Bullish) logic: 
    # macd['MACD_8_17_9'] > macd['MACDs_8_17_9']
    
    # 2. Stochastic (14, 5) -> In Rule #1 usually 14, 3, 3 or similar. 
    # User specified: Settings (14, 5)
    stoch = df_history.ta.stoch(k=14, d=5, smooth_k=3)
    
    # 3. Moving Average (10-day)
    # SMA 10
    sma10 = df_history.ta.sma(length=10)
    
    # Combine signals (logic for "today" / last row)
    last_row = df_history.iloc[-1]
    
    # Need to handle the column names pandas-ta generates
    # MACD cols: MACD_8_17_9, MACDh_8_17_9, MACDs_8_17_9
    # Stoch cols: STOCHk_14_5_3, STOCHd_14_5_3
    
    macd_val = macd.iloc[-1]['MACD_8_17_9']
    macd_sig = macd.iloc[-1]['MACDs_8_17_9']

    stoch_k = stoch.iloc[-1]['STOCHk_14_5_3']
    stoch_d = stoch.iloc[-1]['STOCHd_14_5_3']

    price = last_row['Close']
    sma_val = sma10.iloc[-1]

    # Add SMA 30 for the chart
    sma30 = df_history.ta.sma(length=30)

    # Simple boolean logic
    macd_bullish = macd_val > macd_sig
    stoch_bullish = stoch_k > stoch_d
    ma_bullish = price > sma_val

    all_green = macd_bullish and stoch_bullish and ma_bullish

    # Build chart series (last 90 days)
    tail = 90
    dates = df_history.index[-tail:].strftime('%Y-%m-%d').tolist()
    prices_series = df_history['Close'].iloc[-tail:].round(2).tolist()

    macd_line = macd['MACD_8_17_9'].iloc[-tail:].round(4).tolist()
    macd_signal_line = macd['MACDs_8_17_9'].iloc[-tail:].round(4).tolist()
    macd_hist = macd['MACDh_8_17_9'].iloc[-tail:].round(4).tolist()

    stoch_k_series = stoch['STOCHk_14_5_3'].iloc[-tail:].round(2).tolist()
    stoch_d_series = stoch['STOCHd_14_5_3'].iloc[-tail:].round(2).tolist()

    sma10_series = sma10.iloc[-tail:].round(2).tolist()
    sma30_series = sma30.iloc[-tail:].round(2).tolist() if sma30 is not None else []

    return {
        "signal": "Green" if all_green else "Red",
        "details": {
            "macd_bullish": bool(macd_bullish),
            "stoch_bullish": bool(stoch_bullish),
            "ma_bullish": bool(ma_bullish),
            "current_price": float(price),
            "sma_10": float(sma_val),
            "macd_value": float(macd_val),
            "macd_signal": float(macd_sig),
            "stoch_k": float(stoch_k),
            "stoch_d": float(stoch_d),
        },
        "chart_data": {
            "dates": dates,
            "prices": prices_series,
            "macd_line": macd_line,
            "macd_signal_line": macd_signal_line,
            "macd_histogram": macd_hist,
            "stoch_k": stoch_k_series,
            "stoch_d": stoch_d_series,
            "sma_10": sma10_series,
            "sma_30": sma30_series,
        }
    }


# ── Advanced Scanner Indicators ───────────────────────────────

def calculate_scanner_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculate all indicators needed for scanner filtering.
    Expects a DataFrame with DatetimeIndex and OHLCV columns.
    """
    if df.empty or len(df) < 20:
        return {}

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]
    current_price = float(close.iloc[-1])

    result: Dict[str, Any] = {
        "current_price": current_price,
    }

    # Moving Averages
    try:
        sma_20 = ta.sma(close, length=20)
        sma_50 = ta.sma(close, length=50)
        sma_200 = ta.sma(close, length=200)

        result["sma_20"] = float(sma_20.iloc[-1]) if sma_20 is not None and not sma_20.empty else None
        result["sma_50"] = float(sma_50.iloc[-1]) if sma_50 is not None and not sma_50.empty else None
        result["sma_200"] = float(sma_200.iloc[-1]) if sma_200 is not None and not sma_200.empty else None
        result["above_sma_200"] = current_price > result["sma_200"] if result["sma_200"] else None
    except Exception:
        result["sma_20"] = result["sma_50"] = result["sma_200"] = None
        result["above_sma_200"] = None

    # RSI
    try:
        rsi = ta.rsi(close, length=14)
        result["rsi_14"] = float(rsi.iloc[-1]) if rsi is not None and not rsi.empty else None
    except Exception:
        result["rsi_14"] = None

    # ATR
    try:
        atr = ta.atr(high, low, close, length=14)
        result["atr_14"] = float(atr.iloc[-1]) if atr is not None and not atr.empty else None
    except Exception:
        result["atr_14"] = None

    # Volume Averages
    try:
        result["avg_volume_20"] = float(volume.tail(20).mean())
        result["avg_volume_50"] = float(volume.tail(50).mean())
    except Exception:
        result["avg_volume_20"] = result["avg_volume_50"] = None

    # Golden/Death Cross
    result["golden_cross"] = check_golden_cross(df)
    result["death_cross"] = check_death_cross(df)

    # Beta (requires SPY data — will be calculated separately if needed)
    result["beta"] = None

    # Relative Strength
    result["relative_strength"] = None

    return result


def calculate_beta(
    stock_df: pd.DataFrame,
    benchmark_df: pd.DataFrame,
    period: int = 252,
) -> Optional[float]:
    """
    Calculate Beta relative to a benchmark (e.g. SPY).
    Beta = Cov(stock, benchmark) / Var(benchmark)
    """
    try:
        stock_returns = stock_df["Close"].pct_change().tail(period).dropna()
        bench_returns = benchmark_df["Close"].pct_change().tail(period).dropna()

        # Align by date
        aligned = pd.DataFrame({
            "stock": stock_returns,
            "bench": bench_returns,
        }).dropna()

        if len(aligned) < 30:
            return None

        cov = np.cov(aligned["stock"], aligned["bench"])
        if cov[1, 1] == 0:
            return None

        beta = cov[0, 1] / cov[1, 1]
        return round(float(beta), 3)

    except Exception:
        return None


def calculate_relative_strength(
    stock_df: pd.DataFrame,
    benchmark_df: pd.DataFrame,
    period: int = 252,
) -> Optional[float]:
    """
    Calculate Relative Strength rating (0-99).
    Compares stock performance to benchmark over the period.
    Weighted: 40% last quarter, 20% each prior quarter.
    """
    try:
        if len(stock_df) < period or len(benchmark_df) < period:
            return None

        quarters = [63, 63, 63, 63]  # ~63 trading days per quarter
        weights = [0.40, 0.20, 0.20, 0.20]

        stock_close = stock_df["Close"].tail(period)
        bench_close = benchmark_df["Close"].tail(period)

        weighted_perf = 0.0
        offset = 0

        for q, w in zip(quarters, weights):
            end = len(stock_close) - offset
            start = max(0, end - q)
            offset += q

            if start >= end or start < 0:
                continue

            stock_ret = (stock_close.iloc[end - 1] - stock_close.iloc[start]) / stock_close.iloc[start]
            bench_ret = (bench_close.iloc[end - 1] - bench_close.iloc[start]) / bench_close.iloc[start]

            # Relative performance
            if bench_ret != 0:
                rel = stock_ret / abs(bench_ret)
            else:
                rel = stock_ret

            weighted_perf += rel * w

        # Normalize to 0-99 scale (rough approximation)
        rs_rating = min(99, max(1, int(50 + weighted_perf * 100)))
        return rs_rating

    except Exception:
        return None


def check_golden_cross(df: pd.DataFrame) -> bool:
    """
    Golden Cross: SMA-50 crosses above SMA-200.
    Check if it happened in the last 10 bars.
    """
    try:
        if len(df) < 210:
            return False

        sma50 = ta.sma(df["Close"], length=50)
        sma200 = ta.sma(df["Close"], length=200)

        if sma50 is None or sma200 is None:
            return False

        # Check last 10 bars for crossover
        for i in range(-10, 0):
            try:
                if sma50.iloc[i - 1] < sma200.iloc[i - 1] and sma50.iloc[i] >= sma200.iloc[i]:
                    return True
            except (IndexError, KeyError):
                continue

        return False
    except Exception:
        return False


def check_death_cross(df: pd.DataFrame) -> bool:
    """
    Death Cross: SMA-50 crosses below SMA-200.
    Check if it happened in the last 10 bars.
    """
    try:
        if len(df) < 210:
            return False

        sma50 = ta.sma(df["Close"], length=50)
        sma200 = ta.sma(df["Close"], length=200)

        if sma50 is None or sma200 is None:
            return False

        for i in range(-10, 0):
            try:
                if sma50.iloc[i - 1] > sma200.iloc[i - 1] and sma50.iloc[i] <= sma200.iloc[i]:
                    return True
            except (IndexError, KeyError):
                continue

        return False
    except Exception:
        return False

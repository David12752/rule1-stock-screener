# Split Normalization Algorithm

## Problem

yfinance auto-adjusts **price history** for stock splits, but **fundamental data** (EPS, Equity, Share Count) is returned as-reported. A 4:1 split means pre-split EPS of $12 should be normalized to $3 for comparison with post-split values.

## Data Source

```python
splits = stock.splits  # pandas Series, index=date, values=split_ratio
```

Example for AAPL:
```
2020-08-31    4.0   # 4-for-1 split
2014-06-09    7.0   # 7-for-1 split
```

## Algorithm

Build a cumulative split factor for each financial reporting date:

```python
import pandas as pd

def build_split_factors(splits: pd.Series, financial_dates: list) -> dict:
    """
    For each financial reporting date, compute how many times shares
    have been split AFTER that date (up to today).

    Returns: {date_str: cumulative_factor}

    Example: if a 4:1 split happened on 2020-08-31,
    then a financial report from 2019-09-30 has factor=4.0
    (its EPS needs to be divided by 4 to compare with today).
    """
    if splits is None or splits.empty:
        return {}

    factors = {}
    for fin_date in financial_dates:
        cumulative = 1.0
        for split_date, ratio in splits.items():
            if split_date > fin_date:
                cumulative *= ratio
        factors[str(fin_date)] = cumulative

    return factors
```

## Application

In `process_financial_data`, after computing raw EPS and equity_per_share:

```python
splits = raw_data.get("splits", pd.Series())
if not splits.empty:
    split_factors = build_split_factors(splits, merged['date'].tolist())
    for idx, row in merged.iterrows():
        date_str = str(row['date'])
        factor = split_factors.get(date_str, 1.0)
        if factor > 1.0:
            eps.iloc[idx] = eps.iloc[idx] / factor
            equity_per_share.iloc[idx] = equity_per_share.iloc[idx] / factor
```

## Edge Cases

- **No splits**: `splits` is empty Series. Factor is always 1.0. No adjustment.
- **Reverse splits**: ratio < 1.0 (e.g., 0.1 for 1:10 reverse). Algorithm handles naturally since cumulative multiplication still works.
- **Multiple splits**: Factors compound. If 7:1 in 2014 and 4:1 in 2020, pre-2014 data has factor = 28.0.

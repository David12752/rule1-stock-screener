"""Yahoo Finance ticker normalization helpers."""
from __future__ import annotations

import math
import re
from typing import Any, Optional

_EXCHANGE_PREFIX = re.compile(
    r"^(SEHK|HKEX|HK|LSE|LON|ASX|TSE|TYO|XETRA|GER|EPA|PAR|AMS|SWX|TSX|NYSE|NASDAQ|BME|SIX|TASE|TLV|TA)\s*:\s*",
    re.IGNORECASE,
)
_HK_CODE = re.compile(r"^(\d{1,5})(?:\.HK)?$", re.IGNORECASE)
_HK_SUFFIX = re.compile(r"(\d+)\.HK$", re.IGNORECASE)


def normalize_yahoo_symbol(symbol: str) -> str:
    """
    Normalize exchange-prefixed / dirty symbols to yfinance form.
    Examples: 'SEHK:\\xa05.HK' -> '5.HK', '0700.HK' -> '700.HK'
    """
    if not symbol:
        return ""
    s = str(symbol).replace("\xa0", " ").replace("\u200b", "").strip()
    s = _EXCHANGE_PREFIX.sub("", s).strip().replace(" ", "")
    if not s:
        return ""

    m = _HK_CODE.fullmatch(s)
    if m and (
        ".HK" in str(symbol).upper()
        or "SEHK" in str(symbol).upper()
        or "HKEX" in str(symbol).upper()
    ):
        return f"{int(m.group(1)):04d}.HK"

    m2 = _HK_SUFFIX.search(s)
    if m2:
        return f"{int(m2.group(1)):04d}.HK"

    return s


def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    """Convert to float; return default for None/NaN/Inf/invalid."""
    if value is None:
        return default
    try:
        num = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(num) or math.isinf(num):
        return default
    return num


def last_valid_close(history) -> Optional[float]:
    """Return the last finite Close price from a pandas OHLC history frame."""
    if history is None or getattr(history, "empty", True):
        return None
    if "Close" not in history.columns:
        return None
    series = history["Close"].dropna()
    for val in reversed(series.tolist()):
        num = safe_float(val)
        if num is not None:
            return num
    return None

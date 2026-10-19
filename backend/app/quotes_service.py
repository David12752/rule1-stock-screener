"""
Live market quotes — short-TTL cache, separate from fundamentals.

Rule #1 analysis caches financial statements for hours (they move quarterly).
Prices move continuously. This module is the single source for "what is the
stock trading at *now*", so every API that returns a price can overlay a
fresh quote without re-running Big 5 / sticker math.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from app.core.cache import TTLCache
from app.symbol_utils import normalize_yahoo_symbol, safe_float

logger = logging.getLogger(__name__)

QUOTE_TTL = float(os.getenv("QUOTE_CACHE_TTL", "20"))
QUOTE_FAST_INFO_LIMIT = int(os.getenv("QUOTE_FAST_INFO_LIMIT", "40"))
_BATCH_SIZE = 80

_quote_cache = TTLCache(maxsize=int(os.getenv("QUOTE_CACHE_MAXSIZE", "4000")))


@dataclass
class Quote:
    symbol: str
    price: float
    previous_close: Optional[float] = None
    change_pct: Optional[float] = None
    as_of: str = ""
    source: str = "yahoo"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _change_pct(price: float, previous: Optional[float]) -> Optional[float]:
    if previous is None or previous <= 0 or price <= 0:
        return None
    return round(((price - previous) / previous) * 100, 2)


def _quote(symbol: str, price: float, previous: Optional[float], source: str) -> Optional[Quote]:
    px = safe_float(price)
    if px is None or px <= 0:
        return None
    prev = safe_float(previous)
    return Quote(
        symbol=symbol,
        price=round(px, 4),
        previous_close=round(prev, 4) if prev and prev > 0 else None,
        change_pct=_change_pct(px, prev),
        as_of=_utcnow(),
        source=source,
    )


def _normalize_symbols(symbols: Iterable[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in symbols:
        sym = normalize_yahoo_symbol(str(raw or "").upper()) or str(raw or "").upper().strip()
        if not sym or sym in seen:
            continue
        seen.add(sym)
        out.append(sym)
    return out


def _extract_download_quotes(df: Any, symbols: List[str]) -> Dict[str, Quote]:
    """Parse a yf.download frame into Quote objects."""
    out: Dict[str, Quote] = {}
    if df is None or getattr(df, "empty", True):
        return out

    # Single-ticker download is flat (no MultiIndex columns).
    if len(symbols) == 1:
        sym = symbols[0]
        try:
            close = df["Close"].dropna()
            if len(close) >= 1:
                price = float(close.iloc[-1])
                prev = float(close.iloc[-2]) if len(close) >= 2 else None
                q = _quote(sym, price, prev, "yahoo_download")
                if q:
                    out[sym] = q
        except Exception:
            pass
        return out

    for sym in symbols:
        try:
            close = df[sym]["Close"].dropna()
            if len(close) < 1:
                continue
            price = float(close.iloc[-1])
            prev = float(close.iloc[-2]) if len(close) >= 2 else None
            q = _quote(sym, price, prev, "yahoo_download")
            if q:
                out[sym] = q
        except Exception:
            continue
    return out


def _fetch_download_sync(symbols: List[str]) -> Dict[str, Quote]:
    import yfinance as yf

    if not symbols:
        return {}
    try:
        # 5d gives today (intraday-updating daily bar) + prior closes for % change.
        df = yf.download(
            symbols,
            period="5d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        return _extract_download_quotes(df, symbols)
    except Exception as exc:
        logger.warning(f"[Quotes] download failed for {len(symbols)} symbols: {exc}")
        return {}


def _fetch_fast_info_one(symbol: str) -> Optional[Quote]:
    import yfinance as yf

    try:
        tick = yf.Ticker(symbol)
        info = tick.fast_info
        price = safe_float(getattr(info, "last_price", None))
        if price is None or price <= 0:
            # Fallback attributes some yfinance versions expose
            for attr in ("lastPrice", "regular_market_price", "regularMarketPrice"):
                price = safe_float(getattr(info, attr, None))
                if price and price > 0:
                    break
        prev = safe_float(getattr(info, "previous_close", None))
        if prev is None or prev <= 0:
            prev = safe_float(getattr(info, "previousClose", None))
        return _quote(symbol, price or 0, prev, "yahoo_fast_info")
    except Exception as exc:
        logger.debug(f"[Quotes] fast_info failed for {symbol}: {exc}")
        return None


def _fetch_fast_info_sync(symbols: List[str]) -> Dict[str, Quote]:
    out: Dict[str, Quote] = {}
    for sym in symbols:
        q = _fetch_fast_info_one(sym)
        if q:
            out[sym] = q
    return out


class QuotesService:
    """Fetch and cache near-real-time Yahoo quotes."""

    def __init__(self, ttl: float = QUOTE_TTL):
        self.ttl = ttl

    async def get_quote(self, symbol: str) -> Optional[Quote]:
        quotes = await self.get_quotes([symbol])
        sym = normalize_yahoo_symbol(symbol.upper()) or symbol.upper()
        return quotes.get(sym)

    async def get_quotes(self, symbols: Iterable[str]) -> Dict[str, Quote]:
        syms = _normalize_symbols(symbols)
        if not syms:
            return {}

        result: Dict[str, Quote] = {}
        missing: List[str] = []
        for sym in syms:
            cached = _quote_cache.get(f"q:{sym}")
            if cached is not None:
                result[sym] = cached
            else:
                missing.append(sym)

        if not missing:
            return result

        fetched = await asyncio.to_thread(self._fetch_missing_sync, missing)
        for sym, quote in fetched.items():
            _quote_cache.set(f"q:{sym}", quote, ttl=self.ttl)
            result[sym] = quote
        return result

    def _fetch_missing_sync(self, symbols: List[str]) -> Dict[str, Quote]:
        """
        Small batches: prefer fast_info (true last trade).
        Large batches: yf.download (one HTTP round-trip, daily bar updated live).
        """
        if not symbols:
            return {}

        if len(symbols) <= QUOTE_FAST_INFO_LIMIT:
            out = _fetch_fast_info_sync(symbols)
            still_missing = [s for s in symbols if s not in out]
            if still_missing:
                out.update(_fetch_download_sync(still_missing))
            return out

        out: Dict[str, Quote] = {}
        for i in range(0, len(symbols), _BATCH_SIZE):
            batch = symbols[i : i + _BATCH_SIZE]
            out.update(_fetch_download_sync(batch))
        return out

    @staticmethod
    def apply_to_analysis(record: Dict[str, Any], quote: Optional[Quote]) -> Dict[str, Any]:
        """Overlay a live quote onto a Rule #1 analysis / library row."""
        if not record or not quote or quote.price <= 0:
            return record
        out = dict(record)
        out["price"] = quote.price
        out["previous_close"] = quote.previous_close
        out["price_change_pct"] = quote.change_pct
        out["price_as_of"] = quote.as_of
        out["price_live"] = True

        mos = safe_float(out.get("mos_price")) or 0.0
        if mos > 0:
            undervalued = quote.price < mos
            vd = dict(out.get("verdict_details") or {})
            vd["undervalued"] = undervalued
            out["verdict_details"] = vd
        return out

    @staticmethod
    def apply_to_scanner_row(record: Dict[str, Any], quote: Optional[Quote]) -> Dict[str, Any]:
        if not record or not quote or quote.price <= 0:
            return record
        out = dict(record)
        out["current_price"] = quote.price
        out["previous_close"] = quote.previous_close
        out["price_change_pct"] = quote.change_pct
        out["price_as_of"] = quote.as_of
        out["price_live"] = True
        return out


quotes_service = QuotesService()


def resolve_market_price(info: Optional[dict], history: Any) -> float:
    """
    Prefer live/session quote fields from Yahoo info over the last daily Close.
    Daily history closes lag until the bar is finalized; info fields track the tape.
    """
    info = info or {}
    for key in (
        "regularMarketPrice",
        "currentPrice",
        "postMarketPrice",
        "preMarketPrice",
        "ask",
        "bid",
        "previousClose",
    ):
        px = safe_float(info.get(key))
        if px is not None and px > 0:
            # skip bid/ask that look like placeholders
            if key in ("ask", "bid") and px < 0.01:
                continue
            return float(px)

    from app.symbol_utils import last_valid_close

    close = last_valid_close(history)
    return float(close) if close and close > 0 else 0.0

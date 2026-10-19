import yfinance as yf
import pandas as pd
import asyncio
import logging
from typing import Optional, Dict, Any, List

from app.core.cache import BUNDLE_TTL, bundle_cache
from app.core.rate_limit import yahoo_limiter
from app.data_providers import HybridDataRouter
from app.symbol_utils import normalize_yahoo_symbol
from app.data_quality import assess_data_quality

logger = logging.getLogger(__name__)

# ── Bulk-download batch size ──────────────────────────────────
_BULK_BATCH_SIZE = 100
_INFO_CONCURRENCY = 10


class DataService:
    def __init__(self):
        self.router = HybridDataRouter()

    async def fetch_ticker_data(
        self, ticker: str, depth: str = "deep", *, force: bool = False
    ) -> Dict[str, Any]:
        """Fetch a provider bundle, served from cache when warm.

        A deep bundle costs ~6 Yahoo round-trips (measured 2.7-5.1s), so the
        cache is what makes repeat scans and re-opening a ticker cheap.
        """
        cache_key = f"{ticker.upper()}:{depth}"

        if not force:
            cached = bundle_cache.get(cache_key)
            if cached is not None:
                return cached

        await yahoo_limiter.acquire()
        bundle = await asyncio.to_thread(self._fetch_sync, ticker, depth)

        # Only cache usable bundles; a failed fetch should be retried, not stuck.
        history = bundle.get("history") if isinstance(bundle, dict) else None
        if history is not None and not getattr(history, "empty", True):
            bundle_cache.set(cache_key, bundle, ttl=BUNDLE_TTL)

        return bundle

    async def fetch_bulk_ohlcv(
        self,
        tickers: List[str],
        period: str = "1y",
        on_progress: Optional[Any] = None,
    ) -> Dict[str, pd.DataFrame]:
        results: Dict[str, pd.DataFrame] = {}
        loop = asyncio.get_event_loop()
        tickers = [normalize_yahoo_symbol(t) or t for t in tickers]
        batches = [
            tickers[i: i + _BULK_BATCH_SIZE]
            for i in range(0, len(tickers), _BULK_BATCH_SIZE)
        ]
        total_batches = len(batches)

        async def _fetch_one_batch(batch: List[str], batch_num: int) -> Dict[str, pd.DataFrame]:
            if on_progress:
                on_progress(f"Downloading batch {batch_num}/{total_batches} ({len(batch)} stocks)…")

            def _dl(b=batch):
                return yf.download(
                    b,
                    period=period,
                    group_by="ticker",
                    auto_adjust=True,
                    progress=False,
                    threads=True,
                )

            try:
                raw = await asyncio.wait_for(
                    loop.run_in_executor(None, _dl),
                    timeout=120.0,
                )
            except asyncio.TimeoutError:
                logger.warning(f"[DataService] Batch {batch_num} timed out — skipping")
                return {}
            except Exception as e:
                logger.warning(f"[DataService] Batch {batch_num} error: {e}")
                return {}

            if raw is None or raw.empty:
                return {}

            batch_result: Dict[str, pd.DataFrame] = {}
            for ticker in batch:
                try:
                    ticker_df = raw[ticker].dropna(how="all")
                    if not ticker_df.empty and len(ticker_df) >= 20:
                        batch_result[ticker] = ticker_df
                except (KeyError, Exception):
                    pass
            return batch_result

        for i in range(0, total_batches, 2):
            group = batches[i: i + 2]
            group_tasks = [
                _fetch_one_batch(b, i + j + 1)
                for j, b in enumerate(group)
            ]
            group_results = await asyncio.gather(*group_tasks, return_exceptions=True)
            for gr in group_results:
                if isinstance(gr, dict):
                    results.update(gr)
            if i + 2 < total_batches:
                await asyncio.sleep(0.5)

        logger.info(f"[DataService] Bulk OHLCV: {len(results)}/{len(tickers)} tickers downloaded")
        return results

    async def fetch_info_concurrent(
        self,
        tickers: List[str],
        max_concurrent: int = _INFO_CONCURRENCY,
        mode: str = "full",
    ) -> Dict[str, dict]:
        sem = asyncio.Semaphore(max_concurrent)
        loop = asyncio.get_event_loop()
        tickers = [normalize_yahoo_symbol(t) or t for t in tickers]

        mode_normalized = (mode or "full").lower()
        if mode_normalized not in ("full", "light"):
            mode_normalized = "full"

        def _as_dict(obj: Any) -> Dict[str, Any]:
            if isinstance(obj, dict):
                return obj
            try:
                return dict(obj)
            except Exception:
                return {}

        def _fetch_light(ticker: str) -> Dict[str, Any]:
            stock = yf.Ticker(ticker)
            fi = _as_dict(stock.fast_info)
            market_cap = fi.get("market_cap")
            beta = fi.get("beta")
            if market_cap is None:
                try:
                    market_cap = getattr(stock.fast_info, "market_cap", None)
                except Exception:
                    market_cap = None
            if beta is None:
                try:
                    beta = getattr(stock.fast_info, "beta", None)
                except Exception:
                    beta = None
            payload: Dict[str, Any] = {"marketCap": market_cap, "beta": beta}
            # Light mode still pulls info once for listing age (startup profile) and
            # any missing cap/beta fields. Cached by yfinance within the process.
            try:
                full = stock.info or {}
                if payload["marketCap"] is None:
                    payload["marketCap"] = full.get("marketCap")
                if payload["beta"] is None:
                    payload["beta"] = full.get("beta")
                epoch = full.get("firstTradeDateEpochUtc") or full.get("firstTradeDateEpoch")
                if epoch is not None:
                    payload["firstTradeDateEpochUtc"] = epoch
            except Exception:
                pass
            return payload

        async def _one(ticker: str):
            async with sem:
                try:
                    timeout_s = 20.0 if mode_normalized == "full" else 6.0
                    fetch_fn = (
                        (lambda t=ticker: yf.Ticker(t).info)
                        if mode_normalized == "full"
                        else (lambda t=ticker: _fetch_light(t))
                    )
                    info = await asyncio.wait_for(
                        loop.run_in_executor(None, fetch_fn),
                        timeout=timeout_s,
                    )
                    return ticker, (info or {})
                except (asyncio.TimeoutError, Exception) as e:
                    logger.debug(f"[DataService] info fetch failed for {ticker}: {e}")
                    return ticker, {}

        pairs = await asyncio.gather(*[_one(t) for t in tickers])
        return dict(pairs)

    def _fetch_sync(self, ticker: str, depth: str = "deep") -> Dict[str, Any]:
        return self.router.fetch_ticker_bundle(ticker, depth=depth)

    def validate_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Delegate to shared assess_data_quality (≥20% missing / thin years)."""
        q = assess_data_quality(data)
        if q.get("incomplete"):
            return {
                "valid": False,
                "error": f"Incomplete data: {'; '.join(q.get('issues') or [])}",
                "issues": q.get("issues") or [],
                "data_quality": q,
            }
        return {"valid": True, "data_quality": q}

"""
Scanner Service — R1 Screener
================================
Orchestrates scanning across multiple tickers with filtering,
Rule #1 quality checks, and progress reporting.
"""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum

import pandas as pd
import numpy as np

from app.pattern_detector import PatternDetector, PatternMatch, PatternType, DetectionModel
from app.data_service import DataService
from app.startup_analyzer import (
    PROFILE_ID as STARTUP_PROFILE,
    enrich_scanner_result,
    listing_age_years_from_info,
)

logger = logging.getLogger(__name__)


# ── Filter Models ─────────────────────────────────────────────

@dataclass
class ScannerFilters:
    """Filtering parameters for the scanner."""
    min_market_cap: Optional[float] = None      # e.g. 1e9 = $1B
    max_market_cap: Optional[float] = None
    min_volume: Optional[float] = None           # e.g. 1_000_000
    sector: Optional[str] = None                 # GICS sector name
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_beta: Optional[float] = None
    max_beta: Optional[float] = None
    rsi_range: Optional[str] = None              # "oversold", "neutral", "overbought"
    above_sma_200: Optional[bool] = None
    require_rule1_quality: bool = False           # Rule #1 quality filter
    detection_model: str = "zigzag_balanced"      # DetectionModel identifier
    universe: Optional[str] = None                # e.g. "sp500", "nasdaq100", "sp400", "dowjones"
    profile: Optional[str] = None                 # e.g. "startup_pre_breakout"
    max_listing_age_years: Optional[float] = None

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "ScannerFilters":
        if not d:
            return cls()
        return cls(
            min_market_cap=d.get("min_market_cap"),
            max_market_cap=d.get("max_market_cap"),
            min_volume=d.get("min_volume"),
            sector=d.get("sector"),
            min_price=d.get("min_price"),
            max_price=d.get("max_price"),
            min_beta=d.get("min_beta"),
            max_beta=d.get("max_beta"),
            rsi_range=d.get("rsi_range"),
            above_sma_200=d.get("above_sma_200"),
            require_rule1_quality=d.get("require_rule1_quality", False),
            detection_model=d.get("detection_model", "zigzag_balanced"),
            universe=d.get("universe"),
            profile=d.get("profile"),
            max_listing_age_years=d.get("max_listing_age_years"),
        )


@dataclass
class ScannerResult:
    """Result of scanning a single ticker."""
    symbol: str
    company_name: str
    sector: str
    patterns: List[Dict[str, Any]]
    current_price: float
    market_cap: float
    avg_volume: float
    beta: Optional[float] = None
    rsi: Optional[float] = None
    above_sma_200: bool = False
    rule1_quality: Optional[Dict[str, Any]] = None
    hot_sector: bool = False  # Flagged by intelligence service
    listing_age_years: Optional[float] = None
    startup_score: Optional[int] = None
    breakout_phase: Optional[str] = None
    is_startup_candidate: bool = False
    top_pattern: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# ── Rule #1 Quality Filter ────────────────────────────────────

class Rule1QualityFilter:
    """
    Checks if a stock passes basic Rule #1 quality criteria
    before appearing in the scanner. This ensures we only scan
    technically on "wonderful companies".
    """

    @staticmethod
    def check_quality(info: dict, financials_summary: Optional[dict] = None) -> Dict[str, Any]:
        """
        Returns quality assessment dict:
        {
            "passes": bool,
            "roic_ok": bool,
            "equity_growth_ok": bool,
            "eps_growth_ok": bool,
            "revenue_growth_ok": bool,
            "debt_ok": bool,
            "summary": str
        }
        """
        result = {
            "passes": False,
            "roic_ok": False,
            "equity_growth_ok": False,
            "eps_growth_ok": False,
            "revenue_growth_ok": False,
            "debt_ok": True,
            "summary": "",
        }

        # Basic checks using yfinance info dict
        roe = info.get("returnOnEquity", 0) or 0
        roic = info.get("returnOnAssets", 0) or 0  # Proxy; true ROIC needs calculation
        earnings_growth = info.get("earningsGrowth", 0) or 0
        revenue_growth = info.get("revenueGrowth", 0) or 0
        debt_to_equity = info.get("debtToEquity", 0) or 0

        result["roic_ok"] = roe > 0.10  # ROE > 10%
        result["eps_growth_ok"] = earnings_growth > 0.05
        result["revenue_growth_ok"] = revenue_growth > 0.05
        result["debt_ok"] = debt_to_equity < 200  # D/E < 2.0

        # If we have deeper financials summary from our analysis
        if financials_summary:
            for key in ["roic", "equity", "eps", "sales"]:
                metric = financials_summary.get(key, {})
                if isinstance(metric, dict):
                    cagr_5y = metric.get("cagr_5y")
                    if cagr_5y is not None and cagr_5y >= 0.10:
                        if key == "roic":
                            result["roic_ok"] = True
                        elif key == "equity":
                            result["equity_growth_ok"] = True
                        elif key == "eps":
                            result["eps_growth_ok"] = True
                        elif key == "sales":
                            result["revenue_growth_ok"] = True

        # Pass if at least 3 out of 5 criteria met
        checks = [
            result["roic_ok"],
            result["equity_growth_ok"],
            result["eps_growth_ok"],
            result["revenue_growth_ok"],
            result["debt_ok"],
        ]
        passed_count = sum(checks)
        result["passes"] = passed_count >= 3

        reasons = []
        if result["roic_ok"]:
            reasons.append("Good ROIC/ROE")
        if result["eps_growth_ok"]:
            reasons.append("EPS Growing")
        if result["revenue_growth_ok"]:
            reasons.append("Revenue Growing")
        if result["debt_ok"]:
            reasons.append("Manageable Debt")
        if not reasons:
            reasons.append("No quality signals found")

        result["summary"] = f"{passed_count}/5 criteria met: " + ", ".join(reasons)
        return result


# ── Scanner Service ───────────────────────────────────────────

# ── Scan result cache constants ──────────────────────────────
_CACHE_TTL_SECONDS = 4 * 3600  # 4-hour TTL per ticker result


class ScannerService:
    """Orchestrates scanning across multiple tickers."""

    def __init__(self, data_service: DataService):
        self.data_service = data_service
        self.quality_filter = Rule1QualityFilter()
        # {cache_key: (result_or_None, timestamp)} — persists across scan calls
        self._pattern_cache: Dict[str, tuple] = {}

    async def scan_universe(
        self,
        tickers: List[str],
        patterns: List[str],
        filters: ScannerFilters,
        min_confidence: float = 0.5,
        timeframe: str = "1y",
        on_progress: Optional[Callable] = None,
        detection_model: str = "zigzag_balanced",
        stock_index_map: Optional[Dict[str, Dict]] = None,
        on_result: Optional[Callable] = None,  # called incrementally as results arrive
    ) -> List[ScannerResult]:
        """
        Scan a list of tickers for specified patterns with filters.

        Performance optimisations vs the sequential version:
        - yf.download() bulk OHLCV: 1 HTTP call per 100 tickers
        - Concurrent info fetching with asyncio semaphore
        - Pattern detection runs in thread pool (non-blocking)
        - Sector pre-filter from stock_index (zero network)

        Args:
            tickers:         list of stock symbols
            patterns:        list of pattern type strings
            filters:         ScannerFilters instance
            min_confidence:  minimum confidence threshold (0.0-1.0)
            timeframe:       lookback ("3m", "6m", "1y", "2y")
            on_progress:     callback(ticker, status) for SSE updates
            detection_model: DetectionModel identifier string
            stock_index_map: optional {symbol: {name, sector, ...}} for
                             pre-filtering without network calls
        """
        # ── 1. Resolve pattern types ──────────────────────────
        pattern_types: List[PatternType] = []
        for p in patterns:
            try:
                pattern_types.append(PatternType(p))
            except ValueError:
                logger.warning(f"Unknown pattern type: {p}")
        if not pattern_types:
            pattern_types = list(PatternType)

        lookback_map = {"3m": 65, "6m": 130, "1y": 252, "2y": 504, "5y": 1260, "10y": 2520}
        lookback = lookback_map.get(timeframe, 252)
        # yfinance period strings
        period_map = {"3m": "3mo", "6m": "6mo", "1y": "1y", "2y": "2y", "5y": "5y", "10y": "10y"}
        period = period_map.get(timeframe, "1y")

        try:
            model_enum = DetectionModel(filters.detection_model)
        except ValueError:
            logger.warning(f"[Scanner] Unknown detection_model '{filters.detection_model}', using zigzag_balanced")
            model_enum = DetectionModel.ZIGZAG_BALANCED

        # ── 2. Universe + Sector pre-filter (free — uses stock_index) ────
        if filters.universe and filters.universe.lower() not in ("all", "") and stock_index_map:
            before = len(tickers)
            universe_key = filters.universe.lower()
            tickers = [
                t for t in tickers
                if (
                    stock_index_map.get(t, {}).get("universe", "").lower() == universe_key
                    or universe_key in [u.lower() for u in stock_index_map.get(t, {}).get("universe_extra", [])]
                )
            ]
            logger.info(f"[Scanner] Universe pre-filter '{filters.universe}': {before} → {len(tickers)}")

        if filters.sector and filters.sector.lower() not in ("all", "") and stock_index_map:
            before = len(tickers)
            tickers = [
                t for t in tickers
                if stock_index_map.get(t, {}).get("sector", "").lower()
                == filters.sector.lower()
            ]
            logger.info(f"[Scanner] Sector pre-filter '{filters.sector}': {before} → {len(tickers)}")

        if not tickers:
            return []

        if on_progress:
            on_progress("__status__", f"Bulk downloading {len(tickers)} tickers…")

        # ── 3. Bulk OHLCV download ────────────────────────────
        def _batch_progress(msg: str) -> None:
            if on_progress:
                on_progress("__status__", msg)

        ohlcv_data = await self.data_service.fetch_bulk_ohlcv(
            tickers, period=period, on_progress=_batch_progress
        )
        logger.info(f"[Scanner] OHLCV downloaded: {len(ohlcv_data)}/{len(tickers)}")

        if on_progress:
            on_progress("__status__", f"Downloaded {len(ohlcv_data)} tickers, pre-filtering…")

        # ── 4. OHLCV-based pre-filter ─────────────────────────
        candidates: List[tuple] = []  # (ticker, history_df)
        for ticker, raw_df in ohlcv_data.items():
            history = raw_df.tail(lookback)
            if len(history) < 50:
                continue
            try:
                current_price = float(history["Close"].iloc[-1])
                avg_volume = float(history["Volume"].tail(20).mean())
            except Exception:
                continue

            if filters.min_volume and avg_volume < filters.min_volume:
                continue
            if filters.min_price and current_price < filters.min_price:
                continue
            if filters.max_price and current_price > filters.max_price:
                continue

            candidates.append((ticker, history))

        logger.info(f"[Scanner] After OHLCV pre-filter: {len(candidates)} candidates")

        if not candidates:
            return []

        # ── 5. Concurrent info fetch (only when needed) ───────
        needs_numeric_info = bool(
            filters.min_market_cap
            or filters.max_market_cap
            or filters.min_beta is not None
            or filters.max_beta is not None
            or filters.profile == "startup_pre_breakout"
        )
        needs_full_info = bool(
            filters.require_rule1_quality
            or not stock_index_map
        )
        needs_info = needs_numeric_info or needs_full_info

        candidate_symbols = [t for t, _ in candidates]

        if needs_info:
            if on_progress:
                on_progress("__status__", f"Fetching stock info for {len(candidate_symbols)} candidates…")
            info_mode = "full" if needs_full_info else "light"
            info_data = await self.data_service.fetch_info_concurrent(candidate_symbols, mode=info_mode)
        else:
            info_data = {}

        # ── 6. Pattern detection — parallel, thread pool ──────
        loop = asyncio.get_event_loop()
        # Too many Python worker threads cause GIL contention and make scans
        # look "stuck" under heavy universes; keep a bounded pool.
        n_threads = min(8, max(2, os.cpu_count() or 4))
        cpu_sem = asyncio.Semaphore(n_threads)
        pattern_executor = ThreadPoolExecutor(max_workers=n_threads, thread_name_prefix="pattern")

        async def process_one(ticker: str, history: pd.DataFrame) -> Optional[ScannerResult]:
            async with cpu_sem:
                index_entry = (stock_index_map or {}).get(ticker, {})
                return await loop.run_in_executor(
                    pattern_executor,
                    self._process_ticker_cached,
                    ticker,
                    history,
                    info_data.get(ticker, {}),
                    pattern_types,
                    filters,
                    min_confidence,
                    model_enum,
                    index_entry,
                )

        if on_progress:
            on_progress("__status__", f"Detecting patterns in {len(candidates)} stocks…")

        # Use as_completed so results stream in immediately rather than waiting for all
        results: List[ScannerResult] = []
        tasks = [asyncio.create_task(process_one(t, h)) for t, h in candidates]
        done_count = 0
        total_count = len(tasks)

        try:
            for coro in asyncio.as_completed(tasks):
                try:
                    ticker_result = await coro
                except asyncio.CancelledError:
                    raise
                except Exception as task_exc:
                    done_count += 1
                    logger.error(f"[Scanner] task error: {task_exc}")
                    continue

                done_count += 1

                if ticker_result and ticker_result.patterns:
                    results.append(ticker_result)
                    if on_result:
                        on_result(ticker_result)   # push to caller immediately
                    if on_progress:
                        on_progress(ticker_result.symbol, "complete")
                else:
                    if on_progress and ticker_result:
                        on_progress(ticker_result.symbol, "complete")

                # Status update every 25 tickers
                if done_count % 25 == 0 and on_progress:
                    on_progress("__status__", f"Pattern detection: {done_count}/{total_count} stocks processed…")
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
            pattern_executor.shutdown(wait=False, cancel_futures=True)

        results.sort(
            key=lambda r: (
                r.startup_score
                if r.startup_score is not None
                else max((p["confidence"] for p in r.patterns), default=0)
            ),
            reverse=True,
        )

        logger.info(f"[Scanner] Complete: {len(results)} stocks with patterns found")
        return results

    def _process_ticker_cached(
        self,
        ticker: str,
        history: pd.DataFrame,
        info: dict,
        pattern_types: List[PatternType],
        filters: ScannerFilters,
        min_confidence: float,
        model_enum: "DetectionModel",
        index_entry: dict,
    ) -> Optional[ScannerResult]:
        """
        Synchronous per-ticker processing — runs in thread pool.
        Receives pre-fetched history and info so no IO happens here.
        """
        import time as _time

        # ── Cache lookup ──────────────────────────────────────
        pattern_key = "|".join(sorted(pt.value for pt in pattern_types))
        profile_key = filters.profile or "-"
        cache_key = f"{ticker}:{model_enum.value}:{pattern_key}:{len(history)}:{profile_key}"
        cached = self._pattern_cache.get(cache_key)
        if cached is not None:
            result_cached, ts = cached
            if _time.time() - ts < _CACHE_TTL_SECONDS:
                return result_cached  # may be None (no patterns) — still skip

        try:
            current_price = float(history["Close"].iloc[-1])
            avg_volume = float(history["Volume"].tail(20).mean())
        except Exception:
            return None

        # ── Quick price-action pre-screen ─────────────────────
        # If the stock's entire price range is smaller than the ZigZag
        # threshold, no pivot can be detected → skip expensive ZigZag.
        prescreen_ok = self._quick_prescreen(
            history["Close"].values,
            model_enum,
        )
        if not prescreen_ok:
            self._pattern_cache[cache_key] = (None, _time.time())
            return None

        market_cap = float(info.get("marketCap", 0) or 0)
        sector = info.get("sector") or index_entry.get("sector", "Unknown")
        beta_raw = info.get("beta")
        beta = float(beta_raw) if beta_raw is not None else None
        company_name = (
            info.get("shortName")
            or info.get("longName")
            or index_entry.get("name")
            or ticker
        )

        # Sector filter (if index pre-filter didn't catch it)
        if filters.sector and filters.sector.lower() not in ("all", ""):
            if sector.lower() != filters.sector.lower():
                return None

        # Market cap filter
        if filters.min_market_cap and market_cap > 0 and market_cap < filters.min_market_cap:
            return None
        if filters.max_market_cap and market_cap > 0 and market_cap > filters.max_market_cap:
            return None

        # Beta filter
        if beta is not None:
            if filters.min_beta is not None and beta < filters.min_beta:
                return None
            if filters.max_beta is not None and beta > filters.max_beta:
                return None

        # Rule #1 Quality
        quality_result: Optional[Dict[str, Any]] = None
        if filters.require_rule1_quality:
            quality_result = self.quality_filter.check_quality(info)
            if not quality_result["passes"]:
                return None
        else:
            quality_result = self.quality_filter.check_quality(info)

        # RSI + SMA200
        rsi = self._calc_rsi(history)
        sma_200 = history["Close"].rolling(200).mean().iloc[-1] if len(history) >= 200 else None
        is_above_sma200 = float(current_price) > float(sma_200) if sma_200 is not None else True

        if filters.rsi_range:
            if filters.rsi_range == "oversold" and (rsi is None or rsi > 30):
                return None
            elif filters.rsi_range == "overbought" and (rsi is None or rsi < 70):
                return None
            elif filters.rsi_range == "neutral" and rsi is not None and (rsi < 30 or rsi > 70):
                return None

        if filters.above_sma_200 is not None and filters.above_sma_200 != is_above_sma200:
            return None

        # Pattern detection (CPU work happens here in thread pool)
        detector = PatternDetector(history, model=model_enum)
        if len(pattern_types) == len(list(PatternType)):
            matches = detector.scan_all_patterns()
        else:
            matches = detector.scan_specific_patterns(pattern_types)

        matches = [m for m in matches if m.confidence >= min_confidence]
        if not matches:
            return None

        listing_age = listing_age_years_from_info(info)

        result = ScannerResult(
            symbol=ticker,
            company_name=company_name,
            sector=sector,
            patterns=[m.to_dict() for m in matches],
            current_price=current_price,
            market_cap=market_cap,
            avg_volume=avg_volume,
            beta=beta,
            rsi=round(rsi, 2) if rsi else None,
            above_sma_200=is_above_sma200,
            rule1_quality=quality_result,
            listing_age_years=listing_age,
        )

        if filters.profile == STARTUP_PROFILE:
            enriched = enrich_scanner_result(result.to_dict(), listing_age_years=listing_age)
            if not enriched:
                self._pattern_cache[cache_key] = (None, _time.time())
                return None
            result.patterns = enriched["patterns"]
            result.listing_age_years = enriched.get("listing_age_years")
            result.startup_score = enriched.get("startup_score")
            result.breakout_phase = enriched.get("breakout_phase")
            result.is_startup_candidate = True
            result.top_pattern = enriched.get("top_pattern")

        self._pattern_cache[cache_key] = (result, _time.time())
        return result

    # ── Cache eviction ────────────────────────────────────────

    def evict_cache(self) -> int:
        """Remove expired cache entries. Returns count evicted."""
        import time as _time
        expired = [
            k for k, (_, ts) in self._pattern_cache.items()
            if _time.time() - ts >= _CACHE_TTL_SECONDS
        ]
        for k in expired:
            del self._pattern_cache[k]
        return len(expired)

    # ── Quick pre-screen helper ───────────────────────────────

    @staticmethod
    def _quick_prescreen(
        closes: np.ndarray,
        model: "DetectionModel",
    ) -> bool:
        """
        Fast O(n) gate before the expensive O(n²) ZigZag computation.

        A chart pattern requires at least one round-trip of:
            start → pivot → end
        The minimum price swing for that pivot equals the ZigZag threshold.
        If the stock's ENTIRE price range (max-min)/min is smaller than
        2× the threshold, no ZigZag pivot can exist → skip.

        Also gates on minimum volatility: need at least 3 directional
        segments to form any recognisable pattern.
        """
        if len(closes) < 30:
            return False

        pmin = float(np.min(closes))
        if pmin <= 0:
            return False
        pmax = float(np.max(closes))
        price_range_pct = (pmax - pmin) / pmin

        # ZigZag threshold per model
        threshold_map = {
            "zigzag_balanced": 0.05,
            "zigzag_loose":    0.03,
            "zigzag_strict":   0.08,
            "peak_based":      0.03,
        }
        threshold = threshold_map.get(model.value, 0.05)

        # Need room for at least 2 full swings (e.g. trough→peak→trough)
        if price_range_pct < threshold * 2:
            return False

        # Minimum directional segments: count crossings of the midpoint
        midpoint = (pmax + pmin) / 2
        above = closes > midpoint
        crossings = int(np.sum(np.diff(above.astype(int)) != 0))
        if crossings < 3:
            return False

        return True

    async def _scan_single_ticker(
        self,
        ticker: str,
        pattern_types: List[PatternType],
        filters: ScannerFilters,
        min_confidence: float,
        lookback: int,
        detection_model: str = "zigzag_balanced",
    ) -> Optional[ScannerResult]:
        """Scan a single ticker and return result if patterns found."""

        # Fetch data
        raw_data = await self.data_service.fetch_ticker_data(ticker)
        history: pd.DataFrame = raw_data.get("history", pd.DataFrame())
        info: dict = raw_data.get("info", {})

        if history.empty or len(history) < 50:
            return None

        # ── Pre-filter: skip stocks that don't match filters ──
        current_price = float(history["Close"].iloc[-1])
        market_cap = float(info.get("marketCap", 0) or 0)
        avg_volume = float(history["Volume"].tail(20).mean())
        sector = str(info.get("sector", "Unknown"))
        beta = info.get("beta")
        company_name = info.get("shortName") or info.get("longName") or ticker

        if not self._passes_pre_filters(filters, current_price, market_cap, avg_volume, sector, beta):
            return None

        # ── Rule #1 Quality Check ──
        quality_result = None
        if filters.require_rule1_quality:
            quality_result = self.quality_filter.check_quality(info)
            if not quality_result["passes"]:
                return None
        else:
            quality_result = self.quality_filter.check_quality(info)

        # ── Calculate RSI / SMA200 for filtering ──
        rsi = self._calc_rsi(history)
        sma_200 = history["Close"].rolling(200).mean().iloc[-1] if len(history) >= 200 else None
        is_above_sma200 = current_price > sma_200 if sma_200 is not None else True

        # Apply RSI filter
        if filters.rsi_range:
            if filters.rsi_range == "oversold" and (rsi is None or rsi > 30):
                return None
            elif filters.rsi_range == "overbought" and (rsi is None or rsi < 70):
                return None
            elif filters.rsi_range == "neutral" and rsi is not None and (rsi < 30 or rsi > 70):
                return None

        if filters.above_sma_200 is not None and filters.above_sma_200 != is_above_sma200:
            return None

        # ── Pattern Detection ──
        try:
            model_enum = DetectionModel(detection_model)
        except ValueError:
            logger.warning(f"[Scanner] Unknown detection_model '{detection_model}', using zigzag_balanced")
            model_enum = DetectionModel.ZIGZAG_BALANCED
        detector = PatternDetector(history, model=model_enum)

        if len(pattern_types) == len(PatternType):
            matches = detector.scan_all_patterns()
        else:
            matches = detector.scan_specific_patterns(pattern_types)

        # Filter by confidence
        matches = [m for m in matches if m.confidence >= min_confidence]

        if not matches:
            return None

        return ScannerResult(
            symbol=ticker,
            company_name=company_name,
            sector=sector,
            patterns=[m.to_dict() for m in matches],
            current_price=current_price,
            market_cap=market_cap,
            avg_volume=avg_volume,
            beta=float(beta) if beta else None,
            rsi=round(rsi, 2) if rsi else None,
            above_sma_200=is_above_sma200,
            rule1_quality=quality_result,
            listing_age_years=listing_age_years_from_info(info),
        )

    def _passes_pre_filters(
        self,
        filters: ScannerFilters,
        price: float,
        market_cap: float,
        avg_volume: float,
        sector: str,
        beta: Optional[float],
    ) -> bool:
        """Quick pre-filter to avoid unnecessary processing."""
        if filters.min_market_cap and market_cap < filters.min_market_cap:
            return False
        if filters.max_market_cap and market_cap > filters.max_market_cap:
            return False
        if filters.min_volume and avg_volume < filters.min_volume:
            return False
        if filters.sector and filters.sector.lower() != "all" and sector.lower() != filters.sector.lower():
            return False
        if filters.min_price and price < filters.min_price:
            return False
        if filters.max_price and price > filters.max_price:
            return False
        if beta is not None:
            if filters.min_beta is not None and beta < filters.min_beta:
                return False
            if filters.max_beta is not None and beta > filters.max_beta:
                return False
        return True

    @staticmethod
    def _calc_rsi(df: pd.DataFrame, period: int = 14) -> Optional[float]:
        """Calculate RSI-14 on close prices."""
        if len(df) < period + 1:
            return None
        closes = df["Close"]
        delta = closes.diff()
        gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
        last_loss = loss.iloc[-1]
        if last_loss == 0:
            return 100.0
        rs = gain.iloc[-1] / last_loss
        return float(100.0 - (100.0 / (1.0 + rs)))

    async def scan_single_stock_patterns(
        self,
        ticker: str,
        timeframe: str = "1y",
    ) -> Dict[str, Any]:
        """
        Get all patterns for a single stock (for the stock detail page).
        Returns full pattern data including OHLC for charting.
        """
        raw_data = await self.data_service.fetch_ticker_data(ticker)
        history: pd.DataFrame = raw_data.get("history", pd.DataFrame())
        info: dict = raw_data.get("info", {})

        if history.empty or len(history) < 50:
            return {"symbol": ticker, "patterns": [], "ohlc": []}

        lookback_map = {"3m": 65, "6m": 130, "1y": 252, "2y": 504}
        lookback = lookback_map.get(timeframe, 252)

        # Limit data to timeframe
        history = history.tail(lookback)

        detector = PatternDetector(history, model=DetectionModel.ZIGZAG_BALANCED)
        matches = detector.scan_all_patterns()

        # Prepare OHLC data for frontend charting
        ohlc = []
        for idx, row in history.iterrows():
            ohlc.append({
                "time": str(idx.date()) if hasattr(idx, "date") else str(idx),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        return {
            "symbol": ticker,
            "company_name": info.get("shortName") or ticker,
            "patterns": [m.to_dict() for m in matches],
            "ohlc": ohlc,
        }

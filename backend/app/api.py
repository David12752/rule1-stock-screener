from fastapi import FastAPI, BackgroundTasks, HTTPException, Request, Query, Body

from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import os
import json
import datetime
import logging
import traceback
import time
import pandas as pd
import polars as pl
import math
from functools import partial
from pathlib import Path
from dotenv import load_dotenv
from app.ssl_fix import fix_ssl_paths

# Apply SSL path fix immediately
fix_ssl_paths()

load_dotenv()

from app.calculations import analyze_big_5, calculate_sticker_price
from app.core.cache import bundle_cache
from app.services.scan_orchestrator import SCAN_CONCURRENCY, run_bounded
from app.data_service import DataService
from app.ai_analyzer import AIAnalyzer
from app.indicators import calculate_three_tools
from app.cache_service import CacheService
from app.scanner_service import ScannerService, ScannerFilters
from app.intelligence_service import IntelligenceService
from app.symbol_utils import normalize_yahoo_symbol, safe_float
from app.quotes_service import quotes_service, resolve_market_price
from app.database import create_db_and_tables
from app.persistence import (
    upsert_analysis,
    archive_scan,
    list_archives,
    get_archive,
)
from app.reports import stocks_to_csv, stocks_to_html
from app.data_quality import assess_data_quality, apply_split_adjustment
from app.performance import build_performance_summary

from app.pattern_detector import PatternType
from app.scheduler import start_scheduler, stop_scheduler, get_next_run_info

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Rule #1 Stock Screener")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
data_service = DataService()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ai_analyzer = AIAnalyzer(GEMINI_API_KEY)
cache_service = CacheService()
scanner_service = ScannerService(data_service)
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
intelligence_service = IntelligenceService(NEWS_API_KEY)

# Models
class ScanRequest(BaseModel):
    tickers: List[str]

class ScannerRequest(BaseModel):
    """Request body for pattern scanning."""
    patterns: List[str] = ["cup_and_handle"]
    tickers: Optional[List[str]] = None
    filters: Optional[dict] = None
    min_confidence: float = 0.5
    timeframe: str = "1y"
    require_rule1_quality: bool = False
    detection_model: str = "zigzag_balanced"   # DetectionModel identifier
    universe: Optional[str] = None            # e.g. "sp500", "nasdaq100", "sp400", "dowjones"
    profile: Optional[str] = None             # e.g. "startup_pre_breakout"


class LibraryScanRequest(BaseModel):
    """Optional universe-scoped Rule #1 library scan."""
    universe: Optional[str] = None  # e.g. "sp500", "nikkei225", "all"
    tickers: Optional[List[str]] = None
    max_tickers: Optional[int] = None  # safety cap for interactive scans

# ── In-memory stores ──────────────────────────────────────────
scan_progress: Dict[str, str] = {}      # ticker -> status string
scan_results: Dict[str, Dict] = {}      # ticker -> full analysis result

# ── Stock index for search ────────────────────────────────────
stock_index: List[Dict[str, str]] = []

# ── Library store ─────────────────────────────────────────────
library_results: Dict[str, Dict] = {}   # ticker -> analysis result
library_progress: Dict[str, str] = {}   # ticker -> status
library_scanning: bool = False
_library_saved_at: Optional[float] = None  # unix ts of last library persist

# ── Scanner store ─────────────────────────────────────────────
scanner_progress: Dict[str, str] = {}   # ticker -> status
scanner_results: List[Dict] = []        # list of ScannerResult dicts
scanner_running: bool = False
scanner_last_meta: Dict = {}            # metadata from last/current scan

_SCANNER_PERSIST_PATH = Path(__file__).resolve().parent.parent / ".tmp" / "scanner_results.json"
_LIBRARY_PERSIST_PATH = Path(__file__).resolve().parent.parent / ".tmp" / "library_results.json"

_DEFAULT_AUTO_PATTERNS = [
    "cup_and_handle",
    "inverse_head_and_shoulders",
    "double_bottom",
    "ascending_triangle",
    "bull_flag",
    "head_and_shoulders",
    "double_top",
    "descending_triangle",
    "bear_flag",
]


def _env_truthy(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class _SafeEncoder(json.JSONEncoder):
    """JSON encoder that converts numpy scalars, NaN/Inf, and other non-serializable types."""
    def default(self, obj):
        try:
            import numpy as np
            if isinstance(obj, (np.integer,)): return int(obj)
            if isinstance(obj, (np.floating,)): return None if (obj != obj or obj == float('inf') or obj == float('-inf')) else float(obj)
            if isinstance(obj, np.ndarray): return obj.tolist()
        except ImportError:
            pass
        if isinstance(obj, float) and (obj != obj or obj == float('inf') or obj == float('-inf')):
            return None
        return super().default(obj)


def _json_safe(obj: Any) -> Any:
    """Recursively replace NaN/Inf so FastAPI's default json.dumps won't 500."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, tuple):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    try:
        import numpy as np
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            return None if (math.isnan(val) or math.isinf(val)) else val
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, np.ndarray):
            return _json_safe(obj.tolist())
    except ImportError:
        pass
    return obj


def _save_library_results() -> None:
    """Persist current library_results to disk so they survive backend restarts.

    Writes to a sibling temp file and renames into place. A previous crash mid-
    `json.dump` left a truncated library_results.json that could not be loaded,
    wiping the entire library on the next start.
    """
    global _library_saved_at
    try:
        _LIBRARY_PERSIST_PATH.parent.mkdir(parents=True, exist_ok=True)
        snapshot = dict(library_results)
        _library_saved_at = time.time()
        payload = {"results": snapshot, "timestamp": _library_saved_at}
        tmp_path = _LIBRARY_PERSIST_PATH.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, cls=_SafeEncoder)
        tmp_path.replace(_LIBRARY_PERSIST_PATH)
        logger.info(f"[Library] Saved {len(snapshot)} results to disk.")
    except Exception as exc:
        logger.warning(f"[Library] Could not save results to disk: {exc}")


def _load_library_results() -> None:
    """Restore library_results from disk on startup."""
    global _library_saved_at
    if not _LIBRARY_PERSIST_PATH.exists():
        return
    try:
        with open(_LIBRARY_PERSIST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        results = data.get("results", {})
        library_results.clear()
        library_results.update(results)
        ts = data.get("timestamp")
        _library_saved_at = float(ts) if ts is not None else None
        logger.info(f"[Library] Restored {len(library_results)} results from disk")
    except Exception as exc:
        logger.warning(f"[Library] Could not load results from disk: {exc}")


def _save_scanner_results() -> None:
    """Persist current scanner results + metadata to disk."""
    try:
        _SCANNER_PERSIST_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_SCANNER_PERSIST_PATH, "w", encoding="utf-8") as f:
            json.dump({"results": scanner_results, "meta": scanner_last_meta}, f, cls=_SafeEncoder)
    except Exception as exc:
        logger.warning(f"[Scanner] Could not save results to disk: {exc}")


def _load_scanner_results() -> None:
    """Restore scanner results + metadata from disk (called on startup)."""
    global scanner_results
    if not _SCANNER_PERSIST_PATH.exists():
        return
    try:
        with open(_SCANNER_PERSIST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        scanner_results.clear()
        scanner_results.extend(data.get("results", []))
        scanner_last_meta.update(data.get("meta", {}))
        logger.info(f"[Scanner] Restored {len(scanner_results)} results from disk")
    except Exception as exc:
        logger.warning(f"[Scanner] Could not load results from disk: {exc}")


def _load_stock_index() -> List[Dict[str, str]]:
    """Load stock index from disk and normalize Yahoo tickers (e.g. Hang Seng)."""
    index_path = Path(__file__).resolve().parent.parent / ".tmp" / "stock_index.json"
    if not index_path.exists():
        logger.warning(f"Stock index not found at {index_path}")
        return []
    with open(index_path, "r", encoding="utf-8") as f:
        items = json.load(f)
    fixed = 0
    for item in items:
        old = item.get("symbol", "")
        new = normalize_yahoo_symbol(old)
        if new and new != old:
            item["symbol"] = new
            fixed += 1
    if fixed:
        logger.info(f"Normalized {fixed} stock-index symbols at load time")
        try:
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2, ensure_ascii=False)
        except Exception as exc:
            logger.warning(f"Could not persist normalized stock index: {exc}")
    return items


def _scanner_saved_age_hours() -> Optional[float]:
    """Age of last pattern scan from meta timestamp, or None if unknown."""
    raw = scanner_last_meta.get("timestamp") or scanner_last_meta.get("scan_time")
    if not raw:
        return None
    try:
        if isinstance(raw, (int, float)):
            ts = float(raw)
        else:
            ts = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        return max(0.0, (time.time() - ts) / 3600.0)
    except Exception:
        return None


def _library_saved_age_hours() -> Optional[float]:
    if _library_saved_at is None:
        return None
    return max(0.0, (time.time() - _library_saved_at) / 3600.0)


def _auto_scan_needed(stale_hours: float) -> bool:
    """True when caches are empty, incomplete, or older than the freshness window."""
    expected = max(1, len(stock_index))
    coverage = len(library_results) / expected
    # Incomplete universe coverage must keep scanning (e.g. TA125/Nikkei missing).
    if coverage < 0.85:
        return True
    if not library_results or not scanner_results:
        return True
    lib_age = _library_saved_age_hours()
    scan_age = _scanner_saved_age_hours()
    if lib_age is None or scan_age is None:
        return True
    return lib_age >= stale_hours or scan_age >= stale_hours


def _index_entry_map() -> Dict[str, Dict[str, Any]]:
    return {
        str(s.get("symbol", "")).upper(): s
        for s in stock_index
        if s.get("symbol")
    }


def _pending_library_stub(symbol: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Placeholder row so a selected universe shows every member before analysis finishes."""
    meta = meta or {}
    name = meta.get("name") or meta.get("company_name") or symbol
    return {
        "symbol": symbol,
        "company_name": name,
        "short_name": name,
        "price": 0.0,
        "sticker_price": 0.0,
        "mos_price": 0.0,
        "verdict": "PENDING",
        "verdict_reason": "ממתין לסריקה אוטומטית",
        "sector": meta.get("sector") or "",
        "industry": meta.get("sub_industry") or meta.get("industry") or "",
        "market_data": {
            "sector": meta.get("sector") or "",
            "market_cap": None,
        },
        "analysis_pending": True,
        "price_live": False,
        "data_source": "yahoo_finance",
    }


def _library_row_for_symbol(
    symbol: str,
    index_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    sym = symbol.upper()
    analyzed = library_results.get(sym) or library_results.get(symbol)
    if isinstance(analyzed, dict):
        row = dict(analyzed)
        row["analysis_pending"] = False
        return row
    return _pending_library_stub(sym, index_map.get(sym))


def _missing_library_tickers(universe: Optional[str] = None) -> List[str]:
    tickers = _symbols_for_universe(universe)
    have = {str(k).upper() for k in library_results.keys()}
    return [t for t in tickers if str(t).upper() not in have]


def _begin_library_scan(tickers: List[str], universe: str = "all") -> Dict[str, Any]:
    """Start a Rule #1 library scan in-process (no HTTP client needed)."""
    global library_scanning
    if library_scanning:
        return {"started": False, "reason": "already_running", "total": 0}
    if not tickers:
        return {"started": False, "reason": "no_tickers", "total": 0}
    library_scanning = True
    library_progress.clear()
    asyncio.create_task(_run_library_scan(tickers, universe))
    return {"started": True, "reason": "ok", "total": len(tickers), "universe": universe}


def _begin_pattern_scan(
    tickers: List[str],
    patterns: Optional[List[str]] = None,
    *,
    universe: Optional[str] = None,
    min_confidence: float = 0.55,
    timeframe: str = "1y",
    detection_model: str = "zigzag_balanced",
    require_rule1_quality: bool = False,
    filters: Optional[dict] = None,
    profile: Optional[str] = None,
    source: str = "auto",
) -> Dict[str, Any]:
    """Start a pattern scan in-process (shared by HTTP + auto scheduler)."""
    global scanner_running
    if scanner_running:
        return {"started": False, "reason": "already_running", "total": 0}
    if not tickers:
        return {"started": False, "reason": "no_tickers", "total": 0}

    patterns = list(patterns or _DEFAULT_AUTO_PATTERNS)
    filters_dict = dict(filters or {})
    if profile == "startup_pre_breakout":
        from app.startup_analyzer import apply_profile_defaults
        patterns, filters_dict = apply_profile_defaults(patterns, filters_dict)

    scanner_running = True
    scanner_progress.clear()
    scanner_results.clear()
    scanner_last_meta.clear()
    scanner_last_meta.update({
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "patterns": patterns,
        "universe": universe or "all",
        "timeframe": timeframe,
        "total_tickers": len(tickers),
        "profile": profile,
        "source": source,
        "data_source": "yahoo_finance",
        "live_quotes": True,
    })

    if require_rule1_quality:
        filters_dict["require_rule1_quality"] = True
    filters_dict["detection_model"] = detection_model
    scan_filters = ScannerFilters.from_dict(filters_dict)

    asyncio.create_task(
        _run_scanner(tickers, patterns, scan_filters, min_confidence, timeframe)
    )
    return {
        "started": True,
        "reason": "ok",
        "total": len(tickers),
        "patterns": patterns,
        "universe": universe or "all",
        "source": source,
    }


def _prioritized_tickers(universe: str = "all") -> List[str]:
    """
    Order tickers so liquid US majors fill the UI first (real Yahoo data, fast feedback),
    then the rest of the selected universe.
    """
    priority_raw = os.getenv(
        "AUTO_SCAN_PRIORITY",
        "sp500,nasdaq100,dowjones,sp400,sp600",
    )
    priority = [p.strip().lower() for p in priority_raw.split(",") if p.strip()]

    base = _symbols_for_universe(universe if universe != "all" else "all")
    if not base:
        base = [s["symbol"] for s in stock_index if s.get("symbol")]

    seen: set[str] = set()
    ordered: List[str] = []
    for uni in priority:
        for sym in _symbols_for_universe(uni):
            if sym in seen:
                continue
            if universe not in ("all", "", "*") and sym not in base:
                continue
            if universe in ("all", "", "*") or sym in base:
                ordered.append(sym)
                seen.add(sym)
    for sym in base:
        if sym not in seen:
            ordered.append(sym)
            seen.add(sym)
    return ordered


async def kickoff_automatic_scans(*, source: str = "startup", force: bool = False) -> Dict[str, Any]:
    """
    Start library + pattern scans without a manual UI/API click.

    Uses real Yahoo Finance market data (no mocks). Tickers are prioritized so
    S&P 500 / majors appear first while the full universe continues in the background.

    On startup, skips when recent results already exist (AUTO_SCAN_STALE_HOURS).
    Nightly jobs pass force=True to always refresh.
    """
    stale_hours = float(os.getenv("AUTO_SCAN_STALE_HOURS", "12"))
    if not force and not _auto_scan_needed(stale_hours):
        logger.info(
            f"[AutoScan] Skipping ({source}) — results fresher than {stale_hours}h "
            f"(library={len(library_results)}, patterns={len(scanner_results)})"
        )
        return {"skipped": True, "reason": "fresh", "source": source}

    universe = (os.getenv("AUTO_SCAN_UNIVERSE", "all") or "all").strip().lower()
    all_tickers = _prioritized_tickers(universe)
    missing = _missing_library_tickers(universe)
    missing_set = {str(t).upper() for t in missing}
    # Catch up incomplete universes first (TA125/Nikkei/etc.), still priority-ordered.
    library_tickers = (
        [t for t in all_tickers if str(t).upper() in missing_set] if missing_set else all_tickers
    )
    if not library_tickers:
        library_tickers = all_tickers

    fast_universe = (os.getenv("AUTO_SCAN_FAST_UNIVERSE", "sp500") or "sp500").strip().lower()
    fast_tickers = _symbols_for_universe(fast_universe) if fast_universe not in ("", "all") else library_tickers[:500]
    if not fast_tickers:
        fast_tickers = library_tickers[: min(500, len(library_tickers))]

    logger.info(
        f"[AutoScan] Starting ({source}) — universe={universe}, "
        f"tickers={len(library_tickers)}, missing={len(missing)}, fast={len(fast_tickers)}, "
        f"data_source=yahoo_finance"
    )

    # Pattern scan first (bulk OHLCV is the fast path for real prices).
    patterns = _begin_pattern_scan(
        all_tickers,
        _DEFAULT_AUTO_PATTERNS,
        universe=None if universe in ("all", "") else universe,
        source=source,
    )
    # Library fundamentals from Yahoo — missing members first so every selected
    # universe fills instead of stalling on already-analyzed US names.
    library = _begin_library_scan(
        library_tickers,
        universe if universe != "all" else "all",
    )

    scanner_last_meta["data_source"] = "yahoo_finance"
    scanner_last_meta["live_quotes"] = True
    scanner_last_meta["auto"] = True

    return {
        "skipped": False,
        "source": source,
        "data_source": "yahoo_finance",
        "tickers": len(library_tickers),
        "fast_tickers": len(fast_tickers),
        "library": library,
        "patterns": patterns,
    }


async def _deferred_auto_scan_on_startup() -> None:
    delay = float(os.getenv("AUTO_SCAN_STARTUP_DELAY_SEC", "1"))
    try:
        await asyncio.sleep(max(0.0, delay))
        await kickoff_automatic_scans(source="startup", force=False)
    except Exception as exc:
        logger.error(f"[AutoScan] Startup scan failed: {exc}", exc_info=True)


@app.on_event("startup")
async def startup_event():
    global stock_index
    try:
        create_db_and_tables()
    except Exception as exc:
        logger.warning(f"[DB] init failed (continuing with JSON only): {exc}")
    await cache_service.connect()
    stock_index = _load_stock_index()
    logger.info(f"Loaded stock index with {len(stock_index)} stocks")
    _load_scanner_results()  # Restore previous scan session
    _load_library_results()   # Restore previous library scan
    await start_scheduler()  # Nightly auto-scan
    if _env_truthy("AUTO_SCAN_ON_STARTUP", "true"):
        asyncio.create_task(_deferred_auto_scan_on_startup())
        logger.info("[AutoScan] Scheduled automatic scan on startup")


@app.on_event("shutdown")
async def shutdown_event():
    await stop_scheduler()
    await cache_service.close()


@app.get("/scheduler/status")
async def scheduler_status():
    """Return info about the nightly auto-scan scheduler."""
    info = get_next_run_info()
    info["auto_scan_on_startup"] = _env_truthy("AUTO_SCAN_ON_STARTUP", "true")
    info["auto_scan_stale_hours"] = float(os.getenv("AUTO_SCAN_STALE_HOURS", "12"))
    info["library_scanning"] = library_scanning
    info["scanner_running"] = scanner_running
    info["library_count"] = len(library_results)
    info["scanner_count"] = len(scanner_results)
    info["data_source"] = scanner_last_meta.get("data_source") or "yahoo_finance"
    info["scan_concurrency"] = SCAN_CONCURRENCY
    info["live_quotes"] = True
    return info


@app.post("/scheduler/trigger")
async def trigger_nightly_scan():
    """Manually trigger the automatic scan pipeline immediately (admin use)."""
    asyncio.create_task(kickoff_automatic_scans(source="manual_trigger", force=True))
    return {"status": "triggered", "message": "Automatic scan started in background"}


# ── Helper: run full analysis pipeline for one ticker ─────────
def _compute_quant(ticker: str, raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Every CPU-bound step of the analysis: quality gate, technicals, Big 5,
    sticker price, payback time, and the polars → dict serialisation.

    Kept synchronous and free of any awaits so `_analyze_ticker` can hand the
    whole block to a worker thread. Run inline on the event loop, these four
    pandas/polars pipelines serialise under concurrency and dominated a
    warm-cache scan at roughly 1 s per ticker.
    """
    info = raw_data.get("info", {})

    # ── Data quality gate ─────────────────────────────────────
    data_quality = assess_data_quality(raw_data)
    split_adjustment_meta: Dict[str, Any] = {
        "applied": False,
        "split_events": data_quality.get("details", {}).get("split_events", 0),
    }

    # ── Technical Analysis ────────────────────────────────────
    ta_results: Dict[str, Any] = {}
    try:
        ta_results = calculate_three_tools(raw_data["history"])
    except Exception as e:
        logger.error(f"[{ticker}] Technical Analysis Error: {e}")

    # ── Fundamental Analysis (Big 5) ─────────────────────────
    pldf = pl.DataFrame()
    big_5_results: Dict = {}
    try:
        pldf, split_adjustment_meta = process_financial_data(raw_data)
        big_5_results = analyze_big_5(pldf)
    except Exception as e:
        logger.error(f"[{ticker}] Fundamental Analysis Error: {e}")
        traceback.print_exc()

    # ── Sticker Price ────────────────────────────────────────
    sticker_res: Dict[str, float] = {"sticker_price": 0.0, "mos_price": 0.0}
    market_price: float = 0.0
    if not pldf.is_empty():
        try:
            latest = pldf.row(-1, named=True)
            current_eps = float(latest.get("eps", 0) or 0)
            current_equity = float(latest.get("equity", 0) or 0)

            equity_metric = big_5_results.get("equity")
            eps_metric = big_5_results.get("eps")

            # Prefer EPS CAGR for growth estimate (more reliable than equity for buyback-heavy companies)
            # Fallback chain: EPS 5y → EPS 3y → EPS 1y → equity 5y → equity 3y → equity 1y
            # Only use POSITIVE values — negative CAGR kills the sticker price calculation.
            # Never invent a hardcoded 10% — if nothing positive exists, sticker returns error.
            def _first_positive(*vals):
                for v in vals:
                    if v is not None and float(v) > 0.01:
                        return float(v)
                return None

            equity_growth: Optional[float] = None
            if equity_metric:
                equity_growth = _first_positive(
                    equity_metric.cagr_5y, equity_metric.cagr_3y, equity_metric.cagr_1y
                )

            # EPS growth as primary candidate (override equity if available)
            eps_growth_for_sticker: Optional[float] = None
            if eps_metric:
                eps_growth_for_sticker = _first_positive(
                    eps_metric.cagr_5y, eps_metric.cagr_3y, eps_metric.cagr_1y
                )

            analyst_est = info.get("earningsGrowth", None)

            # Prefer session quote fields over last daily Close (which lags
            # until the bar finalizes). Live overlay happens again on serve.
            market_price = resolve_market_price(info, raw_data.get("history"))

            pe_current = (market_price / current_eps) if current_eps > 0 and market_price > 0 else 0.0

            sticker_res = calculate_sticker_price(
                current_eps=current_eps,
                current_equity=current_equity,
                historic_equity_growth=equity_growth,
                eps_growth_estimate=eps_growth_for_sticker,
                analyst_growth_estimate=float(analyst_est) if analyst_est else None,
                historic_pe_mean=pe_current,
            )
        except Exception as e:
            logger.error(f"[{ticker}] Sticker Price Error: {e}")

    # ── Payback Time ──────────────────────────────────────────
    payback_time_years: float = 999.9
    try:
        latest = pldf.row(-1, named=True)
        # Using 3-year avg FCF to be conservative/smooth, or just last year?
        # Rule #1 usually uses current debt / avg FCF or last FCF.
        # Let's use Last Year FCF for simplicity, or 3-year avg if possible.
        current_fcf = float(latest.get("fcf", 0) or 0)
        
        # We need Total Debt. It wasn't in the DF, let's extract it from raw data or add to DF?
        # Best to add 'total_debt' to DF in process_financial_data
        current_debt = float(latest.get("total_debt", 0) or 0)

        from app.calculations import calculate_payback_time
        payback_time_years = calculate_payback_time(current_debt, current_fcf)
    except Exception as e:
        logger.error(f"[{ticker}] Payback Time Error: {e}")

    # ── Serialize Big 5 + history for JSON ───────────────────
    big_5_serialized: Dict[str, Any] = {}
    for key, metric in big_5_results.items():
        if hasattr(metric, "model_dump"):
            big_5_serialized[key] = metric.model_dump()
        elif hasattr(metric, "dict"):
            big_5_serialized[key] = metric.dict()
        else:
            big_5_serialized[key] = metric

    _BIG5_REF = {"roic", "equity", "eps", "sales", "fcf"}

    def _grew(metric) -> bool:
        if isinstance(metric, dict):
            return bool(metric.get("consistent_growth", False))
        return bool(getattr(metric, "consistent_growth", False))

    big5_growth_count = sum(
        1 for k, m in big_5_results.items() if k in _BIG5_REF and _grew(m)
    )
    big5_pass = (
        all(_grew(m) for k, m in big_5_results.items() if k in _BIG5_REF)
        if big_5_results
        else False
    )

    latest_roic = 0.0
    if not pldf.is_empty() and "roic" in pldf.columns:
        try:
            latest_roic = float(pldf["roic"][-1])
        except Exception:
            latest_roic = 0.0

    return {
        "data_quality": data_quality,
        "split_adjustment": split_adjustment_meta,
        "ta_results": ta_results,
        "big_5_serialized": big_5_serialized,
        "big5_pass": big5_pass,
        "big5_growth_count": big5_growth_count,
        "latest_roic": latest_roic,
        "has_financials": not pldf.is_empty(),
        "financial_history": pldf.to_dicts() if not pldf.is_empty() else [],
        "sticker_res": sticker_res,
        "market_price": market_price,
        "payback_time_years": payback_time_years,
    }


async def _analyze_ticker(
    ticker: str, raw_data: Dict[str, Any], *, include_ai: bool = True
) -> Dict[str, Any]:
    """
    Run full Rule #1 analysis on already-fetched raw data.
    Returns a JSON-serialisable result dict.
    """
    info = raw_data.get("info", {})
    company_name = info.get("shortName") or info.get("longName") or ticker

    quant = await asyncio.to_thread(_compute_quant, ticker, raw_data)

    data_quality = quant["data_quality"]
    split_adjustment_meta = quant["split_adjustment"]
    ta_results = quant["ta_results"]
    big_5_serialized = quant["big_5_serialized"]
    big5_pass = quant["big5_pass"]
    sticker_res = quant["sticker_res"]
    market_price = quant["market_price"]
    payback_time_years = quant["payback_time_years"]

    # ── AI Qualitative Analysis ───────────────────────────────
    ai_results: Dict[str, Any] = {
        "moat_score": 0,
        "moat_type": "Unknown",
        "moat_analysis": "AI analysis skipped (no API key).",
        "management_integrity": False,
        "management_description": "",
        "meaning_flag": False,
        "red_flags": [],
    }
    if GEMINI_API_KEY and include_ai:
        try:
            summary = info.get("longBusinessSummary", "No summary available.")
            # requests.post is synchronous with a 30s timeout. Called directly
            # from this coroutine it stalled the whole event loop per ticker,
            # freezing every other request including the progress SSE stream.
            ai_results = await asyncio.to_thread(
                partial(
                    ai_analyzer.analyze_moat_and_management,
                    ticker,
                    business_summary=summary,
                    risk_factors="Not available in free feed.",
                    earnings_transcript="Not available in free feed.",
                )
            )
        except Exception as e:
            logger.error(f"[{ticker}] AI Error: {e}")
            ai_results["moat_analysis"] = f"AI Service Error: {e}"

    # ── Heuristic moat (fallback when no Gemini key / AI returned 0) ──────
    # Uses ROIC level + Big 5 pass count as a rule-based proxy (max 7/10).
    # Always labelled so the UI never presents this as Gemini AI output.
    if ai_results.get("moat_score", 0) == 0 and quant["has_financials"]:
        try:
            _b5_count = quant["big5_growth_count"]
            _latest_roic = quant["latest_roic"]
            _h = 0
            if _latest_roic >= 0.20:   _h += 3
            elif _latest_roic >= 0.15: _h += 2
            elif _latest_roic >= 0.10: _h += 1
            if _b5_count >= 5:   _h += 3
            elif _b5_count >= 3: _h += 2
            elif _b5_count >= 2: _h += 1
            _h = max(1, min(_h, 7))
            ai_results["moat_score"] = _h
            ai_results["moat_type"] = "Heuristic"
            ai_results["moat_source"] = "heuristic"
            ai_results["moat_analysis"] = (
                f"ציון שיטתי (לא AI): ROIC={_latest_roic:.1%}, Big5={_b5_count}/5. "
                "מבוסס על נוסחה מקומית — הוסף GEMINI_API_KEY לניתוח AI מלא."
            )
        except Exception as _e:
            logger.warning(f"[{ticker}] Heuristic moat error: {_e}")
    elif ai_results.get("moat_score", 0) > 0 and not ai_results.get("moat_source"):
        ai_results["moat_source"] = "ai"

    # ── Final Verdict ─────────────────────────────────────────
    # Big 5 = ROIC, Equity/Share, EPS, Sales, FCF (ROE is supplemental, not gating)
    # Payback Time: Rule #1 wants debt paid off in < 3 years with FCF
    payback_ok = payback_time_years <= 3.0

    undervalued = (market_price > 0 and sticker_res.get("mos_price", 0) > 0
                   and market_price < sticker_res.get("mos_price", 0))

    green_signal = ta_results.get("signal") == "Green"
    moat = ai_results.get("moat_score", 0)

    # Verdict reasoning is emitted twice: as the original English prose (kept for
    # CSV/HTML reports and older cached records) and as structured codes. The codes
    # let the UI render the explanation in Hebrew - and in any other language later
    # - without pattern-matching English sentences.
    verdict_reasons = []
    verdict_failures: List[Dict[str, Any]] = []
    if not big5_pass:
        verdict_reasons.append("Inconsistent Big 5 growth (<10% long-term CAGR)")
        verdict_failures.append({"code": "big5_inconsistent"})
    if not payback_ok:
        verdict_reasons.append(f"High debt payback time ({payback_time_years:.1f}yr > 3yr)")
        verdict_failures.append({
            "code": "debt_payback_high",
            "years": round(payback_time_years, 1),
            "limit": 3,
        })
    if not undervalued:
        verdict_reasons.append("Price above Margin of Safety")
        verdict_failures.append({"code": "above_mos"})
    if not green_signal:
        verdict_reasons.append("Technical signal is not Green")
        verdict_failures.append({"code": "signal_not_green"})

    if big5_pass and payback_ok and undervalued and green_signal:
        verdict = "BUY"
        verdict_primary = "all_criteria_met"
        verdict_reason = "All Rule #1 criteria met! Strong growth, low debt, undervalued, and technical entry signal."
    elif big5_pass and payback_ok and undervalued and not green_signal:
        verdict = "WAIT"
        verdict_primary = "good_price_awaiting_signal"
        verdict_reason = "Great business at a great price, but waiting for technical entry signal."
    elif big5_pass and payback_ok and not undervalued and green_signal:
        verdict = "WAIT"
        verdict_primary = "signal_but_above_mos"
        verdict_reason = "Strong company with buy signal, but current price is above the Margin of Safety."
    elif big5_pass and payback_ok and not undervalued:
        verdict = "WATCHLIST"
        verdict_primary = "quality_but_overvalued"
        verdict_reason = "Wonderful business, but currently overvalued. Wait for price to drop to MOS."
    elif big5_pass and not payback_ok:
        verdict = "WARY"
        verdict_primary = "growth_but_high_debt"
        verdict_reason = f"Good growth but high debt load ({payback_time_years:.1f} years to pay off)."
    else:
        verdict = "DISQUALIFIED"
        verdict_primary = "failed_core_criteria"
        verdict_reason = "Failed core Rule #1 growth criteria. " + "; ".join(verdict_reasons[:2])

    verdict_modifiers: List[Dict[str, Any]] = []

    # Moat adjustments
    if moat >= 8 and verdict in ["WAIT", "WATCHLIST"]:
        verdict_reason += " [Strong Moat — high priority watchlist]"
        verdict_modifiers.append({"code": "strong_moat_priority"})
    elif moat <= 2 and verdict == "BUY":
        verdict = "WAIT"
        verdict_reason += " [Downgraded: AI could not verify a strong Moat]"
        verdict_modifiers.append({"code": "downgraded_unverified_moat"})

    # Incomplete data: never allow unqualified BUY
    if data_quality.get("incomplete"):
        if verdict == "BUY":
            verdict = "WAIT"
            verdict_reason += " [Downgraded: Incomplete Data — thin fundamentals / missing fields]"
            verdict_modifiers.append({"code": "downgraded_incomplete_data"})
        elif "Incomplete Data" not in verdict_reason:
            verdict_reason += " [Incomplete Data warning]"
            verdict_modifiers.append({"code": "incomplete_data_warning"})

    # ── Market Data from yfinance info ────────────────────────
    market_cap = info.get("marketCap", 0) or 0
    pe_ratio = info.get("trailingPE", None) or info.get("forwardPE", None)
    pb_ratio = info.get("priceToBook", None)
    ps_ratio = info.get("priceToSalesTrailing12Months", None)
    ev_ebitda = info.get("enterpriseToEbitda", None)
    week_52_high = info.get("fiftyTwoWeekHigh", None)
    week_52_low = info.get("fiftyTwoWeekLow", None)
    dividend_yield = info.get("dividendYield", None)
    dividend_rate = info.get("dividendRate", None)
    sector = info.get("sector", None)
    industry = info.get("industry", None)
    employees = info.get("fullTimeEmployees", None)
    debt_to_equity = info.get("debtToEquity", None)
    current_ratio = info.get("currentRatio", None)
    gross_margins = info.get("grossMargins", None)
    profit_margins = info.get("profitMargins", None)
    operating_margins = info.get("operatingMargins", None)
    beta = info.get("beta", None)
    shares_outstanding = info.get("sharesOutstanding", None)
    float_shares = info.get("floatShares", None)
    analyst_target_price = info.get("targetMeanPrice", None)
    analyst_recommendation = info.get("recommendationKey", None)
    forward_eps = info.get("forwardEps", None)
    trailing_eps = info.get("trailingEps", None)
    revenue_growth = info.get("revenueGrowth", None)
    earnings_growth = info.get("earningsGrowth", None)
    return_on_equity = info.get("returnOnEquity", None)
    return_on_assets = info.get("returnOnAssets", None)
    short_name = info.get("shortName", company_name)
    long_business_summary_en = (info.get("longBusinessSummary") or "").strip()
    long_business_summary = long_business_summary_en
    # Detail views (include_ai=True) show "תמצית עסק" in Hebrew. Bulk library
    # scans skip this to avoid thousands of translate round-trips.
    if include_ai and long_business_summary_en:
        try:
            long_business_summary = await asyncio.to_thread(
                ai_analyzer.translate_to_hebrew, long_business_summary_en
            )
        except Exception as e:
            logger.warning(f"[{ticker}] Business summary translate failed: {e}")

    return _json_safe({
        "symbol": ticker,
        "company_name": company_name,
        "short_name": short_name,
        "sector": sector,
        "industry": industry,
        "price": market_price,
        "big_5": big_5_serialized,
        "financial_history": quant["financial_history"],
        "sticker_price": sticker_res.get("sticker_price", 0),
        "mos_price": sticker_res.get("mos_price", 0),
        "sticker_price_breakdown": {
            "current_eps": sticker_res.get("current_eps", 0),
            "estimated_growth": sticker_res.get("estimated_growth", 0),
            "growth_source": sticker_res.get("growth_source"),
            "growth_capped": sticker_res.get("growth_capped", False),
            "future_eps": sticker_res.get("future_eps", 0),
            "future_pe": sticker_res.get("future_pe", 0),
            "future_price": sticker_res.get("future_price", 0),
            "sticker_price": sticker_res.get("sticker_price", 0),
            "mos_price": sticker_res.get("mos_price", 0),
            "discount_rate": 0.15,
            "years": 10,
        },
        "market_data": {
            "market_cap": market_cap,
            "pe_ratio": pe_ratio,
            "pb_ratio": pb_ratio,
            "ps_ratio": ps_ratio,
            "ev_ebitda": ev_ebitda,
            "week_52_high": week_52_high,
            "week_52_low": week_52_low,
            "dividend_yield": dividend_yield,
            "dividend_rate": dividend_rate,
            "debt_to_equity": debt_to_equity,
            "current_ratio": current_ratio,
            "gross_margins": gross_margins,
            "profit_margins": profit_margins,
            "operating_margins": operating_margins,
            "beta": beta,
            "shares_outstanding": shares_outstanding,
            "float_shares": float_shares,
            "analyst_target_price": analyst_target_price,
            "analyst_recommendation": analyst_recommendation,
            "forward_eps": forward_eps,
            "trailing_eps": trailing_eps,
            "revenue_growth": revenue_growth,
            "earnings_growth": earnings_growth,
            "return_on_equity": return_on_equity,
            "return_on_assets": return_on_assets,
            "employees": employees,
            # Prefer Hebrew for the UI; keep English for debugging / re-translate.
            "long_business_summary": long_business_summary,
            "long_business_summary_en": long_business_summary_en or None,
        },
        "ai_analysis": ai_results,
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        # Structured equivalent of verdict_reason, for localised rendering.
        "verdict_primary": verdict_primary,
        "verdict_modifiers": verdict_modifiers,
        "verdict_failures": verdict_failures,
        "verdict_details": {
            "big5_pass": big5_pass,
            "payback_ok": payback_ok,
            "undervalued": undervalued,
            "green_signal": green_signal,
            "moat_score": moat,
            "incomplete_data": bool(data_quality.get("incomplete")),
        },
        "technical_analysis": ta_results,
        "payback_time": round(payback_time_years, 1),
        "data_quality": data_quality,
        "split_adjustment": split_adjustment_meta,
    })


async def process_ticker(ticker: str):
    """
    Background task: fetch data and run full analysis for a ticker.
    Stores results in the global scan_results dict.
    """
    try:
        scan_progress[ticker] = "fetching"
        logger.info(f"[{ticker}] Fetching data...")

        raw_data = await data_service.fetch_ticker_data(ticker)

        # Accept any amount of data (yfinance free usually gives ~4 years)
        if raw_data.get("history") is None or raw_data["history"].empty:
            scan_progress[ticker] = "error: no price data found"
            return

        scan_progress[ticker] = "analyzing"
        logger.info(f"[{ticker}] Analyzing ({raw_data.get('years_count', '?')} years of data)...")

        result = await _analyze_ticker(ticker, raw_data)
        scan_results[ticker] = result

        scan_progress[ticker] = "complete"
        logger.info(f"[{ticker}] Analysis complete.")

    except Exception as e:
        logger.error(f"[{ticker}] Error: {str(e)}")
        traceback.print_exc()
        scan_progress[ticker] = f"error: {str(e)}"

@app.post("/scan")
async def start_scan(request: ScanRequest):
    """
    Start a background scan for a list of tickers.
    """
    tickers = [t.strip().upper() for t in request.tickers if t.strip()]
    for ticker in tickers:
        scan_progress[ticker] = "queued"

    def _mark_failed(ticker: str, exc: BaseException) -> None:
        scan_progress[ticker] = f"error: {exc}"

    # One task for the whole scan, internally concurrent. Starlette's
    # BackgroundTasks awaits its queue sequentially, which serialized every scan.
    asyncio.create_task(run_bounded(tickers, process_ticker, on_error=_mark_failed))

    return {"message": f"Started scan for {len(tickers)} tickers.", "tickers": tickers}


@app.get("/events")
async def sse_endpoint(request: Request):
    """
    Server-Sent Events for real-time progress updates.
    Sends progress status AND results when ticker analysis is complete.
    """
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            if scan_progress:
                payload = {
                    "progress": scan_progress,
                    "results": {},
                }
                # Attach results for completed tickers
                for ticker, status in scan_progress.items():
                    if status == "complete" and ticker in scan_results:
                        payload["results"][ticker] = scan_results[ticker]

                yield f"data: {json.dumps(payload)}\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/results")
async def get_all_results():
    """
    Return all cached scan results.
    """
    return {"progress": scan_progress, "results": scan_results}


@app.get("/results/{ticker}")
async def get_result(ticker: str):
    """
    Return cached result for a specific ticker.
    """
    ticker = ticker.upper()
    if ticker in scan_results:
        return scan_results[ticker]
    raise HTTPException(status_code=404, detail=f"No results found for {ticker}. Run a scan first.")

def process_financial_data(raw_data: Dict[str, Any]):
    """
    Convert yfinance pandas DFs to the Polars DF structure required by calculations.py.
    Returns (pldf, split_adjustment_meta).
    """
    empty_meta = {"applied": False, "split_events": 0, "adjusted_rows": 0, "max_factor": 1.0, "fields": []}
    fin = raw_data.get('financials', pd.DataFrame())
    bal = raw_data.get('balance_sheet', pd.DataFrame())
    cf = raw_data.get('cashflow', pd.DataFrame())

    # If all empty, return empty DF
    if fin.empty and bal.empty and cf.empty:
        return pl.DataFrame(), empty_meta

    # Transpose so index is Date
    fin = fin.T if not fin.empty else pd.DataFrame()
    bal = bal.T if not bal.empty else pd.DataFrame()
    cf = cf.T if not cf.empty else pd.DataFrame()

    # Merge based on index (Date)
    frames = [f for f in [fin, bal, cf] if not f.empty]
    if not frames:
        return pl.DataFrame(), empty_meta

    merged = frames[0]
    for i, f in enumerate(frames[1:], 1):
        merged = merged.join(f, lsuffix=f'_l{i}', rsuffix=f'_r{i}', how='outer')

    merged.index.name = 'date'
    merged = merged.reset_index()
    merged = merged.sort_values('date')  # Oldest to Newest

    # Helper to safe get column (tries multiple name variants)
    def get_col(df: pd.DataFrame, candidates: list) -> pd.Series:
        for c in candidates:
            # Exact match
            if c in df.columns:
                return df[c].fillna(0)
            # Partial match (yfinance sometimes adds suffixes)
            for col in df.columns:
                if c in str(col):
                    return df[col].fillna(0)
        return pd.Series(0, index=df.index)

    # Extract Metrics (Handling common yfinance variations)
    # Sales
    sales = get_col(merged, ['Total Revenue', 'Total Revenue_fin'])
    
    # EPS
    eps = get_col(merged, ['Diluted EPS', 'Basic EPS'])
    
    # Equity (Book Value) = Total Assets - Total Liab
    # Or 'Total Stockholder Equity'
    equity_total = get_col(merged, ['Total Stockholder Equity', 'Total Stockholder Equity_bal', 'Stockholders Equity'])
    shares = get_col(merged, ['Ordinary Shares Number', 'Share Issued'])
    # Fallback to avoid div by zero
    equity_per_share = equity_total / shares.replace(0, 1)
    
    # FCF = Free Cash Flow
    fcf = get_col(merged, ['Free Cash Flow', 'Free Cash Flow_cf'])
    
    # ROIC = NOPAT / Invested Capital
    # Simplified Proxy: Net Income / (Total Equity + Total Debt)
    net_income = get_col(merged, ['Net Income', 'Net Income_fin'])
    total_debt = get_col(merged, ['Total Debt', 'Total Debt_bal'])
    invested_capital = equity_total + total_debt
    roic = net_income / invested_capital.replace(0, 1)

    # ROE = Net Income / Equity
    roe = net_income / equity_total.replace(0, 1)



    # Split adjustment on per-share fields (EPS, Equity/Share)
    adjusted, split_meta = apply_split_adjustment(
        merged['date'].tolist(),
        {"eps": eps, "equity": equity_per_share},
        raw_data.get("splits", pd.Series(dtype=float)),
    )
    eps = adjusted["eps"]
    equity_per_share = adjusted["equity"]

    # Construct Polars Dataframe
    try:
        # Convert dates to string for safe Polars ingestion
        date_series = merged['date'].astype(str)
        data = {
            'date': date_series.tolist(),
            'sales': pd.to_numeric(sales, errors='coerce').fillna(0).tolist(),
            'eps': pd.to_numeric(eps, errors='coerce').fillna(0).tolist(),
            'equity': pd.to_numeric(equity_per_share, errors='coerce').fillna(0).tolist(),
            'fcf': pd.to_numeric(fcf, errors='coerce').fillna(0).tolist(),
            'roic': pd.to_numeric(roic, errors='coerce').fillna(0).tolist(),
            'roe': pd.to_numeric(roe, errors='coerce').fillna(0).tolist(),
            'total_debt': pd.to_numeric(total_debt, errors='coerce').fillna(0).tolist(),
        }
        pldf = pl.DataFrame(data)
    except Exception as e:
        logger.error(f"Error constructing Polars DataFrame: {e}")
        return pl.DataFrame(), split_meta
    
    # Fill NAs with 0
    pldf = pldf.fill_null(0)
    
    return pldf, split_meta

async def _overlay_live_price(record: Dict[str, Any], ticker: str) -> Dict[str, Any]:
    """Attach a fresh quote to a cached analysis without re-running fundamentals."""
    try:
        quote = await quotes_service.get_quote(ticker)
    except Exception as exc:
        logger.debug(f"[Quotes] overlay failed for {ticker}: {exc}")
        return record
    updated = quotes_service.apply_to_analysis(record, quote)
    # Keep in-memory caches price-fresh so subsequent list views stay current.
    if quote and quote.price > 0:
        if ticker in library_results:
            library_results[ticker]["price"] = quote.price
            library_results[ticker]["price_as_of"] = quote.as_of
            library_results[ticker]["price_change_pct"] = quote.change_pct
            library_results[ticker]["price_live"] = True
        if ticker in scan_results:
            scan_results[ticker]["price"] = quote.price
            scan_results[ticker]["price_as_of"] = quote.as_of
            scan_results[ticker]["price_change_pct"] = quote.change_pct
            scan_results[ticker]["price_live"] = True
    return updated


@app.get("/stock/{ticker}")
async def get_stock_analysis(ticker: str):
    """
    Get full Rule #1 analysis for a specific ticker.
    Prefer in-memory scan / library caches so the full report page opens quickly.
    Live price is always overlaid — fundamentals may be cached, quotes are not.
    """
    ticker = normalize_yahoo_symbol(ticker.upper()) or ticker.upper()

    if ticker in scan_results:
        return _json_safe(await _overlay_live_price(dict(scan_results[ticker]), ticker))

    # Library scans skip AI/translation; still serve the quant result immediately
    # so the full-report page opens without a Yahoo round-trip.
    if ticker in library_results:
        cached = dict(library_results[ticker])
        # Do NOT freeze into scan_results without a live quote — that used to
        # pin yesterday's price for the rest of the process lifetime.
        return _json_safe(await _overlay_live_price(cached, ticker))

    try:
        raw_data = await data_service.fetch_ticker_data(ticker)

        if raw_data.get("history") is None or raw_data["history"].empty:
            raise HTTPException(status_code=404, detail=f"No data found for {ticker}")

        result = await _analyze_ticker(ticker, raw_data)
        # Prefer a true last-trade quote over the bundle's possibly-stale close.
        result = await _overlay_live_price(result, ticker)
        result = _json_safe(result)
        scan_results[ticker] = result  # cache for later (price refreshed on read)
        upsert_analysis(result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CRITICAL API ERROR for {ticker}: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@app.get("/quotes")
async def get_quotes(symbols: str = Query(..., min_length=1, max_length=8000)):
    """
    Bulk near-real-time quotes. Comma-separated symbols.
    Cached ~20s server-side so the UI can poll aggressively.
    """
    raw = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(raw) > 500:
        raise HTTPException(status_code=400, detail="Max 500 symbols per request")
    quotes = await quotes_service.get_quotes(raw)
    return {
        "as_of": datetime.datetime.utcnow().isoformat() + "Z",
        "count": len(quotes),
        "quotes": {sym: q.to_dict() for sym, q in quotes.items()},
    }


# ── Search endpoint ───────────────────────────────────────────
@app.get("/search")
async def search_stocks(q: str = Query("", min_length=1, max_length=100)):
    """
    Search stocks by name, ticker, or sector.
    Returns top 10 matches sorted by relevance.
    Falls back to live yfinance lookup when local results are sparse.
    """
    query = q.strip().upper()
    if not query:
        return []

    scored = []
    for stock in stock_index:
        symbol = stock["symbol"].upper()
        name = stock["name"].upper()
        sector = stock["sector"].upper()

        score = 0
        if symbol == query:
            score = 100
        elif symbol.startswith(query):
            score = 80
        elif query in symbol:
            score = 60
        elif query in name:
            score = 40
        elif query in sector:
            score = 20
        else:
            continue

        scored.append({**stock, "_score": score})

    scored.sort(key=lambda x: -x["_score"])
    results = [{k: v for k, v in item.items() if k != "_score"} for item in scored[:10]]

    # yfinance live fallback: when local results are sparse and query looks like a ticker
    if len(results) < 3 and len(query) <= 10 and query.replace("-", "").replace(".", "").isalpha():
        try:
            import yfinance as yf
            import asyncio

            def _yf_lookup(sym: str):
                try:
                    t = yf.Ticker(sym)
                    info = t.fast_info
                    # fast_info has last_price; check it's a valid instrument
                    price = getattr(info, "last_price", None)
                    if price and price > 0:
                        full = t.info
                        return {
                            "symbol": sym,
                            "name": full.get("shortName") or full.get("longName") or sym,
                            "sector": full.get("sector") or full.get("quoteType") or "",
                            "sub_industry": full.get("industry") or "",
                            "universe": "live",
                            "exchange": full.get("exchange") or "",
                            "currency": full.get("currency") or "",
                            "country": full.get("country") or "",
                        }
                except Exception:
                    pass
                return None

            live = await asyncio.to_thread(_yf_lookup, query)
            if live and not any(r["symbol"].upper() == query for r in results):
                results.insert(0, live)
        except Exception:
            pass

    return results


@app.get("/search/validate")
async def validate_ticker(ticker: str = Query("", min_length=1, max_length=20)):
    """
    Validate whether a ticker symbol actually exists via yfinance.
    Returns {valid: bool, symbol, name, exchange, currency, country}.
    """
    sym = ticker.strip().upper()
    if not sym:
        return {"valid": False}

    # Check local index first
    for stock in stock_index:
        if stock["symbol"].upper() == sym:
            return {"valid": True, **{k: v for k, v in stock.items()}}

    # Live check via yfinance
    try:
        import yfinance as yf
        import asyncio

        def _check(s: str):
            try:
                t = yf.Ticker(s)
                info = t.fast_info
                price = getattr(info, "last_price", None)
                if price and price > 0:
                    full = t.info
                    return {
                        "valid": True,
                        "symbol": s,
                        "name": full.get("shortName") or full.get("longName") or s,
                        "sector": full.get("sector") or full.get("quoteType") or "",
                        "sub_industry": full.get("industry") or "",
                        "exchange": full.get("exchange") or "",
                        "currency": full.get("currency") or "",
                        "country": full.get("country") or "",
                    }
            except Exception:
                pass
            return {"valid": False}

        return await asyncio.to_thread(_check, sym)
    except Exception:
        return {"valid": False}


def _symbols_for_universe(universe: Optional[str] = None) -> List[str]:
    """Return stock_index symbols matching universe (or all)."""
    key = (universe or "all").lower().strip()
    if not key or key in ("all", "*"):
        return [s["symbol"] for s in stock_index if s.get("symbol")]
    out: List[str] = []
    for s in stock_index:
        sym = s.get("symbol")
        if not sym:
            continue
        primary = (s.get("universe") or "").lower()
        extras = [u.lower() for u in (s.get("universe_extra") or [])]
        if primary == key or key in extras:
            out.append(sym)
    return out


# ── Library endpoints ─────────────────────────────────────────
@app.get("/library")
async def get_library(
    universe: Optional[str] = None,
    live_prices: bool = Query(
        False,
        description="Overlay live quotes (default off — UI uses /quotes; keeps this endpoint fast)",
    ),
    include_pending: bool = Query(
        True,
        description="Include every universe member, even before Rule #1 analysis finishes",
    ),
):
    """
    Return screened stocks for a universe.

    By default returns the **full universe roster**: analyzed rows plus PENDING
    stubs for members not yet scanned — so selecting TA125/Nikkei/etc. always
    shows every constituent, not only the fraction already in library_results.
    """
    index_map = _index_entry_map()
    universe_key = (universe or "all").lower().strip()
    member_symbols = _symbols_for_universe(universe_key)

    if include_pending and member_symbols:
        stocks = [_library_row_for_symbol(sym, index_map) for sym in member_symbols]
    else:
        stocks = list(library_results.values())
        if universe_key not in ("all", "*", ""):
            allowed = {s.upper() for s in member_symbols}
            stocks = [s for s in stocks if str(s.get("symbol", "")).upper() in allowed]

    analyzed_count = sum(1 for s in stocks if not s.get("analysis_pending"))

    if live_prices and stocks:
        # Only quote rows that already have analysis (pending stubs have price 0).
        quote_syms = [
            str(s.get("symbol", "")).upper()
            for s in stocks
            if s.get("symbol") and not s.get("analysis_pending")
        ][:200]
        if quote_syms:
            try:
                quotes = await asyncio.wait_for(
                    quotes_service.get_quotes(quote_syms),
                    timeout=6.0,
                )
                refreshed: List[Dict[str, Any]] = []
                for row in stocks:
                    sym = str(row.get("symbol", "")).upper()
                    quote = quotes.get(sym)
                    if quote and not row.get("analysis_pending"):
                        updated = quotes_service.apply_to_analysis(dict(row), quote)
                        refreshed.append(updated)
                        if sym in library_results and updated.get("price_live"):
                            library_results[sym]["price"] = updated.get("price")
                            library_results[sym]["price_as_of"] = updated.get("price_as_of")
                            library_results[sym]["price_change_pct"] = updated.get(
                                "price_change_pct"
                            )
                            library_results[sym]["price_live"] = True
                    else:
                        refreshed.append(row)
                stocks = refreshed
            except asyncio.TimeoutError:
                logger.warning("[Library] live price overlay timed out — serving cached prices")
            except Exception as exc:
                logger.warning(f"[Library] live price overlay failed: {exc}")

    return {
        "scanning": library_scanning,
        "progress": library_progress,
        "total": len(member_symbols) if member_symbols else len(stock_index),
        "analyzed": analyzed_count,
        "pending": max(0, len(stocks) - analyzed_count),
        "universe": universe_key or "all",
        "stocks": stocks,
        "prices_live": bool(live_prices),
        "data_source": "yahoo_finance",
    }


@app.post("/library/ensure-scan")
async def ensure_library_scan(
    request: LibraryScanRequest = Body(default_factory=LibraryScanRequest),
):
    """
    Make sure the selected universe is fully analyzed.
    Starts a background scan for missing tickers only (no manual UI button needed).
    """
    universe = request.universe or "all"
    if request.tickers:
        wanted = [normalize_yahoo_symbol(t.upper()) or t.upper() for t in request.tickers]
        missing = [
            t for t in wanted
            if t not in library_results and t.upper() not in library_results
        ]
    else:
        missing = _missing_library_tickers(universe)

    if request.max_tickers and request.max_tickers > 0:
        missing = missing[: request.max_tickers]

    if not missing:
        return {
            "started": False,
            "scanning": library_scanning,
            "missing": 0,
            "universe": universe,
            "message": "Universe already fully analyzed.",
        }

    if library_scanning:
        return {
            "started": False,
            "scanning": True,
            "missing": len(missing),
            "universe": universe,
            "message": "Library scan already in progress; missing tickers will be covered or re-queued next cycle.",
        }

    started = _begin_library_scan(missing, universe if universe != "all" else "all")
    return {
        "started": bool(started.get("started")),
        "scanning": True,
        "missing": len(missing),
        "universe": universe,
        "total": started.get("total", len(missing)),
        "message": f"Started scan for {len(missing)} missing stocks.",
        "data_source": "yahoo_finance",
    }


@app.post("/library/refresh-prices")
async def refresh_library_prices():
    """Refresh only current prices on cached library analyses."""
    if not library_results:
        raise HTTPException(status_code=404, detail="No library results to refresh")

    symbols = list(library_results.keys())
    quotes = await quotes_service.get_quotes(symbols)
    updated = 0
    for sym, quote in quotes.items():
        if sym in library_results and quote.price > 0:
            library_results[sym] = quotes_service.apply_to_analysis(
                library_results[sym], quote
            )
            updated += 1

    if updated:
        asyncio.create_task(asyncio.to_thread(_save_library_results))

    return {"updated": updated, "total": len(symbols)}


@app.post("/library/scan")
async def start_library_scan(
    background_tasks: BackgroundTasks,
    request: LibraryScanRequest = Body(default_factory=LibraryScanRequest),
):
    """
    Trigger a Rule #1 library scan. Optionally scoped to a universe / ticker list.
    """
    if library_scanning:
        return {"message": "Library scan already in progress.", "scanning": True}

    body = request
    if body.tickers:
        tickers = [normalize_yahoo_symbol(t.upper()) or t.upper() for t in body.tickers]
    else:
        tickers = _symbols_for_universe(body.universe)

    if body.max_tickers and body.max_tickers > 0:
        tickers = tickers[: body.max_tickers]

    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers matched the requested universe.")

    started = _begin_library_scan(tickers, body.universe or "all")
    if not started.get("started"):
        return {"message": "Library scan already in progress.", "scanning": True}

    return {
        "message": f"Started library scan for {len(tickers)} stocks.",
        "universe": body.universe or "all",
        "total": len(tickers),
        "scanning": True,
    }


async def _library_worker(ticker: str) -> None:
    """Analyze one ticker into the library store."""
    library_progress[ticker] = "analyzing"
    logger.info(f"[Library] Analyzing {ticker}...")

    raw_data = await data_service.fetch_ticker_data(ticker)

    if raw_data.get("history") is None or raw_data["history"].empty:
        library_progress[ticker] = "error: no data"
        return

    # AI is fetched lazily per ticker via /stock/{ticker}; running it inside a
    # bulk scan added a blocking 30s-timeout HTTP call per name.
    result = await _analyze_ticker(ticker, raw_data, include_ai=False)
    library_results[ticker] = result
    library_progress[ticker] = "complete"
    await asyncio.to_thread(upsert_analysis, result)

    # Periodic checkpoint so a long scan survives a restart.
    if len(library_results) % 100 == 0:
        asyncio.create_task(asyncio.to_thread(_save_library_results))


async def _run_library_scan(tickers: List[str], universe: str = "all"):
    """Background task: scan all tickers for the library."""
    global library_scanning
    try:
        for ticker in tickers:
            library_progress[ticker] = "queued"

        def _mark_failed(ticker: str, exc: BaseException) -> None:
            library_progress[ticker] = f"error: {exc}"

        await run_bounded(tickers, _library_worker, on_error=_mark_failed)

    finally:
        library_scanning = False
        logger.info(f"[Library] Scan complete. {len(library_results)} stocks analyzed.")
        # Final save on completion (or partial completion). Both of these touch
        # disk/DB synchronously, so they run in a thread to keep the loop free.
        await asyncio.to_thread(_save_library_results)
        # Archive this run (only newly scanned subset + summary)
        scanned = {t: library_results[t] for t in tickers if t in library_results}
        await asyncio.to_thread(
            partial(
                archive_scan,
                "library",
                universe=universe,
                title=f"Library scan · {universe} · {len(scanned)} stocks",
                meta={
                    "requested": len(tickers),
                    "completed": len(scanned),
                    "verdicts": {
                        v: sum(1 for s in scanned.values() if s.get("verdict") == v)
                        for v in ("BUY", "WAIT", "WATCHLIST", "WARY", "DISQUALIFIED")
                    },
                },
                payload={"stocks": list(scanned.values())},
            )
        )


@app.get("/library/status")
async def get_library_status():
    """Get library scan progress."""
    total = len(library_progress)
    done = len([s for s in library_progress.values() if s == "complete" or s.startswith("error")])
    return {
        "scanning": library_scanning,
        "total": total,
        "done": done,
        "progress": library_progress,
    }


# ── Archives & Reports ────────────────────────────────────────
@app.get("/archives")
async def get_archives(kind: Optional[str] = None, limit: int = 50):
    return {"archives": list_archives(kind=kind, limit=min(limit, 200))}


@app.get("/archives/{archive_id}")
async def get_archive_detail(archive_id: int):
    row = get_archive(archive_id)
    if not row:
        raise HTTPException(status_code=404, detail="Archive not found")
    return row


class ReportExportRequest(BaseModel):
    rows: List[Dict[str, Any]] = []
    title: str = "Rule #1 Report"
    subtitle: Optional[str] = None
    kind: str = "candidates"  # candidates | library | custom
    universe: Optional[str] = None
    archive: bool = True


@app.post("/reports/export")
async def export_report(request: ReportExportRequest, format: str = Query("csv")):
    """
    Export rows as CSV or HTML. Optionally archives the snapshot in the DB.
    format: csv | html
    """
    rows = request.rows or []
    fmt = (format or "csv").lower()

    archive_id = None
    if request.archive and rows:
        archive_id = archive_scan(
            request.kind or "candidates",
            universe=request.universe,
            title=request.title,
            meta={"format": fmt, "count": len(rows)},
            payload={"stocks": rows},
        )

    if fmt == "html":
        content = stocks_to_html(rows, title=request.title, subtitle=request.subtitle)
        headers = {"Content-Disposition": 'attachment; filename="rule1-report.html"'}
        if archive_id:
            headers["X-Archive-Id"] = str(archive_id)
        return Response(content=content, media_type="text/html; charset=utf-8", headers=headers)

    content = stocks_to_csv(rows)
    headers = {"Content-Disposition": 'attachment; filename="rule1-report.csv"'}
    if archive_id:
        headers["X-Archive-Id"] = str(archive_id)
    return Response(content=content, media_type="text/csv; charset=utf-8", headers=headers)


@app.get("/reports/library")
async def export_library_report(
    format: str = Query("csv"),
    universe: Optional[str] = None,
    verdict: Optional[str] = None,
):
    """Quick export of current in-memory library results."""
    stocks = list(library_results.values())
    if universe and universe.lower() not in ("all", "", "*"):
        allowed = {s.upper() for s in _symbols_for_universe(universe)}
        stocks = [s for s in stocks if str(s.get("symbol", "")).upper() in allowed]
    if verdict:
        stocks = [s for s in stocks if s.get("verdict") == verdict.upper()]

    title = f"Library · {universe or 'all'}" + (f" · {verdict}" if verdict else "")
    archive_scan(
        "library_export",
        universe=universe or "all",
        title=title,
        meta={"count": len(stocks), "verdict": verdict},
        payload={"stocks": stocks},
    )

    if format.lower() == "html":
        return Response(
            content=stocks_to_html(stocks, title=title),
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="library-report.html"'},
        )
    return Response(
        content=stocks_to_csv(stocks),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="library-report.csv"'},
    )


@app.get("/performance/summary")
async def performance_summary():
    """Aggregate workspace performance / quality health metrics."""
    portfolio_rows: List[Dict[str, Any]] = []
    try:
        path = Path(__file__).resolve().parent.parent / ".tmp" / "portfolio.json"
        if path.exists():
            portfolio_rows = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(portfolio_rows, dict):
                portfolio_rows = portfolio_rows.get("holdings") or portfolio_rows.get("items") or []
    except Exception:
        portfolio_rows = []

    return build_performance_summary(
        library_results=library_results,
        scanner_results=scanner_results,
        portfolio_rows=portfolio_rows if isinstance(portfolio_rows, list) else [],
    )


@app.get("/market/status")
async def get_market_status():
    return {
        "status": "online",
        "system": "Rule #1 Screener",
        "scan_concurrency": SCAN_CONCURRENCY,
        "bundle_cache": bundle_cache.stats(),
        "redis": cache_service.available,
    }


@app.get("/market/providers")
async def get_data_providers():
    """Hybrid provider status: Yahoo for scans, EODHD for deep when keyed."""
    deep = getattr(data_service.router, "deep_provider_name", "yahoo")
    return {
        "scan_provider": "yahoo",
        "deep_provider": deep,
        "eodhd_configured": deep == "eodhd",
        "policy": "Yahoo for bulk/scan; EODHD for deep Rule #1 when EODHD_API_KEY is set",
    }


@app.delete("/scan")
async def clear_scan():
    """Clear all scan progress and results."""
    scan_progress.clear()
    scan_results.clear()
    return {"message": "Scan data cleared."}


# ══════════════════════════════════════════════════════════════
# SCANNER ENDPOINTS — R1 Screener (Technical Pattern Scanner)
# ══════════════════════════════════════════════════════════════

@app.get("/scanner/patterns")
async def list_available_patterns():
    """List all detectable chart patterns with descriptions."""
    return [
        {
            "id": "cup_and_handle",
            "name": "Cup & Handle",
            "type": "bullish",
            "description": "A rounded bottom (cup) followed by a small pullback (handle), signaling a continuation of the uptrend. Breakout above the rim confirms the pattern.",
        },
        {
            "id": "head_and_shoulders",
            "name": "Head & Shoulders",
            "type": "bearish",
            "description": "Three peaks where the middle (head) is highest. A break below the neckline confirms a bearish reversal.",
        },
        {
            "id": "inverse_head_and_shoulders",
            "name": "Inverse Head & Shoulders",
            "type": "bullish",
            "description": "Three troughs where the middle (head) is lowest. A break above the neckline confirms a bullish reversal.",
        },
        {
            "id": "double_bottom",
            "name": "Double Bottom",
            "type": "bullish",
            "description": "Two troughs at roughly the same level, forming a 'W' shape. Signals a bullish reversal.",
        },
        {
            "id": "double_top",
            "name": "Double Top",
            "type": "bearish",
            "description": "Two peaks at roughly the same level, forming an 'M' shape. Signals a bearish reversal.",
        },
        {
            "id": "ascending_triangle",
            "name": "Ascending Triangle",
            "type": "bullish",
            "description": "Flat upper resistance with rising lower support (higher lows). Typically breaks upward.",
        },
        {
            "id": "descending_triangle",
            "name": "Descending Triangle",
            "type": "bearish",
            "description": "Flat lower support with declining upper resistance (lower highs). Typically breaks downward.",
        },
        {
            "id": "bull_flag",
            "name": "Bull Flag",
            "type": "bullish",
            "description": "A sharp rally (pole) followed by a gentle downward consolidation (flag). Expect breakout upward.",
        },
        {
            "id": "bear_flag",
            "name": "Bear Flag",
            "type": "bearish",
            "description": "A sharp decline (pole) followed by a gentle upward consolidation (flag). Expect breakdown.",
        },
    ]


@app.get("/scanner/universes")
async def list_universes():
    """List available stock universes and their counts from the loaded index."""
    # Count primary + extra tags for every universe present in the index
    counts: dict = {}
    for s in stock_index:
        primary = s.get("universe", "sp500")
        counts[primary] = counts.get(primary, 0) + 1
        for extra in s.get("universe_extra", []):
            counts[extra] = counts.get(extra, 0) + 1

    # Ordered list with display metadata — only emit universes that actually have stocks
    KNOWN_META = {
        "all":       {"label": "All Universes",     "icon": "🌍", "region": "all"},
        "sp500":     {"label": "S&P 500",           "icon": "🇺🇸", "region": "us"},
        "nasdaq100": {"label": "NASDAQ-100",         "icon": "💻", "region": "us"},
        "sp400":     {"label": "S&P 400 MidCap",    "icon": "📈", "region": "us"},
        "sp600":     {"label": "S&P 600 SmallCap",  "icon": "🔬", "region": "us"},
        "dowjones":  {"label": "Dow Jones 30",       "icon": "🏗️", "region": "us"},
        "ftse100":   {"label": "FTSE 100",           "icon": "🇬🇧", "region": "europe"},
        "dax":       {"label": "DAX 40",             "icon": "🇩🇪", "region": "europe"},
        "cac40":     {"label": "CAC 40",             "icon": "🇫🇷", "region": "europe"},
        "aex":       {"label": "AEX 25",             "icon": "🇳🇱", "region": "europe"},
        "smi":       {"label": "SMI 20",             "icon": "🇨🇭", "region": "europe"},
        "ibex35":    {"label": "IBEX 35",            "icon": "🇪🇸", "region": "europe"},
        "tsx":       {"label": "TSX 60",             "icon": "🇨🇦", "region": "americas"},
        "asx200":    {"label": "ASX 200",            "icon": "🇦🇺", "region": "apac"},
        "nikkei225": {"label": "Nikkei 225",         "icon": "🇯🇵", "region": "apac"},
        "hangseng":  {"label": "Hang Seng",          "icon": "🇭🇰", "region": "apac"},
        "ta35":      {"label": "ת״א-35",             "icon": "🇮🇱", "region": "israel"},
        "ta125":     {"label": "ת״א-125",            "icon": "🇮🇱", "region": "israel"},
    }

    result = [{"id": "all", "label": "All Universes", "icon": "🌍", "region": "all", "count": len(stock_index)}]
    for uid, meta in KNOWN_META.items():
        if uid == "all":
            continue
        c = counts.get(uid, 0)
        if c > 0:
            result.append({"id": uid, "count": c, **meta})

    # Also surface any unknown universes found in the index that aren't in KNOWN_META
    for uid, c in sorted(counts.items(), key=lambda x: -x[1]):
        if uid not in KNOWN_META and c > 0:
            result.append({"id": uid, "label": uid.upper(), "icon": "🏛️", "region": "other", "count": c})

    return result


@app.post("/scanner/scan")
async def start_pattern_scan(request: ScannerRequest, background_tasks: BackgroundTasks):
    """Start a pattern scan across specified tickers."""
    if scanner_running:
        return {"message": "Scanner already running. Please wait."}

    # Determine tickers to scan
    tickers = request.tickers
    if not tickers:
        tickers = [s["symbol"] for s in stock_index]

    # Apply universe pre-filter HERE (before bulk download) so total_tickers is accurate
    # and the bulk OHLCV download only fetches the right stocks.
    universe_key = (request.universe or "").lower()
    if universe_key and universe_key not in ("all", ""):
        before = len(tickers)
        idx_map = {s["symbol"]: s for s in stock_index}
        tickers = [
            t for t in tickers
            if (
                idx_map.get(t, {}).get("universe", "").lower() == universe_key
                or universe_key in [u.lower() for u in idx_map.get(t, {}).get("universe_extra", [])]
            )
        ]
        logger.info(f"[Scanner] Universe pre-filter '{universe_key}': {before} → {len(tickers)} tickers")

    filters_dict = dict(request.filters or {})
    profile = request.profile or filters_dict.get("profile")
    started = _begin_pattern_scan(
        tickers,
        list(request.patterns or []),
        universe=request.universe or "custom",
        min_confidence=request.min_confidence,
        timeframe=request.timeframe,
        detection_model=request.detection_model,
        require_rule1_quality=request.require_rule1_quality,
        filters=filters_dict,
        profile=profile,
        source="manual",
    )
    if not started.get("started"):
        return {"message": "Scanner already running. Please wait."}

    return {
        "message": f"Scanner started for {len(tickers)} tickers, "
                   f"patterns: {started.get('patterns')}",
        "total_tickers": len(tickers),
        "profile": profile,
    }


async def _run_scanner(
    tickers: List[str],
    patterns: List[str],
    filters: ScannerFilters,
    min_confidence: float,
    timeframe: str,
):
    """Background task: run the pattern scanner."""
    global scanner_running
    # Overall timeout: 900s (15 min) — prevents the scanner from hanging forever
    _SCANNER_TIMEOUT = 900.0
    try:
        for ticker in tickers:
            scanner_progress[ticker] = "queued"

        def on_progress(ticker: str, status: str):
            scanner_progress[ticker] = status

        # Build a symbol → {name, sector, sub_industry} map for pre-filtering
        index_map = {s["symbol"]: s for s in stock_index}

        results = await asyncio.wait_for(
            scanner_service.scan_universe(
                tickers=tickers,
                patterns=patterns,
                filters=filters,
                min_confidence=min_confidence,
                timeframe=timeframe,
                on_progress=on_progress,
                stock_index_map=index_map,
                on_result=lambda r: (
                    scanner_results.append(r.to_dict())
                    if r not in scanner_results  # avoid duplicates on retry
                    else None
                ),
            ),
            timeout=_SCANNER_TIMEOUT,
        )

        # on_result already populated scanner_results incrementally;
        # re-sync to catch any missed due to timing edge cases
        found_symbols = {r["symbol"] for r in scanner_results}
        for r in results:
            if r.symbol not in found_symbols:
                scanner_results.append(r.to_dict())

        _save_scanner_results()  # Persist final snapshot to disk
        archive_scan(
            "pattern",
            universe=scanner_last_meta.get("universe") if isinstance(scanner_last_meta, dict) else None,
            title=f"Pattern scan · {len(scanner_results)} hits",
            meta={
                "patterns_found": sum(len(r.get("patterns") or []) for r in scanner_results if isinstance(r, dict)),
                "stocks_with_patterns": len(scanner_results),
                **(scanner_last_meta if isinstance(scanner_last_meta, dict) else {}),
            },
            payload={"results": list(scanner_results)},
        )

    except asyncio.TimeoutError:
        logger.error(f"[Scanner] Timed out after {_SCANNER_TIMEOUT}s — returning partial results ({len(scanner_results)} found so far)")
        scanner_progress["__status__"] = "Scan timed out — partial results shown"
        _save_scanner_results()
        archive_scan(
            "pattern",
            title=f"Pattern scan (partial) · {len(scanner_results)} hits",
            meta={"partial": True, "stocks_with_patterns": len(scanner_results)},
            payload={"results": list(scanner_results)},
        )
    except Exception as e:
        logger.error(f"[Scanner] Fatal error: {e}")
        traceback.print_exc()
    finally:
        scanner_running = False
        logger.info(f"[Scanner] Complete. {len(scanner_results)} stocks with patterns found.")


_SETTLED_MARKERS = ("complete", "found", "error", "skip", "done")


def _count_settled(progress: Dict[str, str]) -> int:
    """Number of tickers that have reached a terminal status."""
    return sum(
        1
        for status in progress.values()
        if any(marker in str(status) for marker in _SETTLED_MARKERS)
    )


@app.get("/scanner/events")
async def scanner_sse(request: Request):
    """SSE stream for scanner progress updates.

    Sends **deltas**. The previous implementation re-serialized the entire
    `scanner_progress` dict and the full `scanner_results` list once per second,
    so a scan's bandwidth and JSON cost grew quadratically as results accumulated
    - it got heavier exactly as the scan progressed. Now each frame carries
    pre-computed counters plus only the rows added since the last frame, and
    nothing is sent at all when nothing changed.
    """
    async def event_generator():
        was_running = False
        ticks_waiting = 0
        quiet_ticks = 0
        sent_results = 0
        last_signature: Optional[tuple] = None

        while True:
            if await request.is_disconnected():
                break

            progress_snapshot = dict(scanner_progress)
            current_count = len(scanner_results)
            scanned = _count_settled(progress_snapshot)
            total = len(progress_snapshot)
            last_ticker = next(reversed(progress_snapshot), None) if progress_snapshot else None

            # Results were cleared underneath us (DELETE /scanner/results).
            reset = current_count < sent_results
            if reset:
                sent_results = 0

            signature = (scanner_running, scanned, total, current_count)
            has_new_results = current_count > sent_results

            if signature != last_signature or has_new_results or reset:
                payload: Dict[str, Any] = {
                    "type": "progress",
                    "running": scanner_running,
                    "scanned": scanned,
                    "total": total,
                    "found": current_count,
                    "ticker": last_ticker,
                }
                if reset:
                    payload["reset"] = True
                if has_new_results:
                    payload["results_append"] = list(scanner_results[sent_results:current_count])
                    sent_results = current_count

                try:
                    yield f"data: {json.dumps(payload, cls=_SafeEncoder)}\n\n"
                except Exception as _enc_err:
                    logger.warning(f"[SSE] Serialization error: {_enc_err}")
                    yield f"data: {json.dumps({'type': 'progress', 'running': scanner_running, 'scanned': scanned, 'total': total, 'found': current_count})}\n\n"

                last_signature = signature
                quiet_ticks = 0
            else:
                # Keepalive only while genuinely idle, to survive proxy timeouts.
                quiet_ticks += 1
                if quiet_ticks >= 15:
                    yield ": keepalive\n\n"
                    quiet_ticks = 0

            if scanner_running:
                was_running = True

            # Close when the scan finished, or after 30s if it never started.
            if not scanner_running and (was_running or ticks_waiting >= 30):
                final: Dict[str, Any] = {
                    "type": "done",
                    "running": False,
                    "scanned": scanned,
                    "total": total,
                    "found": current_count,
                }
                if current_count > sent_results:
                    final["results_append"] = list(scanner_results[sent_results:current_count])
                try:
                    yield f"data: {json.dumps(final, cls=_SafeEncoder)}\n\n"
                except Exception:
                    yield f"data: {json.dumps({'type': 'done', 'running': False, 'found': current_count})}\n\n"
                break

            if not scanner_running:
                ticks_waiting += 1

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/scanner/results")
async def get_scanner_results(
    universe: Optional[str] = Query(None, description="Filter hits to an index universe"),
    live_prices: bool = Query(False, description="Overlay near-real-time quotes"),
):
    """Get all scanner results, optionally filtered by universe."""
    results = list(scanner_results)
    universe_key = (universe or "").lower().strip()
    if universe_key and universe_key not in ("all", "*", ""):
        allowed = {s.upper() for s in _symbols_for_universe(universe_key)}
        results = [r for r in results if str(r.get("symbol", "")).upper() in allowed]

    if live_prices and results:
        symbols = [r.get("symbol") for r in results if r.get("symbol")][:200]
        try:
            quotes = await asyncio.wait_for(
                quotes_service.get_quotes(symbols),
                timeout=6.0,
            )
            refreshed = []
            for r in results:
                sym = r.get("symbol")
                q = quotes.get(sym) if sym else None
                row = quotes_service.apply_to_scanner_row(dict(r), q)
                if q and q.price > 0 and isinstance(r, dict):
                    r["current_price"] = q.price
                    r["price_as_of"] = q.as_of
                    r["price_change_pct"] = q.change_pct
                    r["price_live"] = True
                refreshed.append(row)
            results = refreshed
        except asyncio.TimeoutError:
            logger.warning("[Scanner] live price overlay timed out — serving cached prices")
        except Exception as exc:
            logger.warning(f"[Scanner] live price overlay failed: {exc}")

    return {
        "running": scanner_running,
        "total_scanned": len(scanner_progress),
        "matches_found": len(results),
        "results": results,
        "meta": scanner_last_meta,
        "prices_live": bool(live_prices),
        "data_source": scanner_last_meta.get("data_source") or "yahoo_finance",
        "universe": universe_key or "all",
    }


@app.get("/scanner/stock/{ticker}/patterns")
async def get_stock_patterns(ticker: str, timeframe: str = "1y"):
    """
    Get detected patterns + OHLC data for a specific stock.
    Used by the stock detail page for pattern overlay on charts.
    """
    ticker = ticker.upper()
    try:
        result = await scanner_service.scan_single_stock_patterns(ticker, timeframe)
        return result
    except Exception as e:
        logger.error(f"[Scanner] Pattern detection error for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/scanner/results")
async def clear_scanner_results():
    """Clear scanner results and reset any stuck running state."""
    global scanner_running
    scanner_progress.clear()
    scanner_results.clear()
    scanner_last_meta.clear()
    scanner_running = False
    # Remove persisted file
    try:
        if _SCANNER_PERSIST_PATH.exists():
            _SCANNER_PERSIST_PATH.unlink()
    except Exception:
        pass
    return {"message": "Scanner results cleared and state reset."}


@app.post("/scanner/refresh")
async def refresh_scanner_prices():
    """
    Lightweight refresh: update only current_price for existing results
    via the shared quotes service — no OHLCV, no pattern re‑detection.
    """
    if not scanner_results:
        raise HTTPException(status_code=404, detail="No cached results to refresh")

    symbols = [r["symbol"] for r in scanner_results]
    logger.info(f"[Scanner] Refreshing prices for {len(symbols)} cached results…")

    try:
        quotes = await asyncio.wait_for(
            quotes_service.get_quotes(symbols),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Price refresh timed out")

    updated = 0
    for r in scanner_results:
        sym = r["symbol"]
        q = quotes.get(sym)
        if q and q.price > 0:
            r["current_price"] = q.price
            r["previous_close"] = q.previous_close
            r["price_change_pct"] = q.change_pct
            r["price_as_of"] = q.as_of
            r["price_live"] = True
            updated += 1

    scanner_last_meta["last_refresh"] = datetime.datetime.utcnow().isoformat()
    _save_scanner_results()  # persist updated prices

    logger.info(f"[Scanner] Refresh done: {updated}/{len(symbols)} prices updated")
    return {
        "updated": updated,
        "total": len(symbols),
        "results": scanner_results,
        "meta": scanner_last_meta,
    }


# ══════════════════════════════════════════════════════════════
# INTELLIGENCE ENDPOINTS — Market Pulse & Trends (Phase 7)
# ══════════════════════════════════════════════════════════════

@app.get("/intelligence/pulse")
async def get_market_pulse():
    """Get full market intelligence snapshot: hot sectors, trends, funding news."""
    try:
        pulse = await asyncio.wait_for(intelligence_service.get_market_pulse(), timeout=30.0)
        return {
            "timestamp": pulse.timestamp,
            "hot_sectors": pulse.hot_sectors,
            "trending_keywords": pulse.trending_keywords,
            "recent_funding_news": pulse.recent_funding_news,
            "sector_heat_map": pulse.sector_heat_map,
        }
    except asyncio.TimeoutError:
        logger.warning("[Intelligence] Market pulse timed out (>30s)")
        return {
            "timestamp": None,
            "hot_sectors": [],
            "trending_keywords": [],
            "recent_funding_news": [],
            "sector_heat_map": {},
            "error": "Intelligence timeout — Google Trends may be rate-limited. Try again later.",
        }
    except Exception as e:
        logger.error(f"[Intelligence] Error: {e}")
        return {
            "timestamp": None,
            "hot_sectors": [],
            "trending_keywords": [],
            "recent_funding_news": [],
            "sector_heat_map": {},
            "error": str(e),
        }


@app.get("/intelligence/sectors")
async def get_sector_heat():
    """Get sector heat map data."""
    try:
        sectors = await intelligence_service.get_sector_heat()
        return [
            {
                "sector": s.sector,
                "heat_score": s.heat_score,
                "trend_score": s.trend_score,
                "news_score": s.news_score,
                "top_keywords": s.top_keywords,
                "funding_activity": s.funding_activity,
            }
            for s in sectors
        ]
    except Exception as e:
        logger.error(f"[Intelligence] Sector heat error: {e}")
        return []


@app.get("/intelligence/trends")
async def get_trends(keywords: Optional[str] = None):
    """Get Google Trends data for specified or default keywords."""
    try:
        kw_list = keywords.split(",") if keywords else None
        trends = await intelligence_service.get_trending_keywords(kw_list)
        return [
            {
                "keyword": t.keyword,
                "interest_score": t.interest_score,
                "trend_direction": t.trend_direction,
                "related_sector": t.related_sector,
            }
            for t in trends
        ]
    except Exception as e:
        logger.error(f"[Intelligence] Trends error: {e}")
        return []


# ── Watchlist ─────────────────────────────────────────────────────────────────
_WATCHLIST_FILE = Path(__file__).parent.parent / ".tmp" / "watchlist.json"


def _load_watchlist() -> dict:
    try:
        if _WATCHLIST_FILE.exists():
            return json.loads(_WATCHLIST_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_watchlist(data: dict) -> None:
    _WATCHLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    _WATCHLIST_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


class WatchlistUpdateRequest(BaseModel):
    notes: Optional[str] = None
    target_price: Optional[float] = None


@app.get("/watchlist")
async def get_watchlist():
    """Return all watchlisted symbols and their metadata."""
    return {"items": list(_load_watchlist().values())}


@app.post("/watchlist/{symbol}")
async def add_to_watchlist(symbol: str, req: Optional[WatchlistUpdateRequest] = None):
    """Add a symbol to the watchlist."""
    wl = _load_watchlist()
    sym = symbol.upper().strip()
    if sym not in wl:
        wl[sym] = {
            "symbol": sym,
            "notes": req.notes if req else None,
            "target_price": req.target_price if req else None,
            "added_at": datetime.datetime.utcnow().isoformat(),
        }
    else:
        # Update fields if provided
        if req:
            if req.notes is not None:
                wl[sym]["notes"] = req.notes
            if req.target_price is not None:
                wl[sym]["target_price"] = req.target_price
    _save_watchlist(wl)
    return {"ok": True, "symbol": sym}


@app.delete("/watchlist/{symbol}")
async def remove_from_watchlist(symbol: str):
    """Remove a symbol from the watchlist."""
    wl = _load_watchlist()
    sym = symbol.upper().strip()
    wl.pop(sym, None)
    _save_watchlist(wl)
    return {"ok": True}


@app.patch("/watchlist/{symbol}")
async def update_watchlist_item(symbol: str, req: WatchlistUpdateRequest):
    """Update notes/target_price for a watchlisted stock."""
    wl = _load_watchlist()
    sym = symbol.upper().strip()
    if sym not in wl:
        raise HTTPException(status_code=404, detail="Symbol not in watchlist")
    if req.notes is not None:
        wl[sym]["notes"] = req.notes
    if req.target_price is not None:
        wl[sym]["target_price"] = req.target_price
    _save_watchlist(wl)
    return {"ok": True}


@app.get("/watchlist/snapshot")
async def get_watchlist_snapshot():
    """Return live price + Rule 1 summary for every watchlisted stock."""
    wl = _load_watchlist()
    if not wl:
        return {"items": []}

    quotes = await quotes_service.get_quotes(list(wl.keys()))
    results = []
    for sym, meta in wl.items():
        q = quotes.get(sym)
        if q and q.price > 0:
            results.append({
                **meta,
                "price": q.price,
                "change_pct": q.change_pct,
                "previous_close": q.previous_close,
                "price_as_of": q.as_of,
                "price_live": True,
                "error": False,
            })
        else:
            results.append({
                **meta,
                "price": None,
                "change_pct": None,
                "error": True,
            })
    return {"items": results}


# ── False negatives (mistaken DISQUALIFIED) ───────────────────
_FALSE_NEG_FILE = Path(__file__).parent.parent / ".tmp" / "false_negatives.json"

_FAILURE_LABELS_HE = {
    "big5_inconsistent": "צמיחה לא עקבית ב-Big 5",
    "debt_payback_high": "זמן החזר חוב ארוך",
    "above_mos": "מחיר מעל מרווח ביטחון",
    "signal_not_green": "אין איתות טכני ירוק",
    "incomplete_data": "נתונים חלקיים",
}


def _load_false_negatives() -> dict:
    try:
        if _FALSE_NEG_FILE.exists():
            return json.loads(_FALSE_NEG_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_false_negatives(data: dict) -> None:
    _FALSE_NEG_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _FALSE_NEG_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, cls=_SafeEncoder), encoding="utf-8")
    tmp.replace(_FALSE_NEG_FILE)


def _snapshot_analysis(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Compact freeze of the analysis that led to DISQUALIFIED."""
    big5_raw = analysis.get("big_5") or {}
    big5 = {}
    for k, v in big5_raw.items():
        if not isinstance(v, dict):
            continue
        big5[k] = {
            "consistent_growth": bool(v.get("consistent_growth")),
            "cagr_1y": v.get("cagr_1y"),
            "cagr_3y": v.get("cagr_3y"),
            "cagr_5y": v.get("cagr_5y"),
            "cagr_10y": v.get("cagr_10y"),
            "latest_value": v.get("latest_value"),
            "unit": v.get("unit"),
        }
    vd = analysis.get("verdict_details") or {}
    failures = list(analysis.get("verdict_failures") or [])
    if vd.get("incomplete_data") and not any(f.get("code") == "incomplete_data" for f in failures):
        failures.append({"code": "incomplete_data"})
    # Derive codes from checklist when the structured list is empty
    if not failures and vd:
        if vd.get("big5_pass") is False:
            failures.append({"code": "big5_inconsistent"})
        if vd.get("payback_ok") is False:
            failures.append({
                "code": "debt_payback_high",
                "years": analysis.get("payback_time"),
                "limit": 3,
            })
        if vd.get("undervalued") is False:
            failures.append({"code": "above_mos"})
        if vd.get("green_signal") is False:
            failures.append({"code": "signal_not_green"})
    enriched = []
    for f in failures:
        code = str(f.get("code") or "")
        enriched.append({**f, "code": code, "he": _FAILURE_LABELS_HE.get(code, code)})
    return {
        "verdict": analysis.get("verdict"),
        "verdict_primary": analysis.get("verdict_primary"),
        "verdict_reason": analysis.get("verdict_reason"),
        "verdict_failures": enriched,
        "verdict_details": vd,
        "price": analysis.get("price"),
        "mos_price": analysis.get("mos_price"),
        "sticker_price": analysis.get("sticker_price"),
        "payback_time": analysis.get("payback_time"),
        "big_5": big5,
        "technical_signal": (analysis.get("technical_analysis") or {}).get("signal"),
        "moat_score": (analysis.get("ai_analysis") or {}).get("moat_score"),
        "company_name": analysis.get("company_name"),
        "data_quality": analysis.get("data_quality"),
    }


def _failure_codes(snapshot: Dict[str, Any]) -> set:
    codes = {str(f.get("code")) for f in (snapshot.get("verdict_failures") or []) if f.get("code")}
    vd = snapshot.get("verdict_details") or {}
    if vd.get("big5_pass") is False:
        codes.add("big5_inconsistent")
    if vd.get("payback_ok") is False:
        codes.add("debt_payback_high")
    if vd.get("undervalued") is False:
        codes.add("above_mos")
    if vd.get("green_signal") is False:
        codes.add("signal_not_green")
    if vd.get("incomplete_data"):
        codes.add("incomplete_data")
    return codes


def _compare_false_negative(original: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    orig_codes = _failure_codes(original)
    curr_snap = _snapshot_analysis(current)
    curr_codes = _failure_codes(curr_snap)

    resolved = sorted(orig_codes - curr_codes)
    still = sorted(orig_codes & curr_codes)
    new = sorted(curr_codes - orig_codes)

    likely: List[Dict[str, Any]] = []
    # Price outcome vs original MOS
    op = original.get("price")
    cp = current.get("price")
    omos = original.get("mos_price")
    price_change_pct = None
    if isinstance(op, (int, float)) and isinstance(cp, (int, float)) and op:
        price_change_pct = round((cp - op) / op * 100, 2)
        if price_change_pct >= 20 and "above_mos" in orig_codes:
            likely.append({
                "code": "mos_was_too_strict_or_sticker_low",
                "he": "המחיר עלה משמעותית אחרי פסילה בגלל MOS — ייתכן שמחיר המדבקה/הצמיחה הוערכו בחסר.",
            })
        if price_change_pct <= -20 and original.get("verdict") == "DISQUALIFIED":
            likely.append({
                "code": "price_confirmed_weakness",
                "he": "המחיר ירד אחרי הפסילה — הפסילה עשויה הייתה מוצדקת מצד הסיכון.",
            })

    if "big5_inconsistent" in resolved:
        likely.append({
            "code": "big5_data_or_timing",
            "he": "Big 5 שנכשל אז עובר עכשיו — ייתכן נתונים חלקיים/פיצול, או שיפור אמיתי בדוחות.",
        })
    if "incomplete_data" in resolved:
        likely.append({
            "code": "data_gap_filled",
            "he": "אזהרת נתונים חלקיים נעלמה — הפסילה/ההורדה היו על בסיס פיד חסר.",
        })
    if "debt_payback_high" in resolved:
        likely.append({
            "code": "debt_or_fcf_misread",
            "he": "החזר החוב השתפר — ייתכן FCF/חוב שגויים בניתוח המקורי או שינוי מאזני.",
        })
    if current.get("verdict") in ("BUY", "WAIT", "WATCHLIST") and original.get("verdict") == "DISQUALIFIED":
        likely.append({
            "code": "reclassified_positive",
            "he": f"הפסיקה הנוכחית היא {current.get('verdict')} — האלגוריתם כבר לא פוסל את המניה.",
        })
    if not likely and still == sorted(orig_codes) and current.get("verdict") == "DISQUALIFIED":
        likely.append({
            "code": "still_disqualified",
            "he": "אותן כשלי ליבה עדיין קיימים בניתוח המחודש — אם לדעתך זו טעות, בדוק ידנית את מקורות הנתונים.",
        })

    return {
        "at": datetime.datetime.utcnow().isoformat(),
        "verdict": current.get("verdict"),
        "verdict_primary": current.get("verdict_primary"),
        "price": current.get("price"),
        "mos_price": current.get("mos_price"),
        "sticker_price": current.get("sticker_price"),
        "payback_time": current.get("payback_time"),
        "price_change_pct": price_change_pct,
        "failures_resolved": [{"code": c, "he": _FAILURE_LABELS_HE.get(c, c)} for c in resolved],
        "failures_still": [{"code": c, "he": _FAILURE_LABELS_HE.get(c, c)} for c in still],
        "failures_new": [{"code": c, "he": _FAILURE_LABELS_HE.get(c, c)} for c in new],
        "likely_mistakes": likely,
        "current_snapshot": curr_snap,
    }


class FalseNegativeRequest(BaseModel):
    notes: Optional[str] = None
    outcome: Optional[str] = None  # outperformed | reclassified | data_error | other


@app.get("/false-negatives")
async def list_false_negatives():
    """Stocks the user flagged as mistakenly DISQUALIFIED."""
    items = sorted(_load_false_negatives().values(), key=lambda x: x.get("noted_at") or "", reverse=True)
    return {"items": items}


@app.post("/false-negatives/{symbol}")
async def add_false_negative(symbol: str, req: Optional[FalseNegativeRequest] = None):
    """
    Flag a stock as a false-negative DISQUALIFIED case.
    Snapshots the current library/scan analysis so later rechecks can diff.
    """
    sym = normalize_yahoo_symbol(symbol.upper().strip()) or symbol.upper().strip()
    analysis = scan_results.get(sym) or library_results.get(sym)
    if not analysis:
        # On-demand fetch so marking from a live analysis still works
        try:
            raw = await data_service.fetch_ticker_data(sym)
            if raw.get("history") is not None and not raw["history"].empty:
                analysis = await _analyze_ticker(sym, raw, include_ai=False)
                scan_results[sym] = analysis
        except Exception as e:
            logger.warning(f"[FalseNeg] Could not analyse {sym}: {e}")

    if not analysis:
        raise HTTPException(status_code=404, detail=f"No analysis available for {sym}")

    store = _load_false_negatives()
    existing = store.get(sym) or {}
    store[sym] = {
        "symbol": sym,
        "company_name": analysis.get("company_name") or existing.get("company_name"),
        "noted_at": existing.get("noted_at") or datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
        "notes": (req.notes if req and req.notes is not None else existing.get("notes")),
        "outcome": (req.outcome if req and req.outcome is not None else existing.get("outcome")),
        "original": _snapshot_analysis(analysis),
        "last_recheck": existing.get("last_recheck"),
    }
    _save_false_negatives(store)
    return {"ok": True, "item": store[sym]}


@app.patch("/false-negatives/{symbol}")
async def update_false_negative(symbol: str, req: FalseNegativeRequest):
    store = _load_false_negatives()
    sym = normalize_yahoo_symbol(symbol.upper().strip()) or symbol.upper().strip()
    if sym not in store:
        raise HTTPException(status_code=404, detail="Not in false-negatives list")
    if req.notes is not None:
        store[sym]["notes"] = req.notes
    if req.outcome is not None:
        store[sym]["outcome"] = req.outcome
    store[sym]["updated_at"] = datetime.datetime.utcnow().isoformat()
    _save_false_negatives(store)
    return {"ok": True, "item": store[sym]}


@app.delete("/false-negatives/{symbol}")
async def remove_false_negative(symbol: str):
    store = _load_false_negatives()
    sym = normalize_yahoo_symbol(symbol.upper().strip()) or symbol.upper().strip()
    store.pop(sym, None)
    _save_false_negatives(store)
    return {"ok": True}


@app.post("/false-negatives/{symbol}/recheck")
async def recheck_false_negative(symbol: str):
    """
    Re-run analysis and explain what changed vs the frozen DISQUALIFIED snapshot.
    Surfaces which failure codes cleared — the likely 'mistake' surface.
    """
    store = _load_false_negatives()
    sym = normalize_yahoo_symbol(symbol.upper().strip()) or symbol.upper().strip()
    if sym not in store:
        raise HTTPException(status_code=404, detail="Not in false-negatives list")

    original = store[sym].get("original") or {}
    raw = await data_service.fetch_ticker_data(sym)
    if raw.get("history") is None or raw["history"].empty:
        raise HTTPException(status_code=404, detail=f"No market data for {sym}")

    current = await _analyze_ticker(sym, raw, include_ai=False)
    scan_results[sym] = current
    comparison = _compare_false_negative(original, current)
    store[sym]["last_recheck"] = comparison
    store[sym]["updated_at"] = datetime.datetime.utcnow().isoformat()
    _save_false_negatives(store)
    return {"ok": True, "item": store[sym], "comparison": comparison}


# ── Portfolio ─────────────────────────────────────────────────────────────────
_PORTFOLIO_FILE = Path(__file__).parent.parent / ".tmp" / "portfolio.json"


def _load_portfolio() -> list:
    try:
        if _PORTFOLIO_FILE.exists():
            return json.loads(_PORTFOLIO_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _save_portfolio(data: list) -> None:
    _PORTFOLIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PORTFOLIO_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


class PortfolioHoldingRequest(BaseModel):
    symbol: str
    shares: float
    avg_cost: float
    notes: Optional[str] = None


class PortfolioUpdateRequest(BaseModel):
    shares: Optional[float] = None
    avg_cost: Optional[float] = None
    notes: Optional[str] = None


@app.get("/portfolio")
async def get_portfolio():
    """Return portfolio holdings."""
    return {"holdings": _load_portfolio()}


@app.post("/portfolio")
async def add_holding(req: PortfolioHoldingRequest):
    """Add or update a portfolio holding."""
    holdings = _load_portfolio()
    sym = req.symbol.upper().strip()
    existing = next((h for h in holdings if h["symbol"] == sym), None)
    if existing:
        # Weighted-average cost calculation
        total_shares = existing["shares"] + req.shares
        existing["avg_cost"] = (
            (existing["shares"] * existing["avg_cost"] + req.shares * req.avg_cost) / total_shares
        )
        existing["shares"] = total_shares
        if req.notes is not None:
            existing["notes"] = req.notes
    else:
        holdings.append({
            "id": f"{sym}_{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "symbol": sym,
            "shares": req.shares,
            "avg_cost": req.avg_cost,
            "notes": req.notes,
            "added_at": datetime.datetime.utcnow().isoformat(),
        })
    _save_portfolio(holdings)
    return {"ok": True}


@app.delete("/portfolio/{symbol}")
async def remove_holding(symbol: str):
    """Remove a holding entirely."""
    holdings = [h for h in _load_portfolio() if h["symbol"] != symbol.upper().strip()]
    _save_portfolio(holdings)
    return {"ok": True}


@app.patch("/portfolio/{symbol}")
async def update_holding(symbol: str, req: PortfolioUpdateRequest):
    """Partially update shares/avg_cost/notes for a holding."""
    holdings = _load_portfolio()
    sym = symbol.upper().strip()
    for h in holdings:
        if h["symbol"] == sym:
            if req.shares is not None:
                h["shares"] = req.shares
            if req.avg_cost is not None:
                h["avg_cost"] = req.avg_cost
            if req.notes is not None:
                h["notes"] = req.notes
            break
    _save_portfolio(holdings)
    return {"ok": True}


@app.get("/portfolio/snapshot")
async def get_portfolio_snapshot():
    """Holdings enriched with live prices, P&L and Rule 1 verdict."""
    holdings = _load_portfolio()
    if not holdings:
        return {"holdings": [], "summary": {"total_value": 0, "total_cost": 0, "total_gain": 0, "total_gain_pct": 0}}

    quotes = await quotes_service.get_quotes([h["symbol"] for h in holdings])
    enriched = []
    for h in holdings:
        sym = h["symbol"]
        shares = h["shares"]
        avg_cost = h["avg_cost"]
        cost = avg_cost * shares
        q = quotes.get(sym)
        verdict = library_results.get(sym, {}).get("verdict") if library_results else None
        if q and q.price > 0:
            price = q.price
            value = price * shares
            gain = value - cost
            gain_pct = (gain / cost * 100) if cost else 0
            enriched.append({
                **h,
                "price": round(price, 2),
                "change_pct": q.change_pct,
                "previous_close": q.previous_close,
                "price_as_of": q.as_of,
                "price_live": True,
                "value": round(value, 2),
                "cost": round(cost, 2),
                "gain": round(gain, 2),
                "gain_pct": round(gain_pct, 2),
                "verdict": verdict,
                "error": False,
            })
        else:
            enriched.append({
                **h,
                "price": None,
                "change_pct": None,
                "value": None,
                "cost": round(cost, 2),
                "gain": None,
                "gain_pct": None,
                "verdict": verdict,
                "error": True,
            })

    total_value = sum(h["value"] or 0 for h in enriched)
    total_cost  = sum(h["cost"]  or 0 for h in enriched)
    total_gain  = total_value - total_cost
    total_gain_pct = (total_gain / total_cost * 100) if total_cost else 0

    return {
        "holdings": enriched,
        "summary": {
            "total_value":    round(total_value, 2),
            "total_cost":     round(total_cost, 2),
            "total_gain":     round(total_gain, 2),
            "total_gain_pct": round(total_gain_pct, 2),
        },
    }


# ── Price Alerts ──────────────────────────────────────────────────────────────
_ALERTS_FILE = Path(__file__).parent.parent / ".tmp" / "price_alerts.json"


def _load_alerts() -> list:
    try:
        if _ALERTS_FILE.exists():
            return json.loads(_ALERTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _save_alerts(data: list) -> None:
    _ALERTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _ALERTS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


class AlertRequest(BaseModel):
    symbol: str
    alert_type: str   # "price_below" | "at_mos" | "at_sticker" | "pattern"
    threshold: Optional[float] = None   # required for price_below


@app.get("/alerts")
async def get_alerts():
    return {"alerts": _load_alerts()}


@app.post("/alerts")
async def create_alert(req: AlertRequest):
    alerts = _load_alerts()
    sym = req.symbol.upper().strip()
    # Deduplicate by symbol+type
    alerts = [a for a in alerts if not (a["symbol"] == sym and a["alert_type"] == req.alert_type)]
    alerts.append({
        "id": f"{sym}_{req.alert_type}_{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "symbol": sym,
        "alert_type": req.alert_type,
        "threshold": req.threshold,
        "fired": False,
        "created_at": datetime.datetime.utcnow().isoformat(),
    })
    _save_alerts(alerts)
    return {"ok": True}


@app.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    alerts = [a for a in _load_alerts() if a["id"] != alert_id]
    _save_alerts(alerts)
    return {"ok": True}


@app.get("/alerts/check")
async def check_alerts():
    """Check all active alerts against current prices. Returns fired alerts."""
    alerts = _load_alerts()
    active = [a for a in alerts if not a.get("fired")]
    if not active:
        return {"fired": []}

    symbols = list({a["symbol"] for a in active})
    quotes = await quotes_service.get_quotes(symbols)
    prices = {sym: (q.price if q else 0) for sym, q in quotes.items()}

    fired_list = []
    updated = []
    for a in alerts:
        if a.get("fired"):
            updated.append(a)
            continue
        sym = a["symbol"]
        price = prices.get(sym, 0) or 0
        triggered = False
        if a["alert_type"] == "price_below" and a.get("threshold") and price > 0:
            triggered = price <= a["threshold"]
        elif a["alert_type"] == "at_mos":
            # Pull mos from library cache
            mos = (library_results.get(sym) or {}).get("mos_price")
            if mos and price > 0:
                triggered = price <= mos
        elif a["alert_type"] == "at_sticker":
            sticker = (library_results.get(sym) or {}).get("sticker_price")
            if sticker and price > 0:
                triggered = price <= sticker

        if triggered:
            a = {**a, "fired": True, "fired_at": datetime.datetime.utcnow().isoformat(), "fired_price": price}
            fired_list.append(a)
        updated.append(a)

    _save_alerts(updated)
    return {"fired": fired_list}


# ── MARKET INDICES ──────────────────────────────────────────

_indices_cache: Dict[str, Any] = {"expires": 0.0, "payload": None}
_INDICES_TTL = float(os.getenv("MARKET_INDICES_TTL", "15"))


@app.get("/market/indices")
async def get_market_indices():
    """Live data for major market indices + crypto (cached ~15s)."""
    now = time.monotonic()
    cached = _indices_cache.get("payload")
    if cached is not None and now < float(_indices_cache.get("expires") or 0):
        return cached

    INDICES = {
        "SP500":   {"symbol": "^GSPC",  "label": "S&P 500"},
        "NASDAQ":  {"symbol": "^IXIC",  "label": "Nasdaq"},
        "DOW":     {"symbol": "^DJI",   "label": "Dow Jones"},
        "RUT":     {"symbol": "^RUT",   "label": "Russell 2000"},
        "BTC":     {"symbol": "BTC-USD","label": "Bitcoin"},
        "GLD":     {"symbol": "GLD",    "label": "Gold ETF"},
        "VIX":     {"symbol": "^VIX",   "label": "VIX"},
    }

    symbol_list = [v["symbol"] for v in INDICES.values()]
    quotes = await quotes_service.get_quotes(symbol_list)

    results = {}
    for key, meta in INDICES.items():
        q = quotes.get(meta["symbol"])
        if q and q.price:
            results[key] = {
                "label": meta["label"],
                "price": round(q.price, 2),
                "change_pct": q.change_pct,
                "prev_close": round(q.previous_close, 2) if q.previous_close else None,
                "as_of": q.as_of,
            }
        else:
            results[key] = {
                "label": meta["label"],
                "price": None,
                "change_pct": None,
                "error": "quote unavailable",
            }

    _indices_cache["payload"] = results
    _indices_cache["expires"] = now + _INDICES_TTL
    return results


# ── AI STOCK CHAT ──────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = []


@app.post("/stock/{ticker}/chat")
async def stock_chat(ticker: str, req: ChatRequest):
    """Chat with AI about a specific stock using its cached analysis context."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    # Build context from cache
    stock_data = (await cache_service.get_analysis(ticker)) or library_results.get(ticker.upper())
    ctx_parts = [f"Symbol: {ticker.upper()}"]

    if stock_data:
        price      = stock_data.get("price", "N/A")
        verdict    = stock_data.get("verdict", "N/A")
        sticker    = stock_data.get("sticker_price", "N/A")
        mos        = stock_data.get("mos_price", "N/A")
        payback    = stock_data.get("payback_time", "N/A")
        ai         = stock_data.get("ai_analysis", {})
        moat_score = ai.get("moat_score", "N/A")
        moat_type  = ai.get("moat_type", "N/A")
        moat_desc  = ai.get("moat_description", "")
        ta         = stock_data.get("technical_analysis", {})
        signal     = ta.get("signal", "N/A")
        md         = stock_data.get("market_data", {})
        company    = stock_data.get("company_name", ticker.upper())

        ctx_parts += [
            f"Company: {company}",
            f"Current Price: ${price}",
            f"Rule #1 Verdict: {verdict}",
            f"Sticker Price: ${sticker}",
            f"MOS Price: ${mos}",
            f"Moat Score: {moat_score}/10 ({moat_type})",
            f"Moat Description: {moat_desc}",
            f"Technical Signal: {signal}",
            f"Debt Payback Time: {payback} years",
            f"P/E Ratio: {md.get('pe_ratio', 'N/A')}",
            f"Market Cap: {md.get('market_cap', 'N/A')}",
            f"Sector: {md.get('sector', 'N/A')}",
        ]

        big5 = stock_data.get("big_5", {})
        for metric, val in big5.items():
            if isinstance(val, dict):
                growth = val.get("growth_rate_10y")
                consistent = val.get("consistent_growth")
                if growth is not None:
                    ctx_parts.append(f"Big5 {metric}: {round(growth*100,1)}% growth, {'✓' if consistent else '✗'}")

    system_prompt = f"""You are a Rule #1 investing assistant specialized in Phil Town's methodology.
You are analyzing the stock {ticker.upper()} for the user.

Stock data context:
{chr(10).join(ctx_parts)}

Guidelines:
- Answer in Hebrew (עברית) unless user writes in English
- Be concise, factual, and focused on Rule #1 investing principles
- Reference Big 5, Moat, MOS, Sticker Price, Three Tools when relevant
- Do NOT give financial advice; present analysis objectively
- Keep answers under 200 words unless asked for detail
"""

    # Build Gemini conversation
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system_prompt,
        )

        # Build history
        history = []
        for msg in (req.history or []):
            role = "user" if msg.get("role") == "user" else "model"
            history.append({"role": role, "parts": [msg.get("content", "")]})

        chat = model.start_chat(history=history)
        response = await asyncio.to_thread(chat.send_message, req.message)
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
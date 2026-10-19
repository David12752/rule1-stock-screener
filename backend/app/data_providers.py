"""
Hybrid market-data providers.

Routing policy:
  - scan / bulk OHLCV  -> Yahoo (fast, free)
  - deep fundamentals  -> EODHD when EODHD_API_KEY is set, else Yahoo
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional, Protocol

import pandas as pd
import requests

from app.core.instrumentation import TimingReport
from app.symbol_utils import normalize_yahoo_symbol

logger = logging.getLogger(__name__)

# Rule #1 analyses 10 fiscal years; 12 gives headroom for partial first years.
HISTORY_PERIOD = os.getenv("YAHOO_HISTORY_PERIOD", "12y")


def _splits_from_history(history_df: Any) -> Optional[pd.Series]:
    """Extract split events from a history frame, avoiding a second request.

    ``Ticker.history`` returns actions by default, so the frame already carries a
    "Stock Splits" column and the separate ``Ticker.splits`` call (measured
    0.56-1.03s) is redundant.

    This yields only splits inside the history window, where ``Ticker.splits``
    returns all-time events. That is sufficient: ``apply_split_adjustment`` only
    applies a split dated *after* a given financial-statement date, and the
    statements never predate the history window.

    Returns None when the column is unavailable, so the caller can fall back.
    """
    if history_df is None or getattr(history_df, "empty", True):
        return None
    if "Stock Splits" not in getattr(history_df, "columns", []):
        return None
    try:
        column = history_df["Stock Splits"]
        return column[column != 0].astype(float)
    except Exception:
        return None


class MarketDataProvider(Protocol):
    name: str

    def fetch_ticker_bundle(self, ticker: str) -> Dict[str, Any]:
        """Return history/financials/balance/cashflow/splits/info shaped like DataService."""
        ...


class YahooProvider:
    name = "yahoo"

    def fetch_ticker_bundle(self, ticker: str) -> Dict[str, Any]:
        import yfinance as yf

        symbol = normalize_yahoo_symbol(ticker) or ticker
        stock = yf.Ticker(symbol)

        # Each of these is its own HTTP round-trip to Yahoo.
        report = TimingReport(f"yahoo:{symbol}")
        with report.step("history"):
            # "max" was the slowest call in the bundle (measured up to 2.3s).
            # Rule #1 needs 10 fiscal years and the technicals need ~250 bars,
            # so 12y covers both with a smaller payload.
            history_df = stock.history(period=HISTORY_PERIOD)
        with report.step("financials"):
            financials = stock.financials
        with report.step("balance_sheet"):
            balance_sheet = stock.balance_sheet
        with report.step("cashflow"):
            cashflow = stock.cashflow
        splits = _splits_from_history(history_df)
        if splits is None:
            with report.step("splits"):
                splits = stock.splits
        with report.step("info"):
            info = stock.info or {}
        report.log()

        years_count = financials.shape[1] if not financials.empty else 0
        return {
            "symbol": symbol,
            "history": history_df,
            "financials": financials,
            "balance_sheet": balance_sheet,
            "cashflow": cashflow,
            "splits": splits,
            "info": info,
            "years_count": years_count,
            "is_complete": years_count >= 3,
            "provider": self.name,
        }


class EODHDProvider:
    """
    EODHD fundamentals + EOD prices for deep Rule #1 analysis.
    Requires EODHD_API_KEY. Maps Yahoo-style tickers to EODHD codes best-effort.
    """

    name = "eodhd"
    BASE = "https://eodhd.com/api"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _to_eodhd_symbol(self, ticker: str) -> str:
        sym = normalize_yahoo_symbol(ticker) or ticker
        if "." not in sym:
            return f"{sym}.US"
        root, suffix = sym.rsplit(".", 1)
        mapping = {
            "L": "LSE",
            "DE": "XETRA",
            "PA": "PA",
            "AS": "AS",
            "SW": "SW",
            "TO": "TO",
            "AX": "AU",
            "T": "TSE",
            "HK": "HK",
            "MC": "MC",
        }
        exchange = mapping.get(suffix.upper(), suffix.upper())
        return f"{root}.{exchange}"

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        q = {"api_token": self.api_key, "fmt": "json"}
        if params:
            q.update(params)
        url = f"{self.BASE}/{path}"
        resp = requests.get(url, params=q, timeout=45)
        resp.raise_for_status()
        return resp.json()

    def fetch_ticker_bundle(self, ticker: str) -> Dict[str, Any]:
        eod_sym = self._to_eodhd_symbol(ticker)
        # Prices
        try:
            eod = self._get(f"eod/{eod_sym}", {"period": "d", "order": "a"})
        except Exception as exc:
            logger.warning(f"[EODHD] price fetch failed for {eod_sym}: {exc}")
            eod = []

        if isinstance(eod, list) and eod:
            history = pd.DataFrame(eod)
            history["Date"] = pd.to_datetime(history["date"])
            history = history.set_index("Date")
            history = history.rename(
                columns={
                    "open": "Open",
                    "high": "High",
                    "low": "Low",
                    "close": "Close",
                    "adjusted_close": "Adj Close",
                    "volume": "Volume",
                }
            )
        else:
            history = pd.DataFrame()

        # Fundamentals
        fundamentals: dict = {}
        try:
            fundamentals = self._get(f"fundamentals/{eod_sym}") or {}
        except Exception as exc:
            logger.warning(f"[EODHD] fundamentals failed for {eod_sym}: {exc}")

        financials, balance_sheet, cashflow, years_count = self._statements_to_frames(fundamentals)
        info = self._fundamentals_to_info(fundamentals, eod_sym)

        return {
            "symbol": normalize_yahoo_symbol(ticker) or ticker,
            "history": history,
            "financials": financials,
            "balance_sheet": balance_sheet,
            "cashflow": cashflow,
            "splits": pd.Series(dtype=float),
            "info": info,
            "years_count": years_count,
            "is_complete": years_count >= 5,
            "provider": self.name,
            "eodhd_symbol": eod_sym,
        }

    def _statements_to_frames(self, fundamentals: dict):
        """Best-effort conversion of EODHD Financials JSON into yfinance-like annual frames."""
        fin = (fundamentals or {}).get("Financials") or {}
        income = (fin.get("Income_Statement") or {}).get("yearly") or {}
        balance = (fin.get("Balance_Sheet") or {}).get("yearly") or {}
        cash = (fin.get("Cash_Flow") or {}).get("yearly") or {}

        def _frame(yearly: dict, field_map: dict) -> pd.DataFrame:
            if not yearly:
                return pd.DataFrame()
            cols = {}
            for date_key, row in yearly.items():
                series = {}
                for src, dst in field_map.items():
                    val = row.get(src)
                    try:
                        series[dst] = float(val) if val not in (None, "", "None") else None
                    except (TypeError, ValueError):
                        series[dst] = None
                cols[pd.Timestamp(date_key)] = series
            if not cols:
                return pd.DataFrame()
            df = pd.DataFrame(cols)
            # yfinance: rows=metric, columns=period dates (newest first)
            return df.reindex(sorted(df.columns, reverse=True), axis=1)

        income_map = {
            "totalRevenue": "Total Revenue",
            "netIncome": "Net Income",
            "ebit": "EBIT",
            "grossProfit": "Gross Profit",
        }
        # EPS often under Highlights / Valuation — filled later in info
        balance_map = {
            "totalStockholderEquity": "Stockholders Equity",
            "totalDebt": "Total Debt",
            "shortLongTermDebtTotal": "Total Debt",
            "commonStockSharesOutstanding": "Ordinary Shares Number",
            "cash": "Cash And Cash Equivalents",
        }
        cash_map = {
            "totalCashFromOperatingActivities": "Operating Cash Flow",
            "capitalExpenditures": "Capital Expenditure",
            "freeCashFlow": "Free Cash Flow",
        }

        financials = _frame(income, income_map)
        balance_sheet = _frame(balance, balance_map)
        cashflow = _frame(cash, cash_map)

        # Synthesize Free Cash Flow if missing
        if not cashflow.empty and "Free Cash Flow" not in cashflow.index:
            if "Operating Cash Flow" in cashflow.index and "Capital Expenditure" in cashflow.index:
                cashflow.loc["Free Cash Flow"] = (
                    cashflow.loc["Operating Cash Flow"] - cashflow.loc["Capital Expenditure"].abs()
                )

        years_count = max(
            financials.shape[1] if not financials.empty else 0,
            balance_sheet.shape[1] if not balance_sheet.empty else 0,
            cashflow.shape[1] if not cashflow.empty else 0,
        )
        return financials, balance_sheet, cashflow, years_count

    def _fundamentals_to_info(self, fundamentals: dict, eod_sym: str) -> dict:
        general = (fundamentals or {}).get("General") or {}
        highlights = (fundamentals or {}).get("Highlights") or {}
        valuation = (fundamentals or {}).get("Valuation") or {}
        shares = (fundamentals or {}).get("SharesStats") or {}

        def g(*keys):
            for src in (highlights, valuation, shares, general):
                for k in keys:
                    if src.get(k) not in (None, "", "None"):
                        return src.get(k)
            return None

        return {
            "longName": general.get("Name") or eod_sym,
            "shortName": general.get("Name") or eod_sym,
            "sector": general.get("Sector"),
            "industry": general.get("Industry"),
            "longBusinessSummary": general.get("Description") or "",
            "currency": general.get("CurrencyCode"),
            "exchange": general.get("Exchange"),
            "marketCap": g("MarketCapitalization"),
            "trailingPE": g("PERatio"),
            "forwardPE": g("PERatio"),
            "priceToBook": g("PriceBookMRQ"),
            "earningsGrowth": None,
            "trailingEps": g("EarningsShare"),
            "forwardEps": g("EarningsShare"),
            "returnOnEquity": g("ReturnOnEquityTTM"),
            "returnOnAssets": g("ReturnOnAssetsTTM"),
            "debtToEquity": None,
            "beta": g("Beta"),
            "dividendYield": g("DividendYield"),
            "sharesOutstanding": g("SharesOutstanding"),
            "fiftyTwoWeekHigh": g("52WeekHigh"),
            "fiftyTwoWeekLow": g("52WeekLow"),
            "recommendationKey": None,
            "targetMeanPrice": None,
        }


class HybridDataRouter:
    """
    Yahoo for scan speed; EODHD for deep analysis when keyed.
    depth: 'scan' | 'deep'
    """

    def __init__(self):
        self.yahoo = YahooProvider()
        key = os.getenv("EODHD_API_KEY", "").strip()
        self.eodhd: Optional[EODHDProvider] = EODHDProvider(key) if key else None
        if self.eodhd:
            logger.info("[DataRouter] EODHD enabled for deep fundamentals")
        else:
            logger.info("[DataRouter] EODHD not configured — deep analysis uses Yahoo")

    @property
    def deep_provider_name(self) -> str:
        return self.eodhd.name if self.eodhd else self.yahoo.name

    def fetch_ticker_bundle(self, ticker: str, depth: str = "deep") -> Dict[str, Any]:
        use_deep = depth == "deep" and self.eodhd is not None
        provider: MarketDataProvider = self.eodhd if use_deep else self.yahoo
        try:
            data = provider.fetch_ticker_bundle(ticker)
            # If deep provider returns empty history, fall back to Yahoo for prices
            if use_deep and (data.get("history") is None or getattr(data["history"], "empty", True)):
                logger.warning(f"[DataRouter] EODHD empty history for {ticker}; merging Yahoo prices")
                yahoo_data = self.yahoo.fetch_ticker_bundle(ticker)
                data["history"] = yahoo_data.get("history", data.get("history"))
                if not data.get("info"):
                    data["info"] = yahoo_data.get("info", {})
                data["provider"] = f"{provider.name}+yahoo_prices"
            return data
        except Exception as exc:
            if use_deep:
                logger.warning(f"[DataRouter] EODHD failed for {ticker} ({exc}); falling back to Yahoo")
                return self.yahoo.fetch_ticker_bundle(ticker)
            raise

#!/usr/bin/env python3
"""
Build a local JSON index of stocks from multiple indices (Wikipedia + curated).
Output: backend/.tmp/stock_index.json

Supported universes:
  US:        sp500, nasdaq100, sp400, dowjones
  Global:    ftse100, dax, cac40, tsx, asx200, nikkei225, hangseng,
             ibex35, aex, smi, kospi200, ftse_mib, omxs30
  Israel:    ta35, ta125

Usage:
    python build_stock_index.py                  # all universes (full rebuild)
    python build_stock_index.py sp500 ftse100    # merge/update those into existing index
"""

import json
import re
import sys
from pathlib import Path
from io import StringIO


# ── Wikipedia scrapers per universe ──────────────────────────

def _fetch_sp500(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    print(f"  Fetching S&P 500 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    df = pd.read_html(StringIO(resp.text))[0]
    records = []
    for _, row in df.iterrows():
        sym = str(row.get("Symbol", "")).strip().replace(".", "-")
        if not sym:
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get("Security", "")).strip(),
            "sector": str(row.get("GICS Sector", "")).strip(),
            "sub_industry": str(row.get("GICS Sub-Industry", "")).strip(),
            "universe": "sp500",
            "exchange": "NASDAQ/NYSE",
            "currency": "USD",
            "country": "US",
        })
    return records


def _fetch_nasdaq100(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    print(f"  Fetching NASDAQ-100 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols):
            df = t
            break
    if df is None:
        print("  WARNING: Could not find NASDAQ-100 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "security" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        sym = str(row.get(sym_col, "")).strip().replace(".", "-") if sym_col else ""
        if not sym or sym.lower() in ("nan", ""):
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "nasdaq100",
            "exchange": "NASDAQ",
            "currency": "USD",
            "country": "US",
        })
    return records


def _fetch_sp400(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies"
    print(f"  Fetching S&P 400 MidCap from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols):
            df = t
            break
    if df is None:
        print("  WARNING: Could not find S&P 400 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "security" in c or "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "gics sector" in c or "sector" in c), None)
    sub_col = next((c for c in df.columns if "sub-industry" in c or "sub_industry" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        sym = str(row.get(sym_col, "")).strip().replace(".", "-") if sym_col else ""
        if not sym or sym.lower() in ("nan", ""):
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": str(row.get(sub_col, "")).strip() if sub_col else "",
            "universe": "sp400",
            "exchange": "NASDAQ/NYSE",
            "currency": "USD",
            "country": "US",
        })
    return records


def _fetch_sp600(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies"
    print(f"  Fetching S&P 600 SmallCap from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols):
            df = t
            break
    if df is None:
        print("  WARNING: Could not find S&P 600 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "security" in c or "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "gics sector" in c or "sector" in c), None)
    sub_col = next((c for c in df.columns if "sub-industry" in c or "sub_industry" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        sym = str(row.get(sym_col, "")).strip().replace(".", "-") if sym_col else ""
        if not sym or sym.lower() in ("nan", ""):
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": str(row.get(sub_col, "")).strip() if sub_col else "",
            "universe": "sp600",
            "exchange": "NASDAQ/NYSE",
            "currency": "USD",
            "country": "US",
        })
    return records


def _fetch_dowjones(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"
    print(f"  Fetching Dow Jones 30 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("symbol" in c or "ticker" in c for c in cols):
            df = t
            break
    if df is None:
        print("  WARNING: Could not find Dow Jones table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "symbol" in c or "ticker" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    industry_col = next((c for c in df.columns if "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        sym = str(row.get(sym_col, "")).strip().replace(".", "-") if sym_col else ""
        if not sym or sym.lower() in ("nan", ""):
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(industry_col, "")).strip() if industry_col else "",
            "sub_industry": "",
            "universe": "dowjones",
            "exchange": "NYSE/NASDAQ",
            "currency": "USD",
            "country": "US",
        })
    return records


# ── Global exchange scrapers ──────────────────────────────────

def _fetch_ftse100(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/FTSE_100_Index"
    print("  Fetching FTSE 100 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("epic" in c or "ticker" in c or "symbol" in c for c in cols):
            df = t
            break
    if df is None:
        print("  WARNING: Could not find FTSE 100 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "epic" in c or "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c or "ftse" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".L" if not raw_sym.endswith(".L") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "ftse100",
            "exchange": "LSE",
            "currency": "GBP",
            "country": "UK",
        })
    return records


def _fetch_dax(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/DAX"
    print("  Fetching DAX from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) > 10:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find DAX table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".DE" if not raw_sym.endswith(".DE") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "dax",
            "exchange": "XETRA",
            "currency": "EUR",
            "country": "Germany",
        })
    return records


def _fetch_cac40(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/CAC_40"
    print("  Fetching CAC 40 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) >= 35:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find CAC 40 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".PA" if not raw_sym.endswith(".PA") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "cac40",
            "exchange": "Euronext Paris",
            "currency": "EUR",
            "country": "France",
        })
    return records


def _fetch_tsx(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/S%26P/TSX_60"
    print("  Fetching TSX 60 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) >= 40:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find TSX 60 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".TO" if not raw_sym.endswith(".TO") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "tsx",
            "exchange": "TSX",
            "currency": "CAD",
            "country": "Canada",
        })
    return records


def _fetch_asx200(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/S%26P/ASX_200"
    print("  Fetching ASX 200 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("code" in c or "ticker" in c or "symbol" in c for c in cols) and len(t) >= 50:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find ASX 200 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "code" in c or "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c or "gics" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".AX" if not raw_sym.endswith(".AX") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "asx200",
            "exchange": "ASX",
            "currency": "AUD",
            "country": "Australia",
        })
    return records


def _fetch_nikkei225(session, pd) -> list:
    """Nikkei constituents from official index site (Wikipedia dropped codes)."""
    url = "https://indexes.nikkei.co.jp/en/nkave/index/component?idx=nk225"
    print("  Fetching Nikkei 225 from indexes.nikkei.co.jp…")
    resp = session.get(url, timeout=60)
    resp.raise_for_status()
    html = resp.text
    structured = re.findall(
        r"(\d{4})\s*</a>\s*</td>\s*<td[^>]*>\s*([^<]{2,80})",
        html,
        flags=re.I | re.S,
    )
    records = []
    seen = set()
    for code, name in structured:
        if code in seen:
            continue
        seen.add(code)
        records.append({
            "symbol": f"{int(code)}.T",
            "name": re.sub(r"\s+", " ", name).strip(),
            "sector": "",
            "sub_industry": "",
            "universe": "nikkei225",
            "exchange": "TSE",
            "currency": "JPY",
            "country": "Japan",
        })
    if not records:
        print("  WARNING: Could not parse Nikkei 225 constituents")
    return records


def _normalize_hk_symbol(raw_sym: str) -> str:
    """Convert Wikipedia / SEHK codes to yfinance form, e.g. 5.HK."""
    s = str(raw_sym).replace("\xa0", " ").replace("\u200b", "").strip()
    s = re.sub(r"^(SEHK|HKEX|HK)\s*:\s*", "", s, flags=re.I).strip().replace(" ", "")
    m = re.search(r"(\d+)", s)
    if not m:
        return s + ".HK" if s and not s.upper().endswith(".HK") else s
    return f"{int(m.group(1)):04d}.HK"


def _fetch_hangseng(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/Hang_Seng_Index"
    print("  Fetching Hang Seng from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("code" in c or "ticker" in c or "stock" in c for c in cols) and len(t) >= 30:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find Hang Seng table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "code" in c or "ticker" in c or "stock" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c or "sub" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = _normalize_hk_symbol(raw_sym)
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "hangseng",
            "exchange": "HKEX",
            "currency": "HKD",
            "country": "Hong Kong",
        })
    return records


def _fetch_ibex35(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/IBEX_35"
    print("  Fetching IBEX 35 from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) >= 30:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find IBEX 35 table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".MC" if not raw_sym.endswith(".MC") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "ibex35",
            "exchange": "BME",
            "currency": "EUR",
            "country": "Spain",
        })
    return records


def _fetch_aex(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/AEX_index"
    print("  Fetching AEX from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) >= 20:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find AEX table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".AS" if not raw_sym.endswith(".AS") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "aex",
            "exchange": "Euronext Amsterdam",
            "currency": "EUR",
            "country": "Netherlands",
        })
    return records


def _fetch_smi(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/Swiss_Market_Index"
    print("  Fetching SMI (Switzerland) from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("ticker" in c or "symbol" in c for c in cols) and len(t) >= 15:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find SMI table")
        return []
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        if not raw_sym or raw_sym.lower() in ("nan", "", "-"):
            continue
        sym = raw_sym + ".SW" if not raw_sym.endswith(".SW") else raw_sym
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "smi",
            "exchange": "SIX",
            "currency": "CHF",
            "country": "Switzerland",
        })
    return records


def _normalize_ta_symbol(raw_sym: str) -> str:
    """Convert TASE ticker codes to yfinance form, e.g. TEVA -> TEVA.TA."""
    s = str(raw_sym).replace("\xa0", " ").replace("\u200b", "").strip()
    s = re.sub(r"^(TASE|TLV|TA)\s*:\s*", "", s, flags=re.I).strip().replace(" ", "")
    if not s or s.lower() in ("nan", "-", "—"):
        return ""
    if s.upper().endswith(".TA"):
        return s.upper() if s.endswith(".TA") else s[:-3] + ".TA"
    # Drop accidental exchange suffixes from other markets
    s = re.sub(r"\.(L|DE|PA|AS|SW|TO|AX|T|HK|MC)$", "", s, flags=re.I)
    return f"{s.upper()}.TA"


def _fetch_ta35(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/TA-35_Index"
    print("  Fetching TA-35 (Israel) from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        flat = [" ".join(str(c) for c in (col if isinstance(col, tuple) else (col,))).lower()
                for col in t.columns]
        if any("ticker" in c for c in flat) and len(t) >= 20:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find TA-35 table")
        return []
    # Flatten MultiIndex columns if present
    df = df.copy()
    df.columns = [
        " ".join(str(c) for c in (col if isinstance(col, tuple) else (col,))).strip().lower()
        for col in df.columns
    ]
    sym_col = next((c for c in df.columns if "ticker" in c or "symbol" in c), None)
    name_col = next((c for c in df.columns if "corporation" in c or "company" in c or "name" in c), None)
    sector_col = next((c for c in df.columns if "industry" in c or "sector" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        sym = _normalize_ta_symbol(raw_sym)
        if not sym:
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "ta35",
            "exchange": "TASE",
            "currency": "ILS",
            "country": "Israel",
        })
    return records


def _fetch_ta125(session, pd) -> list:
    url = "https://en.wikipedia.org/wiki/TA-125_Index"
    print("  Fetching TA-125 (Israel) from Wikipedia…")
    resp = session.get(url)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = None
    for t in tables:
        cols = [str(c).lower() for c in t.columns]
        if any("symbol" in c or "ticker" in c for c in cols) and len(t) >= 80:
            df = t
            break
    if df is None:
        print("  WARNING: Could not find TA-125 table")
        return []
    df = df.copy()
    df.columns = [str(c).lower() for c in df.columns]
    sym_col = next((c for c in df.columns if "symbol" in c or "ticker" in c), None)
    name_col = next((c for c in df.columns if "name" in c or "company" in c), None)
    sector_col = next((c for c in df.columns if "sector" in c or "industry" in c), None)
    records = []
    for _, row in df.iterrows():
        raw_sym = str(row.get(sym_col, "")).strip() if sym_col else ""
        sym = _normalize_ta_symbol(raw_sym)
        if not sym:
            continue
        records.append({
            "symbol": sym,
            "name": str(row.get(name_col, "")).strip() if name_col else sym,
            "sector": str(row.get(sector_col, "")).strip() if sector_col else "",
            "sub_industry": "",
            "universe": "ta125",
            "exchange": "TASE",
            "currency": "ILS",
            "country": "Israel",
        })
    return records


_FETCHERS = {
    "sp500":     _fetch_sp500,
    "nasdaq100": _fetch_nasdaq100,
    "sp400":     _fetch_sp400,
    "sp600":     _fetch_sp600,
    "dowjones":  _fetch_dowjones,
    "ftse100":   _fetch_ftse100,
    "dax":       _fetch_dax,
    "cac40":     _fetch_cac40,
    "tsx":       _fetch_tsx,
    "asx200":    _fetch_asx200,
    "nikkei225": _fetch_nikkei225,
    "hangseng":  _fetch_hangseng,
    "ibex35":    _fetch_ibex35,
    "aex":       _fetch_aex,
    "smi":       _fetch_smi,
    "ta35":      _fetch_ta35,
    "ta125":     _fetch_ta125,
}

_UNIVERSE_LABELS = {
    "sp500":     "S&P 500",
    "nasdaq100": "NASDAQ-100",
    "sp400":     "S&P 400 MidCap",
    "sp600":     "S&P 600 SmallCap",
    "dowjones":  "Dow Jones 30",
    "ftse100":   "FTSE 100 (UK)",
    "dax":       "DAX (Germany)",
    "cac40":     "CAC 40 (France)",
    "tsx":       "TSX 60 (Canada)",
    "asx200":    "ASX 200 (Australia)",
    "nikkei225": "Nikkei 225 (Japan)",
    "hangseng":  "Hang Seng (HK)",
    "ibex35":    "IBEX 35 (Spain)",
    "aex":       "AEX (Netherlands)",
    "smi":       "SMI (Switzerland)",
    "ta35":      "TA-35 (Israel)",
    "ta125":     "TA-125 (Israel)",
}


# ── Main builder ──────────────────────────────────────────────

def build_index(universes: list = None):
    import pandas as pd
    import requests

    project_root = Path(__file__).resolve().parent.parent.parent
    out_dir = project_root / "backend" / ".tmp"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "stock_index.json"

    partial = bool(universes)
    if not universes:
        universes = list(_FETCHERS.keys())

    session = requests.Session()
    session.headers.update({"User-Agent": "Rule1Screener/1.0"})

    seen: set = set()
    all_records: list = []

    # Selective updates merge into the existing index so we don't wipe other markets.
    if partial and out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding="utf-8"))
            rebuild = set(universes)
            for r in existing:
                primary = r.get("universe")
                extras = list(r.get("universe_extra") or [])
                if primary in rebuild:
                    continue
                extras = [u for u in extras if u not in rebuild]
                if extras:
                    r = {**r, "universe_extra": extras}
                elif "universe_extra" in r:
                    r = {k: v for k, v in r.items() if k != "universe_extra"}
                sym = r.get("symbol")
                if sym and sym not in seen:
                    seen.add(sym)
                    all_records.append(r)
            print(f"  Merging into existing index ({len(all_records)} kept)…")
        except Exception as e:
            print(f"  WARNING: could not load existing index for merge: {e}")

    for key in universes:
        if key not in _FETCHERS:
            print(f"  Unknown universe '{key}', skipping.")
            continue
        try:
            records = _FETCHERS[key](session, pd)
            added = 0
            for r in records:
                sym = r["symbol"]
                if sym and sym not in seen:
                    seen.add(sym)
                    all_records.append(r)
                    added += 1
                elif sym in seen:
                    for existing in all_records:
                        if existing["symbol"] == sym:
                            extras = existing.get("universe_extra", [])
                            if key not in extras and key != existing["universe"]:
                                extras.append(key)
                                existing["universe_extra"] = extras
                            break
            print(f"  {_UNIVERSE_LABELS[key]}: {added} new stocks added")
        except Exception as e:
            print(f"  ERROR fetching {key}: {e}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_records, f, indent=2, ensure_ascii=False)

    print(f"\nTotal: {len(all_records)} unique stocks written to {out_path}")
    from collections import Counter
    counts = Counter(r["universe"] for r in all_records)
    for u, c in sorted(counts.items()):
        print(f"  {_UNIVERSE_LABELS.get(u, u)}: {c} stocks")
    return all_records


if __name__ == "__main__":
    requested = sys.argv[1:] if len(sys.argv) > 1 else None
    build_index(requested)

---
name: stock-search
description: Stock search engine and screener library for Rule #1 investing. Use when users want to search stocks by company name (not just ticker symbol), browse a stock library, or scan the market for stocks matching Rule #1 criteria (Big 5 growth rates >10%, strong moat, margin of safety). Integrates real-time market data via yfinance and provides both search and automated screening functionality.
---

# Stock Search

Adds two capabilities to the Rule #1 Screener:

1. **Search Engine** - Search stocks by company name, sector, or keyword (not just ticker symbol)
2. **Stock Library / Screener** - Scan S&P 500 stocks and filter by Rule #1 criteria

## Architecture

### Backend (FastAPI endpoints)

| Endpoint | Method | Purpose |
|---|---|---|
| `/search?q=` | GET | Search stocks by name/ticker/sector |
| `/library` | GET | Get pre-screened stock library |
| `/library/scan` | POST | Trigger full S&P 500 scan |
| `/library/status` | GET | Get scan progress |

### Frontend (Next.js pages)

- Search bar with autocomplete in the navbar (always visible)
- `/library` page showing screened stocks grid with Rule #1 filters

## Implementation

### Step 1: Stock Search Index

Run `scripts/build_stock_index.py` to build a local JSON index of S&P 500 stocks from Wikipedia. The index maps company names, sectors, and tickers for fast search.

The index is stored at `backend/.tmp/stock_index.json` and refreshed weekly.

### Step 2: Backend Endpoints

Add to `backend/app/api.py`:

1. **`/search`** endpoint - Fuzzy-matches query against the stock index (name, ticker, sector). Returns top 10 matches with basic info.

2. **`/library`** endpoint - Returns cached screening results. Each entry includes: ticker, company name, sector, price, sticker price, MOS price, Big 5 pass/fail, moat score, signal.

3. **`/library/scan`** endpoint - Triggers background scan of all S&P 500 stocks. Uses existing `_analyze_ticker` pipeline. Progress tracked via SSE.

### Step 3: Frontend Components

1. **Search bar** - Debounced input in navbar, dropdown results with ticker + company name + sector. Click navigates to `/stock/[ticker]`.

2. **Library page** - Grid of StockCard components with filters:
   - Big 5 Pass (all metrics >10%)
   - Undervalued (price < sticker price)
   - Signal (Green/Red)
   - Sector filter

## Reference

- See `references/sp500_scraping.md` for index building details

---
name: rule1-gaps
description: Implementation plan to close all gaps between the Rule #1 Stock Screener specification and the current codebase. Use when the developer needs to bring the app to full spec compliance, including 10-year data fetching, stock split normalization, data validation, final verdict logic, Gemini Pro upgrade, and database/cache integration.
---

# Rule #1 Gaps - Implementation Plan

Closes every gap between the product specification and the current codebase.
Six phases, ordered by dependency and impact.

## Phase 1: API Key Setup (Manual - 5 min)

**Prerequisite for Phase 4. Do this first.**

1. Open https://aistudio.google.com/apikey
2. Click "Create API Key", select or create a Google Cloud project
3. Copy the key
4. Paste into `backend/.env`:
   ```
   GEMINI_API_KEY=<your_key>
   ```

No other paid API keys are required. yfinance and Wikipedia are free.

## Phase 2: Data Service - 10 Year History + Splits + Validation

**Files:** `backend/app/data_service.py`

Run `scripts/patch_data_service.py` to apply changes automatically.

### Changes

1. **10-year history**: Change `period="2y"` to `period="max"` for price data, and use `stock.income_stmt`, `stock.balance_sheet`, `stock.cashflow` (annual) which return up to 4 years on free tier. Document limitation.
2. **Stock Split normalization**: yfinance auto-adjusts price history but NOT fundamentals. Add split-factor adjustment: divide historical EPS and Equity by cumulative split ratio from `stock.splits`.
3. **Data completeness validation**: Replace simple year-count check with percentage-based validation. If >20% of expected data points are NaN/missing across financials, flag as "Incomplete Data".
4. **Expose `splits` data** in the returned dict for downstream normalization in `process_financial_data`.

### Acceptance

- `fetch_ticker_data("AAPL")` returns `history` with >5 years of rows
- `splits` key present in result
- `validate_data` flags tickers with >20% missing fields

## Phase 3: Final Verdict Logic

**Files:** `backend/app/api.py`, `frontend/src/app/stock/[ticker]/page.tsx`, `frontend/src/components/stock-card.tsx`

Run `scripts/patch_verdict.py` to apply backend changes.

### Backend

Add a `verdict` field to `_analyze_ticker` return value. Logic:

```
big5_pass = all 5 metrics have consistent_growth == True
undervalued = price < mos_price
green_signal = technical_analysis.signal == "Green"

if big5_pass and undervalued and green_signal:
    verdict = "BUY"
elif big5_pass and (undervalued or green_signal):
    verdict = "WAIT"
else:
    verdict = "DISQUALIFIED"
```

### Frontend

- Stock detail page: Add verdict banner at top (green/yellow/red)
- StockCard: Show verdict badge

## Phase 4: Gemini Model Upgrade

**Files:** `backend/app/ai_analyzer.py`

### Change

Update the `GEMINI_URL` from `gemini-1.5-flash` to `gemini-2.0-flash`:

```python
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
```

gemini-2.0-flash is free tier (15 RPM), smarter than 1.5-flash, and faster than 1.5-pro.

### Acceptance

- With valid `GEMINI_API_KEY`, calling `/stock/AAPL` returns `ai_analysis.moat_score > 0`

## Phase 5: Process Financial Data - Split Normalization

**Files:** `backend/app/api.py` (function `process_financial_data`)

### Change

After computing `eps` and `equity_per_share`, apply split adjustment using cumulative split factor from `raw_data["splits"]`. This ensures historical EPS and equity values are comparable to current values.

See `references/split_normalization.md` for the algorithm.

## Phase 6: Database & Cache Integration (Optional)

**Files:** `backend/app/api.py`, `backend/app/models.py`, `backend/app/cache_service.py`

This phase is **optional** - the app works fully without it. Implement only if persistence across restarts is needed.

### PostgreSQL

1. Install PostgreSQL locally or use a cloud instance
2. Update `DATABASE_URL` in `backend/.env`
3. Add `create_db_and_tables()` call in startup event
4. After `_analyze_ticker`, persist result to `AnalysisResult` table
5. On `/stock/{ticker}`, check DB before fetching fresh

### Redis

1. Install Redis locally or use Docker: `docker run -d -p 6379:6379 redis`
2. The `cache_service.py` already handles connection. With Redis running, it auto-connects
3. Add caching calls: `set_analysis` after analysis, `get_analysis` before fetching
4. TTL: 15 min for prices, 24 hours for AI analysis

## Execution Order

```
Phase 1 (manual) --> Phase 2 --> Phase 5 --> Phase 3 --> Phase 4 --> Phase 6
  API key setup      Data 10y    Splits      Verdict     Gemini      DB/Cache
  5 min              30 min      15 min      20 min      5 min       optional
```

Phase 2 and 5 are data-layer. Phase 3 and 4 are feature-layer. Phase 6 is infra-layer.

## References

- **Split normalization algorithm**: See `references/split_normalization.md`
- **Verdict decision tree**: See `references/verdict_logic.md`

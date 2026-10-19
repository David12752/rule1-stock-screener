# Rule #1 Screener — Refactoring & Redesign Masterplan

Audit date: 2026-07-29
Scope audited: `backend/app/**` (~270 KB Python), `frontend/src/**` (~250 KB TS/TSX), `electron/`, root plan docs.

---

## Part 1 — Executive Summary & Diagnostic Audit

### 1.0 Stop-the-line finding: the workspace is currently broken at runtime

> **Status: FIXED in Phase 0 (2026-07-29).** The diagnosis below is preserved as the audit record. `npm run typecheck` is now clean and the affected panels render.

Before any redesign discussion: `npx tsc --noEmit` fails with 13 errors, 12 of which are the same thing.

```
src/components/workspace/workspace-shell.tsx(330,61): error TS2304: Cannot find name 'fmt'.
src/components/workspace/workspace-shell.tsx(331,61): error TS2304: Cannot find name 'fmt'.
... (12 total: lines 330, 331, 469, 583, 707, 711, 715, 786, 788, 789, 932, 941)
src/components/workspace/workspace-context.tsx(246,23): error TS2345: Property 'ticker' is missing ...
```

`fmt` is called 12 times and is **never defined and never imported** in the file:

```330:331:frontend/src/components/workspace/workspace-shell.tsx
              <td className="px-2 py-1 text-end font-mono">{fmt(s.price)}</td>
              <td className="px-2 py-1 text-end font-mono">{fmt(s.mos_price)}</td>
```

Those call sites sit inside the Quality table (330, 331), Timing table (469), Candidates table (583), Analysis panel (707–789) and Portfolio panel (932, 941). Any of those five panels throws `ReferenceError: fmt is not defined` the moment it renders a row. `next dev` with Turbopack does not typecheck, so this ships silently into dev; `next build` will fail outright.

**A meaningful share of what is being experienced as "the UI freezes" is very likely this crash**, not slowness — a thrown render in a client component blanks the subtree and leaves whatever spinner/last paint was on screen. Fix this first (Phase 0, ~10 minutes) and re-measure before attributing anything else to performance.

### 1.1 Architecture as it actually stands

```
Next.js 16.1.6 / React 19.2.3  ──HTTP + SSE──►  FastAPI (single 89 KB api.py, 48 routes)
  Tailwind v4, shadcn (partial)                   ├─ yfinance  (primary, free)
  recharts + lightweight-charts                   ├─ EODHD     (optional, if key)
  raw fetch + EventSource                         ├─ Gemini    (via raw requests)
  ONE React context, no query cache               └─ Redis     (built, connected, never used)
  Capacitor Android + Electron wrappers
```

Six route files exist but five are shells. `/library`, `/portfolio`, `/scanner`, `/watchlist` are ~195-byte client components that mount, paint "מעביר ל-Workspace…", then `router.replace()` into `/?tab=…`:

```6:16:frontend/src/components/workspace/redirect-to-workspace.tsx
export default function RedirectToWorkspace({ tab }: { tab: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/?tab=${tab}`);
  }, [router, tab]);
```

So the real application is two god-files:

| File | Size | Lines | What lives inside |
|---|---|---|---|
| `frontend/src/app/stock/[ticker]/page.tsx` | 94 KB | ~1294 | 8 tab bodies, 5 charts, a valuation calculator, all formatters |
| `frontend/src/components/workspace/workspace-shell.tsx` | 43 KB | ~1047 | 6 panels (Universe/Quality/Timing/Candidates/Analysis/Portfolio) |
| `backend/app/api.py` | 89 KB | ~2200 | 48 routes + analysis pipeline + 2 SSE endpoints + 10 global mutable stores |

### 1.2 Performance bottlenecks (ranked, with evidence)

**P1 — A hard 1-second sleep in front of every single ticker fetch.**

```22:25:backend/app/data_service.py
    async def fetch_ticker_data(self, ticker: str, depth: str = "deep") -> Dict[str, Any]:
        await asyncio.sleep(1.0)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._fetch_sync, ticker, depth)
```

This was a deliberate rate-limit decision — `SCANNER_IMPLEMENTATION_PLAN.md:491` says *"Add 1-second delay between tickers (existing pattern in data_service.py)"*. The intent is right, the mechanism is wrong: a blind per-call sleep is paid even on cache hits, even for one ticker, and it does not actually bound the global request rate when calls are concurrent. It needs to be a shared token bucket.

**P2 — Scans are strictly sequential.** `/scan` fans out via Starlette `BackgroundTasks`, which awaits tasks **one at a time in a for-loop**:

```639:641:backend/app/api.py
    for ticker in tickers:
        scan_progress[ticker] = "queued"
        background_tasks.add_task(process_ticker, ticker)
```

The library scan is explicitly sequential and adds a second sleep:

```1032:1058:backend/app/api.py
        for ticker in tickers:
            ...
                raw_data = await data_service.fetch_ticker_data(ticker)
                ...
                result = await _analyze_ticker(ticker, raw_data)
            ...
            # Rate limit: small delay between tickers
            await asyncio.sleep(0.5)
```

Fixed sleep cost alone is `1.5 × N` seconds. For a 500-name universe that is 12.5 minutes of pure `sleep` before a single byte of network or CPU.

**P3 — Six Yahoo round-trips per ticker.** Each property access on a `yf.Ticker` is its own HTTP request:

```37:51:backend/app/data_providers.py
        stock = yf.Ticker(symbol)
        history_df = stock.history(period="max")
        financials = stock.financials
        balance_sheet = stock.balance_sheet
        cashflow = stock.cashflow
        splits = stock.splits
        ...
            "info": stock.info or {},
```

`period="max"` pulls the entire price history when Rule #1 needs ~10 fiscal years, and `.info` is the slowest single call in yfinance.

**P4 — A blocking `requests.post` to Gemini on the asyncio event loop.** `_analyze_ticker` is `async def`, and it calls the AI analyzer directly:

```390:398:backend/app/api.py
    if GEMINI_API_KEY:
        try:
            summary = info.get("longBusinessSummary", "No summary available.")
            ai_results = ai_analyzer.analyze_moat_and_management(
```

which is synchronous with a 30-second timeout:

```77:88:backend/app/ai_analyzer.py
            response = requests.post(
                f"{self.GEMINI_URL}?key={self.api_key}",
                ...
                timeout=30,
            )
```

No `to_thread`, no executor. **This stalls the entire server for up to 30s per ticker** — every other request, including the SSE stream the UI uses to show progress, stops. This is the true "whole app freezes" mechanism on the backend side.

**P5 — Redis exists, is wired up, and is never used.** `CacheService` implements `get_financials`/`set_financials`/`get_analysis`/`set_analysis` (`backend/app/cache_service.py:41-73`) and connects on startup. Grep confirms **not one call site** on the fetch or analyze path. Every scan re-downloads data that changes quarterly. There's also a latent bug: `api.py:2157` calls `cache_service.get(ticker)`, a method that does not exist on the class.

**P6 — SSE re-serializes the full result set every second.** Both streams poll globals on a 1s timer and re-send everything:

```657:669:backend/app/api.py
            if scan_progress:
                payload = { "progress": scan_progress, "results": {} }
                for ticker, status in scan_progress.items():
                    if status == "complete" and ticker in scan_results:
                        payload["results"][ticker] = scan_results[ticker]
                yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1)
```

Payload grows O(N) with completed tickers, so the stream gets heavier exactly as the scan progresses. Each full analysis blob is large (Big 5, breakdowns, TA arrays). The client then re-parses and re-sets state every second.

**P7 — One unmemoized mega-context re-renders the whole app on every SSE tick.** The provider value is a fresh object literal on every render, holding ~26 fields:

```410:439:frontend/src/components/workspace/workspace-context.tsx
  const value: WorkspaceContextValue = {
    tab, setTab, universes, selectedUniverse, setSelectedUniverse,
    qualityStocks, qualityPassers, qualityLoading, qualityScanning,
    ... 26 fields total ...
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
```

The individual `useCallback`/`useMemo` wrappers inside the file are wasted effort — a new `value` identity notifies every consumer regardless. And the SSE handler writes to it once per second:

```302:308:frontend/src/components/workspace/workspace-context.tsx
          setTimingProgress({ scanned: done || keys.length, total: keys.length, ... });
          if (Array.isArray(msg.results)) setTimingResults(msg.results);
```

Each tick → new context value → `WorkspaceShell` + active panel + all ~500 rows + every `WatchlistButton` re-render, plus a full recompute of the `candidates` merge/sort (`workspace-context.tsx:353-408`).

**P8 — N+1 fetches from table rows.** Every row renders a `WatchlistButton`, each of which calls `useWatchlist()`, and each hook instance fires its own `fetch('/watchlist')` on mount plus a synchronous `localStorage.getItem` + `JSON.parse`:

```317:348:frontend/src/components/workspace/workspace-shell.tsx
          {filtered.map((s) => (
            <tr key={s.symbol} ... onClick={() => selectSymbol(s.symbol, true)}>
              ...
              <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                <WatchlistButton symbol={s.symbol} size="sm" />
```

With `filtered = qualityPassers.slice(0, 500)` that is **up to 500 concurrent requests to `/watchlist`** on tab open.

**P9 — No virtualization anywhere, and a `slice(0, 500)` standing in for it.**

```191:191:frontend/src/components/workspace/workspace-shell.tsx
  const filtered = useMemo(() => qualityPassers.slice(0, 500), [qualityPassers]);
```

500 `<tr>` × ~8 cells × a nested interactive component ≈ 4–5k DOM nodes, fully re-rendered on every SSE tick. The cap also silently truncates results, which is a correctness problem masquerading as a performance fix.

**P10 — No shared fetch cache and no request cancellation.** `package.json` has no React Query, no SWR, no Zustand, no virtualization library, no table library. Every panel and page refetches independently. `EventSource` in `workspace-context.tsx:286` is closed on `done`/`error` but **never on unmount** — navigate away mid-scan and the stream leaks with a handler writing into a dead tree. The stock page effect (`page.tsx:122`) has no `AbortController` and no cancelled-flag, so fast ticker switching races.

**Measured impact.** These are now benchmarks, not projections — see `backend/scripts/bench_scan.py` and §3 Phase 1 results.

| | Before | After Phase 1 |
|---|---|---|
| 6-ticker scan, cold | **45.64 s** | **8.71 s** |
| Mean per ticker | 7.61 s | 1.45 s |
| Execution | sequential (7 s apart) | concurrent (all clustered) |
| Provider bundle time | 4.3–5.1 s | 3.16 s |
| Network calls / ticker | 6 | 5 cold, **0 warm** |
| Forced sleep / ticker | 1.0 s (+0.5 s library) | 0 |
| Event-loop stalls | blocking AI per ticker | none |

**Speedup: 5.2x cold.** Extrapolated to a 500-name library scan: ~65 min → ~14 min.

### 1.3 UX friction points (ranked, with evidence)

**U1 — Three tabs of content are unreachable.** The stock page defines 8 `TabsContent` panels but only 5 `TabsTrigger`s:

| `TabsContent value=` | Line | Has trigger? | Content stranded |
|---|---|---|---|
| `overview` | 416 | yes | — |
| `valuation` | 539 | yes | — |
| `big5` | 782 | yes | — |
| `three-tools` | 890 | yes | — |
| **`analysis`** | **1037** | **NO** | Moat score, AI moat text, management, red flags, business summary |
| **`financials`** | **1127** | **NO** | Margin grid, Big 5 table, 10-year history |
| **`patterns`** | **1225** | **NO** | Candlestick chart + detected patterns |
| `chat` | 1287 | yes | — |

Roughly 250 lines of built, working features — including **the candlestick price chart and the entire AI analysis** — cannot be opened by any user. The `loadPatterns` lazy-fetch is even wired onto the `big5` and `three-tools` triggers (lines 402, 405) to preload data for a tab that has no way to open.

**U2 — Two incompatible layout models.** `app-chrome.tsx` branches on route:

```16:27:frontend/src/components/app-chrome.tsx
        className={
          isWorkspace
            ? "flex h-dvh flex-col overflow-hidden"
            : "flex min-h-screen flex-col"
        }
```

`/` is a fixed-viewport app shell with nested scroll (correct for a terminal). `/stock/[ticker]` is a `min-h-screen … pb-20` scrolling document. The user's "excessive scrolling" complaint is entirely the second one — and it's the page they spend analysis time on.

**U3 — ~2 viewports of chrome before the stock page's tabs.** Fixed vertical stack above `TabsList`: breadcrumb (232) → hero header (241–288) → verdict banner (290–328) → price band (330–375) → **12 MetricCards** (377–391) → tab list (393). Then the `overview` body adds another 1.5–2 screens. Default landing is ~3–4 screens of scroll; `valuation` pushes it to ~5.

**U4 — Valuation UI is duplicated three ways.** `StickerPriceGauge` renders on both `overview` (428–433) and `valuation` (547–552). The price band (330–367), the gauge, the "price zones" block and the calculator all restate MOS/sticker/current in different visual languages on one page.

**U5 — Raw numbers with no visual encoding.** The 12-card quick-metrics grid (378–390) shows P/E, EV/EBITDA, Beta and margins as bare `text-lg font-bold` — only payback time gets a threshold color. Same in the Quality table (330–333): price, MOS, moat and signal are undifferentiated mono text, so the eye has nothing to scan for. `implementation_plan.md` already specified a traffic-light system for exactly this; it was never applied to these surfaces.

**U6 — Text walls.** `moat_analysis` dumped as one `text-sm leading-relaxed` paragraph (`page.tsx:1056`), full `long_business_summary` (1118), 7 stacked explanation paragraphs in the sticker breakdown (563–606), and in the workspace an 11px `line-clamp-10` prose block (`workspace-shell.tsx:802-809`).

**U7 — Navigation IA is broken.** The Navbar links only to `/?tab=universe` plus the command palette. There are no Scanner/Library/Portfolio entries, the four legacy URLs only redirect, and the five rich scanner components (`filter-panel.tsx` 26 KB, `scan-results-table.tsx`, `scan-progress.tsx`, `pattern-selector.tsx`, `sentiment-card.tsx`) are **exported but imported nowhere** — orphaned by the workspace rewrite. Same for `search-bar.tsx`, `stock-card.tsx`, and the `ui/chart.tsx` stub.

**U8 — Design tokens exist but are bypassed ~529 times.** `globals.css` defines a full OKLCH semantic set (`--success`, `--warning`, `--info`, `--chart-1..5`, radius scale, sidebar tokens). Components then hardcode Tailwind palette classes and hex: ~106 instances in the stock page, ~48 in the workspace shell. Verdict colors are defined twice with different palettes — `green-*` in `page.tsx:62-76` vs `emerald-*` in `workspace-shell.tsx:48-54`. Chart strokes use raw hex (`#22c55e`, `#eab308`, `#3b82f6`, `#ef4444`). One Recharts tooltip uses `hsl(var(--card))` while the tokens are **oklch**, so that style is simply dead. `badge.tsx` has no `success`/`warning` variant, which is why every status pill is ad-hoc.

**U9 — Accessibility and touch.** Table rows are clickable `<tr>` elements with `onClick` and no `role`/`tabIndex`/keyboard path (`workspace-shell.tsx:318-322`). Status is encoded by color + emoji only. Type runs `text-[9px]`–`text-[11px]` across the shell. The Analysis and Portfolio panels are hard `grid-cols-12` with `col-span-3/4/5` and no mobile collapse — which matters because this ships as a Capacitor Android app. `components.json` declares `"rtl": false` while `layout.tsx` sets `dir="rtl"`.

**U10 — Loading states shift layout.** `MarketBar` returns `null` until loaded (`market-bar.tsx:64`), so the chrome height jumps on every load. The Analysis panel replaces its entire 3-column grid with a centered spinner (`workspace-shell.tsx:687-690`). `skeleton.tsx` exists but is used only on the stock page.

### 1.4 Codebase cleanup inventory

| Item | Evidence | Action |
|---|---|---|
| `fmt` undefined ×12 | `workspace-shell.tsx` | **Fix now** — extract `lib/format.ts` |
| 3 orphaned `TabsContent` | `page.tsx:1037,1127,1225` | Wire into new tab spec |
| 5 orphaned scanner components | never imported | Harvest `filter-panel` into the new filter rail; delete the rest |
| `ui/chart.tsx` | 319-byte stub, unused | Replace with real chart wrappers |
| `search-bar.tsx`, `stock-card.tsx` | unused | Delete (command palette supersedes) |
| `CacheService.get_financials` etc. | never called | Wire in, don't delete |
| `cache_service.get(...)` | `api.py:2157` — no such method | Bug: fix |
| `ScannerService._scan_single_ticker` | `scanner_service.py:592-679`, superseded | Delete |
| `ScannerService.evict_cache` | never called | Wire into scheduler or delete |
| `openbb` in requirements | no imports | Remove from `requirements.txt` |
| `rule1-gaps/scripts/patch_*.py` | one-off file-rewriting monkey-patches; `patch_data_service.py` re-inserts the 1.0 s sleep | Delete — actively dangerous |
| Duplicate history tables | `page.tsx:848-886` vs `1187-1220` | Collapse to one |
| 3 parallel progress stores | `scan_*`, `library_*`, `scanner_*` in `api.py:93-108` | Unify behind one job model |
| `nul` file in repo root | 0 bytes, Windows artifact | Delete |
| Gemini key in request URL | leaked into every error log | **Fixed** — moved to header + redaction |
| Duplicate lockfiles | root + `frontend/` | Keep `frontend/`'s only |
| `_pattern_cache` written from thread pool | `scanner_service.py`, no lock | Add lock |

### 1.5 Two findings the instrumentation surfaced (not visible from reading code)

**The AI has never worked, and every ticker paid for it.** Enabling tracing showed an identical failure on every single ticker:

```
ERROR:app.ai_analyzer:AI Analysis Error for AAPL: 400 Client Error: Bad Request for url:
https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AIza...
```

Querying the API directly returns the actual cause — not the model name, the credential:

```json
{ "error": { "code": 400, "message": "API key not valid. Please pass a valid API key.",
             "status": "INVALID_ARGUMENT", "reason": "API_KEY_INVALID" } }
```

So the moat scores in the UI have always come from the rule-based heuristic fallback (`api.py:403-419`), never from Gemini. Meanwhile the failing call was a **synchronous, event-loop-blocking HTTP request on every ticker of every scan** — pure wasted latency for a result that was always discarded. The code comment claiming `gemini-3.1-flash-lite` was the fix for an earlier HTTP 400 was chasing the wrong cause.

**ACTION REQUIRED — rotate the key.** Because it was sent as a `?key=` query parameter, `requests` embedded it in every exception message, and `logger.error` wrote it to the logs. The key in `backend/.env` is therefore both **invalid and exposed in log output**. Issue a new key at <https://aistudio.google.com/apikey>, put it in `backend/.env`, and confirm the model in `GEMINI_MODEL` (now env-configurable, defaulting to `gemini-2.0-flash`). The transport is fixed — the key now travels in the `x-goog-api-key` header and error text is redacted before logging — but that does not un-leak the existing one.

---

## Part 2 — UI/UX Wireframe & Tab Architecture Specification

### 2.1 Design principles

1. **One layout model everywhere: fixed-viewport app shell.** `h-dvh`, `overflow-hidden` at every level except designated scroll containers. Scrolling exists **only** inside virtualized tables and one designated content pane per view.
2. **Master–detail beats navigation.** Clicking a row opens an inspector pane in place. Full-page navigation becomes an escape hatch, not the primary path.
3. **Encode before you print.** Every number that has a threshold gets a color, badge, bar or sparkline. Raw mono text is reserved for values with no interpretation.
4. **Progressive disclosure for prose.** AI and business text collapses to a 2-line claim + evidence chips; full text behind "expand".
5. **One source of truth for semantics.** A single `verdict.ts` module owns label + token + icon for every verdict, signal and score band. No component picks its own green.

### 2.2 Global shell

```
┌────────────────────────────────────────────────────────────────────────────┐
│ TopBar  40px   [logo] Rule#1   ⌘K search    [scan status pill]  [⚙] [◐]   │ fixed
├────────────────────────────────────────────────────────────────────────────┤
│ MarketBar 28px  S&P +0.4% ▲  NDX −0.2% ▼  VIX 14.2   (skeleton, never null)│ fixed
├──────┬─────────────────────────────────────────────────────────────────────┤
│      │                                                                     │
│ Rail │                        VIEW CONTENT                                 │ flex-1
│ 64px │                     (own scroll container)                          │ min-h-0
│      │                                                                     │
│ ▣ Sc │                                                                     │
│ ◈ Ca │                                                                     │
│ ◎ An │                                                                     │
│ ▤ Po │                                                                     │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

The rail replaces the current 6-step horizontal strip with 4 destinations. Rationale: Universe is *configuration*, not a destination — it becomes a filter drawer inside Screener. Quality and Timing are two *lenses on the same table*, not two places.

| Rail item | Was | Why |
|---|---|---|
| **Screener** | Universe + Quality + Timing | One virtualized table, column-group toggle: Quality lens \| Timing lens \| Both. Universe = drawer. |
| **Candidates** | Candidates | Unchanged — the merged ranking is the payoff view |
| **Analysis** | Analysis | Becomes the inspector target; also reachable inline |
| **Portfolio** | Portfolio | Unchanged |

The 6-step funnel is still communicated — as a progress meter in the TopBar (`Universe 500 → Quality 41 → Timing 12 → Candidates 7`), which teaches the workflow without spending navigation on it.

### 2.3 Screener view

```
┌─ Screener ─────────────────────────────────────────────────────────────────┐
│ [Universe: S&P500 ▾] [Filters ⚗ 3] │ Lens: (Quality)(Timing)(Both) │ [Scan ▶]│ 44px
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░ 312/500 · 41 passed · ~2m left        [Export ⇩] │ 24px  progress
├────────────────────────────────────────────────────────────────────────────┤
│ ⭑ SYM   Company        Verdict  Price   MOS    Disc%  Moat  Big5  Sig  ▸   │ sticky header
├────────────────────────────────────────────────────────────────────────────┤
│ ☆ AAPL  Apple Inc      [קנה  ]  178.20  201.4  +11.6% ●●●●○ ▮▮▮▮▮ ▲   ▸   │
│ ★ MSFT  Microsoft      [המתן]  412.00  380.1   −8.4% ●●●●● ▮▮▮▮▯ ▲   ▸   │  virtualized
│ ☆ NVDA  NVIDIA         [מעקב]  875.30  402.7  −117%  ●●●○○ ▮▮▮▯▯ ▼   ▸   │  ~34px rows
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Virtualized** with `@tanstack/react-virtual`. The `slice(0, 500)` cap is removed; the full universe renders.
- Row height fixed at 34px, `<div role="row">` CSS-grid rows rather than `<table>` (required for transform-based virtualization), `role="button"` + `tabIndex={0}` + Enter/Space handler for keyboard access.
- **Visual encoding per column:** Verdict → semantic badge. Disc% → signed color + inline bar. Moat → 5-dot rating. Big5 → 5-segment pass bar. Sig → ▲/▼ with color *and* glyph (never color alone).
- `▸` opens the **inspector** (§2.5). Row click selects; it does not navigate.
- Progress bar is fed by a Zustand selector, so ticks repaint 24px of DOM — not the table.
- Filters drawer harvests the existing `filter-panel.tsx` (26 KB of already-built filter UI, currently orphaned).

### 2.4 Candidates view

Same table shell, different columns: Score (0–100 ring), Source (Quality / Timing / Both chip), Top pattern + confidence, Discount %, Signal. Sorting defaults to the existing `score` computation, which moves out of the context into `lib/scoring.ts` as a pure, testable function.

### 2.5 Inspector pane (new — the biggest UX win)

Opening from any table splits the view instead of navigating:

```
┌─ table (flex-1, still virtualized) ──────────┬─ Inspector 420px ───────────┐
│ ☆ AAPL  Apple Inc   [קנה] 178.20 …        ▸ │ AAPL · Apple Inc     [↗][✕] │
│ ★ MSFT  Microsoft   [המתן] 412.00 …       ▸ │ ┌─────────────────────────┐ │
│ ☆ NVDA  NVIDIA      [מעקב] 875.30 …       ▸ │ │  [קנה]   Score 82/100   │ │
│                                              │ │  178.20  MOS 201.4 +12% │ │
│                                              │ └─────────────────────────┘ │
│                                              │  sparkline price 1Y  ╱╲╱    │
│                                              │  Big 5   ROIC ▮ EQ ▮ EPS ▮  │
│                                              │  ✓ ROIC>10  ✓ Debt<3y       │
│                                              │  ✕ Sales CAGR 6.2%          │
│                                              │  Moat ●●●●○ "Brand + eco…"  │
│                                              │  [Open full analysis ↗]     │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

Below `lg` the inspector becomes a bottom sheet (Capacitor Android + the `dir="rtl"` layout both handled). This is the fix for U4/U6/U2 at once: the decision-grade summary is one click deep with zero scrolling, and the full page becomes optional.

### 2.6 Stock detail — tab architecture

Converted from a `min-h-screen` document to the app-shell model. **Fixed 88px header + 40px tab bar + one scroll container.**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ‹ AAPL  Apple Inc · NASDAQ ☆   178.20 ▲1.2%   [קנה]  Score 82  MOS +11.6% │ 88px fixed
├────────────────────────────────────────────────────────────────────────────┤
│ (סקירה) (שווי) (דוחות) (טכני) (AI)                            [⇩ PDF][⇩CSV]│ 40px fixed
├────────────────────────────────────────────────────────────────────────────┤
│  tab body — the only scrollable region, target ≤ 1.25 viewports            │
└────────────────────────────────────────────────────────────────────────────┘
```

The header absorbs the current breadcrumb + hero + verdict banner + price band (lines 232–375, ~2 viewports) into 88px. The 12-card metric grid moves into the Overview tab where it belongs.

#### Tab 1 — סקירה / Overview

| Region | Components | Data | Chart |
|---|---|---|---|
| Verdict strip | `VerdictCard` — verdict, one-sentence "deal breaker", score ring | `verdict`, `verdict_reason` | Score ring (SVG) |
| Price history | `PriceChart` | `ta.chart_data` | **lightweight-charts** area + SMA10/30 — *promoted from the dead `patterns` tab* |
| Rule #1 checklist | `ChecklistCard` — 6 rows, ✓/✕ + value + threshold | Big 5, payback, MOS | per-row mini bar |
| Valuation snapshot | `StickerPriceGauge` (**the single instance in the app**) | sticker, MOS, price | existing SVG gauge |
| Key metrics | `MetricGrid` — 8 cards max (down from 12), each threshold-colored | P/E, EV/EBITDA, ROIC, ROE, margins, beta, payback | sparkline per card |

#### Tab 2 — שווי / Valuation Models

| Region | Components | Data | Chart |
|---|---|---|---|
| Waterfall | `ValuationWaterfall` | `sticker_price_breakdown` | **Recharts waterfall**: Current EPS → growth → Future EPS → Future P/E → Future Price → discount → Sticker → ×0.5 → MOS |
| Model comparison | `ModelTable` — Sticker, MOS, Ten-Cap, Payback-Time, analyst target | all models | horizontal range bars vs current price |
| Price zones | `PriceZoneBar` | MOS / sticker / current | existing band, kept once |
| Calculator | `ValuationCalculator` — **isolated component, own state** | user growth/P/E/MOS inputs | live-updating result strip |
| Assumptions | `AssumptionList` — 7 steps as collapsible chips, not 7 paragraphs | breakdown text | — |

The calculator's sliders currently re-render all ~1294 lines including every Recharts tree. Extracting it is both a UX and a perf fix.

#### Tab 3 — דוחות / Financial Statements

*Unlocks the orphaned `financials` panel (line 1127).*

| Region | Components | Data | Chart |
|---|---|---|---|
| Statement switcher | segmented: Income / Balance / Cash Flow | `financial_history` | — |
| Statement table | `StatementTable` — years as columns, virtualized rows, sticky first column | 10y | per-row sparkline + YoY% color |
| Margin trends | `MarginChart` | gross/op/net by year | **Recharts multi-line** *(new — currently missing)* |
| Big 5 CAGR | `Big5CagrChart` | 1/3/5/10y CAGR vs 10% ref | existing bar chart, moved here |
| Growth alignment | `NormalizedGrowthChart` | `*_norm` series | existing "parallel lines" chart |

#### Tab 4 — טכני / Technicals & Charts

*Unlocks the orphaned `patterns` panel (line 1225) and the candlestick chart.*

| Region | Components | Data | Chart |
|---|---|---|---|
| Signal strip | 3 `SignalCard`s (MA / MACD / Stochastic) — verdict + value + threshold | `ta` | — |
| Main chart | `CandlestickChart` with pattern overlays + volume | OHLCV + patterns | **lightweight-charts** — was unreachable |
| Indicators | `MacdChart`, `StochasticChart` — synced crosshair | `ta` | existing Recharts, given shared x-axis |
| Pattern list | `PatternList` — type, confidence bar, detected date, target | `patternData` | — |

#### Tab 5 — AI / Insights

*Unlocks the orphaned `analysis` panel (line 1037).*

| Region | Components | Data | Chart |
|---|---|---|---|
| Moat | `MoatCard` — score /10 as 5-dot + type chip + 2-line claim | `moat_score`, `moat_type` | dot rating |
| Evidence | `EvidenceChips` — the moat paragraph parsed into claim chips, full text behind "expand" | `moat_analysis` | — |
| Management | `ManagementCard` — integrity boolean as pass/fail badge | `management_*` | — |
| Red flags | `RedFlagList` — severity-sorted, each with the metric that triggered it | `red_flags` | — |
| Business | `SummaryCard` — 3 lines + expand | `long_business_summary` | — |
| Chat | `AIChatPanel` (existing) | — | — |

Chat folds in here rather than owning a top-level tab — it's an interaction on the AI content, not a peer view.

### 2.7 Design system work

```ts
// src/lib/verdict.ts — the single source of truth (replaces VERDICT_COLORS + VERDICT_CLS)
export const VERDICT = {
  BUY:          { he: "קנה",   token: "success",     icon: TrendingUp,  score: 100 },
  WAIT:         { he: "המתן",  token: "warning",     icon: Clock,       score: 70 },
  WATCHLIST:    { he: "מעקב",  token: "info",        token2: "chart-2", icon: Eye,  score: 50 },
  WARY:         { he: "זהירות", token: "warning-2",  icon: AlertCircle, score: 30 },
  DISQUALIFIED: { he: "פסול",  token: "destructive", icon: XCircle,     score: 0 },
} as const;
```

- Extend `badge.tsx` with `success` / `warning` / `info` / `muted` variants so status pills stop being ad-hoc.
- Add `--chart-*` consumption: chart colors read from CSS vars via `getComputedStyle` once, or a `chartTheme.ts` exporting the same OKLCH values — no more raw hex.
- Delete the `hsl(var(--card))` tooltip style (dead against OKLCH tokens).
- Raise the type floor: `text-[9px]`/`text-[10px]` → `text-xs` (12px) minimum.
- New primitives: `StatusBadge`, `Sparkline` (dependency-free SVG), `DotRating`, `SegmentBar`, `ScoreRing`, `DeltaText`, `MetricCard`, `Inspector`, `DataTable` (virtualized), `TabShell`.

### 2.8 Target folder structure

```
frontend/src/
├── app/                          # routes only — thin
│   ├── layout.tsx
│   ├── page.tsx                  # → <Workspace />
│   ├── stock/[ticker]/page.tsx   # → <StockDetail ticker={…} />  (target < 60 lines)
│   └── library|portfolio|…       # DELETE — replaced by next.config redirects
├── components/
│   ├── ui/                       # shadcn primitives + new atoms
│   └── charts/                   # PriceChart, CandlestickChart, MacdChart, MarginChart,
│                                 # ValuationWaterfall, NormalizedGrowthChart, Sparkline
├── features/
│   ├── screener/                 # ScreenerView, FilterDrawer, columns.ts, lenses.ts
│   ├── candidates/
│   ├── inspector/
│   ├── portfolio/
│   └── stock-detail/
│       ├── StockDetail.tsx       # header + TabShell only
│       └── tabs/                 # OverviewTab, ValuationTab, FinancialsTab,
│                                 # TechnicalsTab, InsightsTab  (one file each)
├── lib/
│   ├── api/                      # typed fetchers + queryKeys.ts
│   ├── format.ts                 # fmt, pct, compact, money  ← fixes the P0
│   ├── verdict.ts
│   ├── scoring.ts                # pure candidate scoring (out of context)
│   └── chart-theme.ts
├── stores/  scan-store.ts        # Zustand: SSE progress, isolated from React tree
└── hooks/   use-watchlist.ts      # backed by one provider, not per-instance fetch
```

```
backend/app/
├── main.py
├── api/routes/                   # scan, library, scanner, stock, search, watchlist,
│                                 # portfolio, alerts, market, intelligence, reports
│                                 # (splits the 89 KB / 48-route api.py)
├── core/  config.py  rate_limit.py  events.py (ScanHub)  cache.py  instrumentation.py
├── services/  data_service.py  scan_orchestrator.py  analysis_service.py
│              scanner_service.py  intelligence_service.py  ai_analyzer.py
├── domain/    calculations.py  indicators.py  pattern_detector.py  verdict.py
└── schemas/   requests.py  responses.py
```

---

## Part 3 — Phased Implementation Roadmap

### Phase 0 — Unbreak ✅ COMPLETE (2026-07-29)

| # | Task | Files | Status |
|---|---|---|---|
| 0.1 | Create `lib/format.ts`; import `fmt` in workspace-shell. Also de-duplicated the identical local copy in `market-bar.tsx` | `lib/format.ts`, `workspace-shell.tsx`, `market-bar.tsx` | ✅ |
| 0.2 | Extract a `TimingProgress` interface so `ticker` is genuinely optional, rather than padding call sites with `ticker: undefined` | `workspace-context.tsx` | ✅ |
| 0.3 | Add 3 `TabsTrigger`s (`financials`, `patterns`, `analysis`) — 8 tabs now reachable *(stopgap; Phase 2 consolidates to 5)* | `page.tsx:395-411` | ✅ |
| 0.4 | Fix `cache_service.get(...)` → `(await cache_service.get_analysis(...))` | `api.py:2157` | ✅ |
| 0.5 | Delete `rule1-gaps/scripts/` and root `nul`; remove the unused `recharts` dep from root `package.json` | — | ✅ |
| 0.6 | Add `npm run typecheck` | `frontend/package.json` | ✅ |
| 0.7 | Move the speculative `loadPatterns` prefetch off the `big5`/`three-tools` triggers onto `patterns`, where the data is actually consumed | `page.tsx:402,405` | ✅ |

**Correction to 0.5 as originally written:** the plan said to delete the root `package-lock.json`. That was wrong. The root `package.json` is a legitimate separate package pinning Electron and `concurrently`, and `frontend/next.config.ts` already sets `turbopack.root`, so the multi-lockfile warning the README complains about is already resolved. Deleting that lockfile would only unpin real dependencies. The genuine redundancy was the unused `recharts` entry at root, which was removed instead.

**Also kept:** `rule1-gaps/references/*.md` and `SKILL.md` are useful reference documentation. Only `scripts/` was deleted — and it was worse than "one-off": `patch_data_service.py` overwrites `data_service.py` wholesale with an older revision that has no `HybridDataRouter`, no `fetch_bulk_ohlcv`, no `fetch_info_concurrent` and no data-quality layer, while re-inserting the 1.0 s sleep. Running `run_all_patches.py` would have silently destroyed most of the current data layer.

**Verified:**
- `npm run typecheck` — 13 errors → **0**
- `python -m py_compile app/api.py` — OK
- End-to-end browser smoke test against the real backend (900 persisted library stocks, 41 passers): Quality / Candidates / Portfolio panels and all 8 stock-detail tabs render with **zero console errors**. The Quality table shows real numeric price/MOS values, and the three formerly unreachable tabs display genuine content (Big 5 growth tables, moat analysis, 8 detected patterns with price targets).

**Next:** re-measure before starting Phase 1 — attribute what remains to performance only after the crash is out of the picture.

### Phase 1 — Performance, data fetching & state ✅ COMPLETE except 1.5b / 1.9 (2026-07-29)

#### Phase 1a — Backend ✅ COMPLETE (2026-07-29)

**1A. Measured first.** `core/instrumentation.py` times every provider round-trip (`RULE1_TRACE_TIMING=1`), and `scripts/bench_scan.py` times scans end-to-end. Baseline, taken before any change:

```
[baseline] 6 tickers: AAPL MSFT NVDA GOOGL AMZN META
     6.68s  AAPL   complete
    16.05s  MSFT   complete
    22.97s  NVDA   complete
    30.02s  GOOGL  complete
    36.99s  AMZN   complete
    43.58s  META   complete
  total 45.64s | mean 7.61s/ticker | SEQUENTIAL (gap ~= total)
```

Per-ticker provider breakdown, slowest first:

```
yahoo:AAPL total=5.05s | history=2.29s splits=0.88s info=0.61s balance_sheet=0.55s cashflow=0.42s financials=0.31s
yahoo:MSFT total=3.82s | history=1.39s info=0.82s splits=0.59s cashflow=0.37s balance_sheet=0.34s financials=0.30s
yahoo:NVDA total=2.73s | history=0.91s info=0.70s splits=0.35s cashflow=0.28s balance_sheet=0.26s financials=0.22s
```

This corrected two guesses in the audit: `history(period="max")` was the single most expensive call, and `.splits` was **not** reusing the history payload — it was a genuine extra round-trip costing 0.35–0.88 s.

| # | Task | Files | Status |
|---|---|---|---|
| 1.1 | `asyncio.sleep(1.0)` → shared `AsyncRateLimiter` token bucket (8/s, burst 16) | `core/rate_limit.py`, `data_service.py` | ✅ |
| 1.2 | `run_bounded` with `asyncio.Semaphore(SCAN_CONCURRENCY=6)`; `/scan` creates one task instead of N `BackgroundTasks` | `services/scan_orchestrator.py`, `api.py` | ✅ |
| 1.3 | `_run_library_scan` rewritten onto the orchestrator; extracted `_library_worker`; 0.5 s sleep dropped | `api.py` | ✅ |
| 1.4 | Gemini call wrapped in `asyncio.to_thread`; `_analyze_ticker(..., include_ai=False)` for bulk scans | `api.py`, `ai_analyzer.py` | ✅ |
| 1.5a | In-process TTL+LRU bundle cache (12 h, thread-safe — written from executor threads) | `core/cache.py`, `data_service.py` | ✅ |
| 1.6 | `history(period="max")` → `12y` (env-tunable); **redundant `.splits` request eliminated** | `data_providers.py` | ✅ |
| 1.8 | `_save_library_results`, `upsert_analysis`, `archive_scan` moved to `asyncio.to_thread` | `api.py` | ✅ |
| 1.17 | **Security:** Gemini key moved from `?key=` query param to `x-goog-api-key` header + error redaction | `ai_analyzer.py` | ✅ |
| 1.18 | Cache/concurrency diagnostics exposed on `/market/status` | `api.py` | ✅ |

**Eliminating the `.splits` call — why it is safe.** `apply_split_adjustment` only applies a split dated *after* a given statement date (`data_quality.py:138`, `if split_date > fin_ts`). Statement dates never predate the 12-year history window, so splits older than the window can never affect the result. Splits are now derived from the `Stock Splits` column that `Ticker.history` already returns, with a fallback to the separate request if the column is absent. Verified against AAPL's 2020 4:1 split: `split_events: 1, adjusted_rows: 0` — identical to the all-time behaviour, because AAPL's statements only reach back to 2021 and are all post-split.

**Results:**

```
[final-cold] 6 tickers  -> total 8.71s | mean 1.45s/ticker | CONCURRENT (clustered)
[after-warm] 6 tickers  -> total 6.40s | bundle_cache 6 hits
library scan, 8 tickers -> 13.78s (1.72s/ticker), all complete
provider bundle          -> 3.16s/ticker, 5 round-trips (was 4.3-5.1s, 6 round-trips)
```

**45.64 s → 8.71 s on identical input: 5.2x.** Regression-checked in a browser against the real backend — Quality table, Portfolio, and the KO/AAPL detail pages with charts and statements all render with zero console errors.

**Deferred from Phase 1a:**
- **1.5b Redis analysis cache.** `cache_service.get_analysis`/`set_analysis` are still unwired on the write path. Redis is not running in this environment (`redis: false`), so wiring it could not be verified; doing it blind risks a serialization bug, since analysis payloads need `_json_safe` treatment first.
- **1.7 SSE deltas.** Deliberately sequenced with the frontend work: changing the event shape requires the consumer to change in the same step, and that consumer is the Zustand store from 1.10.

#### Phase 1b — Frontend ✅ COMPLETE (2026-07-29)

| # | Task | Files | Status |
|---|---|---|---|
| 1.7 | SSE emits **deltas** — pre-computed counters plus only rows added since the last frame; explicit `done` frame ends the stream | `api.py` | ✅ |
| 1.10 | Zustand `scan-store` with slice selectors; `EventSource` held in a ref with unmount cleanup | `stores/scan-store.ts`, `workspace-context.tsx` | ✅ |
| 1.11 | Context value memoized; scan progress/results removed from it entirely; `candidates` extracted into `useCandidates()` | `workspace-context.tsx`, `workspace-shell.tsx` | ✅ |
| 1.12 | Watchlist rebuilt on `useSyncExternalStore`; added `useIsWatched(symbol)` so a row's star subscribes to one symbol | `use-watchlist.ts`, `watchlist-button.tsx` | ✅ |
| 1.13 | Reusable `VirtualTable`; all three screener tables virtualized; `slice(0, 500)` removed | `virtual-table.tsx`, `workspace-shell.tsx` | ✅ |
| 1.14 | `AbortController` on the stock page fetch and the palette's debounced search | `page.tsx`, `command-palette.tsx` | ✅ |
| 1.15 | `useMemo` for `normalizedData`; the three technical charts extracted into a `memo`'d component with memoized series | `page.tsx`, `stock/technical-charts.tsx` | ✅ |
| 1.16 | `localStorage` recents read on open instead of during render | `command-palette.tsx` | ✅ |
| 1.9 | React Query migration | — | ⏸ deferred, see below |

**What the SSE change actually fixes.** The old stream re-serialized the whole `scanner_progress` dict *and* every result found so far, once per second. Cost grew quadratically with scan length — the stream got heavier exactly as the scan progressed, and each frame replaced the entire results array in React state, re-rendering every row. Frames now carry `scanned/total/found/ticker` counters plus a `results_append` delta, and are suppressed entirely when nothing changed.

Measured with `backend/scripts/bench_sse.py` (10 tickers, 9 hits):

```
data frames      : 5
total bytes      : 41,803
rows appended    : 9      <- each result crosses the wire exactly once
full-payload frames : 0
final frame      : {"type": "done", "running": false, "scanned": 9, "total": 11, "found": 9}
server results   : 9      <- matches rows appended, so no rows were lost or duplicated
```

**A race the delta work exposed.** The client closed the stream on `running === false`. Since the frontend opens `EventSource` immediately after `POST /scanner/scan` returns, the first frame can arrive before the scanner flips its flag — so the stream closed instantly and the UI sat at zero results for the whole scan. Only the server's explicit `done` frame is terminal now.

**Re-render isolation.** `WorkspaceShell` sits above every panel, so anything it subscribes to re-renders the whole workspace. It no longer reads scan state at all; the tab-strip count badge and scan spinner are leaf components (`CandidateCountBadge`, `TimingScanSpinner`) that subscribe on their own behalf. Likewise `candidates` moved out of the provider into `useCandidates()`, so recomputing the merge/sort as results stream in no longer creates a new context value.

**Watchlist.** `WatchlistButton` renders once per row, and each instance was independently fetching `/watchlist` on mount and re-reading `localStorage` on every change — up to 500 identical requests to open one tab. There is now a single module-level store: one reconcile per page load, and `useIsWatched(symbol)` returns a boolean so toggling one star does not re-render the other few hundred.

**Virtualization.** Virtualizing a real `<table>` needs spacer rows above and below the window *and* `table-layout: fixed` with explicit `<colgroup>` widths — otherwise auto layout sizes columns from whichever rows happen to be on screen and they jitter as you scroll. `VirtualTable` does both and takes a declarative column config, which also removed three near-duplicate 50-line table bodies from `workspace-shell.tsx`.

**Verified:** `tsc --noEmit` clean. Browser regression against the live backend — Quality (41 rows), Timing with a live scan (incremental counter, results accumulating, spinner appearing and clearing), Candidates (28 rows, count badge), command palette search and recents, and the AAPL detail page with all three technical charts plus the Overview trends chart drawing real data. No console errors.

**Known cosmetic warning (pre-existing, not introduced here):** Recharts logs `The width(-1) and height(-1) of chart should be greater than 0` for charts mounted inside inactive tab panels, which have no measurable box until shown. Charts render correctly once their tab is active. The fix belongs with the Phase 2 tab infrastructure, where panels get mounted lazily.

**Deferred: 1.9 React Query.** Skipped deliberately rather than half-done. Migrating every `fetch` is a wide, mechanical change that touches request paths in ~15 components, and doing part of it leaves two competing data-fetching conventions in the codebase — worse than either end state. None of the wins above depended on it: the SSE, watchlist, virtualization and memoization fixes addressed the measured bottlenecks directly. React Query's value here is caching and dedup for the *non*-scan fetches (`/library`, `/universes`, `/stock/{ticker}`), which is real but secondary, and it fits naturally alongside the Phase 2 folder restructure.

**Next backend bottleneck (found by the warm-cache run).** With the network fully cached, 6 tickers still took 6.40 s — about 1.07 s/ticker of pure CPU. `_analyze_ticker` runs `process_financial_data`, `analyze_big_5`, `calculate_sticker_price` and `calculate_three_tools` synchronously inside the coroutine, so under concurrency they serialize on the event loop. At 500 tickers that is ~9 minutes of unavoidable CPU and is now the dominant cost. Moving those four calls into `asyncio.to_thread` (pandas/polars release the GIL for much of this work) is the highest-value remaining backend change.

**Exit criteria:** 500-ticker cold scan ≤ 6 min, warm ≤ 30 s. No event-loop stall > 100 ms under `asyncio` debug. React Profiler: SSE tick repaints only the progress bar. 5000-row table scrolls at 60 fps.

### Phase 2 — Layout overhaul, tab infrastructure & design system (1.5–2 weeks)

| # | Task |
|---|---|
| 2.1 | `AppShell`: one `h-dvh` model for **all** routes; delete the `isWorkspace` branch in `app-chrome.tsx:16-27` |
| 2.2 | `lib/verdict.ts` + `badge.tsx` success/warning/info variants; replace all ~529 hardcoded colors with tokens |
| 2.3 | New atoms: `StatusBadge`, `Sparkline`, `DotRating`, `SegmentBar`, `ScoreRing`, `DeltaText`, `MetricCard` |
| 2.4 | `TabShell` (Radix Tabs + URL sync + lazy mount, active panel only) |
| 2.5 | Left rail with 4 destinations; funnel becomes a TopBar progress meter |
| 2.6 | Screener view: merge Universe/Quality/Timing; filter drawer harvested from `filter-panel.tsx`; lens toggle |
| 2.7 | `DataTable` — virtualized, `role="row"`, keyboard nav, sticky header, column groups |
| 2.8 | `Inspector` pane + bottom-sheet variant below `lg` |
| 2.9 | Split `stock/[ticker]/page.tsx` (1294 lines) into `StockDetail.tsx` + 5 tab files; 88px fixed header; delete duplicate gauge + duplicate history table |
| 2.10 | Split `workspace-shell.tsx` (1047 lines) into `features/*` modules |
| 2.11 | Skeletons everywhere; `MarketBar` reserves height instead of returning `null` |
| 2.12 | a11y + RTL pass: 12px type floor, `aria-*` on interactive rows, glyph+color status, `components.json` `rtl: true`, mobile stacking for the 12-col grids |
| 2.13 | `next.config.ts` redirects for the 4 legacy routes; delete `redirect-to-workspace.tsx` and the orphaned components |

**Exit criteria:** Zero document scroll on any route. Stock detail tab bodies ≤ 1.25 viewports. `page.tsx` and `workspace-shell.tsx` both < 200 lines. Keyboard-navigable tables. No hardcoded hex in `src/`.

### Phase 3 — Data visualization & polish (1 week)

| # | Task |
|---|---|
| 3.1 | `charts/` wrappers on `chart-theme.ts`; delete the `ui/chart.tsx` stub |
| 3.2 | `PriceChart` (lightweight-charts) promoted to Overview |
| 3.3 | `CandlestickChart` + pattern overlays finally reachable on Technicals |
| 3.4 | `ValuationWaterfall` — **new**, the 7-step sticker breakdown as one visual instead of 7 paragraphs |
| 3.5 | `MarginChart` — **new**, gross/op/net trends |
| 3.6 | Synced crosshair across Price / MACD / Stochastic |
| 3.7 | `Sparkline` in every table cell that has history |
| 3.8 | Portfolio equity curve — **new** |
| 3.9 | `EvidenceChips` — AI prose → claim chips + expand |
| 3.10 | Export flow: PDF/CSV from any view, with the current filter set |
| 3.11 | Framer Motion (already installed): tab crossfade, inspector slide, row stagger — all `prefers-reduced-motion` aware |

**Exit criteria:** Every metric with history has a visual. No paragraph over 3 lines without progressive disclosure. Lighthouse ≥ 90 desktop.

---

## Part 4 — Actionable Refactoring Code Examples

### 4.1 Phase 0 — the P0 fix (as shipped)

Three copies of a `fmt` helper existed in the codebase — `market-bar.tsx:19` and `stock/[ticker]/page.tsx:29` — plus the missing one in `workspace-shell.tsx`. The two existing copies had **different semantics**, so they could not simply be merged:

| Copy | Placeholder | Grouping |
|---|---|---|
| `market-bar.tsx` | `—` | `toLocaleString` — thousands separators |
| `page.tsx` | `N/A` | `toFixed` — no separators |

The grouped variant is the correct one for financial tables (index levels and prices run to four figures), so it became canonical. `market-bar.tsx` was migrated to it — behaviour-identical, so zero visual change. The stock page's 46 call sites were **left alone**: switching them would change the placeholder and add separators across the whole page, which is a design-system decision that belongs in Phase 2, not a hotfix.

```ts
// frontend/src/lib/format.ts  — shipped
/**
 * Shared number formatting for dense financial tables.
 *
 * `fmt` groups thousands, which matters for index levels and prices that run
 * into four figures. Missing values render as an em dash rather than "N/A" so
 * that columns of numbers stay visually aligned.
 */
export function fmt(n: number | null | undefined, decimals = 2): string {
    if (n == null || Number.isNaN(n)) return "—";
    return n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}
```

Only `fmt` was extracted. The `pct` / `compact` / `money` helpers sketched earlier were deliberately **not** added, because nothing imports them yet — they arrive in Phase 2 when the stock page's local `fmtPct` / `fmtCap` / `fmtNum` are consolidated here.

```diff
--- a/frontend/src/components/workspace/workspace-shell.tsx
+++ b/frontend/src/components/workspace/workspace-shell.tsx
@@
 import { cn } from "@/lib/utils";
+import { fmt } from "@/lib/format";
 import { Button } from "@/components/ui/button";
```

For the type error, the root cause was `useState` inferring `ticker` as *required* from `ticker: undefined as string | undefined`, while the context interface declared it optional. Extracting the interface fixes it at the source instead of padding every call site:

```diff
--- a/frontend/src/components/workspace/workspace-context.tsx
+interface TimingProgress {
+  scanned: number;
+  total: number;
+  found: number;
+  ticker?: string;
+}
+
 interface WorkspaceContextValue {
@@
-  timingProgress: { scanned: number; total: number; found: number; ticker?: string };
+  timingProgress: TimingProgress;
@@
-  const [timingProgress, setTimingProgress] = useState({
-    scanned: 0,
-    total: 0,
-    found: 0,
-    ticker: undefined as string | undefined,
-  });
+  const [timingProgress, setTimingProgress] = useState<TimingProgress>({
+    scanned: 0,
+    total: 0,
+    found: 0,
+  });
```

And the orphaned tabs, plus removal of the speculative prefetch. `patternData` is consumed **only** inside the `patterns` panel, yet `loadPatterns` was wired to the `big5` and `three-tools` triggers — firing an expensive deep-fetch-plus-CPU endpoint on two tabs that never used the result:

```diff
--- a/frontend/src/app/stock/[ticker]/page.tsx
-<TabsTrigger value="big5" … onClick={loadPatterns}>
+<TabsTrigger value="big5" …>
     <Brain className="h-4 w-4 me-1.5" /> ניתוח עומק
 </TabsTrigger>
+<TabsTrigger value="financials" …>
+    <BarChart3 className="h-4 w-4 me-1.5" /> דוחות כספיים
+</TabsTrigger>
-<TabsTrigger value="three-tools" … onClick={loadPatterns}>
+<TabsTrigger value="three-tools" …>
     <Activity className="h-4 w-4 me-1.5" /> טכני
 </TabsTrigger>
+<TabsTrigger value="patterns" … onClick={loadPatterns}>
+    <ScanSearch className="h-4 w-4 me-1.5" /> דפוסים
+</TabsTrigger>
+<TabsTrigger value="analysis" …>
+    <ShieldCheck className="h-4 w-4 me-1.5" /> מוט וניהול
+</TabsTrigger>
```

### 4.2 Backend — token bucket replaces the blind sleep

```python
# backend/app/core/rate_limit.py
import asyncio
import time


class AsyncRateLimiter:
    """Shared token bucket. Bounds the *global* request rate to a provider,
    instead of paying a fixed sleep per call (which is both slower and weaker)."""

    def __init__(self, rate_per_sec: float, burst: float | None = None):
        self._rate = rate_per_sec
        self._capacity = burst if burst is not None else rate_per_sec
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: float = 1.0) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                self._tokens = min(
                    self._capacity, self._tokens + (now - self._updated) * self._rate
                )
                self._updated = now
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                wait_for = (tokens - self._tokens) / self._rate
            await asyncio.sleep(wait_for)


# Yahoo's unofficial ceiling is ~2000 req/hour. Six calls per deep ticker
# means ~5.5 deep tickers/sec is already generous; 8 tokens/sec with burst 16.
yahoo_limiter = AsyncRateLimiter(rate_per_sec=8.0, burst=16.0)
```

```python
# backend/app/data_service.py  — replaces lines 22-25
from app.core.cache import bundle_cache          # in-process TTL-LRU
from app.core.rate_limit import yahoo_limiter


class DataService:
    async def fetch_ticker_data(
        self, ticker: str, depth: str = "deep", *, force: bool = False
    ) -> Dict[str, Any]:
        key = f"{ticker}:{depth}"

        if not force:
            cached = bundle_cache.get(key)
            if cached is not None:
                return cached                      # warm path: no sleep, no network

        await yahoo_limiter.acquire()               # was: await asyncio.sleep(1.0)
        bundle = await asyncio.to_thread(self._fetch_sync, ticker, depth)

        # Statements move quarterly; 12h is safe and still same-session-fresh.
        bundle_cache.set(key, bundle, ttl=12 * 3600)
        return bundle
```

```python
# backend/app/core/cache.py
import time
from collections import OrderedDict
from typing import Any, Optional


class TTLCache:
    """In-process LRU+TTL. Holds pandas objects directly — no serialization cost,
    which is why raw provider bundles live here rather than in Redis."""

    def __init__(self, maxsize: int = 512):
        self._maxsize = maxsize
        self._data: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._data[key] = (time.monotonic() + ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)


bundle_cache = TTLCache(maxsize=512)
```

Redis (`cache_service.py`) keeps the **analysis JSON**, which is already serializable — so both tiers get used for what they're each good at:

```python
# inside _analyze_ticker, before doing any work
cached = await cache_service.get_analysis(ticker)
if cached and not force:
    return cached
...
await cache_service.set_analysis(ticker, result, expire=6 * 3600)
```

### 4.3 Backend — parallel orchestrator replaces sequential BackgroundTasks

```python
# backend/app/services/scan_orchestrator.py
import asyncio
import logging
import os
from typing import Awaitable, Callable, Iterable

logger = logging.getLogger(__name__)
SCAN_CONCURRENCY = int(os.getenv("SCAN_CONCURRENCY", "6"))


async def run_bounded(
    tickers: Iterable[str],
    worker: Callable[[str], Awaitable[None]],
    *,
    concurrency: int = SCAN_CONCURRENCY,
) -> None:
    """Run `worker` over tickers with bounded concurrency.

    Replaces Starlette BackgroundTasks, which awaits its queue strictly
    sequentially and therefore serialized every scan.
    """
    sem = asyncio.Semaphore(concurrency)

    async def guarded(ticker: str) -> None:
        async with sem:
            try:
                await worker(ticker)
            except Exception:
                logger.exception("[scan] %s failed", ticker)

    await asyncio.gather(*(guarded(t) for t in tickers))
```

```python
# backend/app/api.py — replaces lines 633-643
@app.post("/scan")
async def start_scan(request: ScanRequest):
    tickers = [t.strip().upper() for t in request.tickers if t.strip()]
    for ticker in tickers:
        scan_progress[ticker] = "queued"
        hub.publish({"type": "progress", "ticker": ticker, "status": "queued"})

    # One task for the whole scan, internally concurrent — not N serialized tasks.
    asyncio.create_task(run_bounded(tickers, process_ticker))

    return {"message": f"Started scan for {len(tickers)} tickers.", "tickers": tickers}
```

The library scan (`api.py:1025-1063`) collapses to the same primitive, and its `await asyncio.sleep(0.5)` disappears — the token bucket now owns rate limiting:

```python
async def _run_library_scan(tickers: List[str], universe: str = "all"):
    global library_scanning
    try:
        for t in tickers:
            library_progress[t] = "queued"
        await run_bounded(tickers, _library_worker)
    finally:
        library_scanning = False
        await asyncio.to_thread(_save_library_results)   # was blocking the loop
```

### 4.4 Backend — get the AI call off the event loop

```diff
--- a/backend/app/api.py
+++ b/backend/app/api.py
@@ -390,7 +390,7 @@
-    if GEMINI_API_KEY:
+    if GEMINI_API_KEY and include_ai:
         try:
             summary = info.get("longBusinessSummary", "No summary available.")
-            ai_results = ai_analyzer.analyze_moat_and_management(
+            # requests.post is synchronous with a 30s timeout — without to_thread
+            # it stalls every other request, including the progress SSE stream.
+            ai_results = await asyncio.to_thread(
+                ai_analyzer.analyze_moat_and_management,
                 ticker,
                 business_summary=summary,
                 risk_factors="Not available in free feed.",
                 earnings_transcript="Not available in free feed.",
             )
```

`_analyze_ticker(ticker, raw_data, *, include_ai: bool = True)`; bulk scans pass `include_ai=False` and the UI lazy-loads AI per ticker from `GET /stock/{ticker}/ai`. On a 500-name scan that removes up to 500 × 30 s of worst-case stalling from the critical path.

### 4.5 Backend — SSE deltas instead of full re-serialization

```python
# backend/app/core/events.py
import asyncio
from typing import Any, Dict, Set


class EventHub:
    """Fan-out pub/sub. Replaces 1s polling of module-level globals."""

    def __init__(self, maxsize: int = 512):
        self._subscribers: Set[asyncio.Queue] = set()
        self._maxsize = maxsize

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._maxsize)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def publish(self, event: Dict[str, Any]) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                self._subscribers.discard(q)   # slow consumer: drop it


hub = EventHub()
```

```python
# backend/app/api.py — replaces lines 646-671
@app.get("/events")
async def sse_endpoint(request: Request):
    queue = hub.subscribe()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"        # keep proxies from closing
                    continue

                yield f"data: {json.dumps(event, cls=_SafeEncoder)}\n\n"

                if event.get("type") == "scan_complete":
                    break
        finally:
            hub.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

Producers emit small, additive events. `summarize_row` returns the ~10 fields the table needs, not the whole analysis blob:

```python
scan_progress[ticker] = "complete"
hub.publish({"type": "progress", "ticker": ticker, "status": "complete"})
hub.publish({"type": "result", "ticker": ticker, "row": summarize_row(result)})
```

Bandwidth goes from O(N²) over a scan to O(N).

### 4.6 Frontend — React Query + a scan store that doesn't re-render the app

```tsx
// frontend/src/lib/api/query-provider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Financial statements change quarterly — there is no reason to
            // refetch them on every mount, tab change, or window focus.
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

```ts
// frontend/src/lib/api/query-keys.ts
export const queryKeys = {
  universes: ["universes"] as const,
  library: (universe: string) => ["library", universe] as const,
  stock: (ticker: string) => ["stock", ticker] as const,
  stockAi: (ticker: string) => ["stock", ticker, "ai"] as const,
  patterns: (ticker: string) => ["stock", ticker, "patterns"] as const,
  watchlist: ["watchlist"] as const,
};
```

The SSE stream writes into a Zustand store, **outside** React's context graph, so a tick notifies only the components that select the slice they need:

```ts
// frontend/src/stores/scan-store.ts
import { create } from "zustand";

type ScanEvent =
  | { type: "progress"; ticker: string; status: string }
  | { type: "result"; ticker: string; row: ScanRow }
  | { type: "scan_complete" };

type ScanState = {
  progress: Record<string, string>;
  rows: Record<string, ScanRow>;
  running: boolean;
  apply: (event: ScanEvent) => void;
  reset: () => void;
};

export const useScanStore = create<ScanState>((set) => ({
  progress: {},
  rows: {},
  running: false,
  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case "progress":
          return { progress: { ...state.progress, [event.ticker]: event.status } };
        case "result":
          return { rows: { ...state.rows, [event.ticker]: event.row } };
        case "scan_complete":
          return { running: false };
      }
    }),
  reset: () => set({ progress: {}, rows: {}, running: false }),
}));

// Selectors — a progress tick repaints the 24px progress bar and nothing else.
export const useScanCounts = () =>
  useScanStore((s) => {
    const keys = Object.keys(s.progress);
    return { total: keys.length, done: keys.filter((k) => s.progress[k] === "complete").length };
  });
```

```ts
// frontend/src/features/screener/use-scan-stream.ts
import { useEffect, useRef } from "react";
import { useScanStore } from "@/stores/scan-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useScanStream(enabled: boolean) {
  const apply = useScanStore((s) => s.apply);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`${API_URL}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        apply(JSON.parse(ev.data));
      } catch {
        /* keepalive comments and malformed frames are ignored */
      }
    };
    es.onerror = () => es.close();

    // The current implementation closes only on done/error, so navigating away
    // mid-scan leaks the stream and writes into an unmounted tree.
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled, apply]);
}
```

And the remaining context becomes small and memoized:

```tsx
// frontend/src/features/screener/workspace-ui-context.tsx
const value = useMemo(
  () => ({ tab, setTab, selectedUniverse, setSelectedUniverse, selectedSymbol, selectSymbol }),
  [tab, setTab, selectedUniverse, setSelectedUniverse, selectedSymbol, selectSymbol]
);
```

### 4.7 Frontend — virtualized screener table

```tsx
// frontend/src/features/screener/virtual-stock-table.tsx
"use client";

import { memo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fmt, pct } from "@/lib/format";
import { VERDICT } from "@/lib/verdict";
import { StatusBadge } from "@/components/ui/status-badge";
import { WatchlistButton } from "@/components/watchlist-button";
import type { QualityRow } from "@/lib/api/types";

const ROW_HEIGHT = 34;
const GRID = "grid grid-cols-[32px_72px_1fr_88px_88px_88px_72px_64px_56px_40px] items-center";

// Virtualization uses transforms, so rows must be CSS-grid divs rather than
// <tr> elements. role="row"/"gridcell" keeps it a table to assistive tech.
const StockRow = memo(function StockRow({
  row,
  selected,
  onSelect,
}: {
  row: QualityRow;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const verdict = row.verdict ? VERDICT[row.verdict] : undefined;
  const discount =
    row.price && row.mos_price ? ((row.mos_price - row.price) / row.mos_price) * 100 : null;

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(row.symbol)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row.symbol);
        }
      }}
      className={`${GRID} h-[34px] cursor-pointer border-b border-border/40 px-2 text-xs
                  outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring
                  ${selected ? "bg-accent/60" : ""}`}
    >
      <div role="gridcell" onClick={(e) => e.stopPropagation()}>
        <WatchlistButton symbol={row.symbol} size="sm" />
      </div>
      <div role="gridcell" className="font-mono font-medium">{row.symbol}</div>
      <div role="gridcell" className="truncate text-muted-foreground">{row.company_name}</div>
      <div role="gridcell">{verdict && <StatusBadge token={verdict.token}>{verdict.he}</StatusBadge>}</div>
      <div role="gridcell" className="text-end font-mono">{fmt(row.price)}</div>
      <div role="gridcell" className="text-end font-mono">{fmt(row.mos_price)}</div>
      <div
        role="gridcell"
        className={`text-end font-mono ${
          discount == null ? "" : discount > 0 ? "text-success" : "text-destructive"
        }`}
      >
        {discount == null ? "—" : pct(discount)}
      </div>
      <div role="gridcell"><DotRating value={row.moat_score} max={10} /></div>
      <div role="gridcell"><SegmentBar segments={row.big5_flags} /></div>
      <div role="gridcell" className="text-end text-muted-foreground">›</div>
    </div>
  );
});

export function VirtualStockTable({
  rows,
  selectedSymbol,
  onSelect,
}: {
  rows: QualityRow[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 12,
  });

  return (
    <div className="flex h-full min-h-0 flex-col" role="grid" aria-rowcount={rows.length}>
      <div className={`${GRID} h-8 shrink-0 border-b border-border bg-card px-2
                       text-[11px] font-medium uppercase text-muted-foreground`} role="row">
        <div /> <div>Sym</div> <div>Company</div> <div>Verdict</div>
        <div className="text-end">Price</div> <div className="text-end">MOS</div>
        <div className="text-end">Disc</div> <div>Moat</div> <div>Big5</div> <div />
      </div>

      {/* the only scroll container in the view */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto custom-scrollbar">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={row.symbol}
                style={{
                  position: "absolute",
                  top: 0,
                  insetInlineStart: 0,   // logical property: RTL-safe
                  width: "100%",
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <StockRow row={row} selected={row.symbol === selectedSymbol} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Paired with a single watchlist provider, which removes the up-to-500 duplicate `/watchlist` requests:

```tsx
// frontend/src/hooks/use-watchlist.tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-keys";

const WatchlistContext = createContext<{
  symbols: Set<string>;
  toggle: (symbol: string) => void;
} | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: queryKeys.watchlist, queryFn: fetchWatchlist });

  const { mutate: toggle } = useMutation({
    mutationFn: toggleWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.watchlist }),
  });

  const value = useMemo(
    () => ({ symbols: new Set(data?.symbols ?? []), toggle }),
    [data, toggle]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

// One fetch for the whole app; every button is a pure consumer.
export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
```

### 4.8 Frontend — the tabbed container

```tsx
// frontend/src/components/ui/tab-shell.tsx
"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

export type TabDef = { id: string; label: string; icon?: React.ComponentType<{ className?: string }> };

/**
 * Fixed-height tab chrome + a single scrollable body.
 * Only the active panel is mounted, so hidden tabs cost no render and,
 * critically, no chart instances.
 */
export function TabShell({
  tabs,
  defaultTab,
  paramKey = "tab",
  actions,
  children,
}: {
  tabs: TabDef[];
  defaultTab: string;
  paramKey?: string;
  actions?: ReactNode;
  children: (activeTab: string) => ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get(paramKey) ?? defaultTab;

  const setActive = useCallback(
    (next: string) => {
      const url = new URLSearchParams(params.toString());
      url.set(paramKey, next);
      router.replace(`?${url.toString()}`, { scroll: false });
    },
    [params, paramKey, router]
  );

  return (
    <Tabs.Root
      value={active}
      onValueChange={setActive}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2">
        <Tabs.List className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium
                         text-muted-foreground transition-colors hover:text-foreground
                         data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {actions}
      </div>

      <Tabs.Content
        value={active}
        forceMount
        className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4"
      >
        {children(active)}
      </Tabs.Content>
    </Tabs.Root>
  );
}
```

```tsx
// frontend/src/features/stock-detail/StockDetail.tsx  — replaces a 1294-line file
"use client";

import { lazy, Suspense } from "react";
import { Gauge, Calculator, FileText, Activity, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { TabShell } from "@/components/ui/tab-shell";
import { StockHeader } from "./StockHeader";
import { StockDetailSkeleton } from "./StockDetailSkeleton";
import { queryKeys } from "@/lib/api/query-keys";

const OverviewTab   = lazy(() => import("./tabs/OverviewTab"));
const ValuationTab  = lazy(() => import("./tabs/ValuationTab"));
const FinancialsTab = lazy(() => import("./tabs/FinancialsTab"));
const TechnicalsTab = lazy(() => import("./tabs/TechnicalsTab"));
const InsightsTab   = lazy(() => import("./tabs/InsightsTab"));

const TABS = [
  { id: "overview",   label: "סקירה", icon: Gauge },
  { id: "valuation",  label: "שווי",   icon: Calculator },
  { id: "financials", label: "דוחות",  icon: FileText },   // was orphaned
  { id: "technicals", label: "טכני",   icon: Activity },   // absorbs orphaned patterns
  { id: "insights",   label: "AI",     icon: Sparkles },   // was orphaned
];

export function StockDetail({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.stock(ticker),
    queryFn: ({ signal }) => fetchStock(ticker, signal),   // cancellable
  });

  if (isLoading) return <StockDetailSkeleton />;
  if (error || !data) return <StockDetailError ticker={ticker} error={error} />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <StockHeader data={data} />
      <TabShell tabs={TABS} defaultTab="overview" actions={<ExportMenu ticker={ticker} />}>
        {(tab) => (
          <Suspense fallback={<TabSkeleton />}>
            {tab === "overview"   && <OverviewTab data={data} />}
            {tab === "valuation"  && <ValuationTab data={data} />}
            {tab === "financials" && <FinancialsTab data={data} />}
            {tab === "technicals" && <TechnicalsTab ticker={ticker} data={data} />}
            {tab === "insights"   && <InsightsTab ticker={ticker} data={data} />}
          </Suspense>
        )}
      </TabShell>
    </div>
  );
}
```

The valuation calculator — currently the cause of a full 1294-line re-render on every slider drag — becomes self-contained:

```tsx
// frontend/src/features/stock-detail/tabs/ValuationCalculator.tsx
"use client";

import { memo, useMemo, useState } from "react";
import { fmt } from "@/lib/format";

// Slider state lives here, so dragging repaints this card only — not the
// page's five Recharts trees.
export const ValuationCalculator = memo(function ValuationCalculator({
  baseEps,
  historicPe,
}: {
  baseEps: number;
  historicPe: number;
}) {
  const [growth, setGrowth] = useState(0.15);
  const [mosPct, setMosPct] = useState(0.5);

  const result = useMemo(() => {
    const futureEps = baseEps * (1 + growth) ** 10;
    const futurePe = Math.min(2 * growth * 100, historicPe);
    const sticker = (futureEps * futurePe) / 1.15 ** 10;
    return { futureEps, futurePe, sticker, mos: sticker * mosPct };
  }, [baseEps, growth, historicPe, mosPct]);

  return (
    <Card>
      <GrowthSlider value={growth} onChange={setGrowth} />
      <MosSlider value={mosPct} onChange={setMosPct} />
      <div className="grid grid-cols-2 gap-2 font-mono text-sm">
        <Stat label="Sticker" value={fmt(result.sticker)} />
        <Stat label="MOS" value={fmt(result.mos)} tone="success" />
      </div>
    </Card>
  );
});
```

### 4.9 Dependencies to add

```bash
cd frontend
npm i @tanstack/react-query @tanstack/react-virtual zustand
npm i -D @tanstack/react-query-devtools
```

Nothing new is needed for charts — `recharts@3.7` and `lightweight-charts@5.1` are already installed and under-used. Backend needs no new packages; `redis` is already in `requirements.txt` and merely unwired. Remove `openbb`.

---

## Appendix — Verification commands

```powershell
# Phase 0 gate
cd frontend; npx tsc --noEmit          # must be clean (currently 13 errors)

# Confirm the orphaned tabs are wired
Select-String -Path "frontend/src/app/stock/[ticker]/page.tsx" -Pattern "TabsTrigger value=|TabsContent value="

# Confirm no hardcoded hex survives Phase 2
Select-String -Path "frontend/src/**/*.tsx" -Pattern "#[0-9a-fA-F]{6}"

# Backend: prove the loop is never blocked
$env:PYTHONASYNCIODEBUG=1; python -m uvicorn app.main:app --port 8000
```

### Sequencing note

Phase 0 → **re-measure** → Phase 1 → Phase 2 → Phase 3. Phases 1 and 2 can run in parallel across two people (Phase 1 is data/state, Phase 2 is layout/design system) provided `lib/format.ts` and `lib/verdict.ts` land first, since both phases import them. Do not start Phase 3 before Phase 2's `chart-theme.ts` exists, or the hardcoded-hex problem will simply be recreated in new files.

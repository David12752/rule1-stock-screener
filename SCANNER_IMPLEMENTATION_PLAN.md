# 🔍 AlphaScanner — Technical Pattern Scanner Implementation Plan

> **מערכת סריקת תבניות טכניות** משולבת באפליקציית Rule #1 הקיימת.
> מותאם ל-Stack הקיים: **Next.js 16 + FastAPI + Python**

---

## 📋 תקציר

הוספת מודול **Stock Scanner** שמזהה תבניות טכניות (Cup & Handle, Head & Shoulders, Double Bottom/Top, ועוד) על כל מניות ה-S&P 500, עם פילטרים מתקדמים וממשק משתמש Dark Mode מקצועי.

**הערה חשובה:** הגמיני הציע Flutter — אבל לנו כבר יש Next.js frontend עובד. נישאר עם Next.js + Recharts ונרחיב אותו.

---

## 🏗️ ארכיטקטורה כללית

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend                    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Scanner   │  │ Pattern  │  │  Candlestick     │ │
│  │  Page      │  │ Details  │  │  Chart Component │ │
│  └───────────┘  └──────────┘  └──────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ REST API + SSE
┌──────────────────────┴──────────────────────────────┐
│                  FastAPI Backend                      │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Scanner   │  │  Pattern     │  │  Indicators  │ │
│  │  API       │  │  Detection   │  │  Engine      │ │
│  │  Routes    │  │  Engine      │  │  (pandas_ta) │ │
│  └───────────┘  └──────────────┘  └──────────────┘ │
│  ┌───────────┐  ┌──────────────┐                    │
│  │  Data      │  │  Cache       │                    │
│  │  Service   │  │  (Redis)     │                    │
│  └───────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────┘
```

---

## 📦 תלויות חדשות (הכל חינמי / קוד פתוח)

### Backend (Python)
| ספרייה | מטרה | רישיון |
|---------|-------|--------|
| `scipy` | `signal.find_peaks` — זיהוי שיאים ושפלים | BSD |
| `scikit-learn` | נורמליזציה, DTW, clustering לתבניות | BSD |
| `numpy` (כבר קיים) | חישובים מתמטיים | BSD |
| `pandas-ta` (כבר קיים) | אינדיקטורים טכניים | MIT |
| `yfinance` (כבר קיים) | מקור נתונים | Apache 2.0 |

### Frontend (Next.js)
| ספרייה | מטרה | רישיון |
|---------|-------|--------|
| `lightweight-charts` | גרפי נרות יפניים מקצועיים (TradingView) | Apache 2.0 |
| `recharts` (כבר קיים) | גרפים כלליים | MIT |

---

## 📅 שלבי הפיתוח

---

### 🔵 Phase 1: תשתית הסריקה — Backend Pattern Detection Engine
**קבצים חדשים:** `backend/app/pattern_detector.py`, `backend/app/scanner_service.py`
**זמן משוער:** 3-4 ימי עבודה

#### 1.1 מנוע זיהוי Peaks/Troughs (`pattern_detector.py`)

```python
# backend/app/pattern_detector.py

import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from dataclasses import dataclass
from typing import List, Optional, Tuple
from enum import Enum

class PatternType(str, Enum):
    CUP_AND_HANDLE = "cup_and_handle"
    HEAD_AND_SHOULDERS = "head_and_shoulders"
    INVERSE_HEAD_AND_SHOULDERS = "inverse_head_and_shoulders" 
    DOUBLE_BOTTOM = "double_bottom"
    DOUBLE_TOP = "double_top"
    ASCENDING_TRIANGLE = "ascending_triangle"
    DESCENDING_TRIANGLE = "descending_triangle"
    BULL_FLAG = "bull_flag"
    BEAR_FLAG = "bear_flag"

@dataclass
class PatternMatch:
    pattern_type: PatternType
    confidence: float          # 0.0 - 1.0
    start_date: str
    end_date: str
    start_idx: int
    end_idx: int
    key_points: List[dict]     # [{date, price, label}]
    target_price: Optional[float] = None
    description: str = ""

class PatternDetector:
    """Core engine for detecting chart patterns using geometric analysis."""
    
    def __init__(self, df: pd.DataFrame):
        """
        df must have columns: Date (index or column), Open, High, Low, Close, Volume
        """
        self.df = df.copy()
        self.close = df['Close'].values
        self.high = df['High'].values
        self.low = df['Low'].values
        self.volume = df['Volume'].values
        self.dates = df.index if isinstance(df.index, pd.DatetimeIndex) else pd.to_datetime(df.index)
    
    def find_peaks_troughs(self, window: int = 20) -> Tuple[np.ndarray, np.ndarray]:
        """Find local peaks and troughs using scipy."""
        peaks, _ = find_peaks(self.close, distance=window, prominence=self.close.std() * 0.3)
        troughs, _ = find_peaks(-self.close, distance=window, prominence=self.close.std() * 0.3)
        return peaks, troughs
    
    def detect_cup_and_handle(self, lookback: int = 120) -> List[PatternMatch]:
        """Detect Cup & Handle pattern."""
        # Algorithm:
        # 1. Find a peak (left rim)
        # 2. Find a trough (cup bottom) — must be rounded (not V-shaped)
        # 3. Price returns to near the left rim level (right rim)
        # 4. Small pullback with declining volume (handle)
        # 5. Breakout above rim level
        ...
    
    def detect_head_and_shoulders(self, lookback: int = 120) -> List[PatternMatch]:
        """Detect Head & Shoulders (bearish) pattern."""
        # Algorithm:
        # 1. Find 3 peaks where middle peak is highest
        # 2. Two troughs between them form the "neckline"
        # 3. Shoulders should be roughly symmetrical
        # 4. Volume typically decreases from left shoulder to head to right shoulder
        ...
    
    def detect_double_bottom(self, lookback: int = 90) -> List[PatternMatch]:
        """Detect Double Bottom (bullish reversal)."""
        ...
    
    def detect_double_top(self, lookback: int = 90) -> List[PatternMatch]:
        """Detect Double Top (bearish reversal)."""
        ...
    
    def scan_all_patterns(self) -> List[PatternMatch]:
        """Run all pattern detection algorithms."""
        results = []
        results.extend(self.detect_cup_and_handle())
        results.extend(self.detect_head_and_shoulders())
        results.extend(self.detect_double_bottom())
        results.extend(self.detect_double_top())
        # Sort by confidence descending
        results.sort(key=lambda x: x.confidence, reverse=True)
        return results
```

#### 1.2 שירות הסריקה (`scanner_service.py`)

```python
# backend/app/scanner_service.py

class ScannerService:
    """Orchestrates scanning across multiple tickers."""
    
    def __init__(self, data_service: DataService):
        self.data_service = data_service
    
    async def scan_universe(
        self,
        tickers: List[str],
        patterns: List[PatternType],
        filters: ScannerFilters,
        on_progress: Callable  # callback for SSE updates
    ) -> List[ScannerResult]:
        """
        Scan a list of tickers for specified patterns with filters.
        
        Filters include:
        - min_market_cap / max_market_cap
        - min_volume
        - min_confidence (0.0-1.0)
        - sector filter
        - price range
        - beta range
        - RSI range
        - MA crossover filters
        """
        ...
```

#### 1.3 משימות ספציפיות — Phase 1

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 1.1 | הוספת `scipy`, `scikit-learn` ל-requirements.txt | `backend/requirements.txt` | תלויות חדשות |
| 1.2 | בניית `PatternDetector` class | `backend/app/pattern_detector.py` | **קובץ חדש** — הליבה של הזיהוי |
| 1.3 | מימוש `detect_cup_and_handle()` | `backend/app/pattern_detector.py` | אלגוריתם Cup & Handle |
| 1.4 | מימוש `detect_head_and_shoulders()` | `backend/app/pattern_detector.py` | אלגוריתם H&S + Inverse H&S |
| 1.5 | מימוש `detect_double_bottom()` / `detect_double_top()` | `backend/app/pattern_detector.py` | אלגוריתמי Double patterns |
| 1.6 | בניית `ScannerService` class | `backend/app/scanner_service.py` | **קובץ חדש** — תיאום הסריקה |
| 1.7 | Unit tests לכל אלגוריתם | `backend/tests/test_patterns.py` | **קובץ חדש** — בדיקות עם נתונים סינתטיים |

---

### 🟢 Phase 2: API Routes — חשיפת הסורק דרך FastAPI
**קובץ:** `backend/app/api.py` (הרחבה)
**זמן משוער:** 1-2 ימי עבודה

#### 2.1 Endpoints חדשים

```python
# ── Scanner Models ────────────────────────────────────────────
class ScannerRequest(BaseModel):
    """Request body for pattern scanning."""
    patterns: List[str] = ["cup_and_handle"]  # Pattern types to scan for
    tickers: Optional[List[str]] = None       # None = scan all S&P 500
    filters: Optional[dict] = None            # {min_market_cap, min_volume, sector, etc.}
    min_confidence: float = 0.6               # Minimum confidence threshold
    timeframe: str = "1y"                     # Lookback period: 3m, 6m, 1y, 2y

class ScannerResultResponse(BaseModel):
    symbol: str
    company_name: str
    pattern: str
    confidence: float
    start_date: str
    end_date: str
    current_price: float
    target_price: Optional[float]
    key_points: List[dict]
    volume_avg: float
    market_cap: float
    sector: str
    description: str


# ── Scanner Endpoints ─────────────────────────────────────────

@app.post("/scanner/scan")
async def start_pattern_scan(request: ScannerRequest, background_tasks: BackgroundTasks):
    """Start a pattern scan across specified tickers."""
    ...

@app.get("/scanner/events")
async def scanner_sse(request: Request):
    """SSE stream for scanner progress updates."""
    ...

@app.get("/scanner/results")
async def get_scanner_results():
    """Get all scanner results."""
    ...

@app.get("/scanner/patterns")
async def list_available_patterns():
    """List all detectable patterns with descriptions."""
    return [
        {"id": "cup_and_handle", "name": "Cup & Handle", "type": "bullish", "description": "..."},
        {"id": "head_and_shoulders", "name": "Head & Shoulders", "type": "bearish", "description": "..."},
        {"id": "inverse_head_and_shoulders", "name": "Inverse H&S", "type": "bullish", "description": "..."},
        {"id": "double_bottom", "name": "Double Bottom", "type": "bullish", "description": "..."},
        {"id": "double_top", "name": "Double Top", "type": "bearish", "description": "..."},
        {"id": "ascending_triangle", "name": "Ascending Triangle", "type": "bullish", "description": "..."},
        {"id": "descending_triangle", "name": "Descending Triangle", "type": "bearish", "description": "..."},
        {"id": "bull_flag", "name": "Bull Flag", "type": "bullish", "description": "..."},
        {"id": "bear_flag", "name": "Bear Flag", "type": "bearish", "description": "..."},
    ]

@app.get("/scanner/stock/{ticker}/patterns")  
async def get_stock_patterns(ticker: str, timeframe: str = "1y"):
    """Get detected patterns for a specific stock."""
    ...
```

#### 2.2 משימות ספציפיות — Phase 2

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 2.1 | הגדרת Pydantic models לסורק | `backend/app/api.py` | `ScannerRequest`, `ScannerResultResponse` |
| 2.2 | Route: `POST /scanner/scan` | `backend/app/api.py` | הפעלת סריקה ברקע |
| 2.3 | Route: `GET /scanner/events` (SSE) | `backend/app/api.py` | עדכוני זמן-אמת |
| 2.4 | Route: `GET /scanner/results` | `backend/app/api.py` | שליפת תוצאות |
| 2.5 | Route: `GET /scanner/patterns` | `backend/app/api.py` | רשימת תבניות זמינות |
| 2.6 | Route: `GET /scanner/stock/{ticker}/patterns` | `backend/app/api.py` | תבניות למניה ספציפית |
| 2.7 | אינטגרציה עם ה-`data_service` הקיים | `backend/app/api.py` | שימוש חוזר בשירות הנתונים |

---

### 🟡 Phase 3: Frontend — Scanner Page & Components
**קבצים חדשים:** `frontend/src/app/scanner/page.tsx`, components חדשים
**זמן משוער:** 4-5 ימי עבודה

#### 3.1 מבנה דפים ורכיבים חדשים

```
frontend/src/
├── app/
│   └── scanner/
│       └── page.tsx              ← דף ה-Scanner הראשי
├── components/
│   ├── scanner/
│   │   ├── pattern-selector.tsx  ← בחירת תבניות (Dropdown)
│   │   ├── filter-panel.tsx      ← פאנל פילטרים (Market Cap, Volume, Beta, etc.)
│   │   ├── scan-results-table.tsx← טבלת תוצאות
│   │   └── scan-progress.tsx     ← Progress bar לסריקה
│   └── candlestick-chart.tsx     ← גרף נרות עם lightweight-charts
```

#### 3.2 Scanner Page — עיצוב

```
┌─────────────────────────────────────────────────────────────┐
│  Navbar [Dashboard] [Library] [Scanner]          [Search]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── Pattern Selection ──────────────────────────────────┐ │
│  │ [Cup & Handle ▼] [H&S ▼] [Double Bottom ▼] [+ More]   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── Filters ────────────────────────────────────────────┐ │
│  │ Market Cap: [All ▼]  Volume: [>1M ▼]  Sector: [All ▼] │ │
│  │ Beta: [0-2 ▼]  RSI: [Any ▼]  Confidence: [>60% ▼]    │ │
│  │                                        [🔍 SCAN NOW]   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── Results (47 matches found) ─────────────────────────┐ │
│  │ ┌──────────────────────────────────────────────────┐   │ │
│  │ │ AAPL  Cup & Handle  ⭐ 87% confidence            │   │ │
│  │ │ $185.20  |  Target: $210  |  Tech  |  Vol: 52M   │   │ │
│  │ │ ┌──── Mini Chart (sparkline) ──────────────┐     │   │ │
│  │ │ │  📈 ~~~~~~\___/~~~~~~~ ↗                  │     │   │ │
│  │ │ └──────────────────────────────────────────┘     │   │ │
│  │ └──────────────────────────────────────────────────┘   │ │
│  │ ┌──────────────────────────────────────────────────┐   │ │
│  │ │ MSFT  Head & Shoulders  ⚠️ 72% confidence        │   │ │
│  │ │ ...                                               │   │ │
│  │ └──────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─── Pattern Detail (click on result) ───────────────────┐ │
│  │  Full Candlestick Chart with pattern overlay            │ │
│  │  Key points marked: Left Rim, Cup Bottom, Right Rim,   │ │
│  │  Handle, Breakout line                                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Candlestick Chart Component (`lightweight-charts`)

```tsx
// frontend/src/components/candlestick-chart.tsx
// Uses TradingView's lightweight-charts (free, Apache 2.0)
// Features:
// - Japanese candlesticks (OHLC)
// - Volume bars at bottom
// - Pattern overlay markers (key points)
// - Support/Resistance lines
// - Responsive & mobile-friendly
```

#### 3.4 משימות ספציפיות — Phase 3

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 3.1 | התקנת `lightweight-charts` | `frontend/package.json` | `npm install lightweight-charts` |
| 3.2 | בניית `CandlestickChart` component | `frontend/src/components/candlestick-chart.tsx` | **קובץ חדש** — גרף נרות מקצועי |
| 3.3 | בניית `PatternSelector` component | `frontend/src/components/scanner/pattern-selector.tsx` | **קובץ חדש** — בחירת תבניות |
| 3.4 | בניית `FilterPanel` component | `frontend/src/components/scanner/filter-panel.tsx` | **קובץ חדש** — פילטרים |
| 3.5 | בניית `ScanResultsTable` component | `frontend/src/components/scanner/scan-results-table.tsx` | **קובץ חדש** — טבלת תוצאות |
| 3.6 | בניית `ScanProgress` component | `frontend/src/components/scanner/scan-progress.tsx` | **קובץ חדש** — התקדמות |
| 3.7 | בניית דף `Scanner` | `frontend/src/app/scanner/page.tsx` | **קובץ חדש** — הדף הראשי |
| 3.8 | עדכון `Navbar` — הוספת לינק Scanner | `frontend/src/components/navbar.tsx` | הוספת טאב חדש |
| 3.9 | הוספת Pattern overlay על stock detail page | `frontend/src/app/stock/[ticker]/page.tsx` | טאב חדש "Patterns" |

---

### 🟠 Phase 4: אינדיקטורים מתקדמים ופילטרים
**קבצים:** `backend/app/indicators.py` (הרחבה), `backend/app/scanner_service.py`
**זמן משוער:** 2-3 ימי עבודה

#### 4.1 אינדיקטורים חדשים לסינון

הרחבת `indicators.py` הקיים כדי לתמוך בפילטרים:

```python
def calculate_scanner_indicators(df: pd.DataFrame) -> dict:
    """Calculate all indicators needed for scanner filtering."""
    return {
        "sma_20": ta.sma(df['Close'], length=20).iloc[-1],
        "sma_50": ta.sma(df['Close'], length=50).iloc[-1],
        "sma_200": ta.sma(df['Close'], length=200).iloc[-1],
        "rsi_14": ta.rsi(df['Close'], length=14).iloc[-1],
        "atr_14": ta.atr(df['High'], df['Low'], df['Close'], length=14).iloc[-1],
        "avg_volume_20": df['Volume'].tail(20).mean(),
        "avg_volume_50": df['Volume'].tail(50).mean(),
        "beta": calculate_beta(df),  # vs SPY
        "relative_strength": calculate_relative_strength(df),  # RS rating
        "above_sma_200": df['Close'].iloc[-1] > ta.sma(df['Close'], length=200).iloc[-1],
        "golden_cross": check_golden_cross(df),
        "death_cross": check_death_cross(df),
    }
```

#### 4.2 סינונים זמינים (לפי ממשק המשתמש)

| פילטר | ערכים אפשריים | מקור |
|--------|-----------------|------|
| Pattern Type | Cup & Handle, H&S, Double Bottom, etc. | pattern_detector |
| Market Cap | Micro, Small, Mid, Large, Mega | yfinance `info.marketCap` |
| Average Volume | >100K, >500K, >1M, >5M | חישוב מ-history |
| Sector | 11 GICS sectors | stock_index.json |
| Beta | 0-0.5, 0.5-1, 1-1.5, 1.5-2, >2 | חישוב vs SPY |
| RSI | Oversold (<30), Neutral (30-70), Overbought (>70) | pandas_ta |
| Price vs SMA200 | Above / Below | חישוב |
| Min. Confidence | 50%, 60%, 70%, 80%, 90% | pattern_detector |

#### 4.3 משימות ספציפיות — Phase 4

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 4.1 | הוספת `calculate_scanner_indicators()` | `backend/app/indicators.py` | פונקציה חדשה |
| 4.2 | מימוש `calculate_beta()` | `backend/app/indicators.py` | Beta vs SPY |
| 4.3 | מימוש `calculate_relative_strength()` | `backend/app/indicators.py` | RS Rating |
| 4.4 | מימוש `check_golden_cross()` / `check_death_cross()` | `backend/app/indicators.py` | MA Crossovers |
| 4.5 | אינטגרציה של האינדיקטורים ב-`ScannerService` | `backend/app/scanner_service.py` | חיבור לפילטרים |

---

### 🔴 Phase 5: אלגוריתמים מתקדמים נוספים
**זמן משוער:** 3-4 ימי עבודה

#### 5.1 תבניות נוספות למימוש

| תבנית | סוג | קושי | תיאור האלגוריתם |
|--------|------|-------|------------------|
| **Ascending Triangle** | Bullish | בינוני | קו עליון אופקי + קו תחתון עולה (higher lows) |
| **Descending Triangle** | Bearish | בינוני | קו תחתון אופקי + קו עליון יורד (lower highs) |
| **Bull Flag** | Bullish | קל-בינוני | עלייה חדה → תיקון קל במקביל כלפי מטה → פריצה |
| **Bear Flag** | Bearish | קל-בינוני | ירידה חדה → תיקון קל כלפי מעלה → שבירה |
| **Wedge (Rising/Falling)** | Mixed | מתקדם | התכנסות של highs ו-lows באותו כיוון |
| **Channel (Ascending/Descending)** | Mixed | בינוני | מחיר נע בין שני קווים מקבילים |

#### 5.2 שיפור הזיהוי באמצעות ML (אופציונלי — Phase 5b)

```python
# אפשרות עתידית: Train a simple classifier
# 1. Generate labeled synthetic patterns (positive + negative examples)
# 2. Extract features: normalize price window, volume profile, slope angles
# 3. Train RandomForest/XGBoost classifier per pattern type
# 4. Use as confidence score refinement layer
```

#### 5.3 משימות ספציפיות — Phase 5

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 5.1 | מימוש Ascending/Descending Triangle | `backend/app/pattern_detector.py` | |
| 5.2 | מימוש Bull/Bear Flag | `backend/app/pattern_detector.py` | |
| 5.3 | מימוש Wedge patterns | `backend/app/pattern_detector.py` | |
| 5.4 | מימוש Channel patterns | `backend/app/pattern_detector.py` | |
| 5.5 | Volume confirmation layer | `backend/app/pattern_detector.py` | ולידציה שהוליום תומך בתבנית |
| 5.6 | Unit tests לתבניות החדשות | `backend/tests/test_patterns.py` | |

---

### 🟣 Phase 6: אופטימיזציה ו-Production Readiness
**זמן משוער:** 2-3 ימי עבודה

#### 6.1 ביצועים

| # | משימה | תיאור |
|---|--------|--------|
| 6.1 | **Caching** — Cache OHLC data ב-Redis | הנתונים לא משתנים תוך יום; cache ל-24 שעות |
| 6.2 | **Batch scanning** — Process tickers in parallel batches | `asyncio.gather()` עם rate limiting |
| 6.3 | **Pre-compute** — סריקה יומית אוטומטית (cron job) | סריקת כל S&P 500 פעם ביום בלילה |
| 6.4 | **Incremental scan** — סרוק רק מניות שהשתנו | בדיקת `last_modified` מול cache |

#### 6.2 Rate Limiting ו-Yahoo Finance

```python
# yfinance rate limiting strategy:
# - Max 2000 requests/hour (Yahoo unofficial limit)
# - S&P 500 = 500 tickers × ~1 request each = ~500 requests
# - Add 1-second delay between tickers (existing pattern in data_service.py)
# - Total scan time: ~8-10 minutes for full S&P 500
# - Cache results for 24 hours to avoid redundant fetches
```

#### 6.3 משימות ספציפיות — Phase 6

| # | משימה | קובץ | תיאור |
|---|--------|-------|--------|
| 6.1 | Redis caching for OHLC data | `backend/app/cache_service.py` | הרחבת cache קיים |
| 6.2 | Parallel batch scanning | `backend/app/scanner_service.py` | `asyncio.gather` |
| 6.3 | Daily auto-scan scheduler | `backend/app/scheduler.py` | **קובץ חדש** |
| 6.4 | Error handling & retry logic | `backend/app/scanner_service.py` | Resilient scanning |
| 6.5 | Mobile responsive polish | `frontend/src/app/scanner/page.tsx` | CSS responsive |

---

## 📁 סיכום — רשימת כל הקבצים החדשים

### Backend
```
backend/app/
├── pattern_detector.py     ← NEW — מנוע זיהוי תבניות
├── scanner_service.py      ← NEW — שירות סריקה
├── scheduler.py            ← NEW — סריקה יומית אוטומטית
backend/tests/
├── test_patterns.py        ← NEW — בדיקות יחידה
```

### Frontend
```
frontend/src/
├── app/scanner/
│   └── page.tsx            ← NEW — דף Scanner
├── components/
│   ├── candlestick-chart.tsx         ← NEW — גרף נרות
│   └── scanner/
│       ├── pattern-selector.tsx      ← NEW — בחירת תבניות
│       ├── filter-panel.tsx          ← NEW — פילטרים
│       ├── scan-results-table.tsx    ← NEW — טבלת תוצאות
│       └── scan-progress.tsx         ← NEW — התקדמות סריקה
```

### קבצים קיימים לעדכון
```
backend/requirements.txt             ← הוספת scipy, scikit-learn
backend/app/api.py                   ← הוספת scanner routes
backend/app/indicators.py            ← הוספת אינדיקטורים מתקדמים
backend/app/cache_service.py         ← הרחבת caching
frontend/package.json                ← הוספת lightweight-charts
frontend/src/components/navbar.tsx   ← הוספת לינק Scanner
frontend/src/app/stock/[ticker]/page.tsx ← טאב Patterns חדש
```

---

## ⏱️ לוח זמנים מוערך

| Phase | שם | זמן משוער | תלות |
|-------|----|-----------|-------|
| 1 | Pattern Detection Engine | 3-4 ימים | — |
| 2 | API Routes | 1-2 ימים | Phase 1 |
| 3 | Frontend Scanner Page | 4-5 ימים | Phase 2 |
| 4 | Advanced Indicators & Filters | 2-3 ימים | Phase 1 |
| 5 | Additional Patterns | 3-4 ימים | Phase 1 |
| 6 | Optimization & Production | 2-3 ימים | Phases 1-5 |
| **Total** | | **~16-21 ימי עבודה** | |

> **Note:** Phases 3, 4, 5 יכולים לרוץ במקביל לאחר Phase 1+2.

---

## ⚠️ מגבלות וסיכונים

| סיכון | השפעה | מיטיגציה |
|--------|--------|----------|
| Yahoo Finance rate limiting | סריקה איטית | Redis caching + batch delays |
| נתונים ב-15 דקות עיכוב | לא real-time | מספיק לתבניות יומיות; ציון ברור ב-UI |
| False positives בזיהוי | תוצאות לא מדויקות | Confidence scoring + Volume confirmation |
| Scan time for 500 stocks | ~10 דקות | Background task + SSE progress |
| yfinance API instability | שגיאות | Retry logic + fallback to cached data |

---

## 🔑 הבדלים מול ההצעה של Gemini

| נושא | הצעת Gemini | הצעתנו (מותאם) |
|-------|-------------|-----------------|
| Frontend | Flutter (cross-platform) | **Next.js** — כבר קיים, מיותר לבנות מחדש |
| Charts | syncfusion_flutter_charts | **lightweight-charts** (TradingView) — חינמי, מקצועי |
| Architecture | Flutter + Python separate apps | **Next.js + FastAPI** — כבר מחובר ועובד |
| Real-time | לא מפורט | **SSE** (Server-Sent Events) — כבר ממומש באפליקציה |
| Data source | yfinance | **yfinance** — אותו דבר, כבר מוגדר ב-DataService |
| Technical indicators | pandas_ta | **pandas_ta** — כבר קיים ב-`indicators.py` |
| Testing | לא צוין | **Unit tests** עם נתונים סינתטיים |

---

## 🚀 הצעד הבא

**מומלץ להתחיל מ-Phase 1.2-1.3**: מימוש `PatternDetector` עם `detect_cup_and_handle()` כ-PoC.  
זה יאפשר לבדוק את הלוגיקה על נתונים אמיתיים לפני שבונים את כל ה-UI.

---

## 🟢 Phase 7: Intelligence Layer — Market Pulse & Trends (IMPLEMENTED)

**קובץ חדש:** `backend/app/intelligence_service.py`  
**תלויות חדשות:** `pytrends`, `newsapi-python`

### 7.1 מה זה עושה
- **Google Trends** — סריקת טרנדים לפי סקטורים (AI, biotech, fintech, EVs...)
- **NewsAPI** — חדשות אחרונות + זיהוי גיוסי הון (Series A/B/C, IPO, funding)
- **Sector Heat Map** — ציון חום לכל סקטור (60% trends + 30% news + 10% funding bonus)
- **Hot Sector Badge** — מסומן על תוצאות הסקנר

### 7.2 API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/intelligence/pulse` | GET | Full market intelligence snapshot |
| `/intelligence/sectors` | GET | Sector heat map data |
| `/intelligence/trends` | GET | Google Trends data for keywords |

### 7.3 Frontend Component
**`SentimentCard`** — כרטיס צד ימין בעמוד הסקנר שמציג:
- 🔥 Hot Sectors (heat bars)
- ↑↓ Trending Topics (badges)
- 🚀 Funding & IPO News (links)

---

## 🟢 Upgrades Implemented

### ZigZag Filter
- Filters price noise using configurable threshold (default 5%)
- Reduces false positives by only acting on significant price pivots
- Applied before all pattern detection

### Multi-Timeframe Validation (MTF)
- Resamples daily data to weekly
- Checks if weekly trend (linear regression slope) aligns with pattern signal
- Checks weekly RSI for overbought/oversold confirmation
- Adjusts confidence ±10-15% based on alignment

### Rule #1 Quality Filter
- Checks ROE >10%, earnings growth >5%, revenue growth >5%, D/E < 2.0
- Passes if ≥3/5 criteria met
- Can be toggled via "Rule #1 Quality Only" checkbox in scanner filters

---

## ✅ Implementation Status

| Component | File | Status |
|-----------|------|--------|
| Pattern Detector | `backend/app/pattern_detector.py` | ✅ Complete |
| Scanner Service | `backend/app/scanner_service.py` | ✅ Complete |
| Intelligence Service | `backend/app/intelligence_service.py` | ✅ Complete |
| Scanner Indicators | `backend/app/indicators.py` | ✅ Extended |
| Scanner API Routes | `backend/app/api.py` | ✅ Extended (9 new endpoints) |
| Candlestick Chart | `frontend/src/components/candlestick-chart.tsx` | ✅ Complete |
| Pattern Selector | `frontend/src/components/scanner/pattern-selector.tsx` | ✅ Complete |
| Filter Panel | `frontend/src/components/scanner/filter-panel.tsx` | ✅ Complete |
| Scan Results Table | `frontend/src/components/scanner/scan-results-table.tsx` | ✅ Complete |
| Scan Progress | `frontend/src/components/scanner/scan-progress.tsx` | ✅ Complete |
| Sentiment Card | `frontend/src/components/scanner/sentiment-card.tsx` | ✅ Complete |
| Scanner Page | `frontend/src/app/scanner/page.tsx` | ✅ Complete |
| Navbar Update | `frontend/src/components/navbar.tsx` | ✅ Updated (Scanner link) |
| Stock Detail Patterns | `frontend/src/app/stock/[ticker]/page.tsx` | ✅ Updated (Patterns tab) |

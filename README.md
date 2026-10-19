# Rule #1 Stock Screener

AI-powered stock analysis tool implementing Phil Town's "Rule #1" investing methodology.

## 🎯 What This Does

Analyzes stocks using:
- **Big 5 Growth Metrics**: ROIC, Equity, EPS, Sales, Free Cash Flow
- **Sticker Price** calculation (Phil Town's fair value formula)
- **Technical Indicators**: MACD, Stochastic, Moving Average
- **AI Qualitative Analysis**: Moat identification, management assessment (optional with Gemini API)

## 🏗️ Architecture

```
┌─────────────────┐      HTTP/SSE      ┌──────────────────┐
│  Next.js        │◄──────────────────►│   FastAPI        │
│  Frontend       │                     │   Backend        │
│  (Port 3000)    │                     │   (Port 8000)    │
└─────────────────┘                     └──────────────────┘
                                               │
                                               ├─► yfinance (data)
                                               ├─► Gemini API (AI - optional)
                                               └─► Redis (cache - optional)
```

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+** (tested with 3.13)
- **Node.js 18+**
- **Redis** (optional, for caching)

### 1. Backend Setup

```powershell
cd backend

# Create virtual environment (optional but recommended)
python -m venv ..\.venv
..\\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Edit backend\.env and add your Gemini API key (optional):
GEMINI_API_KEY=your_key_here

# Start the server
python -m uvicorn app.api:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`

**Test it**:
```powershell
curl http://localhost:8000/market/status
# Should return: {"status":"online","system":"Rule #1 Screener"}
```

###  2. Frontend Setup

```powershell
cd frontend

# Install dependencies
npm install

# Configure API URL (already set in .env.local)
# NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 3. Use the Application

1. **Open browser**: Navigate to `http://localhost:3000`
2. **Enter tickers**: Type stock symbols separated by commas (e.g., `AAPL, MSFT, GOOGL`)
3. **Click "SCAN"**: Watch real-time progress updates
4. **View results**: Click any stock card to see detailed analysis

## 📊 Features Implemented

### ✅ Working
- [x] Full stock data fetching (yfinance)
- [x] Big 5 growth analysis (CAGR calculations)
- [x] Sticker Price & Margin of Safety calculation
- [x] Technical indicators (MACD, Stochastic, MA)
- [x] Real-time scan progress (Server-Sent Events)
- [x] Beautiful, responsive UI
- [x] Stock detail pages with charts
- [x] AI analysis integration (requires API key)
- [x] Graceful degradation (works without Redis/AI)

### 🔄 Partial
- [ ] Database persistence (models defined, not connected)
- [ ] Redis caching (optional, disabled by default)
- [ ] 10-year data requirement (relaxed to 3+ years due to free API limits)

## 🐛 Known Issues & Fixes Applied

### Issue: `google-generativeai` Package Crashes on Python 3.13
**Solution**: Rewrote `AIAnalyzer` to use direct HTTP REST API calls instead of the broken SDK.

### Issue: yfinance Limited to ~4 Years of Data
**Solution**: Relaxed the 10-year requirement to 3 years. For full 10-year analysis, consider upgrading to a paid data provider.

### Issue: Non-ASCII Path SSL Errors
**Solution**: Implemented `ssl_fix.py` to copy certifi bundle to ASCII-only temp path.

### Issue: Frontend Build Warnings
**Solution**: Multiple lockfiles detected. Safe to ignore or remove `package-lock.json` from root directory.

## 📁 Project Structure

```
Rule #1/
├── backend/
│   ├── app/
│   │   ├── api.py              # Main FastAPI app
│   │   ├── calculations.py     # Big 5 & Sticker Price logic
│   │   ├── data_service.py     # yfinance data fetching
│   │   ├── ai_analyzer.py      # Gemini AI integration
│   │   ├── indicators.py       # Technical indicators
│   │   ├── cache_service.py    # Redis caching (optional)
│   │   ├── models.py           # Database models
│   │   └── ssl_fix.py          # SSL path workaround
│   ├── requirements.txt
│   └── .env                    # Environment variables
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # Dashboard
│   │   │   └── stock/[ticker]/page.tsx  # Stock detail
│   │   └── components/
│   │       ├── navbar.tsx
│   │       ├── stock-card.tsx
│   │       └── sticker-price-gauge.tsx
│   ├── package.json
│   └── .env.local              # API_URL configuration
├── package.json                # Root scripts (npm run dev = both servers)
└── README.md                   # This file
```

## 🔧 Environment Variables

### Backend (.env)
```bash
# Required for AI analysis (otherwise disabled gracefully)
GEMINI_API_KEY=

# Optional (not currently used)
DATABASE_URL=postgresql://user:password@localhost/rule1_db
REDIS_URL=redis://localhost:6379
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🧪 Testing

```powershell
# Test backend health
curl http://localhost:8000/market/status

# Trigger a scan
$body = '{"tickers":["AAPL"]}'; Invoke-WebRequest -Uri "http://localhost:8000/scan" -Method Post -ContentType "application/json" -Body $body

# Check results
curl http://localhost:8000/results

# Get specific stock analysis
curl http://localhost:8000/stock/AAPL
```

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/market/status` | GET | Health check |
| `/scan` | POST | Start background scan for multiple tickers |
| `/events` | GET | Server-Sent Events for real-time progress |
| `/results` | GET | Get all cached scan results |
| `/results/{ticker}` | GET | Get specific ticker result |
| `/stock/{ticker}` | GET | Get full analysis for a ticker (on-demand) |
| `/scan` | DELETE | Clear all scan data |

## 🎨 UI Features

- **Real-time updates**: SSE connection shows scan progress live
- **Color-coded signals**: Green (buy), Red (wait) based on Technical Tools
- **Valuation indicators**: Shows if stock is undervalued/overvalued
- **Interactive charts**: Big 5 growth trends visualization
- **Dark theme**: Professional, modern design
- **Responsive layout**: Works on desktop and mobile

## 💡 How It Works

### Scan Pipeline
1. User enters tickers
2. Backend fetches financial data from yfinance
3. Calculates Big 5 CAGR for 1Y, 3Y, 5Y, 10Y
4. Computes Sticker Price using growth rates and P/E
5. Runs technical analysis (MACD, Stochastic, MA)
6. (Optional) Gemini AI analyzes business moat
7. Results stream to frontend via SSE
8. Cached in memory for quick re-access

### Big 5 Analysis
```
ROIC = Net Income / (Total Equity + Total Debt)
Equity/Share = Total Equity / Shares Outstanding
EPS, Sales, FCF = From financial statements

CAGR = (End Value / Start Value)^(1/years) - 1
Consistent Growth = All CAGRs > 10%
```

### Sticker Price Formula
```
1. Estimate Growth Rate = min(Historic Equity Growth, Analyst Estimate)
2. Future EPS = Current EPS × (1 + Growth)^10
3. Future P/E = min(2 × Growth × 100, Historic P/E)
4. Future Price = Future EPS × Future P/E
5. Sticker Price = Future Price / (1.15^10)
6. MOS Price = Sticker Price × 0.5
```

## 🚧 Roadmap

- [ ] User authentication & watchlists
- [ ] Historical scan archive
- [ ] Export to CSV/PDF
- [ ] Price alerts
- [ ] Stock comparison tool
- [ ] Upgrade to paid data source for 10-year data
- [ ] Mobile app

## 🤝 Contributing

This is a personal project, but feel free to fork and customize!

## 📄 License

MIT License - see individual component licenses in subdirectories.

## 👤 Author

Built following Phil Town's "Rule #1" methodology.

---

**תיקונים שבוצעו** (Fixes Applied):
1. ✅ Backend API - זרימה מלאה מקצה לקצה
2. ✅ Process Ticker - ניתוח מלא במקום placeholder
3. ✅ Results Store - שמירה בזיכרון
4. ✅ Frontend - נתונים אמיתיים מה-SSE
5. ✅ AI Analyzer - עקיפת הבעיה עם google-generativeai
6. ✅ Data Service - הרפייה של דרישת 10 שנים
7. ✅ StockCard - קישור לדף פרטים
8. ✅ Stock Detail Page - תצוגת Big 5 + טבלאות
9. ✅ Environment Files - .env templates
10. ✅ Error Handling - graceful fallbacks

**הפרויקט מוכן לשימוש!** 🎉

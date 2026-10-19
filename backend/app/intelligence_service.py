"""
Intelligence Service — Market Pulse & Trends
=============================================
Combines Google Trends (pytrends) and NewsAPI to identify hot sectors,
trending topics, and startup/funding activity that provides fundamental
context for technical patterns.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import os
import json

logger = logging.getLogger(__name__)


# ── Sector-to-Keywords Mapping ────────────────────────────────

SECTOR_KEYWORDS: Dict[str, List[str]] = {
    "Information Technology": ["AI artificial intelligence", "cloud computing", "cybersecurity", "SaaS", "semiconductor"],
    "Health Care": ["biotech", "gene therapy", "telehealth", "pharmaceutical", "medical devices"],
    "Financials": ["fintech", "blockchain", "digital banking", "insurance tech", "crypto"],
    "Consumer Discretionary": ["e-commerce", "electric vehicles", "streaming", "retail tech"],
    "Communication Services": ["social media", "5G", "streaming services", "digital advertising"],
    "Industrials": ["robotics", "automation", "supply chain", "aerospace", "smart manufacturing"],
    "Consumer Staples": ["plant-based food", "organic products", "D2C brands"],
    "Energy": ["renewable energy", "solar power", "EV charging", "green hydrogen", "nuclear energy"],
    "Utilities": ["smart grid", "energy storage", "clean energy"],
    "Real Estate": ["proptech", "remote work real estate", "data centers"],
    "Materials": ["lithium mining", "rare earth", "sustainable materials"],
}

# Map sectors to related stock index sectors
SECTOR_ALIASES: Dict[str, List[str]] = {
    "Information Technology": ["Technology", "Information Technology"],
    "Health Care": ["Healthcare", "Health Care"],
    "Financials": ["Financial Services", "Financials", "Financial"],
    "Consumer Discretionary": ["Consumer Cyclical", "Consumer Discretionary"],
    "Communication Services": ["Communication Services", "Communication"],
    "Industrials": ["Industrials", "Industrial"],
    "Consumer Staples": ["Consumer Defensive", "Consumer Staples"],
    "Energy": ["Energy"],
    "Utilities": ["Utilities"],
    "Real Estate": ["Real Estate"],
    "Materials": ["Basic Materials", "Materials"],
}


@dataclass
class TrendData:
    keyword: str
    interest_score: int       # 0-100 from Google Trends
    trend_direction: str      # "rising", "falling", "stable"
    related_sector: str


@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    published_at: str
    snippet: str
    related_sector: Optional[str] = None
    is_funding_news: bool = False


@dataclass
class SectorHeat:
    sector: str
    heat_score: float         # 0.0 – 1.0  (composite)
    trend_score: float        # From Google Trends
    news_score: float         # From news frequency/sentiment
    top_keywords: List[str]
    recent_news: List[Dict[str, Any]]
    funding_activity: int     # Number of funding-related headlines


@dataclass
class MarketPulse:
    """Full market intelligence snapshot."""
    timestamp: str
    hot_sectors: List[Dict[str, Any]]
    trending_keywords: List[Dict[str, Any]]
    recent_funding_news: List[Dict[str, Any]]
    sector_heat_map: Dict[str, float]


# ── Sector → Representative ETFs (Yahoo Finance, free) ───────
SECTOR_ETFS: Dict[str, List[str]] = {
    "Information Technology": ["XLK", "AAPL", "MSFT", "NVDA"],
    "Health Care":            ["XLV", "JNJ", "UNH", "PFE"],
    "Financials":             ["XLF", "JPM", "BAC", "GS"],
    "Consumer Discretionary": ["XLY", "AMZN", "TSLA", "HD"],
    "Communication Services": ["XLC", "META", "GOOGL", "NFLX"],
    "Industrials":            ["XLI", "CAT", "HON", "BA"],
    "Consumer Staples":       ["XLP", "PG", "KO", "WMT"],
    "Energy":                 ["XLE", "XOM", "CVX", "SLB"],
    "Utilities":              ["XLU", "NEE", "DUK", "SO"],
    "Real Estate":            ["XLRE", "AMT", "PLD", "EQIX"],
    "Materials":              ["XLB", "LIN", "APD", "FCX"],
}


class IntelligenceService:
    """
    Provides market context by combining:
    1. Google Trends (pytrends) — keyword/sector interest
    2. Yahoo Finance news (yfinance) — free, no API key required
    """

    def __init__(self, news_api_key: Optional[str] = None):
        # news_api_key kept for backwards compat but not used
        self._trends_available = False
        self._news_available = True   # Yahoo Finance always available
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 3600  # 1 hour cache

        # Check if pytrends is available
        try:
            from pytrends.request import TrendReq
            self._trends_available = True
        except ImportError:
            logger.warning("pytrends not installed. Google Trends data unavailable.")

        logger.info("News data sourced from Yahoo Finance (yfinance) — no API key required.")

    # ── Google Trends ─────────────────────────────────────────

    async def get_trending_keywords(
        self, keywords: Optional[List[str]] = None, timeframe: str = "today 3-m"
    ) -> List[TrendData]:
        """
        Fetch Google Trends data for sector-related keywords.
        Uses async wrapper around pytrends (which is synchronous).
        """
        if not self._trends_available:
            return []

        cache_key = f"trends_{timeframe}_{hash(tuple(keywords or []))}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, self._fetch_trends_sync, keywords, timeframe
        )

        self._set_cached(cache_key, result)
        return result

    def _fetch_trends_sync(
        self, keywords: Optional[List[str]], timeframe: str
    ) -> List[TrendData]:
        """Synchronous Google Trends fetch."""
        try:
            from pytrends.request import TrendReq

            pytrends = TrendReq(hl="en-US", tz=360)
            results: List[TrendData] = []

            # If no keywords specified, use top keywords from each sector
            if not keywords:
                keywords = []
                for sector, kws in SECTOR_KEYWORDS.items():
                    keywords.extend(kws[:2])  # Top 2 per sector

            # pytrends allows max 5 keywords per request
            for i in range(0, len(keywords), 5):
                batch = keywords[i : i + 5]
                try:
                    pytrends.build_payload(batch, timeframe=timeframe, geo="US")
                    interest = pytrends.interest_over_time()

                    if interest.empty:
                        continue

                    for kw in batch:
                        if kw not in interest.columns:
                            continue

                        series = interest[kw]
                        current = int(series.iloc[-1])
                        prev = int(series.iloc[-5]) if len(series) >= 5 else current

                        if current > prev * 1.1:
                            direction = "rising"
                        elif current < prev * 0.9:
                            direction = "falling"
                        else:
                            direction = "stable"

                        # Find related sector
                        related = "General"
                        for sector, sector_kws in SECTOR_KEYWORDS.items():
                            if kw in sector_kws:
                                related = sector
                                break

                        results.append(TrendData(
                            keyword=kw,
                            interest_score=current,
                            trend_direction=direction,
                            related_sector=related,
                        ))

                except Exception as e:
                    logger.warning(f"Trends batch error for {batch}: {e}")
                    continue

            results.sort(key=lambda x: x.interest_score, reverse=True)
            return results

        except Exception as e:
            logger.error(f"Google Trends error: {e}")
            return []

    # ── NewsAPI ───────────────────────────────────────────────

    async def get_sector_news(
        self,
        sectors: Optional[List[str]] = None,
        days_back: int = 7,
    ) -> List[NewsItem]:
        """Fetch recent news headlines related to sectors and funding."""
        if not self._news_available:
            return []

        cache_key = f"news_{hash(tuple(sectors or []))}_{days_back}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, self._fetch_news_sync, sectors, days_back
        )

        self._set_cached(cache_key, result)
        return result

    def _fetch_news_sync(
        self, sectors: Optional[List[str]], days_back: int
    ) -> List[NewsItem]:
        """Fetch news from Yahoo Finance via yfinance — no API key needed."""
        try:
            import yfinance as yf
            from datetime import timezone

            # Decide which sectors/tickers to pull
            target_sectors: List[str] = sectors if sectors else list(SECTOR_ETFS.keys())

            results: List[NewsItem] = []
            seen_urls: set = set()

            for sector in target_sectors:
                etfs = SECTOR_ETFS.get(sector, [])
                # Use the sector ETF (first ticker) — it aggregates sector news well
                ticker_sym = etfs[0] if etfs else None
                if not ticker_sym:
                    continue
                try:
                    raw_news = yf.Ticker(ticker_sym).news or []
                except Exception:
                    raw_news = []

                for article in raw_news:
                    # yfinance >= 0.2.37 wraps articles in a "content" dict
                    if "content" in article and isinstance(article["content"], dict):
                        content = article["content"]
                        url = (content.get("canonicalUrl") or content.get("clickThroughUrl") or {}).get("url", "")
                        title = content.get("title", "")
                        pub_str = content.get("pubDate", "")
                        snippet = content.get("summary", "")[:200]
                        source = (content.get("provider") or {}).get("displayName", "Yahoo Finance")
                    else:
                        # legacy flat dict format
                        url = article.get("link", "")
                        title = article.get("title", "")
                        pub_ts = article.get("providerPublishTime", 0)
                        pub_str = (
                            datetime.fromtimestamp(pub_ts, tz=timezone.utc).isoformat()
                            if pub_ts else ""
                        )
                        snippet = article.get("summary", article.get("description", ""))[:200]
                        source = article.get("publisher", "Yahoo Finance")
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    is_funding = any(
                        term in title.lower()
                        for term in ["funding", "raises", "series a", "series b",
                                     "series c", "ipo", "investment", "valuation",
                                     "acquisition", "merger", "deal"]
                    )

                    results.append(NewsItem(
                        title=title,
                        source=source,
                        url=url,
                        published_at=pub_str,
                        snippet=snippet or title[:200],
                        related_sector=sector,
                        is_funding_news=is_funding,
                    ))

            # Sort by newest first
            results.sort(
                key=lambda n: n.published_at or "",
                reverse=True,
            )
            return results

        except Exception as e:
            logger.error(f"Yahoo Finance news error: {e}")
            return []

    # ── Sector Heat Map ───────────────────────────────────────

    async def get_sector_heat(self) -> List[SectorHeat]:
        """
        Compute a heat score for each sector by combining
        Google Trends interest + news frequency.
        """
        cache_key = "sector_heat"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        # Fetch trends and news in parallel
        trends_task = self.get_trending_keywords()
        news_task = self.get_sector_news(days_back=7)

        trends, news = await asyncio.gather(trends_task, news_task)

        sector_data: Dict[str, Dict[str, Any]] = {}

        # Initialize all sectors
        for sector in SECTOR_KEYWORDS:
            sector_data[sector] = {
                "trend_scores": [],
                "news_count": 0,
                "funding_count": 0,
                "top_keywords": [],
                "recent_news": [],
            }

        # Aggregate trends
        for t in trends:
            if t.related_sector in sector_data:
                sector_data[t.related_sector]["trend_scores"].append(t.interest_score)
                sector_data[t.related_sector]["top_keywords"].append(t.keyword)

        # Aggregate news
        for n in news:
            if n.related_sector and n.related_sector in sector_data:
                sector_data[n.related_sector]["news_count"] += 1
                if n.is_funding_news:
                    sector_data[n.related_sector]["funding_count"] += 1
                sector_data[n.related_sector]["recent_news"].append(asdict(n))

        # Compute heat scores
        results: List[SectorHeat] = []
        max_news = max((d["news_count"] for d in sector_data.values()), default=1) or 1

        for sector, data in sector_data.items():
            trend_scores = data["trend_scores"]
            avg_trend = sum(trend_scores) / len(trend_scores) if trend_scores else 0.0
            trend_normalized = avg_trend / 100.0  # 0-100 → 0-1

            news_normalized = data["news_count"] / max_news

            # Composite: 60% trends, 30% news, 10% funding
            funding_bonus = min(0.1, data["funding_count"] * 0.02)
            heat = 0.6 * trend_normalized + 0.3 * news_normalized + funding_bonus
            heat = min(1.0, heat)

            results.append(SectorHeat(
                sector=sector,
                heat_score=round(heat, 3),
                trend_score=round(trend_normalized, 3),
                news_score=round(news_normalized, 3),
                top_keywords=data["top_keywords"][:5],
                recent_news=data["recent_news"][:3],
                funding_activity=data["funding_count"],
            ))

        results.sort(key=lambda x: x.heat_score, reverse=True)
        self._set_cached(cache_key, results)
        return results

    # ── Full Market Pulse ─────────────────────────────────────

    async def get_market_pulse(self) -> MarketPulse:
        """Get a complete market intelligence snapshot."""
        sector_heat = await self.get_sector_heat()
        trends = await self.get_trending_keywords()
        news = await self.get_sector_news(days_back=7)

        funding_news = [asdict(n) for n in news if n.is_funding_news]

        return MarketPulse(
            timestamp=datetime.now().isoformat(),
            hot_sectors=[asdict(s) for s in sector_heat[:5]],
            trending_keywords=[asdict(t) for t in trends[:10]],
            recent_funding_news=funding_news[:10],
            sector_heat_map={s.sector: s.heat_score for s in sector_heat},
        )

    # ── Cross-reference with stocks ───────────────────────────

    def is_hot_sector(
        self,
        stock_sector: str,
        sector_heat_map: Dict[str, float],
        threshold: float = 0.5,
    ) -> bool:
        """Check if a stock's sector is currently 'hot'."""
        # Try direct match first
        if stock_sector in sector_heat_map:
            return sector_heat_map[stock_sector] >= threshold

        # Try alias matching
        for canonical, aliases in SECTOR_ALIASES.items():
            if stock_sector in aliases and canonical in sector_heat_map:
                return sector_heat_map[canonical] >= threshold

        return False

    # ── Cache Helpers ─────────────────────────────────────────

    def _get_cached(self, key: str) -> Any:
        """Get value from cache if not expired."""
        if key in self._cache:
            entry = self._cache[key]
            if datetime.now().timestamp() - entry["ts"] < self._cache_ttl:
                return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any):
        """Store value in cache."""
        self._cache[key] = {
            "ts": datetime.now().timestamp(),
            "data": data,
        }

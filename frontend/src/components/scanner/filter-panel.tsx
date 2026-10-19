"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

const MARKET_CAP_OPTIONS = [
    { label: "הכל", value: "" },
    { label: "מיקרו (<$300M)", value: "micro" },
    { label: "קטן ($300M-$2B)", value: "small" },
    { label: "בינוני ($2B-$10B)", value: "mid" },
    { label: "גדול ($10B-$200B)", value: "large" },
    { label: "ענק (>$200B)", value: "mega" },
];

const VOLUME_OPTIONS = [
    { label: "כלשהו", value: "" },
    { label: ">100K", value: "100000" },
    { label: ">500K", value: "500000" },
    { label: ">1M", value: "1000000" },
    { label: ">5M", value: "5000000" },
];

const SECTORS = [
    "All",
    "Information Technology",
    "Health Care",
    "Financials",
    "Consumer Discretionary",
    "Communication Services",
    "Industrials",
    "Consumer Staples",
    "Energy",
    "Utilities",
    "Real Estate",
    "Materials",
];

const BETA_OPTIONS = [
    { label: "כלשהו", value: "" },
    { label: "נמוך (0-0.5)", value: "0-0.5" },
    { label: "מתון (0.5-1)", value: "0.5-1" },
    { label: "ממוצע (1-1.5)", value: "1-1.5" },
    { label: "גבוה (1.5-2)", value: "1.5-2" },
    { label: "גבוה מאוד (>2)", value: "2-99" },
];

const RSI_OPTIONS = [
    { label: "כלשהו", value: "" },
    { label: "מכור יתר (<30)", value: "oversold" },
    { label: "ניטרלי (30-70)", value: "neutral" },
    { label: "קנוי יתר (>70)", value: "overbought" },
];

const CONFIDENCE_OPTIONS = [
    { label: "≥50%", value: "0.5" },
    { label: "≥60%", value: "0.6" },
    { label: "≥70%", value: "0.7" },
    { label: "≥80%", value: "0.8" },
    { label: "≥90%", value: "0.9" },
];

const TIMEFRAME_OPTIONS = [
    { label: "3 חודשים", value: "3m" },
    { label: "6 חודשים", value: "6m" },
    { label: "שנה", value: "1y" },
    { label: "2 שנים", value: "2y" },
    { label: "5 שנים", value: "5y" },
    { label: "10 שנים 📊", value: "10y" },
];

const DETECTION_MODEL_OPTIONS = [
    {
        value: "zigzag_balanced",
        label: "ZigZag מאוזן",
        badge: "ברירת מחדל",
        badgeColor: "text-blue-400",
        description: "סף מרכזי 5% · איזון טוב בין אותות לאיכות",
    },
    {
        value: "zigzag_loose",
        label: "ZigZag רפה",
        badge: "יותר אותות",
        badgeColor: "text-yellow-400",
        description: "סף מרכזי 3% · זיהוי מוקדם, יותר כזיות חיובי",
    },
    {
        value: "zigzag_strict",
        label: "ZigZag ניוון",
        badge: "איכות גבוהה",
        badgeColor: "text-green-400",
        description: "סף מרכזי 8% · רק נדנודות מאושרות משמעותיות",
    },
    {
        value: "peak_based",
        label: "Peak-Based (scipy)",
        badge: "אלגוריתם חלופי",
        badgeColor: "text-purple-400",
        description: "scipy find_peaks ישירות — ללא חילוץ ZigZag",
    },
];

// Local display metadata — Hebrew descriptions + estimated scan time
const UNIVERSE_META: Record<string, { description: string; est: string }> = {
    all:       { description: "כל המניות",                est: "~5-15 דק" },
    sp500:     { description: "503 מניות",                est: "~2-4 דק" },
    nasdaq100: { description: "100 מניות",                est: "~1-2 דק" },
    sp400:     { description: "400 מניות",                est: "~2-3 דק" },
    dowjones:  { description: "30 מניות Blue Chip",       est: "~20 שנ"  },
    ftse100:   { description: "100 מניות שוק בריטניה",   est: "~1-2 דק" },
    dax:       { description: "40 מניות שוק גרמניה",     est: "~25 שנ"  },
    cac40:     { description: "40 מניות שוק צרפת",       est: "~25 שנ"  },
    aex:       { description: "25 מניות שוק הולנד",      est: "~15 שנ"  },
    smi:       { description: "20 מניות שוק שוויץ",      est: "~12 שנ"  },
    ibex35:    { description: "35 מניות שוק ספרד",       est: "~20 שנ"  },
    tsx:       { description: "60 מניות שוק קנדה",       est: "~40 שנ"  },
    asx200:    { description: "200 מניות אוסטרליה",      est: "~1-2 דק" },
    nikkei225: { description: "225 מניות יפן",            est: "~1-2 דק" },
    hangseng:  { description: "הונג קונג",                est: "~40 שנ"  },
    ta35:      { description: "35 מניות גדולות בת״א",    est: "~20 שנ"  },
    ta125:     { description: "125 מניות שוק ישראל",     est: "~1 דק"   },
};

// Fallback static list — used while the API loads
const UNIVERSE_FALLBACK = [
    { value: "all",       label: "הכל",           icon: "🌍", count: null },
    { value: "sp500",     label: "S&P 500",        icon: "🇺🇸", count: null },
    { value: "nasdaq100", label: "NASDAQ-100",      icon: "💻", count: null },
    { value: "sp400",     label: "S&P 400 MidCap", icon: "📈", count: null },
    { value: "dowjones",  label: "Dow Jones 30",   icon: "🏗️", count: null },
];

type UniverseOption = {
    value: string;
    label: string;
    icon: string;
    count: number | null;
    description: string;
    est: string;
};

export interface FilterValues {
    universe: string;
    marketCap: string;
    minVolume: string;
    sector: string;
    beta: string;
    rsi: string;
    minConfidence: string;
    timeframe: string;
    aboveSma200: boolean;
    requireRule1Quality: boolean;
    detectionModel: string;
}

interface FilterPanelProps {
    filters: FilterValues;
    onFilterChange: (filters: FilterValues) => void;
    onScan?: () => void;
    isScanning: boolean;
}

export function FilterPanel({
    filters,
    onFilterChange,
    isScanning,
}: FilterPanelProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [universeOptions, setUniverseOptions] = useState<UniverseOption[]>(
        UNIVERSE_FALLBACK.map((u) => ({
            ...u,
            description: UNIVERSE_META[u.value]?.description ?? "",
            est: UNIVERSE_META[u.value]?.est ?? "",
        }))
    );

    // Fetch available universes from the backend on mount
    useEffect(() => {
        const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        fetch(`${API}/scanner/universes`)
            .then((r) => r.json())
            .then((data: Array<{ id: string; label: string; icon: string; count: number }>) => {
                const options: UniverseOption[] = data.map((u) => ({
                    value: u.id,
                    label: u.label,
                    icon: u.icon ?? "🏛️",
                    count: u.count,
                    description: UNIVERSE_META[u.id]?.description
                        ?? (u.count != null ? `${u.count} מניות` : ""),
                    est: UNIVERSE_META[u.id]?.est ?? "",
                }));
                if (options.length > 0) setUniverseOptions(options);
            })
            .catch(() => {/* keep fallback */});
    }, []);

    const update = (key: keyof FilterValues, value: string | boolean) => {
        onFilterChange({ ...filters, [key]: value });
    };

    // Count non-default active advanced filters for the badge
    const advancedCount = [
        filters.marketCap !== "all" && filters.marketCap !== "",
        filters.minVolume !== "all" && filters.minVolume !== "",
        filters.sector !== "all" && filters.sector !== "All" && filters.sector !== "",
        filters.beta !== "all" && filters.beta !== "",
        filters.rsi !== "all" && filters.rsi !== "",
        filters.minConfidence !== "0.5",
        filters.timeframe !== "1y",
        filters.aboveSma200,
        filters.requireRule1Quality,
        filters.detectionModel !== "zigzag_balanced",
    ].filter(Boolean).length;

    const selectedUniverse = universeOptions.find((o) => o.value === filters.universe);

    return (
        <div className="space-y-4">

            {/* ── Universe ─────────────────────────────────────── */}
            <div>
                <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        מדד לסריקה
                    </label>
                    {selectedUniverse && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {selectedUniverse.est}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {universeOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => update("universe", opt.value)}
                            className={`text-right rounded-lg border px-3 py-2.5 text-xs transition-all ${
                                filters.universe === opt.value
                                    ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/70"
                                    : "border-border bg-secondary/20 hover:border-emerald-500/40 hover:bg-secondary/40"
                            }`}
                        >
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-base leading-none">{opt.icon}</span>
                                <span className={`font-semibold truncate ${filters.universe === opt.value ? "text-emerald-400" : "text-foreground"}`}>{opt.label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                {opt.description}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Advanced Filters Toggle ─────────────────────── */}
            <div className="flex items-center justify-between gap-3 pt-1">
                <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all ${
                        showAdvanced || advancedCount > 0
                            ? "border-blue-500/60 bg-blue-500/8 text-blue-300"
                            : "border-border/60 bg-secondary/20 text-muted-foreground hover:border-blue-500/40 hover:text-blue-300"
                    }`}
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>סינון מתקדם</span>
                    {advancedCount > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-500/30 text-blue-200 text-[10px] font-bold">
                            {advancedCount}
                        </span>
                    )}
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`} />
                </button>

                <span className="text-[11px] text-muted-foreground">
                    {isScanning ? "סריקה אוטומטית מ־Yahoo Finance…" : "סריקה אוטומטית · נתוני אמת"}
                </span>
            </div>

            {/* ── Collapsible Advanced Filters ─────────────────── */}
            <AnimatePresence>
            {showAdvanced && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                >
                <div className="pt-1 space-y-4 border-t border-border/40">

            {/* ── Detection Model ───────────────────────────────── */}
            <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2.5">
                    מודל זיהוי
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {DETECTION_MODEL_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => update("detectionModel", opt.value)}
                            className={`text-right rounded-lg border px-3 py-2.5 text-xs transition-all ${
                                filters.detectionModel === opt.value
                                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/70"
                                    : "border-border bg-secondary/20 hover:border-blue-500/40 hover:bg-secondary/40"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`font-semibold ${filters.detectionModel === opt.value ? "text-blue-400" : "text-foreground"}`}>{opt.label}</span>
                                <span className={`text-[10px] font-bold shrink-0 mr-1 ${opt.badgeColor}`}>{opt.badge}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                                {opt.description}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Filters Row ───────────────────────────────────── */}
            <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2.5">
                    פילטרים
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
                    {/* Market Cap */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">שווי שוק</label>
                        <select
                            value={filters.marketCap}
                            onChange={(e) => update("marketCap", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {MARKET_CAP_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Volume */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">נפח ממוצע</label>
                        <select
                            value={filters.minVolume}
                            onChange={(e) => update("minVolume", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {VOLUME_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sector */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">סקטור</label>
                        <select
                            value={filters.sector}
                            onChange={(e) => update("sector", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {SECTORS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Beta */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">בטא</label>
                        <select
                            value={filters.beta}
                            onChange={(e) => update("beta", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {BETA_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* RSI */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">RSI</label>
                        <select
                            value={filters.rsi}
                            onChange={(e) => update("rsi", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {RSI_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Confidence */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">ביטחון</label>
                        <select
                            value={filters.minConfidence}
                            onChange={(e) => update("minConfidence", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {CONFIDENCE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Timeframe */}
                    <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">מסגרת זמן</label>
                        <select
                            value={filters.timeframe}
                            onChange={(e) => update("timeframe", e.target.value)}
                            className="w-full bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        >
                            {TIMEFRAME_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Toggles ───────────────────────────────────────── */}
            <div className="flex items-center gap-5 pt-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer group">
                        <div
                            onClick={() => update("aboveSma200", !filters.aboveSma200)}
                            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${filters.aboveSma200 ? "bg-blue-600" : "bg-secondary"}`}
                        >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${filters.aboveSma200 ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">מעל SMA 200</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer group">
                        <div
                            onClick={() => update("requireRule1Quality", !filters.requireRule1Quality)}
                            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${filters.requireRule1Quality ? "bg-green-600" : "bg-secondary"}`}
                        >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${filters.requireRule1Quality ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                        <span className={`transition-colors ${filters.requireRule1Quality ? "text-green-500" : "text-muted-foreground group-hover:text-green-400"}`}>
                            איכות כלל 1# בלבד
                        </span>
                    </label>
            </div>

                </div>
                </motion.div>
            )}
            </AnimatePresence>

        </div>
    );
}

/**
 * Converts the UI filter values to the API request format.
 */
export function filtersToApiPayload(filters: FilterValues): Record<string, any> {
    const payload: Record<string, any> = {};

    // Universe
    if (filters.universe && filters.universe !== "all") {
        payload.universe = filters.universe;
    }

    // Detection model
    if (filters.detectionModel) {
        payload.detection_model = filters.detectionModel;
    }

    // Market cap mapping
    const capMap: Record<string, { min?: number; max?: number }> = {
        micro: { max: 300_000_000 },
        small: { min: 300_000_000, max: 2_000_000_000 },
        mid: { min: 2_000_000_000, max: 10_000_000_000 },
        large: { min: 10_000_000_000, max: 200_000_000_000 },
        mega: { min: 200_000_000_000 },
    };
    if (filters.marketCap && capMap[filters.marketCap]) {
        const cap = capMap[filters.marketCap];
        if (cap.min) payload.min_market_cap = cap.min;
        if (cap.max) payload.max_market_cap = cap.max;
    }

    if (filters.minVolume) {
        payload.min_volume = parseFloat(filters.minVolume);
    }

    if (filters.sector && filters.sector !== "All") {
        payload.sector = filters.sector;
    }

    if (filters.beta) {
        const [min, max] = filters.beta.split("-").map(Number);
        if (!isNaN(min)) payload.min_beta = min;
        if (!isNaN(max)) payload.max_beta = max;
    }

    if (filters.rsi) {
        payload.rsi_range = filters.rsi;
    }

    if (filters.aboveSma200) {
        payload.above_sma_200 = true;
    }

    return payload;
}

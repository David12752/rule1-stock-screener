"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, TrendingUp, Clock, Command } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RECENTS_KEY = "rule1_recent_symbols";

function readRecents(): string[] {
    try {
        return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    } catch {
        return [];
    }
}

interface SearchResult {
    symbol: string;
    name: string;
    type?: string;
    exchange?: string;
}

/**
 * Global Cmd+K search palette.
 * Registers `Cmd+K` / `Ctrl+K` keyboard shortcut.
 */
export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(0);
    const [recents, setRecents] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Register keyboard shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setOpen((o) => !o);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // Focus input on open. Recents are read here rather than during render:
    // localStorage is unavailable while the server prerenders, and re-parsing the
    // JSON on every keystroke was pure waste.
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery(""); setResults([]); setSelected(0);
            setRecents(readRecents());
        }
    }, [open]);

    // Debounced search
    useEffect(() => {
        if (!query.trim() || query.length < 1) { setResults([]); return; }
        const controller = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `${API_URL}/search?q=${encodeURIComponent(query)}&limit=8`,
                    { signal: controller.signal }
                );
                if (res.ok) setResults(await res.json());
            } catch {
                /* aborted or offline */
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);
        return () => {
            clearTimeout(t);
            // Without this, a slow response for "AA" could land after "AAPL" and
            // repopulate the list with results for the older query.
            controller.abort();
        };
    }, [query]);

    const navigate = useCallback((symbol: string) => {
        router.push(`/stock/${symbol}`);
        setOpen(false);
    }, [router]);

    // Keyboard navigation
    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
        if (e.key === "Enter" && results[selected]) navigate(results[selected].symbol);
    };

    return (
        <>
            {/* Trigger button in navbar (optional inline use) */}
            <button
                onClick={() => setOpen(true)}
                className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors border border-white/[0.06] rounded-md px-2.5 py-1.5 bg-white/[0.02] hover:bg-white/[0.04]"
                aria-label="Open search"
            >
                <Search className="h-3 w-3" />
                <span>חיפוש...</span>
                <span className="ms-1 flex items-center gap-0.5 opacity-60">
                    <Command className="h-2.5 w-2.5" />K
                </span>
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                            onClick={() => setOpen(false)}
                        />

                        {/* Palette */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: -10 }}
                            transition={{ type: "spring", duration: 0.25 }}
                            className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-[101] w-full max-w-lg"
                        >
                            <div className="rounded-2xl border border-white/[0.1] bg-zinc-900/95 shadow-2xl overflow-hidden">
                                {/* Input */}
                                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 text-muted-foreground/50 animate-spin shrink-0" />
                                    ) : (
                                        <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                    )}
                                    <input
                                        ref={inputRef}
                                        value={query}
                                        onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                                        onKeyDown={handleKey}
                                        placeholder="חפש מניה — AAPL, Apple, Microsoft..."
                                        className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/40 focus:outline-none"
                                        dir="ltr"
                                    />
                                    <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.1] text-muted-foreground/40">ESC</kbd>
                                </div>

                                {/* Results */}
                                <div className="max-h-80 overflow-y-auto py-1">
                                    {results.length > 0 ? results.map((r, i) => (
                                        <button
                                            key={r.symbol}
                                            onMouseEnter={() => setSelected(i)}
                                            onClick={() => navigate(r.symbol)}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${
                                                selected === i ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                                            }`}
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
                                                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono font-bold text-sm text-foreground">{r.symbol}</div>
                                                <div className="text-xs text-muted-foreground/60 truncate">{r.name}</div>
                                            </div>
                                            {r.exchange && (
                                                <span className="text-[10px] text-muted-foreground/30 font-mono">{r.exchange}</span>
                                            )}
                                        </button>
                                    )) : query.length === 0 && recents.length > 0 ? (
                                        <div>
                                            <div className="px-4 py-2 text-[10px] text-muted-foreground/40 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                                                <Clock className="h-3 w-3" /> חיפושים אחרונים
                                            </div>
                                            {recents.slice(0, 5).map((sym, i) => (
                                                <button key={sym} onClick={() => navigate(sym)}
                                                    onMouseEnter={() => setSelected(i)}
                                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${selected === i ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
                                                    <Clock className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                                                    <span className="font-mono font-bold text-sm">{sym}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : query.length >= 1 && !loading && results.length === 0 ? (
                                        <div className="text-center py-8 text-sm text-muted-foreground/40">
                                            לא נמצאו תוצאות עבור &quot;{query}&quot;
                                        </div>
                                    ) : null}
                                </div>

                                {/* Footer */}
                                <div className="px-4 py-2 border-t border-white/[0.05] flex items-center gap-3 text-[10px] text-muted-foreground/30">
                                    <span>↑↓ ניווט</span>
                                    <span>↵ פתח</span>
                                    <span>ESC סגור</span>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

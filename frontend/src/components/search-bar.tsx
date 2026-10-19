"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SearchIcon, Loader2Icon, XCircleIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Country flag emoji lookup by exchange suffix / country
const COUNTRY_FLAG: Record<string, string> = {
    US: "🇺🇸", UK: "🇬🇧", Germany: "🇩🇪", France: "🇫🇷",
    Canada: "🇨🇦", Australia: "🇦🇺", Japan: "🇯🇵",
    "Hong Kong": "🇭🇰", Spain: "🇪🇸", Netherlands: "🇳🇱",
    Switzerland: "🇨🇭", "South Korea": "🇰🇷",
};

interface SearchResult {
    symbol: string;
    name: string;
    sector: string;
    sub_industry: string;
    exchange?: string;
    currency?: string;
    country?: string;
    universe?: string;
}

export function SearchBar() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (query.trim().length < 1) {
            setResults([]);
            setIsOpen(false);
            setNotFound(false);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            setNotFound(false);
            try {
                const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query.trim())}`);
                if (res.ok) {
                    const data: SearchResult[] = await res.json();
                    setResults(data);
                    setSelectedIndex(-1);
                    if (data.length > 0) {
                        setIsOpen(true);
                        setNotFound(false);
                    } else {
                        setIsOpen(true);   // open to show "not found" message
                        setNotFound(true);
                    }
                }
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = useCallback((symbol: string) => {
        setIsOpen(false);
        setQuery("");
        setResults([]);
        setNotFound(false);
        router.push(`/stock/${symbol}`);
    }, [router]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (results.length > 0)
                setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (results.length > 0)
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && results[selectedIndex]) {
                handleSelect(results[selectedIndex].symbol);
            } else if (results.length === 1) {
                // single result → auto-select
                handleSelect(results[0].symbol);
            } else if (query.trim().length >= 1 && !notFound) {
                // Direct search: navigate to the typed ticker
                handleSelect(query.trim().toUpperCase());
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    const flag = (country?: string) => (country ? (COUNTRY_FLAG[country] ?? "") : "");

    return (
        <div ref={wrapperRef} className="relative w-full max-w-sm">
            <div className="relative">
                <SearchIcon className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder="חפש מניה (AAPL, Apple...)..."
                    className="ps-9 pe-8 h-9 font-mono text-sm bg-white/[0.04] border-white/[0.08] placeholder:text-muted-foreground/50 focus:bg-white/[0.06] focus:border-primary/40 transition-all"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => (results.length > 0 || notFound) && setIsOpen(true)}
                    dir="ltr"
                />
                {loading && (
                    <Loader2Icon className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full start-0 end-0 mt-1.5 bg-popover/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50 max-h-80 overflow-y-auto custom-scrollbar">
                    {notFound ? (
                        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                            <XCircleIcon className="h-4 w-4 shrink-0 text-red-400/70" />
                            <span>לא נמצאה מניה בשם &ldquo;{query}&rdquo;</span>
                        </div>
                    ) : (
                        results.map((stock, i) => (
                            <button
                                key={stock.symbol}
                                className={`w-full text-start px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                                    i === selectedIndex
                                        ? "bg-primary/10 text-foreground"
                                        : "hover:bg-white/[0.04] text-foreground/80"
                                }`}
                                onClick={() => handleSelect(stock.symbol)}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold font-mono text-sm text-primary shrink-0">
                                        {flag(stock.country) && (
                                            <span className="mr-1 text-base">{flag(stock.country)}</span>
                                        )}
                                        {stock.symbol}
                                    </span>
                                    <span className="text-sm text-muted-foreground truncate">{stock.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {stock.currency && (
                                        <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded font-mono">
                                            {stock.currency}
                                        </span>
                                    )}
                                    {stock.sector && (
                                        <span className="text-[11px] text-muted-foreground/70 bg-white/[0.04] px-2 py-0.5 rounded">
                                            {stock.sector}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fmt } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const MARKET_BAR_KEY = "rule1_marketbar_open";
export const MARKET_BAR_EVENT = "rule1:marketbar";

interface IndexData {
    label: string;
    price: number | null;
    change_pct: number | null;
    error?: string;
}

type IndicesMap = Record<string, IndexData>;

const INDEX_ORDER = ["SP500", "NASDAQ", "DOW", "RUT", "BTC", "GLD", "VIX"];

function IndexItem({ k, d }: { k: string; d: IndexData }) {
    const isPos = (d.change_pct ?? 0) > 0;
    const isNeg = (d.change_pct ?? 0) < 0;
    const pct = d.change_pct;

    return (
        <div className="flex shrink-0 items-center gap-1.5 border-r border-white/[0.05] px-3 last:border-r-0">
            <span className="text-xs font-medium text-muted-foreground/60">{d.label}</span>
            <span className="font-mono text-xs font-semibold text-foreground/90">
                {k === "BTC"
                    ? `$${d.price?.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "—"}`
                    : fmt(d.price)}
            </span>
            {pct != null && (
                <span
                    className={`flex items-center gap-0.5 font-mono text-xs font-bold ${
                        isPos
                            ? "text-emerald-400"
                            : isNeg
                              ? "text-red-400"
                              : "text-muted-foreground/50"
                    }`}
                >
                    {isPos ? (
                        <TrendingUp className="h-2.5 w-2.5" />
                    ) : isNeg ? (
                        <TrendingDown className="h-2.5 w-2.5" />
                    ) : (
                        <Minus className="h-2.5 w-2.5" />
                    )}
                    {isPos ? "+" : ""}
                    {fmt(pct, 2)}%
                </span>
            )}
        </div>
    );
}

function readOpen(): boolean {
    try {
        return localStorage.getItem(MARKET_BAR_KEY) === "1";
    } catch {
        return false;
    }
}

export function toggleMarketBar() {
    try {
        const next = localStorage.getItem(MARKET_BAR_KEY) === "1" ? "0" : "1";
        localStorage.setItem(MARKET_BAR_KEY, next);
        window.dispatchEvent(new CustomEvent(MARKET_BAR_EVENT, { detail: next === "1" }));
    } catch {
        /* ignore */
    }
}

/**
 * Renders nothing when collapsed (no chrome row). Open via Navbar toggle.
 */
export function MarketBar() {
    const [data, setData] = useState<IndicesMap>({});
    const [loaded, setLoaded] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setOpen(readOpen());
        const onEvt = (e: Event) => {
            const ce = e as CustomEvent<boolean>;
            setOpen(!!ce.detail);
        };
        const onStorage = (e: StorageEvent) => {
            if (e.key === MARKET_BAR_KEY) setOpen(e.newValue === "1");
        };
        window.addEventListener(MARKET_BAR_EVENT, onEvt);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(MARKET_BAR_EVENT, onEvt);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const fetchIndices = async () => {
            try {
                const res = await fetch(`${API_URL}/market/indices`);
                if (res.ok) {
                    setData(await res.json());
                    setLoaded(true);
                }
            } catch {
                /* keep prior */
            }
        };
        fetchIndices();
        const interval = setInterval(fetchIndices, 15_000);
        return () => clearInterval(interval);
    }, [open]);

    if (!open) return null;

    return (
        <div className="h-7 w-full shrink-0 overflow-x-auto border-b border-white/[0.04] bg-black/20 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
            <div className="flex h-7 min-w-max items-center px-3">
                {!loaded ? (
                    INDEX_ORDER.slice(0, 5).map((k) => (
                        <div key={k} className="flex shrink-0 items-center gap-1.5 px-3">
                            <Skeleton className="h-3 w-10" />
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-3 w-8" />
                        </div>
                    ))
                ) : (
                    INDEX_ORDER.filter((k) => data[k]).map((k) => (
                        <IndexItem key={k} k={k} d={data[k]} />
                    ))
                )}
            </div>
        </div>
    );
}

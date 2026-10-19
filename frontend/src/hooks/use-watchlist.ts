"use client";

import { useCallback, useSyncExternalStore } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "rule1_watchlist_v1";
const CHANGE_EVENT = "rule1_watchlist_change";

/**
 * Watchlist state as a single module-level external store.
 *
 * Previously this hook held its own `useState` plus two `useEffect`s, including a
 * `fetch('/watchlist')` on mount. Because a `WatchlistButton` renders in every
 * table row, opening a 500-row screener fired ~500 identical requests and ran 500
 * localStorage reads on every change. The store below is shared by all consumers,
 * so the server reconcile happens exactly once per page.
 *
 * localStorage remains the source of truth (instant, offline-safe) and the
 * backend is synced fire-and-forget, matching the previous behaviour.
 */

const EMPTY: string[] = [];

let snapshot: string[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function readLocal(): string[] {
    try {
        const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
        return [];
    }
}

function sameContents(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Replace the snapshot only when contents actually change.
 * `useSyncExternalStore` compares snapshots by identity, so returning a fresh
 * array on every read would cause an infinite render loop.
 */
function commit(next: string[]): void {
    if (sameContents(next, snapshot)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
}

function writeLocal(symbols: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
        /* storage unavailable */
    }
    commit(symbols);
    // Kept so any other listener (e.g. another tab's handler) still reacts.
    try {
        window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
        /* SSR */
    }
}

function hydrateOnce(): void {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;

    commit(readLocal());
    window.addEventListener(CHANGE_EVENT, () => commit(readLocal()));

    // One reconcile per page load, not one per mounted button.
    fetch(`${API_URL}/watchlist`)
        .then((r) => r.json())
        .then((data: { items?: { symbol: string }[] }) => {
            const serverSymbols = (data.items ?? []).map((i) => i.symbol);
            if (serverSymbols.length > 0) {
                writeLocal(Array.from(new Set([...serverSymbols, ...readLocal()])));
            }
        })
        .catch(() => {
            /* offline - localStorage is authoritative */
        });
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    hydrateOnce();
    return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
    return snapshot;
}

function getServerSnapshot(): string[] {
    return EMPTY;
}

/* ── Mutations: module-level, so identity is stable across renders ── */

export async function toggleWatchlist(symbol: string): Promise<void> {
    const sym = symbol.toUpperCase();
    const current = readLocal();
    const already = current.includes(sym);
    writeLocal(already ? current.filter((s) => s !== sym) : [...current, sym]);

    try {
        if (already) {
            await fetch(`${API_URL}/watchlist/${sym}`, { method: "DELETE" });
        } else {
            await fetch(`${API_URL}/watchlist/${sym}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
        }
    } catch {
        /* backend offline - localStorage is fine */
    }
}

export async function addToWatchlist(
    symbol: string,
    notes?: string,
    targetPrice?: number
): Promise<void> {
    const sym = symbol.toUpperCase();
    const current = readLocal();
    if (current.includes(sym)) return;
    writeLocal([...current, sym]);
    try {
        await fetch(`${API_URL}/watchlist/${sym}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: notes ?? null, target_price: targetPrice ?? null }),
        });
    } catch {
        /* offline */
    }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
    const sym = symbol.toUpperCase();
    writeLocal(readLocal().filter((s) => s !== sym));
    try {
        await fetch(`${API_URL}/watchlist/${sym}`, { method: "DELETE" });
    } catch {
        /* offline */
    }
}

/* ── Hooks ── */

/** Full watchlist. Re-renders whenever any symbol is added or removed. */
export function useWatchlist() {
    const symbols = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const isWatched = useCallback(
        (symbol: string) => symbols.includes(symbol.toUpperCase()),
        [symbols]
    );

    return {
        symbols,
        count: symbols.length,
        isWatched,
        toggle: toggleWatchlist,
        add: addToWatchlist,
        remove: removeFromWatchlist,
    };
}

/**
 * Subscribe to a single symbol's watched state.
 *
 * Returns a boolean, so a row's star only re-renders when that specific symbol
 * changes - not when any symbol anywhere in the watchlist changes.
 */
export function useIsWatched(symbol: string): boolean {
    const sym = symbol.toUpperCase();
    const selector = useCallback(() => snapshot.includes(sym), [sym]);
    return useSyncExternalStore(subscribe, selector, () => false);
}

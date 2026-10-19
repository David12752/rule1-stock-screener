"use client";

import { create } from "zustand";

/**
 * Scan progress lives outside React's context graph.
 *
 * Previously the SSE handler called `setTimingProgress` and `setTimingResults` on
 * the workspace context once per second. Because the provider built a fresh value
 * object on every render, each tick re-rendered the shell, the active panel, all
 * ~500 table rows and every WatchlistButton, and recomputed the candidates
 * merge/sort. Here components subscribe to individual slices, so a progress tick
 * repaints only the progress indicator.
 */

/** A pattern-scanner hit. Canonical shape; re-exported by workspace-context. */
export interface TimingResult {
    symbol: string;
    company_name: string;
    sector: string;
    patterns: Array<{
        pattern_type: string;
        confidence: number;
        description?: string;
        target_price?: number;
        key_points?: Array<{ date?: string; price?: number; label?: string }>;
    }>;
    current_price: number;
    market_cap?: number;
    listing_age_years?: number | null;
    startup_score?: number | null;
    breakout_phase?: "forming" | "near" | "broken" | string | null;
    is_startup_candidate?: boolean;
    top_pattern?: string | null;
    rule1_quality?: { passes: boolean; summary: string };
    rule1_verdict?: string;
    price_change_pct?: number | null;
    price_as_of?: string;
    price_live?: boolean;
}

export interface ScanProgress {
    scanned: number;
    total: number;
    found: number;
    ticker?: string;
}

/** Delta frame emitted by GET /scanner/events. */
export type ScanEvent = {
    type?: "progress" | "done";
    running?: boolean;
    scanned?: number;
    total?: number;
    found?: number;
    ticker?: string | null;
    reset?: boolean;
    results_append?: TimingResult[];
};

interface ScanState {
    running: boolean;
    progress: ScanProgress;
    results: TimingResult[];
    apply: (event: ScanEvent) => void;
    setResults: (results: TimingResult[]) => void;
    setRunning: (running: boolean) => void;
    reset: () => void;
}

const EMPTY_PROGRESS: ScanProgress = { scanned: 0, total: 0, found: 0 };

export const useScanStore = create<ScanState>((set) => ({
    running: false,
    progress: EMPTY_PROGRESS,
    results: [],

    apply: (event) =>
        set((state) => {
            const appended = event.results_append;
            const results = event.reset
                ? appended ?? []
                : appended && appended.length > 0
                    ? [...state.results, ...appended]
                    : state.results;

            return {
                running: event.running ?? state.running,
                progress: {
                    scanned: event.scanned ?? state.progress.scanned,
                    total: event.total ?? state.progress.total,
                    found: event.found ?? results.length,
                    ticker: event.ticker ?? undefined,
                },
                results,
            };
        }),

    setResults: (results) =>
        set((state) => ({
            results,
            progress: { ...state.progress, found: results.length },
        })),

    setRunning: (running) => set({ running }),

    reset: () => set({ running: false, progress: EMPTY_PROGRESS, results: [] }),
}));

/* ── Selectors: subscribe to the narrowest slice possible ── */

export const useScanRunning = () => useScanStore((s) => s.running);
export const useScanProgress = () => useScanStore((s) => s.progress);
export const useScanResults = () => useScanStore((s) => s.results);

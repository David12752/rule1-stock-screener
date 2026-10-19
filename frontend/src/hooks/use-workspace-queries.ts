"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiGet } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { QualityStock, UniverseInfo } from "@/components/workspace/workspace-context";
import type { TimingResult } from "@/stores/scan-store";

interface LibraryResponse {
    stocks?: QualityStock[];
    scanning?: boolean;
    analyzed?: number;
    pending?: number;
    total?: number;
}

/**
 * The universe catalogue. Effectively static for a session, so it is cached for
 * the lifetime of the page rather than re-fetched whenever a panel remounts.
 */
export function useUniverses() {
    const { data } = useQuery({
        queryKey: queryKeys.universes,
        queryFn: async ({ signal }) => {
            const raw = await apiGet<UniverseInfo[] | { universes?: UniverseInfo[] }>(
                "/scanner/universes",
                signal
            );
            return Array.isArray(raw) ? raw : raw.universes ?? [];
        },
        staleTime: Infinity,
    });

    return data ?? [];
}

/**
 * Full universe roster (analyzed + PENDING stubs) for Rule #1 quality view.
 *
 * Uses live_prices=false so the list endpoint stays fast; prices come from
 * useLiveQuotes. While scanning, polls every 2s so new rows appear quickly.
 */
export function useLibrary(universe: string) {
    const query = useQuery({
        queryKey: queryKeys.library(universe),
        queryFn: ({ signal }) => {
            const params = new URLSearchParams({
                live_prices: "false",
                include_pending: "true",
            });
            if (universe && universe !== "all") {
                params.set("universe", universe);
            }
            return apiGet<LibraryResponse>(`/library?${params.toString()}`, signal);
        },
        refetchInterval: (q) => (q.state.data?.scanning ? 2000 : 8_000),
        staleTime: 2_000,
        refetchOnWindowFocus: true,
    });

    return {
        stocks: query.data?.stocks ?? [],
        scanning: !!query.data?.scanning,
        analyzed: query.data?.analyzed ?? 0,
        pending: query.data?.pending ?? 0,
        total: query.data?.total ?? 0,
        loading: query.isPending,
        refetch: query.refetch,
    };
}

/** Pattern-scanner results as last persisted by the backend. */
export function useTimingResults(universe: string = "all") {
    return useQuery({
        queryKey: [...queryKeys.timingResults, universe],
        queryFn: async ({ signal }) => {
            const params = new URLSearchParams({ live_prices: "false" });
            if (universe && universe !== "all") {
                params.set("universe", universe);
            }
            const data = await apiGet<{ results?: TimingResult[]; running?: boolean }>(
                `/scanner/results?${params.toString()}`,
                signal
            );
            return {
                results: data.results ?? [],
                running: !!data.running,
            };
        },
        refetchInterval: (q) => (q.state.data?.running ? 2000 : 8_000),
        staleTime: 2_000,
        refetchOnWindowFocus: true,
    });
}

/** Invalidators, so a POST /scan can refresh the affected lists explicitly. */
export function useWorkspaceInvalidators() {
    const qc = useQueryClient();

    const invalidateLibrary = useCallback(
        () => qc.invalidateQueries({ queryKey: ["library"] }),
        [qc]
    );
    const invalidateTiming = useCallback(
        () => qc.invalidateQueries({ queryKey: queryKeys.timingResults }),
        [qc]
    );

    return { invalidateLibrary, invalidateTiming };
}

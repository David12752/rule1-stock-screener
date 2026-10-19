"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * One client for the whole app.
 *
 * Created in state rather than at module scope so a fast refresh (or a second
 * root in tests) does not share a cache across trees.
 *
 * Defaults favour responsive prices: short stale windows, refetch on focus.
 * Individual queries (library / stock / quotes) set their own poll intervals.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 15_000,
                        gcTime: 10 * 60_000,
                        refetchOnWindowFocus: true,
                        retry: 1,
                    },
                },
            })
    );

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

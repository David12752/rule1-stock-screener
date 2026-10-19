/**
 * Every cache key in one place.
 *
 * Keys are arrays so a prefix invalidates a family: invalidating `["library"]`
 * refreshes the quality list for every universe, while `library(universe)`
 * targets one.
 */
export const queryKeys = {
    universes: ["universes"] as const,
    library: (universe?: string) => ["library", universe ?? "all"] as const,
    timingResults: ["scanner", "results"] as const,
    performance: ["performance", "summary"] as const,
    marketStatus: ["market", "status"] as const,
    stock: (ticker: string) => ["stock", ticker.toUpperCase()] as const,
    quotes: (symbolsKey: string) => ["quotes", symbolsKey] as const,
};

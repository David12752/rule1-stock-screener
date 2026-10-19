"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export interface LiveQuote {
  symbol: string;
  price: number;
  previous_close?: number | null;
  change_pct?: number | null;
  as_of?: string;
  source?: string;
}

interface QuotesResponse {
  as_of: string;
  count: number;
  quotes: Record<string, LiveQuote>;
}

const DEFAULT_INTERVAL_MS = 15_000;

/**
 * Poll near-real-time Yahoo quotes for a set of symbols.
 * Server caches ~20s, so 15s client polls stay cheap.
 */
export function useLiveQuotes(
  symbols: string[],
  intervalMs: number = DEFAULT_INTERVAL_MS
) {
  const normalized = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of symbols) {
      const sym = String(raw || "")
        .trim()
        .toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      out.push(sym);
    }
    return out.sort();
  }, [symbols]);

  const key = normalized.join(",");

  const query = useQuery({
    queryKey: queryKeys.quotes(key),
    queryFn: ({ signal }) =>
      apiGet<QuotesResponse>(`/quotes?symbols=${encodeURIComponent(key)}`, signal),
    enabled: normalized.length > 0,
    refetchInterval: intervalMs,
    staleTime: Math.min(10_000, intervalMs),
    refetchOnWindowFocus: true,
  });

  return {
    quotes: query.data?.quotes ?? {},
    asOf: query.data?.as_of,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

/** Merge a live quote map onto rows that expose `price` or `current_price`. */
export function applyLiveQuotes<T extends Record<string, unknown>>(
  rows: T[],
  quotes: Record<string, LiveQuote>,
  opts?: { priceKey?: "price" | "current_price"; symbolKey?: string }
): T[] {
  if (!rows.length || !quotes || Object.keys(quotes).length === 0) return rows;
  const priceKey = opts?.priceKey ?? "price";
  const symbolKey = opts?.symbolKey ?? "symbol";

  return rows.map((row) => {
    const sym = String(row[symbolKey] ?? "")
      .trim()
      .toUpperCase();
    const q = quotes[sym];
    if (!q?.price || q.price <= 0) return row;
    return {
      ...row,
      [priceKey]: q.price,
      previous_close: q.previous_close ?? row.previous_close,
      price_change_pct: q.change_pct ?? row.price_change_pct,
      price_as_of: q.as_of ?? row.price_as_of,
      price_live: true,
    };
  });
}

"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, API_URL } from "@/lib/api/client";

export type FalseNegativeOutcome =
  | "outperformed"
  | "reclassified"
  | "data_error"
  | "other"
  | null
  | undefined;

export interface FalseNegativeFailure {
  code: string;
  he?: string;
  years?: number;
  limit?: number;
}

export interface FalseNegativeLikelyMistake {
  code: string;
  he: string;
}

export interface FalseNegativeSnapshot {
  verdict?: string;
  verdict_primary?: string;
  verdict_reason?: string;
  verdict_failures?: FalseNegativeFailure[];
  verdict_details?: Record<string, unknown>;
  price?: number;
  mos_price?: number;
  sticker_price?: number;
  payback_time?: number;
  big_5?: Record<string, unknown>;
  technical_signal?: string;
  moat_score?: number;
  company_name?: string;
}

export interface FalseNegativeRecheck {
  at?: string;
  verdict?: string;
  price?: number;
  mos_price?: number;
  price_change_pct?: number | null;
  failures_resolved?: FalseNegativeFailure[];
  failures_still?: FalseNegativeFailure[];
  failures_new?: FalseNegativeFailure[];
  likely_mistakes?: FalseNegativeLikelyMistake[];
}

export interface FalseNegativeItem {
  symbol: string;
  company_name?: string;
  noted_at?: string;
  updated_at?: string;
  notes?: string | null;
  outcome?: FalseNegativeOutcome;
  original?: FalseNegativeSnapshot;
  last_recheck?: FalseNegativeRecheck | null;
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed`);
  return (await res.json()) as T;
}

export const falseNegQueryKey = ["false-negatives"] as const;

export function useFalseNegatives() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: falseNegQueryKey,
    queryFn: async ({ signal }) => {
      const data = await apiGet<{ items?: FalseNegativeItem[] }>(
        "/false-negatives",
        signal
      );
      return data.items ?? [];
    },
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: falseNegQueryKey });
  }, [qc]);

  const add = useMutation({
    mutationFn: async ({
      symbol,
      notes,
      outcome,
    }: {
      symbol: string;
      notes?: string;
      outcome?: string;
    }) =>
      apiPost<{ ok: boolean; item: FalseNegativeItem }>(
        `/false-negatives/${encodeURIComponent(symbol)}`,
        { notes, outcome }
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (symbol: string) =>
      apiDelete(`/false-negatives/${encodeURIComponent(symbol)}`),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      symbol,
      notes,
      outcome,
    }: {
      symbol: string;
      notes?: string;
      outcome?: string;
    }) =>
      apiPatch<{ ok: boolean; item: FalseNegativeItem }>(
        `/false-negatives/${encodeURIComponent(symbol)}`,
        { notes, outcome }
      ),
    onSuccess: invalidate,
  });

  const recheck = useMutation({
    mutationFn: (symbol: string) =>
      apiPost<{ ok: boolean; item: FalseNegativeItem; comparison: FalseNegativeRecheck }>(
        `/false-negatives/${encodeURIComponent(symbol)}/recheck`,
        {}
      ),
    onSuccess: invalidate,
  });

  const symbols = new Set((query.data ?? []).map((i) => i.symbol.toUpperCase()));

  return {
    items: query.data ?? [],
    loading: query.isPending,
    isTracked: (symbol: string) => symbols.has(symbol.toUpperCase()),
    add,
    remove,
    update,
    recheck,
    refetch: query.refetch,
  };
}

export const OUTCOME_HE: Record<string, string> = {
  outperformed: "עלתה אחרי הפסילה",
  reclassified: "סווגה מחדש לחיוב",
  data_error: "טעות בנתונים",
  other: "אחר",
};

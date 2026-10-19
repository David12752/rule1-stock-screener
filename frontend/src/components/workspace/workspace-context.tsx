"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLibrary,
  useTimingResults,
  useUniverses,
} from "@/hooks/use-workspace-queries";
import { applyLiveQuotes, useLiveQuotes } from "@/hooks/use-live-quotes";
import { apiPost } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useScanResults, useScanStore } from "@/stores/scan-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type WorkspaceTab =
  | "universe"
  | "quality"
  | "timing"
  | "startup"
  | "candidates"
  | "analysis"
  | "portfolio";

export interface UniverseInfo {
  id: string;
  label: string;
  icon?: string;
  region?: string;
  count: number;
}

export interface QualityStock {
  symbol: string;
  company_name?: string;
  price: number;
  sticker_price: number;
  mos_price: number;
  verdict?: string;
  big_5?: Record<string, any>;
  ai_analysis?: { moat_score?: number; moat_type?: string; moat_analysis?: string };
  price_change_pct?: number | null;
  price_as_of?: string;
  price_live?: boolean;
  technical_analysis?: { signal?: string };
  payback_time?: number;
  market_data?: { sector?: string; market_cap?: number };
  verdict_reason?: string;
  data_quality?: { incomplete?: boolean; issues?: string[] };
  split_adjustment?: { applied?: boolean; split_events?: number };
  analysis_pending?: boolean;
}

export type { TimingResult } from "@/stores/scan-store";

export interface CandidateRow {
  symbol: string;
  name: string;
  sector?: string;
  verdict?: string;
  price?: number;
  mos?: number;
  sticker?: number;
  patterns: number;
  topPattern?: string;
  confidence?: number;
  signal?: string;
  moat?: number;
  source: "both" | "quality" | "timing";
  score: number;
  discountPct?: number;
}

/**
 * Scan progress and pattern results deliberately do NOT live here - they are in
 * `stores/scan-store.ts`. They change up to once per second during a scan, and a
 * context update re-renders every consumer. Read them with `useScanProgress()`,
 * `useScanRunning()` and `useScanResults()` so only the components that display
 * them repaint.
 */
interface WorkspaceContextValue {
  tab: WorkspaceTab;
  setTab: (t: WorkspaceTab) => void;
  universes: UniverseInfo[];
  selectedUniverse: string;
  setSelectedUniverse: (id: string) => void;
  qualityStocks: QualityStock[];
  qualityPassers: QualityStock[];
  qualityLoading: boolean;
  qualityScanning: boolean;
  qualityAnalyzed: number;
  qualityPending: number;
  qualityTotal: number;
  refreshQuality: () => Promise<void>;
  timingOnlyQuality: boolean;
  setTimingOnlyQuality: (v: boolean) => void;
  refreshTiming: () => Promise<void>;
  selectedSymbol: string | null;
  /** Second arg opens the side inspector (legacy name: goAnalysis). */
  selectSymbol: (symbol: string | null, openSideInspector?: boolean) => void;
  /** Side/bottom inspector open (row click or portfolio pick). */
  inspectorOpen: boolean;
  openInspector: (symbol: string) => void;
  closeInspector: () => void;
  candidateMode: "both" | "quality" | "timing" | "any";
  setCandidateMode: (m: "both" | "quality" | "timing" | "any") => void;
  universeCount: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

function readTabFromUrl(): WorkspaceTab {
  if (typeof window === "undefined") return "universe";
  const t = new URLSearchParams(window.location.search).get("tab");
  // Legacy ?tab=analysis → quality; full analysis lives on /stock/[ticker]
  // and the side inspector. Keep "analysis" in the type for old call sites.
  if (t === "analysis") return "quality";
  const valid: WorkspaceTab[] = [
    "universe",
    "quality",
    "timing",
    "startup",
    "candidates",
    "portfolio",
  ];
  return valid.includes(t as WorkspaceTab) ? (t as WorkspaceTab) : "universe";
}

const VERDICT_SCORE: Record<string, number> = {
  BUY: 100,
  WAIT: 70,
  WATCHLIST: 55,
  WARY: 30,
  DISQUALIFIED: 0,
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Lazy init from ?tab= so deep links land on the right panel without a
  // universe-flash on the first paint (and without a setState-in-effect lint).
  const [tab, setTabState] = useState<WorkspaceTab>(readTabFromUrl);
  const [selectedUniverse, setSelectedUniverse] = useState("all");
  // Default off so auto pattern hits show immediately without waiting on quality.
  const [timingOnlyQuality, setTimingOnlyQuality] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [candidateMode, setCandidateMode] = useState<"both" | "quality" | "timing" | "any">(
    "both"
  );
  const esRef = useRef<EventSource | null>(null);

  // SSR always sees "universe" (no window). Re-read the query string after mount
  // so /?tab=quality actually opens Quality instead of staying on Universe.
  useEffect(() => {
    const fromUrl = readTabFromUrl();
    setTabState((current) => (current === fromUrl ? current : fromUrl));
  }, []);

  // Server state lives in the query cache; only UI state stays in this provider.
  const universes = useUniverses();
  const {
    stocks: libraryStocks,
    scanning: qualityScanning,
    analyzed: qualityAnalyzed,
    pending: qualityPending,
    total: qualityTotal,
    loading: qualityLoading,
    refetch: refetchLibrary,
  } = useLibrary(selectedUniverse);
  const { data: timingQueryData } = useTimingResults(selectedUniverse);
  const timingData = timingQueryData?.results;
  const timingServerRunning = !!timingQueryData?.running;
  const queryClient = useQueryClient();

  // Ensure missing members of the selected universe get scanned automatically.
  useEffect(() => {
    let cancelled = false;
    const universe = selectedUniverse || "all";
    (async () => {
      try {
        await apiPost("/library/ensure-scan", { universe });
        if (!cancelled) await refetchLibrary();
      } catch {
        /* backend may be busy; polling will retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUniverse, refetchLibrary]);

  // When a scan finishes, immediately queue any remaining gaps for this universe.
  useEffect(() => {
    if (qualityScanning) return;
    const universe = selectedUniverse || "all";
    let cancelled = false;
    (async () => {
      try {
        const res = await apiPost<{ started?: boolean; missing?: number }>(
          "/library/ensure-scan",
          { universe }
        );
        if (!cancelled && res?.started) await refetchLibrary();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qualityScanning, selectedUniverse, refetchLibrary]);

  // Live quotes only for analyzed rows (PENDING stubs have no Yahoo price yet).
  // Cap protects /quotes URL length and keeps the UI responsive.
  const qualitySymbols = useMemo(() => {
    const analyzed = libraryStocks
      .filter((s) => s.verdict && s.verdict !== "PENDING" && !s.analysis_pending)
      .map((s) => s.symbol)
      .filter(Boolean);
    return analyzed.slice(0, 400);
  }, [libraryStocks]);
  const { quotes: qualityQuotes } = useLiveQuotes(qualitySymbols, 10_000);
  const qualityStocks = useMemo(
    () => applyLiveQuotes(libraryStocks, qualityQuotes),
    [libraryStocks, qualityQuotes]
  );

  // Keep timing/startup table prices fresh without waiting for a full results refetch.
  const timingRows = useScanResults();
  const timingSymbols = useMemo(
    () => timingRows.map((r) => r.symbol).filter(Boolean),
    [timingRows]
  );
  const { quotes: timingQuotes } = useLiveQuotes(timingSymbols, 15_000);
  useEffect(() => {
    if (!timingQuotes || Object.keys(timingQuotes).length === 0) return;
    const current = useScanStore.getState().results;
    if (!current.length) return;
    let changed = false;
    const next = current.map((row) => {
      const q = timingQuotes[row.symbol];
      if (!q?.price || q.price <= 0 || q.price === row.current_price) return row;
      changed = true;
      return {
        ...row,
        current_price: q.price,
        price_change_pct: q.change_pct ?? undefined,
        price_live: true,
      } as typeof row;
    });
    if (changed) useScanStore.getState().setResults(next);
  }, [timingQuotes]);

  // The pattern store is the single source of truth for the timing panel because
  // the SSE stream appends to it mid-scan. Persisted/live-priced results refresh
  // it only when a scan is NOT running, so we don't clobber the stream.
  useEffect(() => {
    if (!timingData) return;
    if (useScanStore.getState().running) return;
    useScanStore.getState().setResults(timingData);
  }, [timingData]);

  const setTab = useCallback((t: WorkspaceTab) => {
    const next = t === "analysis" ? "quality" : t;
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const selectSymbol = useCallback(
    (symbol: string | null, openSideInspector = false) => {
      setSelectedSymbol(symbol);
      if (symbol && openSideInspector) {
        setInspectorOpen(true);
      }
    },
    []
  );

  const openInspector = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setInspectorOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
  }, []);

  const universeCount = useMemo(() => {
    return universes.find((u) => u.id === selectedUniverse)?.count
      ?? universes.find((u) => u.id === "all")?.count
      ?? 0;
  }, [universes, selectedUniverse]);

  const refreshQuality = useCallback(async () => {
    await refetchLibrary();
  }, [refetchLibrary]);

  const refreshTiming = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: queryKeys.timingResults });
  }, [queryClient]);

  const qualityPassers = useMemo(
    () =>
      qualityStocks.filter(
        (s) => s.verdict && !["DISQUALIFIED"].includes(s.verdict)
      ),
    [qualityStocks]
  );

  const attachScanStream = useCallback((refreshOnDone = true) => {
    esRef.current?.close();
    const es = new EventSource(`${API_URL}/scanner/events`);
    esRef.current = es;

    const finish = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      useScanStore.getState().setRunning(false);
    };

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        useScanStore.getState().apply(msg);
        if (msg.type === "done") {
          finish();
          if (refreshOnDone) refreshTiming();
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    es.onerror = () => {
      finish();
      if (refreshOnDone) refreshTiming();
    };
  }, [refreshTiming]);

  // Auto-scans start on the backend without a UI click — attach the live SSE
  // stream whenever the server reports a pattern scan already in progress.
  useEffect(() => {
    if (!timingServerRunning) return;
    if (esRef.current) return;
    useScanStore.getState().setRunning(true);
    attachScanStream(true);
  }, [timingServerRunning, attachScanStream]);

  // The stream used to be closed only on done/error, so navigating away
  // mid-scan leaked it and left a handler writing into an unmounted tree.
  useEffect(
    () => () => {
      esRef.current?.close();
      esRef.current = null;
    },
    []
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      tab,
      setTab,
      universes,
      selectedUniverse,
      setSelectedUniverse,
      qualityStocks,
      qualityPassers,
      qualityLoading,
      qualityScanning,
      qualityAnalyzed,
      qualityPending,
      qualityTotal,
      refreshQuality,
      timingOnlyQuality,
      setTimingOnlyQuality,
      refreshTiming,
      selectedSymbol,
      selectSymbol,
      inspectorOpen,
      openInspector,
      closeInspector,
      candidateMode,
      setCandidateMode,
      universeCount,
    }),
    [
      tab,
      setTab,
      universes,
      selectedUniverse,
      qualityStocks,
      qualityPassers,
      qualityLoading,
      qualityScanning,
      qualityAnalyzed,
      qualityPending,
      qualityTotal,
      refreshQuality,
      timingOnlyQuality,
      refreshTiming,
      selectedSymbol,
      selectSymbol,
      inspectorOpen,
      openInspector,
      closeInspector,
      candidateMode,
      universeCount,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Merged Quality x Timing ranking.
 *
 * Lives outside the provider so that recomputing it (which happens whenever new
 * pattern results stream in) does not create a new context value and therefore
 * does not re-render every consumer of the workspace context.
 */
export function useCandidates(): CandidateRow[] {
  const { qualityStocks, candidateMode } = useWorkspace();
  const timingResults = useScanResults();

  return useMemo<CandidateRow[]>(() => {
    const qMap = new Map(qualityStocks.map((s) => [s.symbol.toUpperCase(), s]));
    const tMap = new Map(timingResults.map((s) => [s.symbol.toUpperCase(), s]));
    const symbols = new Set([...qMap.keys(), ...tMap.keys()]);
    const rows: CandidateRow[] = [];

    for (const sym of symbols) {
      const q = qMap.get(sym);
      const t = tMap.get(sym);
      const hasQ = !!q && q.verdict && q.verdict !== "DISQUALIFIED";
      const hasT = !!t && (t.patterns?.length ?? 0) > 0;

      let source: CandidateRow["source"] | null = null;
      if (hasQ && hasT) source = "both";
      else if (hasQ) source = "quality";
      else if (hasT) source = "timing";
      else continue;

      if (candidateMode === "both" && source !== "both") continue;
      if (candidateMode === "quality" && !hasQ) continue;
      if (candidateMode === "timing" && !hasT) continue;

      const top = t?.patterns?.[0];
      const price = q?.price ?? t?.current_price;
      const mos = q?.mos_price;
      const discountPct =
        price && mos && mos > 0 ? ((mos - price) / mos) * 100 : undefined;

      let score = 0;
      if (q?.verdict) score += VERDICT_SCORE[q.verdict] ?? 0;
      if (top?.confidence) score += top.confidence * 40;
      if (source === "both") score += 25;
      if (q?.technical_analysis?.signal === "Green") score += 15;
      if (discountPct != null && discountPct > 0) score += Math.min(20, discountPct / 2);

      rows.push({
        symbol: sym,
        name: q?.company_name || t?.company_name || sym,
        sector: q?.market_data?.sector || t?.sector,
        verdict: q?.verdict || t?.rule1_verdict,
        price,
        mos,
        sticker: q?.sticker_price,
        patterns: t?.patterns?.length ?? 0,
        topPattern: top?.pattern_type,
        confidence: top?.confidence,
        signal: q?.technical_analysis?.signal,
        moat: q?.ai_analysis?.moat_score,
        source,
        score: Math.round(score),
        discountPct,
      });
    }

    return rows.sort((a, b) => b.score - a.score);
  }, [qualityStocks, timingResults, candidateMode]);
}

"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { apiGet } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { StockAnalysis } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/watchlist-button";
import { FalseNegativeButton } from "@/components/false-negative-button";
import { InfoHint } from "@/components/info-hint";
import {
  BIG5_METRICS,
  CONSISTENCY_HE,
  QUALITY_BADGES,
  SIGNAL_HE,
  VALUATION_METRICS,
} from "@/lib/metrics";
import {
  VERDICT_CLS,
  VERDICT_EXPLAIN,
  VERDICT_HE,
  verdictReasonsHe,
} from "@/lib/verdict";
import { useWorkspace } from "./workspace-context";

/**
 * Master–detail inspector: opens beside (desktop) or under (mobile) the table
 * when a row is clicked, without navigating away from the screener funnel.
 */
export function StockInspector() {
  const { selectedSymbol, closeInspector } = useWorkspace();

  useEffect(() => {
    if (!selectedSymbol) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSymbol, closeInspector]);

  const { data, isFetching: loading } = useQuery({
    queryKey: queryKeys.stock(selectedSymbol ?? ""),
    queryFn: ({ signal }) =>
      apiGet<StockAnalysis>(`/stock/${encodeURIComponent(selectedSymbol!)}`, signal),
    enabled: !!selectedSymbol,
    refetchInterval: 15_000,
    staleTime: 8_000,
    refetchOnWindowFocus: true,
  });

  if (!selectedSymbol) return null;

  const undervalued =
    !!data && data.price > 0 && data.mos_price > 0 && data.price < data.mos_price;

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={closeInspector}
      />

      <aside
        className={cn(
          "z-50 flex flex-col overflow-hidden border-white/[0.08] bg-[#0c0e14]",
          // Desktop: side pane at the inline-end (left in RTL)
          "lg:relative lg:z-auto lg:h-full lg:w-[420px] lg:shrink-0 lg:border-s",
          // Mobile: bottom sheet
          "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t shadow-2xl lg:rounded-none lg:shadow-none"
        )}
        aria-label={`ניתוח ${selectedSymbol}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-sm font-semibold">
              {data?.short_name || data?.company_name || selectedSymbol}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {selectedSymbol}
              {data?.sector || data?.market_data?.sector
                ? ` · ${data.sector || data.market_data?.sector}`
                : ""}
            </div>
          </div>
          {data?.verdict && (
            <InfoHint
              info={{
                label: `פסיקה: ${VERDICT_HE[data.verdict] || data.verdict}`,
                what: VERDICT_EXPLAIN[data.verdict] ?? "פסיקת Rule #1 עבור המניה.",
              }}
            >
              <span
                className={cn(
                  "cursor-help rounded px-2 py-0.5 text-[11px]",
                  VERDICT_CLS[data.verdict]
                )}
              >
                {VERDICT_HE[data.verdict] || data.verdict}
              </span>
            </InfoHint>
          )}
          <button
            type="button"
            onClick={closeInspector}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            aria-label="סגור בדיקה"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          {loading && !data && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> מנתח {selectedSymbol}…
            </div>
          )}

          {data && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {undervalued && (
                  <InfoHint info={QUALITY_BADGES.below_mos}>
                    <Badge className="cursor-help bg-emerald-500/15 text-emerald-400 text-[10px]">
                      {QUALITY_BADGES.below_mos.label}
                    </Badge>
                  </InfoHint>
                )}
                {data.data_quality?.incomplete && (
                  <InfoHint info={QUALITY_BADGES.incomplete}>
                    <Badge className="cursor-help bg-orange-500/15 text-orange-300 text-[10px]">
                      {QUALITY_BADGES.incomplete.label}
                    </Badge>
                  </InfoHint>
                )}
                {data.technical_analysis?.signal && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    איתות:{" "}
                    <span
                      className={
                        data.technical_analysis.signal === "Green"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {SIGNAL_HE[data.technical_analysis.signal] ??
                        data.technical_analysis.signal}
                    </span>
                    <InfoHint info={VALUATION_METRICS.signal} />
                  </span>
                )}
              </div>

              <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                {verdictReasonsHe(data).map((line, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-muted-foreground/40">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {(
                  [
                    ["price", fmt(data.price)],
                    ["mos_price", fmt(data.mos_price)],
                    ["sticker_price", fmt(data.sticker_price)],
                    [
                      "payback_time",
                      data.payback_time != null && data.payback_time < 900
                        ? `${data.payback_time} שנים`
                        : "—",
                    ],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="rounded bg-white/[0.03] p-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {VALUATION_METRICS[key].label}
                      <InfoHint info={VALUATION_METRICS[key]} />
                    </div>
                    <div className="font-mono text-sm">{value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  חמשת המדדים
                  <InfoHint
                    info={{
                      label: "חמשת המדדים",
                      term: "The Big 5",
                      what: "חמישה מדדים שפיל טאון בוחן לזיהוי עסק איכותי.",
                      rule: "כל אחד צריך 10% ומעלה לטווח ארוך (ROE משלים).",
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {["roic", "equity", "eps", "sales", "fcf", "roe"].map((k) => {
                    const m = data.big_5?.[k];
                    const ok = !!m?.consistent_growth;
                    const info = BIG5_METRICS[k];
                    const isLevel = m?.unit === "ratio";
                    const headline = isLevel
                      ? m?.latest_value ?? null
                      : m?.cagr_5y ?? m?.cagr_3y ?? m?.cagr_1y ?? null;

                    return (
                      <div
                        key={k}
                        className={cn(
                          "rounded-md border px-2 py-1.5",
                          ok
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-red-500/20 bg-red-500/5"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {info?.label ?? k}
                            <InfoHint info={info} />
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-medium",
                              ok ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {ok ? CONSISTENCY_HE.pass : CONSISTENCY_HE.fail}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-sm">
                          {headline != null ? `${(headline * 100).toFixed(1)}%` : "—"}
                          <span className="ms-1 text-[9px] font-sans text-muted-foreground">
                            {isLevel ? "רמה" : "צמיחה"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {data.ai_analysis?.moat_score != null && (
                <div className="rounded-md border border-white/[0.06] p-2">
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="flex items-center gap-1 font-medium">
                      חומה תחרותית
                      <InfoHint info={VALUATION_METRICS.moat_score} />
                    </span>
                    <span className="font-mono">{data.ai_analysis.moat_score}/10</span>
                  </div>
                  {data.ai_analysis.moat_analysis && (
                    <p className="mt-1 line-clamp-4 text-[11px] text-muted-foreground leading-relaxed">
                      {data.ai_analysis.moat_analysis}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-2">
          <WatchlistButton symbol={selectedSymbol} size="sm" />
          <FalseNegativeButton
            symbol={selectedSymbol}
            verdict={data?.verdict}
            size="sm"
          />
          <Button size="sm" variant="secondary" className="ms-auto" asChild>
            <a href={`/stock/${encodeURIComponent(selectedSymbol)}?tab=report`}>
              <ExternalLink className="h-3.5 w-3.5 me-1" />
              דוח מלא
            </a>
          </Button>
        </div>
      </aside>
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useWatchlist } from "@/hooks/use-watchlist";
import { WatchlistButton } from "@/components/watchlist-button";
import {
  OUTCOME_HE,
  useFalseNegatives,
  type FalseNegativeItem,
} from "@/hooks/use-false-negatives";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { Holding, PerformanceSummary } from "@/lib/api/types";
import { VERDICT_CLS, VERDICT_HE } from "@/lib/verdict";
import { fmt } from "@/lib/format";
import { DenseTable } from "../shared";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

function FalseNegativeDetail({
  item,
  onClose,
  onRecheck,
  onRemove,
  onOutcome,
  rechecking,
}: {
  item: FalseNegativeItem;
  onClose: () => void;
  onRecheck: () => void;
  onRemove: () => void;
  onOutcome: (outcome: string) => void;
  rechecking: boolean;
}) {
  const orig = item.original;
  const rc = item.last_recheck;
  const origFails = (orig?.verdict_failures || []).map((f) => f.code);

  return (
    <div className="col-span-12 flex min-h-0 flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2 shrink-0">
        <div>
          <h3 className="font-mono text-sm font-semibold">
            {item.symbol}
            {item.company_name ? (
              <span className="ms-2 font-sans font-normal text-muted-foreground">
                {item.company_name}
              </span>
            ) : null}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            סומן {item.noted_at?.slice(0, 10) || "—"} · פסיקה מקורית:{" "}
            <span className={cn("rounded px-1 text-[10px]", VERDICT_CLS[orig?.verdict || ""])}>
              {VERDICT_HE[orig?.verdict || ""] || orig?.verdict || "—"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={rechecking} onClick={onRecheck}>
            {rechecking ? (
              <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="me-1 h-3.5 w-3.5" />
            )}
            בדוק מחדש מה השתנה
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="me-1 h-3.5 w-3.5" />
            הסר
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            סגור
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 text-[11px]">
        <div className="rounded border border-white/[0.06] p-2">
          <div className="mb-1 font-medium">כשלים בזמן הפסילה</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {(orig?.verdict_failures || []).length === 0 && <li>—</li>}
            {(orig?.verdict_failures || []).map((f) => (
              <li key={f.code}>• {f.he || f.code}</li>
            ))}
            {origFails.length === 0 && orig?.verdict_details && (
              <>
                {(orig.verdict_details as { big5_pass?: boolean }).big5_pass === false && (
                  <li>• צמיחה לא עקבית ב-Big 5</li>
                )}
              </>
            )}
          </ul>
          <div className="mt-2 font-mono text-muted-foreground">
            מחיר {fmt(orig?.price)} · MOS {fmt(orig?.mos_price)} · החזר{" "}
            {orig?.payback_time != null ? `${fmt(orig.payback_time, 1)}ש׳` : "—"}
          </div>
        </div>

        <div className="rounded border border-white/[0.06] p-2 md:col-span-2">
          <div className="mb-1 font-medium">מה הייתה הטעות? (אחרי בדיקה מחדש)</div>
          {!rc && (
            <p className="text-muted-foreground">
              לחצו «בדוק מחדש» — נריץ ניתוח עדכני ונשווה לכשלים שגרמו לפסילה.
            </p>
          )}
          {rc && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  פסיקה עכשיו:{" "}
                  <span className={cn("rounded px-1 text-[10px]", VERDICT_CLS[rc.verdict || ""])}>
                    {VERDICT_HE[rc.verdict || ""] || rc.verdict}
                  </span>
                </span>
                {rc.price_change_pct != null && (
                  <span
                    className={cn(
                      "font-mono",
                      rc.price_change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    מחיר {rc.price_change_pct >= 0 ? "+" : ""}
                    {rc.price_change_pct}% מאז
                  </span>
                )}
              </div>
              {(rc.likely_mistakes || []).map((m) => (
                <p key={m.code} className="rounded bg-amber-500/10 px-2 py-1.5 text-amber-100/90">
                  {m.he}
                </p>
              ))}
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] text-emerald-400/80">נפתרו</div>
                  <ul className="text-muted-foreground">
                    {(rc.failures_resolved || []).length === 0 && <li>—</li>}
                    {(rc.failures_resolved || []).map((f) => (
                      <li key={f.code}>✓ {f.he || f.code}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] text-red-400/80">עדיין קיימים</div>
                  <ul className="text-muted-foreground">
                    {(rc.failures_still || []).length === 0 && <li>—</li>}
                    {(rc.failures_still || []).map((f) => (
                      <li key={f.code}>• {f.he || f.code}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] text-sky-400/80">חדשים</div>
                  <ul className="text-muted-foreground">
                    {(rc.failures_new || []).length === 0 && <li>—</li>}
                    {(rc.failures_new || []).map((f) => (
                      <li key={f.code}>• {f.he || f.code}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">סיווג ידני:</span>
        {Object.entries(OUTCOME_HE).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={item.outcome === id ? "default" : "outline"}
            className="h-7 text-[10px]"
            onClick={() => onOutcome(id)}
          >
            {label}
          </Button>
        ))}
        {item.notes && (
          <span className="ms-2 text-[11px] text-muted-foreground">הערה: {item.notes}</span>
        )}
      </div>
    </div>
  );
}

export function PortfolioPanel() {
  const { symbols } = useWatchlist();
  const { openInspector } = useWorkspace();
  const {
    items: falseNegatives,
    recheck,
    remove,
    update,
  } = useFalseNegatives();
  const [selectedFn, setSelectedFn] = useState<string | null>(null);

  const { data: holdings = [] } = useQuery({
    queryKey: ["portfolio"],
    queryFn: async ({ signal }) => {
      const d = await apiGet<Holding[] | { holdings?: Holding[]; items?: Holding[] }>(
        "/portfolio",
        signal
      );
      return Array.isArray(d) ? d : d.holdings ?? d.items ?? [];
    },
  });

  const { data: perf } = useQuery({
    queryKey: queryKeys.performance,
    queryFn: ({ signal }) => apiGet<PerformanceSummary>("/performance/summary", signal),
  });

  const { data: portfolioSnap } = useQuery({
    queryKey: ["portfolio", "snapshot"],
    queryFn: ({ signal }) =>
      apiGet<{ holdings?: Array<Holding & { price?: number; change_pct?: number }> }>(
        "/portfolio/snapshot",
        signal
      ),
    refetchInterval: 20_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    enabled: holdings.length > 0,
  });

  const snapBySymbol = useMemo(() => {
    const map = new Map<string, { price?: number; change_pct?: number | null }>();
    for (const h of portfolioSnap?.holdings ?? []) {
      const sym = (h.symbol || "").toUpperCase();
      if (sym) map.set(sym, h);
    }
    return map;
  }, [portfolioSnap]);

  const activeFn =
    falseNegatives.find((i) => i.symbol === selectedFn) ||
    (selectedFn ? null : falseNegatives[0] ?? null);

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-2 p-3">
      <div className="col-span-12 grid grid-cols-2 md:grid-cols-5 gap-2 shrink-0">
        <div className="rounded-md border border-white/[0.06] p-2">
          <div className="text-[10px] text-muted-foreground">BUY בספרייה</div>
          <div className="font-mono text-lg">{perf?.library?.buy_count ?? "—"}</div>
        </div>
        <div className="rounded-md border border-white/[0.06] p-2">
          <div className="text-[10px] text-muted-foreground">% נתונים חסרים</div>
          <div className="font-mono text-lg">{perf?.library?.incomplete_pct ?? "—"}%</div>
        </div>
        <div className="rounded-md border border-white/[0.06] p-2">
          <div className="text-[10px] text-muted-foreground">חיתוך איכות∩תזמון</div>
          <div className="font-mono text-lg">{perf?.scanner?.overlap_with_quality ?? "—"}</div>
        </div>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <div className="text-[10px] text-muted-foreground">פסילות במעקב</div>
          <div className="font-mono text-lg text-amber-300">{falseNegatives.length}</div>
        </div>
        <div className="rounded-md border border-white/[0.06] p-2">
          <div className="text-[10px] text-muted-foreground">ארכיונים / DB</div>
          <div className="font-mono text-lg">
            {perf?.database?.archives ?? "—"} / {perf?.database?.persisted_analyses ?? "—"}
          </div>
        </div>
      </div>

      {activeFn && (
        <FalseNegativeDetail
          item={activeFn}
          rechecking={recheck.isPending}
          onClose={() => setSelectedFn(null)}
          onRecheck={() => recheck.mutate(activeFn.symbol)}
          onRemove={() => {
            remove.mutate(activeFn.symbol);
            setSelectedFn(null);
          }}
          onOutcome={(outcome) =>
            update.mutate({ symbol: activeFn.symbol, outcome })
          }
        />
      )}

      <div className="col-span-3 flex min-h-0 flex-col gap-2 rounded-md border border-white/[0.06] p-2">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold">מעקב</h3>
          <Badge variant="outline">{symbols.length}</Badge>
        </div>
        <DenseTable>
          <tbody>
            {symbols.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-center text-muted-foreground">הרשימה ריקה</td>
              </tr>
            )}
            {symbols.map((s) => (
              <tr
                key={s}
                className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer"
                onClick={() => openInspector(s)}
              >
                <td className="px-2 py-1.5 font-mono font-semibold">{s}</td>
                <td className="px-2 py-1.5 text-end" onClick={(e) => e.stopPropagation()}>
                  <WatchlistButton symbol={s} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </div>

      <div className="col-span-3 flex min-h-0 flex-col gap-2 rounded-md border border-white/[0.06] p-2">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold">תיק</h3>
          <Badge variant="outline">{holdings.length}</Badge>
        </div>
        <DenseTable>
          <thead className="sticky top-0 bg-background/95">
            <tr className="border-b border-white/[0.06] text-muted-foreground">
              <th className="px-2 py-1 text-start">סימול</th>
              <th className="px-2 py-1 text-end">כמות</th>
              <th className="px-2 py-1 text-end">מחיר</th>
              <th className="px-2 py-1 text-end">עלות</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                  אין אחזקות
                </td>
              </tr>
            )}
            {holdings.map((h) => {
              const sym = (h.symbol || h.ticker || "").toUpperCase();
              const live = snapBySymbol.get(sym);
              return (
              <tr
                key={h.symbol || h.ticker}
                className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer"
                onClick={() => {
                  if (sym) openInspector(sym);
                }}
              >
                <td className="px-2 py-1 font-mono">{h.symbol || h.ticker}</td>
                <td className="px-2 py-1 text-end font-mono">{h.shares ?? h.quantity ?? "—"}</td>
                <td className="px-2 py-1 text-end font-mono">
                  {live?.price != null ? (
                    <span className={live.change_pct != null && live.change_pct < 0 ? "text-red-400" : "text-emerald-400"}>
                      {fmt(live.price)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1 text-end font-mono">{fmt(h.avg_cost ?? h.cost_basis)}</td>
              </tr>
              );
            })}
          </tbody>
        </DenseTable>
      </div>

      <div className="col-span-3 flex min-h-0 flex-col gap-2 rounded-md border border-amber-500/25 p-2">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold">פסול בטעות?</h3>
            <p className="text-[10px] text-muted-foreground">
              מניות שנפסלו ונרצה לבדוק מה השתבש בניתוח
            </p>
          </div>
          <Badge variant="outline">{falseNegatives.length}</Badge>
        </div>
        <DenseTable>
          <tbody>
            {falseNegatives.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-center text-muted-foreground text-[11px]">
                  סמנו «פסול בטעות?» בניתוח של מניה פסולה
                </td>
              </tr>
            )}
            {falseNegatives.map((item) => (
              <tr
                key={item.symbol}
                className={cn(
                  "cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03]",
                  (selectedFn || falseNegatives[0]?.symbol) === item.symbol &&
                    "bg-amber-500/10"
                )}
                onClick={() => setSelectedFn(item.symbol)}
              >
                <td className="px-2 py-1.5 font-mono font-semibold">{item.symbol}</td>
                <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                  {item.outcome ? OUTCOME_HE[item.outcome] || item.outcome : "ממתין לבדיקה"}
                </td>
                <td className="px-2 py-1.5 text-end text-[10px] text-muted-foreground">
                  {item.last_recheck ? "נבדק" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </div>

      <div className="col-span-3 flex min-h-0 flex-col gap-2 overflow-auto rounded-md border border-white/[0.06] p-2">
        <h3 className="text-sm font-semibold shrink-0">התפלגות פסיקות</h3>
        <div className="space-y-1 text-xs">
          {Object.entries(perf?.library?.verdicts || {}).map(([k, n]) => (
            <div key={k} className="flex items-center justify-between">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", VERDICT_CLS[k])}>
                {VERDICT_HE[k] || k}
              </span>
              <span className="font-mono">{String(n)}</span>
            </div>
          ))}
          {!perf?.library?.verdicts && (
            <div className="text-muted-foreground">אין נתוני ספרייה עדיין</div>
          )}
        </div>
      </div>
    </div>
  );
}

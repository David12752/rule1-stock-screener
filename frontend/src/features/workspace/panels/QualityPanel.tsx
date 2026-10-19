"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWorkspace, type QualityStock } from "@/components/workspace/workspace-context";
import { VirtualTable } from "@/components/workspace/virtual-table";
import { PanelHeader } from "@/components/workspace/panel-header";
import { EmptyState } from "@/components/ui/empty-state";
import { VERDICT_CLS, VERDICT_EXPLAIN, VERDICT_HE, VERDICT_ORDER } from "@/lib/verdict";
import { Loader2, ArrowLeft, ScanSearch } from "lucide-react";
import { exportRows } from "../shared";
import { QualityStatsRow } from "../QualityStatsRow";
import { QUALITY_COLUMNS } from "../columns";

export function QualityPanel() {
  const {
    qualityStocks,
    qualityPassers,
    qualityLoading,
    qualityScanning,
    qualityAnalyzed,
    qualityPending,
    qualityTotal,
    refreshQuality,
    openInspector,
    setTab,
    selectedUniverse,
  } = useWorkspace();

  const [verdictFilter, setVerdictFilter] = useState<Set<string>>(
    () => new Set(["BUY", "WAIT", "WATCHLIST", "WARY", "DISQUALIFIED", "PENDING", "UNKNOWN"])
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of qualityStocks) {
      const v = s.verdict || "UNKNOWN";
      c[v] = (c[v] || 0) + 1;
    }
    return c;
  }, [qualityStocks]);

  const filtered = useMemo(
    () => qualityStocks.filter((s) => verdictFilter.has(s.verdict || "UNKNOWN")),
    [qualityStocks, verdictFilter]
  );

  const toggleVerdict = (v: string) =>
    setVerdictFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const allVerdicts = useMemo(
    () =>
      [...VERDICT_ORDER, "PENDING", "UNKNOWN"].filter(
        (v) => (counts[v] ?? 0) > 0
      ) as string[],
    [counts]
  );

  const emptyState =
    qualityStocks.length > 0 ? (
      <EmptyState
        title="אין מניות בפסיקות שנבחרו"
        description="סמנו פסיקה נוספת למעלה, או הציגו את כל התוצאות."
        actionLabel={`הצג הכול (${qualityStocks.length})`}
        onAction={() => setVerdictFilter(new Set(allVerdicts))}
      />
    ) : (
      <EmptyState
        icon={ScanSearch}
        title={qualityScanning ? "סריקת איכות אוטומטית בתהליך" : "ממתין לנתוני איכות"}
        description={
          qualityScanning
            ? "סורקים נתוני Yahoo Finance אמיתיים ברקע — התוצאות מופיעות כאן בהדרגה."
            : "הסריקה רצה אוטומטית מהשרת על נתוני שוק אמיתיים. אם הרשימה ריקה — המתינו כמה רגעים או רעננו."
        }
        secondaryLabel="בחרו יקום אחר"
        onSecondary={() => setTab("universe")}
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <PanelHeader
        title="סינון איכות"
        description={
          <>
            שלב 2 — חמשת המדדים, חומה ומרווח ביטחון ·{" "}
            <span className="font-mono text-foreground/80">{selectedUniverse}</span>
            {" · "}
            מוצגות {filtered.length}/{qualityStocks.length}
            {qualityTotal > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · נותחו {qualityAnalyzed}/{qualityTotal}
                {qualityPending > 0 ? ` · ממתינים ${qualityPending}` : ""}
              </span>
            )}
            {qualityScanning && (
              <span className="text-primary"> · סריקה אוטומטית…</span>
            )}
            <span className="text-muted-foreground"> · Yahoo Finance</span>
          </>
        }
        trailing={
          qualityScanning ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              סורק
            </span>
          ) : null
        }
        actions={[
          {
            label: "רענון",
            onClick: () => {
              void refreshQuality();
            },
            disabled: qualityLoading,
          },
          {
            label: "ייצוא CSV",
            onClick: () => {
              void exportRows(
                filtered,
                "csv",
                `איכות · ${selectedUniverse}`,
                "library",
                selectedUniverse
              ).catch(() => {});
            },
            disabled: filtered.length === 0,
          },
          {
            label: "ייצוא HTML",
            onClick: () => {
              void exportRows(
                filtered,
                "html",
                `איכות · ${selectedUniverse}`,
                "library",
                selectedUniverse
              ).catch(() => {});
            },
            disabled: filtered.length === 0,
          },
        ]}
        primary={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setTab("timing")}
            disabled={qualityPassers.length === 0}
          >
            המשך לתזמון
            <ArrowLeft className="me-1 h-3.5 w-3.5" />
          </Button>
        }
      />

      <QualityStatsRow
        total={qualityStocks.length}
        counts={counts}
        active={verdictFilter}
        onSelect={(key) => {
          if (key === "ALL") {
            setVerdictFilter(new Set(allVerdicts));
            return;
          }
          setVerdictFilter(new Set([key]));
        }}
      />

      {allVerdicts.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">סינון מהיר:</span>
          {allVerdicts.map((v) => {
            const active = verdictFilter.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleVerdict(v)}
                title={VERDICT_EXPLAIN[v] || "מניות שלא התקבלה עבורן פסיקה"}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  active
                    ? cn(VERDICT_CLS[v] || "bg-white/10 text-foreground", "border-transparent")
                    : "border-white/[0.08] text-muted-foreground/60 hover:text-foreground"
                )}
              >
                {VERDICT_HE[v] || "ללא פסיקה"} {counts[v]}
              </button>
            );
          })}
        </div>
      )}

      <VirtualTable
        rows={filtered}
        rowKey={(s: QualityStock) => s.symbol}
        onRowClick={(s) => openInspector(s.symbol)}
        loading={qualityLoading}
        loadingLabel="טוען ספרייה…"
        emptyLabel={emptyState}
        columns={QUALITY_COLUMNS}
      />
    </div>
  );
}

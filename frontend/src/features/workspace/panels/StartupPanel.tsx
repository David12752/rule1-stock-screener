"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useScanProgress, useScanResults, useScanRunning } from "@/stores/scan-store";
import { VirtualTable } from "@/components/workspace/virtual-table";
import { PanelHeader } from "@/components/workspace/panel-header";
import { Loader2, ArrowLeft, Rocket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { STARTUP_COLUMNS } from "../columns";

const PHASE_HE: Record<string, string> = {
  forming: "נוצרת",
  near: "קרוב לפריצה",
  broken: "פרצה",
};

export function StartupPanel() {
  const {
    refreshTiming,
    selectedUniverse,
    setSelectedUniverse,
    openInspector,
    setTab,
  } = useWorkspace();
  const allResults = useScanResults();
  const scanning = useScanRunning();
  const progress = useScanProgress();

  const rows = useMemo(() => {
    const tagged = allResults.filter(
      (r) => r.is_startup_candidate || r.startup_score != null
    );
    const base = tagged.length > 0 ? tagged : allResults;
    return [...base].sort((a, b) => (b.startup_score ?? 0) - (a.startup_score ?? 0));
  }, [allResults]);

  const universeLabel =
    selectedUniverse === "all" || !selectedUniverse
      ? "S&P 600 (ברירת מחדל)"
      : selectedUniverse;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
        <strong className="font-medium text-amber-50">מסלול מחקר נפרד</strong>
        {" — "}
        לא מחליף את שלבי יקום → איכות → תזמון. כאן מוצגות מניות קטנות לפני פריצה
        טכנית מתוך הסריקה האוטומטית (נתוני Yahoo Finance אמיתיים).
      </div>

      <PanelHeader
        title="מחקר פריצה — מניות קטנות"
        description={
          <>
            מחוץ למשפך · שווי $50M–$2B · יקום:{" "}
            <span className="font-mono text-foreground/80">{universeLabel}</span>
            {scanning && (
              <span className="text-primary">
                {" "}
                · {progress.scanned}/{progress.total || "?"} · נמצאו {progress.found}
                {progress.ticker && !progress.ticker.startsWith("__")
                  ? ` · ${progress.ticker}`
                  : ""}
              </span>
            )}
            <span className="text-muted-foreground"> · Yahoo Finance</span>
          </>
        }
        trailing={
          scanning ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              סורק
            </span>
          ) : (
            <Badge variant="outline" className="font-mono">
              {rows.length}
            </Badge>
          )
        }
        actions={[
          ...(selectedUniverse !== "sp600"
            ? [
                {
                  label: "עבור ל־S&P 600",
                  onClick: () => setSelectedUniverse("sp600"),
                  disabled: scanning,
                },
              ]
            : []),
          {
            label: "רענון",
            onClick: () => {
              void refreshTiming();
            },
          },
        ]}
        primary={
          <Button
            size="sm"
            variant="outline"
            className="min-h-10 sm:min-h-8"
            onClick={() => setTab("universe")}
          >
            חזרה למשפך
            <ArrowLeft className="me-1 h-3.5 w-3.5" />
          </Button>
        }
      />

      <div className="flex shrink-0 flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded bg-white/[0.04] px-2 py-0.5">
          {PHASE_HE.forming} = מתחת להתנגדות
        </span>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
          {PHASE_HE.near} = בתוך 2% מהפריצה
        </span>
      </div>

      <VirtualTable
        rows={rows}
        rowKey={(r) => r.symbol}
        onRowClick={(r) => openInspector(r.symbol)}
        emptyLabel={
          <EmptyState
            icon={Rocket}
            title={scanning ? "סריקה אוטומטית בתהליך" : "אין מועמדי פריצה"}
            description={
              scanning
                ? "מזהים תבניות פריצה מנתוני שוק אמיתיים — התוצאות יופיעו כאן."
                : "מסלול מחקר מחוץ למשפך — מניות קטנות לפני פריצה טכנית. מומלץ יקום S&P 600."
            }
            secondaryLabel={
              selectedUniverse !== "sp600" ? "עבור ל־S&P 600" : "חזרה למשפך"
            }
            onSecondary={
              selectedUniverse !== "sp600"
                ? () => setSelectedUniverse("sp600")
                : () => setTab("universe")
            }
          />
        }
        columns={STARTUP_COLUMNS}
      />
    </div>
  );
}

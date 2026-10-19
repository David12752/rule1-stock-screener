"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useScanProgress, useScanResults, useScanRunning } from "@/stores/scan-store";
import { VirtualTable } from "@/components/workspace/virtual-table";
import { PanelHeader } from "@/components/workspace/panel-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, ArrowLeft, CandlestickChart } from "lucide-react";
import { TIMING_COLUMNS } from "../columns";

export function TimingPanel() {
  const {
    refreshTiming,
    selectedUniverse,
    openInspector,
    setTab,
    timingOnlyQuality,
    setTimingOnlyQuality,
    qualityPassers,
  } = useWorkspace();
  const timingResults = useScanResults();
  const timingScanning = useScanRunning();
  const timingProgress = useScanProgress();

  const emptyState =
    timingOnlyQuality && qualityPassers.length === 0 ? (
      <EmptyState
        icon={CandlestickChart}
        title="אין עדיין מניות איכות"
        description="סינון 'רק מניות איכות' דורש תוצאות משלב 2. המתינו לסריקת האיכות האוטומטית, או בטלו את הסינון."
        actionLabel="הצג את כל התבניות"
        onAction={() => setTimingOnlyQuality(false)}
        secondaryLabel="חזרה לאיכות"
        onSecondary={() => setTab("quality")}
      />
    ) : (
      <EmptyState
        icon={CandlestickChart}
        title={timingScanning ? "סריקת תבניות אוטומטית בתהליך" : "ממתין לנתוני תזמון"}
        description={
          timingScanning
            ? `מתקדם ${timingProgress.scanned}/${timingProgress.total || "?"} · נמצאו ${timingProgress.found}. נתוני מחיר אמיתיים מ־Yahoo Finance.`
            : "הסריקה רצה אוטומטית מהשרת. תוצאות תבניות יופיעו כאן כשיהיו זמינות."
        }
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <PanelHeader
        title="תזמון — תבניות"
        description={
          <>
            שלב 3 — מתי להיכנס
            {timingOnlyQuality ? (
              <>
                {" "}
                · סורק{" "}
                <span className="text-emerald-400">{qualityPassers.length}</span> שעברו
                איכות
              </>
            ) : (
              <>
                {" "}
                · יקום:{" "}
                <span className="font-mono text-foreground/80">{selectedUniverse}</span>
              </>
            )}
            {timingScanning && (
              <span className="text-primary">
                {" "}
                · {timingProgress.scanned}/{timingProgress.total || "?"} · נמצאו{" "}
                {timingProgress.found}
                {timingProgress.ticker ? ` · ${timingProgress.ticker}` : ""}
              </span>
            )}
            <span className="text-muted-foreground"> · Yahoo Finance</span>
          </>
        }
        trailing={
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
              <input
                type="checkbox"
                checked={timingOnlyQuality}
                onChange={(e) => setTimingOnlyQuality(e.target.checked)}
              />
              רק מניות איכות
            </label>
            {timingScanning ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                סורק
              </span>
            ) : (
              <Badge variant="outline" className="font-mono">
                {timingResults.length}
              </Badge>
            )}
          </>
        }
        actions={[
          {
            label: "רענון",
            onClick: () => {
              void refreshTiming();
            },
          },
        ]}
        primary={
          <Button size="sm" variant="secondary" onClick={() => setTab("candidates")}>
            למועמדים
            <ArrowLeft className="h-3.5 w-3.5 me-1" />
          </Button>
        }
      />

      <VirtualTable
        rows={timingResults}
        rowKey={(r) => r.symbol}
        onRowClick={(r) => openInspector(r.symbol)}
        emptyLabel={emptyState}
        columns={TIMING_COLUMNS}
      />
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { useCandidates, useWorkspace, type WorkspaceTab } from "./workspace-context";
import { useScanResults } from "@/stores/scan-store";

/**
 * Single source of truth for the Rule #1 workflow:
 * Universe → Quality → Timing → Candidates.
 */
const STEPS: {
  tab: WorkspaceTab;
  label: string;
  hint: string;
}[] = [
  { tab: "universe", label: "יקום", hint: "איפה לסרוק" },
  { tab: "quality", label: "איכות", hint: "Rule #1" },
  { tab: "timing", label: "תזמון", hint: "מתי להיכנס" },
  { tab: "candidates", label: "מועמדים", hint: "חיתוך סופי" },
];

export function FunnelMeter() {
  const { tab, setTab, universeCount, qualityPassers } = useWorkspace();
  const timingCount = useScanResults().length;
  const candidatesCount = useCandidates().length;

  const counts: Record<string, number> = {
    universe: universeCount,
    quality: qualityPassers.length,
    timing: timingCount,
    candidates: candidatesCount,
  };

  const funnelActive = STEPS.some((s) => s.tab === tab);
  const offFunnel = tab === "startup" || tab === "portfolio";

  return (
    <div
      className="flex shrink-0 flex-col border-b border-white/[0.06] bg-black/20"
      role="navigation"
      aria-label="התקדמות סינון"
    >
      {offFunnel ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-1 text-[10px] text-amber-200/90">
          <span>
            {tab === "startup"
              ? "מסלול מחקר נפרד — לא שלב במשפך Rule #1"
              : "תיק מעקב — מחוץ למשפך הסינון"}
          </span>
          <button
            type="button"
            onClick={() => setTab("universe")}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary underline-offset-2 hover:underline"
          >
            חזרה למשפך
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1 sm:py-1.5">
        <span className="me-1 hidden shrink-0 text-[10px] font-medium text-muted-foreground/70 sm:inline">
          משפך
        </span>
        {STEPS.map((step, idx) => {
          const active = tab === step.tab;
          const count = counts[step.tab] ?? 0;
          return (
            <div key={step.tab} className="flex items-center gap-0.5">
              {idx > 0 && (
                <span className="px-0.5 text-[10px] text-muted-foreground/40 sm:px-1" aria-hidden>
                  →
                </span>
              )}
              <button
                type="button"
                onClick={() => setTab(step.tab)}
                title={step.hint}
                className={cn(
                  "flex min-h-10 items-center gap-1 rounded-md px-2.5 py-2 text-[11px] whitespace-nowrap transition-colors sm:min-h-0 sm:gap-1.5 sm:py-1",
                  active
                    ? "bg-primary/15 font-medium text-foreground"
                    : funnelActive
                      ? "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      : "text-muted-foreground/55 hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground/60">{idx + 1}</span>
                <span>{step.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 font-mono text-[10px]",
                    active ? "bg-primary/25 text-primary" : "bg-white/[0.06]"
                  )}
                >
                  {count.toLocaleString("he-IL")}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

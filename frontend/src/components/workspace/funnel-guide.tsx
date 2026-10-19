"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceTab } from "@/components/workspace/workspace-context";
import { CandlestickChart, Globe2, ScanSearch } from "lucide-react";
import type { ComponentType } from "react";

const STEPS: {
  tab: WorkspaceTab;
  step: number;
  title: string;
  body: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    tab: "universe",
    step: 1,
    title: "יקום",
    body: "בוחרים איפה לסרוק",
    icon: Globe2,
  },
  {
    tab: "quality",
    step: 2,
    title: "איכות",
    body: "מסננים לפי כלל מספר 1",
    icon: ScanSearch,
  },
  {
    tab: "timing",
    step: 3,
    title: "תזמון",
    body: "תבניות מחיר לכניסה",
    icon: CandlestickChart,
  },
];

/**
 * First-run welcome: three funnel steps.
 * Compact = slim strip for the Universe hero; full = larger cards elsewhere.
 */
export function FunnelGuide({
  onGo,
  className,
  compact = false,
}: {
  onGo: (tab: WorkspaceTab) => void;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <nav
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5",
          className
        )}
        aria-label="מדריך התחלה"
      >
        <span className="me-1 text-[11px] font-medium text-muted-foreground">
          המסלול:
        </span>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const current = s.tab === "universe";
          return (
            <span key={s.tab} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="text-muted-foreground/40" aria-hidden>
                  ←
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onGo(s.tab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  current
                    ? "bg-primary/20 font-medium text-primary"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="font-heading">{s.step}. {s.title}</span>
              </button>
            </span>
          );
        })}
      </nav>
    );
  }

  return (
    <section
      className={cn(
        "shrink-0 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.08] to-transparent p-3 sm:p-4",
        className
      )}
      aria-label="מדריך התחלה"
    >
      <div className="mb-3 space-y-1">
        <h2 className="font-heading text-sm font-semibold text-foreground sm:text-base">
          איך מתחילים?
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          שלושה שלבים במשפך — יקום, איכות, תזמון. מסלול «מחקר פריצה» הוא אופציונלי
          ומחוץ למשפך.
        </p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.tab}
              className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-black/20 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 font-mono text-[11px] font-semibold text-primary">
                  {s.step}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="font-heading text-sm font-medium">{s.title}</span>
              </div>
              <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
              <button
                type="button"
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs font-medium transition-colors",
                  s.tab === "universe"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
                onClick={() => onGo(s.tab)}
              >
                {s.title === "יקום"
                  ? "בחרו יקום"
                  : s.title === "איכות"
                    ? "לסריקת איכות"
                    : "לתזמון"}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

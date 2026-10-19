"use client";

import { cn } from "@/lib/utils";
import {
  useWorkspace,
  type WorkspaceTab,
} from "@/components/workspace/workspace-context";
import { Briefcase, Rocket } from "lucide-react";

/**
 * Side destinations only. The Rule #1 funnel
 * (יקום → איכות → תזמון → מועמדים) is exclusively FunnelMeter.
 *
 * Desktop: side rail. Mobile: bottom bar (usable touch targets).
 */
const RAIL: {
  id: string;
  label: string;
  shortLabel: string;
  hint: string;
  icon: typeof Rocket;
  tab: WorkspaceTab;
}[] = [
  {
    id: "startup",
    label: "מחקר פריצה",
    shortLabel: "פריצה",
    hint: "מסלול מחקר מחוץ למשפך",
    icon: Rocket,
    tab: "startup",
  },
  {
    id: "portfolio",
    label: "תיק מעקב",
    shortLabel: "תיק",
    hint: "רשימת מעקב אישית",
    icon: Briefcase,
    tab: "portfolio",
  },
];

function RailButtons({
  layout,
}: {
  layout: "side" | "bottom";
}) {
  const { tab, setTab } = useWorkspace();
  const bottom = layout === "bottom";

  return (
    <>
      {RAIL.map((item) => {
        const Icon = item.icon;
        const active = tab === item.tab;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.tab)}
            title={item.hint}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors",
              bottom
                ? "min-h-12 flex-1 flex-col px-2 py-2"
                : "min-h-11 w-full flex-col px-1.5 py-2.5",
              active
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <Icon className={cn("shrink-0", bottom ? "h-5 w-5" : "h-4 w-4")} />
            <span className="leading-tight">
              {bottom ? item.shortLabel : item.label}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Desktop / tablet side rail — wider labels, 44px+ targets. */
export function WorkspaceRail() {
  return (
    <div className="hidden shrink-0 flex-col border-e border-white/[0.06] bg-black/15 sm:flex">
      <nav
        className="flex w-[4.75rem] flex-1 flex-col items-stretch gap-1 p-1.5 md:w-24"
        aria-label="מסלולים מחוץ למשפך"
      >
        <div className="mb-1 px-0.5 pt-1 text-center text-[9px] leading-tight text-muted-foreground/55">
          מחוץ למשפך
        </div>
        <RailButtons layout="side" />
      </nav>
    </div>
  );
}

/** Mobile bottom bar — large touch targets for side paths. */
export function WorkspaceBottomNav() {
  return (
    <nav
      className="flex shrink-0 items-stretch gap-1 border-t border-white/[0.06] bg-black/30 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 sm:hidden"
      aria-label="מסלולים מחוץ למשפך"
    >
      <div className="flex min-w-0 flex-1 items-stretch gap-1">
        <span className="flex w-10 shrink-0 items-center justify-center self-center text-[9px] leading-tight text-muted-foreground/50">
          מחקר
        </span>
        <RailButtons layout="bottom" />
      </div>
    </nav>
  );
}

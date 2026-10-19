"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWorkspace, type UniverseInfo } from "@/components/workspace/workspace-context";
import { UniverseWorldMap } from "@/features/workspace/UniverseWorldMap";
import {
  LABEL_HE,
  REGION_HE,
  REGION_STYLE,
  labelOf,
  regionStyleForUniverse,
} from "@/features/workspace/universe-meta";
import { ArrowLeft, Check, Globe2, Sparkles } from "lucide-react";

type ViewMode = "stars" | "world";
const VIEW_KEY = "rule1_universe_view";

const STAR_REGIONS = ["us", "europe", "apac", "americas", "israel"] as const;

export function UniversePanel() {
  const { universes, selectedUniverse, setSelectedUniverse, setTab } = useWorkspace();
  const [view, setView] = useState<ViewMode>("world");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "stars" || saved === "world") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setView(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const items = useMemo(
    () => universes.filter((u) => u.id !== "all"),
    [universes]
  );

  const byRegion = useMemo(() => {
    const map = new Map<string, UniverseInfo[]>();
    for (const u of items) {
      const r = u.region || "other";
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(u);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.count || 0) - (a.count || 0));
    }
    return map;
  }, [items]);

  const allUniverse = universes.find((u) => u.id === "all");
  const total = allUniverse?.count ?? items.reduce((s, u) => s + (u.count || 0), 0);
  const maxCount = Math.max(...items.map((u) => u.count || 0), 1);

  const selected = universes.find((u) => u.id === selectedUniverse);
  const selectedLabel =
    selectedUniverse === "all"
      ? LABEL_HE.all
      : selected
        ? labelOf(selected.id, selected.label)
        : selectedUniverse;
  const selectedCount =
    selectedUniverse === "all" ? total : selected?.count ?? 0;

  const regionLayouts = STAR_REGIONS.filter((r) => byRegion.has(r));

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#070b14]">
      {view === "stars" ? <Starfield /> : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,oklch(0.2_0.04_230/0.5),oklch(0.08_0.02_260)_70%)]"
        />
      )}

      <header className="relative z-[2] flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-black/35 px-2 py-2 backdrop-blur-md sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-sm font-semibold tracking-tight text-foreground md:text-base">
            {view === "world" ? "מפת העולם" : "מפת היקום"}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {view === "world" ? "בורסות במיקום האמיתי" : "בחרו גלקסיה לסריקה"}
            <span className="mx-1 text-white/20">·</span>
            {selectedLabel}
            <span className="mx-1 text-white/20">·</span>
            <span className="font-mono text-primary/90">
              {selectedCount.toLocaleString("he-IL")}
            </span>
          </p>
        </div>

        <div
          className="flex shrink-0 rounded-lg border border-white/[0.08] bg-black/40 p-0.5"
          role="group"
          aria-label="מצב תצוגה"
        >
          <button
            type="button"
            onClick={() => setViewMode("world")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
              view === "world"
                ? "bg-primary/25 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={view === "world"}
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">עולם</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("stars")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
              view === "stars"
                ? "bg-primary/25 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={view === "stars"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">יקום</span>
          </button>
        </div>

        <Button
          size="sm"
          className="shrink-0 gap-1.5 font-heading shadow-[0_0_28px_oklch(0.68_0.16_205/0.35)]"
          onClick={() => setTab("quality")}
        >
          <span className="hidden sm:inline">המשך לאיכות</span>
          <span className="sm:hidden">המשך</span>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="relative z-[1] min-h-0 flex-1 overflow-hidden">
        {view === "world" ? (
          <UniverseWorldMap
            items={items}
            selectedUniverse={selectedUniverse}
            setSelectedUniverse={setSelectedUniverse}
            total={total}
            maxCount={maxCount}
          />
        ) : (
          <StarMapView
            regionIds={regionLayouts}
            byRegion={byRegion}
            selectedUniverse={selectedUniverse}
            setSelectedUniverse={setSelectedUniverse}
            total={total}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Readable “galaxies”: full exchange names in regional panels.
 * Cosmic look without truncating labels inside tiny circles.
 */
function StarMapView({
  regionIds,
  byRegion,
  selectedUniverse,
  setSelectedUniverse,
  total,
}: {
  regionIds: readonly string[];
  byRegion: Map<string, UniverseInfo[]>;
  selectedUniverse: string;
  setSelectedUniverse: (id: string) => void;
  total: number;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      {/* Hero sun — compact */}
      <button
        type="button"
        onClick={() => setSelectedUniverse("all")}
        aria-pressed={selectedUniverse === "all"}
        className={cn(
          "relative mx-auto flex w-full max-w-md shrink-0 items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-start transition-all",
          selectedUniverse === "all"
            ? "border-amber-300/50 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
            : "border-white/10 hover:border-amber-300/30"
        )}
        style={{
          background:
            "radial-gradient(circle at 15% 40%, rgba(251,191,36,0.35), transparent 45%), linear-gradient(90deg, rgba(124,58,237,0.25), rgba(15,23,42,0.85))",
        }}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff7c2,#f97316_50%,#7c3aed)] shadow-[0_0_20px_rgba(249,115,22,0.5)]">
          <Sparkles className="h-5 w-5 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold text-white">כל היקומים</span>
          <span className="text-xs text-white/70">סריקה על כל המדדים הזמינים</span>
        </span>
        <span className="font-mono text-xl font-semibold text-amber-200">
          {total.toLocaleString("he-IL")}
        </span>
        {selectedUniverse === "all" ? (
          <Check className="h-4 w-4 shrink-0 text-amber-200" strokeWidth={3} />
        ) : null}
      </button>

      {/* Region galaxies — readable full names */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
        {regionIds.map((region) => {
          const list = byRegion.get(region) ?? [];
          const rs = REGION_STYLE[region] ?? REGION_STYLE.other;
          return (
            <section
              key={region}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/35 backdrop-blur-sm"
              style={{
                boxShadow: `inset 0 0 40px ${rs.glow.replace("0.55", "0.12").replace("0.5", "0.12").replace("0.6", "0.12").replace("0.45", "0.12")}`,
              }}
            >
              <header
                className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2"
                style={{ background: `${rs.fill}33` }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: rs.pin, boxShadow: `0 0 10px ${rs.glow}` }}
                />
                <h2 className="font-heading text-sm font-semibold" style={{ color: rs.pin }}>
                  {REGION_HE[region] || region}
                </h2>
                <span className="ms-auto font-mono text-[11px] text-muted-foreground">
                  {list.length} מדדים
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {list.map((u) => {
                  const active = selectedUniverse === u.id;
                  const style = regionStyleForUniverse(u.region || region);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUniverse(u.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-start transition-all",
                        active
                          ? "border-white/40 bg-white/10"
                          : "border-white/5 hover:border-white/15 hover:bg-white/[0.04]"
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{
                          background: `radial-gradient(circle at 30% 25%, ${style.pin}, ${style.fill})`,
                          boxShadow: `0 0 12px ${style.glow}`,
                        }}
                      >
                        {(u.count || 0) > 99 ? "●" : (u.count || 0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-[13px] font-semibold text-foreground">
                          {labelOf(u.id, u.label)}
                        </span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {(u.count || 0).toLocaleString("he-IL")} מניות
                        </span>
                      </span>
                      {active ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={3} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Starfield() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,#1a1040_0%,#0a0e1a_45%,#05070f_100%)]" />
      <div className="absolute inset-0 opacity-90 [background-image:radial-gradient(1.5px_1.5px_at_8%_12%,#fff,transparent),radial-gradient(1px_1px_at_18%_40%,rgba(255,220,180,0.85),transparent),radial-gradient(1.5px_1.5px_at_28%_18%,rgba(180,240,255,0.95),transparent),radial-gradient(1px_1px_at_42%_72%,#fff,transparent),radial-gradient(1.2px_1.2px_at_55%_22%,rgba(255,180,220,0.8),transparent),radial-gradient(1px_1px_at_68%_58%,rgba(180,255,200,0.75),transparent),radial-gradient(1.5px_1.5px_at_78%_14%,#fff,transparent),radial-gradient(1px_1px_at_88%_44%,rgba(200,200,255,0.7),transparent),radial-gradient(1px_1px_at_12%_78%,rgba(255,200,120,0.7),transparent),radial-gradient(1.2px_1.2px_at_33%_88%,#fff,transparent),radial-gradient(1px_1px_at_62%_85%,rgba(180,220,255,0.65),transparent),radial-gradient(1.5px_1.5px_at_92%_80%,rgba(255,180,255,0.75),transparent)]" />
      <div className="absolute -left-1/4 top-[10%] h-[55vmin] w-[55vmin] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.14),transparent_70%)] blur-2xl" />
      <div className="absolute -right-1/5 top-[5%] h-[50vmin] w-[50vmin] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.14),transparent_70%)] blur-2xl" />
      <div className="absolute bottom-0 left-1/3 h-[40vmin] w-[40vmin] rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.12),transparent_70%)] blur-2xl" />
      <div className="absolute right-1/4 bottom-[10%] h-[35vmin] w-[35vmin] rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.12),transparent_70%)] blur-2xl" />
    </div>
  );
}

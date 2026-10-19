"use client";

import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/info-hint";
import { VERDICT_EXPLAIN, VERDICT_HE } from "@/lib/verdict";

type Stat = {
  key: string;
  label: string;
  count: number;
  tone: "buy" | "wait" | "watch" | "wary" | "out" | "total";
  hint?: string;
};

const TONE: Record<Stat["tone"], string> = {
  buy: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-300",
  wait: "border-yellow-500/30 bg-yellow-500/[0.07] text-yellow-300",
  watch: "border-sky-500/30 bg-sky-500/[0.07] text-sky-300",
  wary: "border-orange-500/30 bg-orange-500/[0.07] text-orange-300",
  out: "border-red-500/25 bg-red-500/[0.05] text-red-300",
  total: "border-primary/25 bg-primary/[0.08] text-primary",
};

/**
 * Glass stats strip for the Quality (library) step — plan §3.3.
 */
export function QualityStatsRow({
  total,
  counts,
  onSelect,
  active,
}: {
  total: number;
  counts: Record<string, number>;
  onSelect?: (verdict: string | "ALL") => void;
  active?: Set<string>;
}) {
  const stats: Stat[] = [
    {
      key: "ALL",
      label: "סה״כ נותחו",
      count: total,
      tone: "total" as const,
      hint: "כל המניות שנסרקו ביקום הנוכחי",
    },
    {
      key: "BUY",
      label: VERDICT_HE.BUY || "קנה",
      count: counts.BUY || 0,
      tone: "buy" as const,
      hint: VERDICT_EXPLAIN.BUY,
    },
    {
      key: "WAIT",
      label: VERDICT_HE.WAIT || "המתן",
      count: counts.WAIT || 0,
      tone: "wait" as const,
      hint: VERDICT_EXPLAIN.WAIT,
    },
    {
      key: "WATCHLIST",
      label: VERDICT_HE.WATCHLIST || "מעקב",
      count: counts.WATCHLIST || 0,
      tone: "watch" as const,
      hint: VERDICT_EXPLAIN.WATCHLIST,
    },
    {
      key: "WARY",
      label: VERDICT_HE.WARY || "זהירות",
      count: counts.WARY || 0,
      tone: "wary" as const,
      hint: VERDICT_EXPLAIN.WARY,
    },
    {
      key: "DISQUALIFIED",
      label: VERDICT_HE.DISQUALIFIED || "פסול",
      count: counts.DISQUALIFIED || 0,
      tone: "out" as const,
      hint: VERDICT_EXPLAIN.DISQUALIFIED,
    },
  ].filter((s) => s.key === "ALL" || s.count > 0);

  if (total === 0) return null;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => {
        const isActive =
          s.key === "ALL"
            ? !active || active.size === 0
            : !!active?.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key === "ALL" ? "ALL" : s.key)}
            className={cn(
              "glass rounded-xl border px-2.5 py-2 text-start transition-all hover:brightness-110",
              TONE[s.tone],
              isActive && s.key !== "ALL" && "ring-1 ring-white/25",
              s.key === "ALL" && "ring-1 ring-primary/20"
            )}
          >
            <div className="flex items-center gap-1 text-[10px] opacity-80">
              <span>{s.label}</span>
              {s.hint ? (
                <InfoHint
                  info={{
                    label: s.label,
                    what: s.hint,
                  }}
                />
              ) : null}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums leading-none">
              {s.count.toLocaleString("he-IL")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

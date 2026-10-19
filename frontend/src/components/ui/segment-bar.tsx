"use client";

import { cn } from "@/lib/utils";

/** Pass/fail segment strip (e.g. Big 5 → 5 segments). */
export function SegmentBar({
  passed,
  total = 5,
  className,
}: {
  passed: number;
  total?: number;
  className?: string;
}) {
  const n = Math.max(0, Math.min(total, Math.round(passed)));
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${n} מתוך ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-[2px]",
            i < n ? "bg-emerald-500/80" : "bg-white/10"
          )}
        />
      ))}
    </span>
  );
}

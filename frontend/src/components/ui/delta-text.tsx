"use client";

import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";

/** Signed percent/number with color + glyph (never color alone). */
export function DeltaText({
  value,
  digits = 1,
  suffix = "%",
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  suffix?: string;
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono tabular-nums",
        pos && "text-emerald-400",
        neg && "text-red-400",
        !pos && !neg && "text-muted-foreground",
        className
      )}
    >
      <span aria-hidden>{pos ? "▲" : neg ? "▼" : "●"}</span>
      {pos ? "+" : ""}
      {fmt(value, digits)}
      {suffix}
    </span>
  );
}

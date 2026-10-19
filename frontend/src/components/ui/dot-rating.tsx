"use client";

import { cn } from "@/lib/utils";

/** 0–max filled dots (moat / confidence style). */
export function DotRating({
  value,
  max = 5,
  className,
}: {
  value: number | null | undefined;
  max?: number;
  className?: string;
}) {
  const filled = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${filled} מתוך ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < filled ? "bg-primary" : "bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

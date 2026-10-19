"use client";

import { cn } from "@/lib/utils";

/** Compact SVG score ring 0–100. */
export function ScoreRing({
  score,
  size = 36,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const color =
    v >= 70 ? "stroke-emerald-400" : v >= 40 ? "stroke-yellow-400" : "stroke-red-400";

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-label={`ציון ${Math.round(v)}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold tabular-nums">
        {Math.round(v)}
      </span>
    </span>
  );
}

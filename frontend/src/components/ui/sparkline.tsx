"use client";

import { cn } from "@/lib/utils";

/** Tiny SVG polyline sparkline from a numeric series. */
export function Sparkline({
  data,
  width = 64,
  height = 20,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data.length) {
    return (
      <span
        className={cn("inline-block bg-white/5", className)}
        style={{ width, height }}
      />
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  const up = data[data.length - 1]! >= data[0]!;

  return (
    <svg
      width={width}
      height={height}
      className={cn("inline-block overflow-visible", className)}
      aria-hidden
    >
      <polyline
        fill="none"
        strokeWidth={1.25}
        points={pts}
        className={up ? "stroke-emerald-400/80" : "stroke-red-400/80"}
      />
    </svg>
  );
}

"use client";

import { BIG5_METRICS } from "@/lib/metrics";

/** @deprecated Prefer BIG5_METRICS from @/lib/metrics — kept for older call sites. */
export const BIG5_LABELS: Record<
  string,
  { label: string; description: string; glossaryKey: string }
> = Object.fromEntries(
  Object.entries(BIG5_METRICS).map(([key, info]) => [
    key,
    {
      label: info.label,
      description: info.what,
      glossaryKey: key === "sales" ? "revenue" : key,
    },
  ])
);

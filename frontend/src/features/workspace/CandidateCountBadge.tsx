"use client";

import { useCandidates } from "@/components/workspace/workspace-context";
import { useScanRunning } from "@/stores/scan-store";
import { Loader2 } from "lucide-react";

export function CandidateCountBadge() {
  const count = useCandidates().length;
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-emerald-500/20 px-1.5 text-[9px] text-emerald-400">
      {count}
    </span>
  );
}

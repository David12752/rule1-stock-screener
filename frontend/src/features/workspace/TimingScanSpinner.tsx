"use client";

import { useCandidates } from "@/components/workspace/workspace-context";
import { useScanRunning } from "@/stores/scan-store";
import { Loader2 } from "lucide-react";

export function TimingScanSpinner() {
  const scanning = useScanRunning();
  if (!scanning) return null;
  return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
}

"use client";

import { cn } from "@/lib/utils";
import type { MetricInfo } from "@/lib/metrics";
import { InfoHint } from "@/components/info-hint";
import type { ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportRows(
  rows: unknown[],
  format: "csv" | "html",
  title: string,
  kind: string,
  universe?: string
) {
  const res = await fetch(`${API_URL}/reports/export?format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, title, kind, universe, archive: true }),
  });
  if (!res.ok) throw new Error("export failed");
  const blob = await res.blob();
  downloadBlob(`rule1-${kind}.${format}`, blob);
}

/** Column header that carries its own explanation. */
export function HeaderWithHint({ info, short }: { info: MetricInfo; short: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {short}
      <InfoHint info={info} />
    </span>
  );
}

export function DenseTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.06]",
        className
      )}
    >
      <table className="w-full text-xs">{children}</table>
    </div>
  );
}

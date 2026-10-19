"use client";

import { Suspense } from "react";
import StockDetail from "@/features/stock-detail/StockDetail";
import { Skeleton } from "@/components/ui/skeleton";

function StockDetailFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Thin route entry. Suspense is required because TabShell reads searchParams.
 */
export default function StockDetailPage() {
  return (
    <Suspense fallback={<StockDetailFallback />}>
      <StockDetail />
    </Suspense>
  );
}

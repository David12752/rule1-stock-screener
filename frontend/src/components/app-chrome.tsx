"use client";

import { Navbar } from "@/components/navbar";
import { AlertsProvider } from "@/components/alerts-provider";
import { MarketBar } from "@/components/market-bar";
import { ToastProvider } from "@/components/toast-provider";
import { QueryProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * One layout model for every route: fixed viewport height, no document scroll.
 * Individual pages decide whether their <main> child scrolls internally
 * (stock detail) or keeps overflow hidden (workspace).
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <ToastProvider>
          <AlertsProvider />
          <div className="flex h-dvh flex-col overflow-hidden">
            <Navbar />
            <MarketBar />
            <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
          </div>
        </ToastProvider>
      </TooltipProvider>
    </QueryProvider>
  );
}

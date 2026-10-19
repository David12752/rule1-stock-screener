"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import {
  MARKET_BAR_EVENT,
  MARKET_BAR_KEY,
  toggleMarketBar,
} from "@/components/market-bar";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    try {
      setMarketOpen(localStorage.getItem(MARKET_BAR_KEY) === "1");
    } catch {
      /* ignore */
    }
    const onEvt = (e: Event) => {
      setMarketOpen(!!(e as CustomEvent<boolean>).detail);
    };
    window.addEventListener(MARKET_BAR_EVENT, onEvt);
    return () => window.removeEventListener(MARKET_BAR_EVENT, onEvt);
  }, []);

  return (
    <nav className="z-50 shrink-0 border-b border-white/[0.06] bg-background/90 backdrop-blur-xl">
      <div className="flex h-10 items-center gap-3 px-3">
        <Link href="/?tab=universe" className="group flex shrink-0 items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg shadow-[0_0_16px_oklch(0.68_0.16_205/0.35)]">
            <span className="absolute inset-0 bg-[linear-gradient(135deg,oklch(0.72_0.16_200),oklch(0.55_0.18_230))]" />
            <span className="relative font-heading text-[11px] font-black tracking-tighter text-primary-foreground">
              #1
            </span>
          </div>
          <div className="leading-tight">
            <div className="gradient-text font-heading text-sm font-bold tracking-tight">
              כלל 1#
            </div>
            <div className="hidden text-[9px] text-muted-foreground sm:block">
              איכות → תזמון → מועמדים
            </div>
          </div>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={toggleMarketBar}
            aria-pressed={marketOpen}
            title="מדדי שוק"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors",
              marketOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <LineChart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">מדדים</span>
          </button>
          <CommandPalette />
        </div>
      </div>
    </nav>
  );
}

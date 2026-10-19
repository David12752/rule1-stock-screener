"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Dense metric tile used on the stock header strip and overview grids.
 * Kept as a shared atom so the workspace analysis panel and stock page match.
 */
export function MetricCard({
    label,
    value,
    hint,
    highlight,
    icon: Icon,
    className,
}: {
    label: string;
    value: string;
    hint?: React.ReactNode;
    highlight?: "green" | "red" | "none";
    icon?: LucideIcon;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center",
                "hover:border-white/[0.12] transition-colors",
                className
            )}
        >
            <div className="mb-1.5 flex items-center justify-center gap-1">
                {Icon && <Icon className="h-3 w-3 text-muted-foreground/60" />}
                <span className="text-[11px] text-muted-foreground">{label}</span>
                {hint}
            </div>
            <div
                className={cn(
                    "font-mono text-base font-bold",
                    highlight === "green" && "text-emerald-400",
                    highlight === "red" && "text-red-400",
                    (!highlight || highlight === "none") && "text-foreground"
                )}
            >
                {value}
            </div>
        </div>
    );
}

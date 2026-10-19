"use client";

import { cn } from "@/lib/utils";
import { VERDICT_CLS, VERDICT_HE, verdictToken, type VerdictToken } from "@/lib/verdict";

const TOKEN_CLS: Record<VerdictToken, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    caution: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    destructive: "bg-red-500/15 text-red-400 border-red-500/30",
    muted: "bg-muted/40 text-muted-foreground border-border",
};

/**
 * Compact status pill. Prefer passing a Rule #1 `verdict`; otherwise pass a
 * semantic `token` directly (e.g. for technical Green/Red).
 */
export function StatusBadge({
    verdict,
    token,
    children,
    className,
}: {
    verdict?: string | null;
    token?: VerdictToken;
    children?: React.ReactNode;
    className?: string;
}) {
    const resolved = token ?? verdictToken(verdict);
    const label = children ?? (verdict ? VERDICT_HE[verdict] ?? verdict : null);
    if (!label) return null;

    return (
        <span
            className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border",
                TOKEN_CLS[resolved],
                verdict ? VERDICT_CLS[verdict] : null,
                className
            )}
        >
            {label}
        </span>
    );
}

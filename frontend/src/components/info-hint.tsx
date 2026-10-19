"use client";

import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MetricInfo } from "@/lib/metrics";

/**
 * The "?" affordance that explains a parameter.
 *
 * Radix tooltips are hover-only by default, which would leave every explanation
 * unreachable on touch devices. `open` is controlled here so a tap toggles it too.
 */
export function InfoHint({
    info,
    className,
    children,
}: {
    info?: MetricInfo;
    className?: string;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);

    if (!info) return <>{children}</>;

    return (
        <Tooltip open={open} onOpenChange={setOpen} delayDuration={200}>
            <TooltipTrigger
                asChild
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((o) => !o);
                }}
            >
                {children ?? (
                    <button
                        type="button"
                        aria-label={`מה זה ${info.label}?`}
                        className={cn(
                            "inline-flex shrink-0 text-muted-foreground/50 transition-colors hover:text-primary",
                            className
                        )}
                    >
                        <HelpCircle className="h-3 w-3" />
                    </button>
                )}
            </TooltipTrigger>
            <TooltipContent side="top">
                <div className="font-medium text-foreground">
                    {info.label}
                    {info.term && (
                        <span className="ms-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                            {info.term}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-muted-foreground">{info.what}</p>
                {info.rule && (
                    <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-primary/90">
                        {info.rule}
                    </p>
                )}
            </TooltipContent>
        </Tooltip>
    );
}

/**
 * A label with its explanation attached — the common case in dense cards, where
 * the whole label should be the hover target rather than a separate tiny icon.
 */
export function MetricLabel({
    info,
    className,
    showIcon = true,
}: {
    info?: MetricInfo;
    className?: string;
    showIcon?: boolean;
}) {
    if (!info) return null;
    return (
        <span className={cn("inline-flex items-center gap-1", className)}>
            <span>{info.label}</span>
            {showIcon && <InfoHint info={info} />}
        </span>
    );
}

"use client";

import * as React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { glossary, type GlossaryEntry } from "@/lib/glossary";
import { ALL_METRICS, type MetricInfo } from "@/lib/metrics";
import { cn } from "@/lib/utils";

/** Map legacy glossary keys → metrics.ts keys (single source of truth). */
const GLOSSARY_TO_METRIC: Record<string, string> = {
  stickerPrice: "sticker_price",
  mos: "mos_price",
  paybackTime: "payback_time",
  debtPayoff: "payback_time",
  moat: "moat_score",
  pe: "pe_ratio",
  marketCap: "market_cap",
  beta: "beta",
  big5: "roic", // fallback detail from ROIC group; short comes from glossary
  revenue: "sales",
  equity: "equity",
  eps: "eps",
  fcf: "fcf",
  roic: "roic",
};

interface InfoTooltipProps {
  /** Glossary key to look up */
  termKey?: string;
  /** Or provide content directly */
  content?: string;
  /** Optional detailed text (overrides glossary detail) */
  detail?: string;
  /** Size of the info icon */
  size?: "sm" | "md" | "lg";
  /** Additional className for the trigger */
  className?: string;
  /** Children to wrap (if not using icon) */
  children?: React.ReactNode;
  /** Side of the tooltip */
  side?: "top" | "right" | "bottom" | "left";
}

const sizeMap = {
  sm: 12,
  md: 14,
  lg: 16,
};

function resolveEntry(termKey?: string): {
  entry?: GlossaryEntry;
  metric?: MetricInfo;
  title?: string;
  shortText?: string;
  detailText?: string;
  idealText?: string;
} {
  if (!termKey) return {};
  const entry = glossary[termKey];
  const metricKey = GLOSSARY_TO_METRIC[termKey] ?? termKey;
  const metric = ALL_METRICS[metricKey] ?? ALL_METRICS[termKey];
  return {
    entry,
    metric,
    title: entry?.term ?? metric?.label,
    shortText: entry?.short ?? metric?.what,
    detailText: entry?.detail ?? metric?.what,
    idealText: entry?.ideal ?? metric?.rule,
  };
}

export function InfoTooltip({
  termKey,
  content,
  detail,
  size = "sm",
  className,
  children,
  side = "top",
}: InfoTooltipProps) {
  const resolved = resolveEntry(termKey);
  const shortText = content ?? resolved.shortText;
  const rawDetail = detail ?? resolved.detailText;
  const detailText =
    rawDetail && rawDetail !== shortText ? rawDetail : undefined;
  const idealText = resolved.idealText;
  const title = resolved.title;

  if (!shortText) return null;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children ? (
            <span className={cn("cursor-help", className)}>{children}</span>
          ) : (
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-primary transition-colors cursor-help",
                className
              )}
              aria-label={title ?? "מידע נוסף"}
            >
              <Info size={sizeMap[size]} />
            </button>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs rounded-lg border border-border/50 bg-popover/95 backdrop-blur-sm px-3 py-2 shadow-xl",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
            )}
          >
            {title && (
              <p className="mb-1 font-heading text-xs font-semibold text-primary">
                {title}
                {resolved.metric?.term ? (
                  <span className="ms-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                    {resolved.metric.term}
                  </span>
                ) : null}
              </p>
            )}
            <p className="text-xs leading-relaxed text-popover-foreground">
              {shortText}
            </p>
            {detailText && detailText !== shortText && (
              <p className="mt-1.5 border-t border-border/30 pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {detailText}
              </p>
            )}
            {idealText && (
              <p className="mt-1 text-[11px] font-medium text-emerald-400">
                ערך אידיאלי: {idealText}
              </p>
            )}
            <Tooltip.Arrow className="fill-popover/95" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/**
 * Convenience: wrap any text label with a tooltip from the glossary
 */
export function GlossaryLabel({
  termKey,
  label,
  className,
}: {
  termKey: string;
  label?: string;
  className?: string;
}) {
  const entry = glossary[termKey];
  const displayLabel = label ?? entry?.term ?? termKey;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{displayLabel}</span>
      <InfoTooltip termKey={termKey} size="sm" />
    </span>
  );
}

"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * First-run / empty table guidance — title, one sentence, and a clear next action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className,
  children,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) || children ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actionLabel && onAction ? (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Button size="sm" variant="outline" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

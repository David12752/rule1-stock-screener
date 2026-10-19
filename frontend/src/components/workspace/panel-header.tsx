"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PanelAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

/**
 * One clear title + one primary CTA. Secondary actions (export, refresh,
 * toggles) live behind a ⋮ menu so the header stops competing with itself.
 */
export function PanelHeader({
  title,
  description,
  primary,
  actions = [],
  trailing,
  className,
}: {
  title: string;
  description?: ReactNode;
  primary?: ReactNode;
  actions?: PanelAction[];
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {trailing}
        {actions.length > 0 ? <OverflowMenu items={actions} /> : null}
        {primary}
      </div>
    </div>
  );
}

function OverflowMenu({ items }: { items: PanelAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="פעולות נוספות"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-white/[0.08] bg-[#12141c] py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="block w-full px-3 py-1.5 text-start text-xs text-foreground/90 hover:bg-white/[0.06] disabled:opacity-40"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

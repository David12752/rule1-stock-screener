"use client";

import { Button } from "@/components/ui/button";
import { useFalseNegatives } from "@/hooks/use-false-negatives";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mark a DISQUALIFIED stock as a suspected false negative so we can later
 * recheck and see which Rule #1 failure was wrong.
 */
export function FalseNegativeButton({
  symbol,
  verdict,
  size = "sm",
  className,
}: {
  symbol: string;
  verdict?: string | null;
  size?: "sm" | "default";
  className?: string;
}) {
  const { isTracked, add, remove } = useFalseNegatives();
  if (!symbol) return null;
  if (verdict && verdict !== "DISQUALIFIED" && !isTracked(symbol)) return null;

  const tracked = isTracked(symbol);
  const busy = add.isPending || remove.isPending;

  return (
    <Button
      type="button"
      size={size}
      variant={tracked ? "secondary" : "outline"}
      className={cn(
        "gap-1 text-[11px]",
        tracked && "border-amber-500/40 text-amber-300",
        className
      )}
      disabled={busy}
      title={
        tracked
          ? "הסר ממעקב פסילות שגויות"
          : "סמן כפסילה שחשודה כשגויה — לבדיקת הטעות אחר כך"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (tracked) remove.mutate(symbol);
        else add.mutate({ symbol });
      }}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : tracked ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {tracked ? "במעקב טעויות" : "פסול בטעות?"}
    </Button>
  );
}

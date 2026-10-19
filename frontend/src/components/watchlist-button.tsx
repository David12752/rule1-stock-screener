"use client";

import { memo } from "react";
import { Star } from "lucide-react";
import { toggleWatchlist, useIsWatched } from "@/hooks/use-watchlist";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WatchlistButtonProps {
    symbol: string;
    size?: "sm" | "md" | "lg";
    className?: string;
    /** Stop click propagation (useful inside clickable cards/rows) */
    stopPropagation?: boolean;
}

const SIZE_CLASSES = {
    sm: "h-6 w-6 p-1",
    md: "h-7 w-7 p-1.5",
    lg: "h-8 w-8 p-1.5",
};
const ICON_CLASSES = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-4.5 w-4.5",
};

export const WatchlistButton = memo(function WatchlistButton({
    symbol,
    size = "md",
    className,
    stopPropagation = false,
}: WatchlistButtonProps) {
    // Subscribes to this symbol only, so one star toggling does not re-render
    // the other few hundred rendered in a screener table.
    const watched = useIsWatched(symbol);
    const { toast } = useToast();

    const handleClick = (e: React.MouseEvent) => {
        if (stopPropagation) e.stopPropagation();
        const nowWatched = !watched;
        toggleWatchlist(symbol);
        toast({
            title: nowWatched ? `${symbol} נוסף למעקב` : `${symbol} הוסר ממעקב`,
            type: nowWatched ? "success" : "info",
            duration: 2500,
        });
    };

    return (
        <button
            onClick={handleClick}
            title={watched ? "הסר מרשימת המעקב" : "הוסף לרשימת מעקב"}
            className={cn(
                "rounded-md transition-all duration-150 flex items-center justify-center",
                watched
                    ? "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
                    : "text-muted-foreground/30 hover:text-yellow-400 hover:bg-yellow-400/10",
                SIZE_CLASSES[size],
                className
            )}
        >
            <Star
                className={cn(ICON_CLASSES[size], watched && "fill-yellow-400")}
            />
        </button>
    );
});


"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface VirtualColumn<T> {
    key: string;
    header: ReactNode;
    /** CSS width fed to <colgroup>. Required: the table uses fixed layout. */
    width: string;
    align?: "start" | "end";
    /** Wrap the cell so row clicks are not triggered (e.g. for buttons). */
    isolate?: boolean;
    cell: (row: T) => ReactNode;
    className?: string;
}

interface VirtualTableProps<T> {
    rows: T[];
    columns: VirtualColumn<T>[];
    rowKey: (row: T) => string;
    onRowClick?: (row: T) => void;
    rowHeight?: number;
    loading?: boolean;
    loadingLabel?: string;
    emptyLabel?: ReactNode;
    className?: string;
}

/**
 * Dense table that renders only the visible rows.
 *
 * The screener panels previously mapped every row into the DOM and capped the
 * list at 500 to stay usable - which both froze the tab on large universes and
 * silently hid results past the cap. Here the row count is unbounded and the DOM
 * holds roughly a viewport's worth of <tr>s.
 *
 * Virtualizing a real <table> requires two things:
 *  - spacer rows above and below the window, so the scrollbar reflects the full
 *    list rather than the rendered slice;
 *  - `table-layout: fixed` plus explicit <colgroup> widths, because auto layout
 *    would resize columns from whichever rows happen to be on screen, making them
 *    jitter as you scroll.
 */
export function VirtualTable<T>({
    rows,
    columns,
    rowKey,
    onRowClick,
    rowHeight = 28,
    loading = false,
    loadingLabel = "טוען…",
    emptyLabel,
    className,
}: VirtualTableProps<T>) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        overscan: 12,
    });

    const items = virtualizer.getVirtualItems();
    const paddingTop = items.length > 0 ? items[0].start : 0;
    const paddingBottom =
        items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

    const showPlaceholder = loading || rows.length === 0;

    return (
        <div
            ref={scrollRef}
            className={cn(
                "min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.06]",
                className
            )}
        >
            <table className="w-full table-fixed text-xs">
                <colgroup>
                    {columns.map((col) => (
                        <col key={col.key} style={{ width: col.width }} />
                    ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                    <tr className="border-b border-white/[0.06] text-muted-foreground">
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={cn(
                                    "px-2 py-1.5 font-medium",
                                    col.align === "end" ? "text-end" : "text-start"
                                )}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {showPlaceholder ? (
                        <tr>
                            <td
                                colSpan={columns.length}
                                className="px-2 py-6 text-center text-muted-foreground"
                            >
                                {loading ? loadingLabel : emptyLabel}
                            </td>
                        </tr>
                    ) : (
                        <>
                            {paddingTop > 0 && <tr style={{ height: paddingTop }} aria-hidden />}
                            {items.map((item) => {
                                const row = rows[item.index];
                                return (
                                    <tr
                                        key={rowKey(row)}
                                        style={{ height: rowHeight }}
                                        className={cn(
                                            "border-b border-white/[0.04]",
                                            onRowClick && "cursor-pointer hover:bg-white/[0.03]"
                                        )}
                                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    >
                                        {columns.map((col) => (
                                            <td
                                                key={col.key}
                                                className={cn(
                                                    "overflow-hidden whitespace-nowrap px-2 py-1",
                                                    col.align === "end" && "text-end",
                                                    col.className
                                                )}
                                                onClick={
                                                    col.isolate
                                                        ? (e) => e.stopPropagation()
                                                        : undefined
                                                }
                                            >
                                                {col.cell(row)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            {paddingBottom > 0 && (
                                <tr style={{ height: paddingBottom }} aria-hidden />
                            )}
                        </>
                    )}
                </tbody>
            </table>
        </div>
    );
}

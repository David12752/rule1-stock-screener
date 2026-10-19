"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabDef = {
    id: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
};

/**
 * Fixed-height tab chrome + a single scrollable body.
 *
 * Only the active panel is mounted (`forceMount` is deliberately NOT used), so
 * hidden tabs cost no render and — critically — no chart instances. That kills
 * the Recharts "width(-1) height(-1)" warning that inactive panels used to log.
 *
 * Tab id is synced to a search param so deep links and browser back work.
 * Query updates keep the current pathname (e.g. `/stock/MSFT`) — a bare
 * `?tab=…` replace would drop the path and dump the user back on `/`.
 */
export function TabShell({
    tabs,
    defaultTab,
    paramKey = "tab",
    aliases,
    actions,
    className,
    listClassName,
    children,
}: {
    tabs: TabDef[];
    defaultTab: string;
    paramKey?: string;
    /** Map retired tab ids → current ids (e.g. big5 → deep). */
    aliases?: Record<string, string>;
    actions?: ReactNode;
    className?: string;
    listClassName?: string;
    children: (activeTab: string) => ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const raw = params.get(paramKey) ?? defaultTab;
    const mapped = aliases?.[raw] ?? raw;
    const resolved = tabs.some((t) => t.id === mapped) ? mapped : defaultTab;

    const setActive = useCallback(
        (next: string) => {
            const url = new URLSearchParams(params.toString());
            url.set(paramKey, next);
            router.replace(`${pathname}?${url.toString()}`, { scroll: false });
        },
        [params, paramKey, pathname, router]
    );

    return (
        <Tabs.Root
            value={resolved}
            onValueChange={setActive}
            className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
        >
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-1">
                <Tabs.List
                    className={cn(
                        "flex min-w-0 flex-1 gap-1 overflow-x-auto custom-scrollbar",
                        listClassName
                    )}
                >
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <Tabs.Trigger
                            key={id}
                            value={id}
                            className={cn(
                                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                                "text-muted-foreground transition-colors hover:text-foreground",
                                "data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
                            )}
                        >
                            {Icon && <Icon className="h-3.5 w-3.5" />}
                            {label}
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>
                {actions}
            </div>

            <Tabs.Content
                value={resolved}
                className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 focus-visible:outline-none"
            >
                {children(resolved)}
            </Tabs.Content>
        </Tabs.Root>
    );
}

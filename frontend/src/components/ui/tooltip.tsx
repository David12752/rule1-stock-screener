"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
    React.ComponentRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-50 max-w-xs rounded-lg border border-white/[0.08] bg-[#12151c] px-3 py-2",
                "text-start text-xs leading-relaxed text-foreground shadow-xl",
                "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
                className
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

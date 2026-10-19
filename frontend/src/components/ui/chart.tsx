"use client"

import * as React from "react"
import type { TooltipProps } from "recharts"

export const ChartContainer = ({ children }: { children: React.ReactNode }) => {
    return <div className="w-full h-full">{children}</div>
}

export type ChartConfig = Record<string, { label: string; color: string }>

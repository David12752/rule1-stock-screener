"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangleIcon, LoaderIcon, TrendingUp, TrendingDown, Shield, Clock, BarChart3 } from "lucide-react";
import { InfoTooltip } from "@/components/info-tooltip";

interface StockCardProps {
    ticker: string;
    companyName?: string;
    price?: number;
    stickerPrice?: number;
    moatScore?: number;
    mosPrice?: number;
    signal?: string;
    loading?: boolean;
    error?: string;
    status?: string;
    verdict?: string;
    paybackTime?: number;
    big5?: Record<string, any>;
    sector?: string;
}

const VERDICT_STYLES: Record<string, { border: string; bg: string; badge: string; dot: string; text: string }> = {
    BUY:          { border: "border-emerald-500/30", bg: "hover:bg-emerald-500/[0.03]", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-500", text: "קנה" },
    WAIT:         { border: "border-yellow-500/30",  bg: "hover:bg-yellow-500/[0.03]",  badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",   dot: "bg-yellow-500", text: "המתן" },
    WATCHLIST:    { border: "border-blue-500/30",    bg: "hover:bg-blue-500/[0.03]",    badge: "bg-blue-500/15 text-blue-400 border-blue-500/25",         dot: "bg-blue-500",   text: "מעקב" },
    WARY:         { border: "border-orange-500/30",  bg: "hover:bg-orange-500/[0.03]",  badge: "bg-orange-500/15 text-orange-400 border-orange-500/25",   dot: "bg-orange-500", text: "זהירות" },
    DISQUALIFIED: { border: "border-red-500/30",     bg: "hover:bg-red-500/[0.03]",     badge: "bg-red-500/15 text-red-400 border-red-500/25",           dot: "bg-red-500",    text: "פסול" },
};

const STATUS_STEPS: Record<string, { label: string; progress: number }> = {
    queued:    { label: "ממתין בתור...", progress: 10 },
    fetching:  { label: "מושך נתונים...", progress: 40 },
    analyzing: { label: "מנתח...", progress: 70 },
};

export function StockCard({
    ticker, companyName, price, stickerPrice, moatScore, mosPrice,
    signal, loading = false, error, status, verdict, paybackTime, big5, sector,
}: StockCardProps) {
    if (loading) {
        const step = STATUS_STEPS[status as string] || { label: "טוען...", progress: 20 };
        return (
            <Card className="border-white/[0.06] bg-card/50 overflow-hidden">
                <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="font-bold font-mono text-base text-foreground">{ticker}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                                <LoaderIcon className="h-3 w-3 animate-spin text-primary" />
                                {step.label}
                            </div>
                        </div>
                        <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                    <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden mt-3">
                        <div className="h-full bg-primary/50 rounded-full transition-all duration-700" style={{ width: `${step.progress}%` }} />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="border-red-500/20 bg-red-500/[0.03]">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-bold font-mono text-base">{ticker}</span>
                        <AlertTriangleIcon className="h-4 w-4 text-red-400/60" />
                    </div>
                    <p className="text-[11px] text-red-400/80 font-mono leading-relaxed">{error}</p>
                </CardContent>
            </Card>
        );
    }

    const vs = verdict ? (VERDICT_STYLES[verdict] || null) : null;
    const isUndervalued = price && mosPrice && price < mosPrice;
    const discountPct = stickerPrice && price
        ? ((stickerPrice - price) / stickerPrice * 100)
        : null;

    const big5PassCount = big5 ? Object.values(big5).filter((m: any) => m?.consistent_growth).length : null;
    const big5Total = big5 ? Object.keys(big5).length : null;

    return (
        <Link href={`/stock/${ticker}`}>
            <Card className={`group border cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 ${vs?.border || "border-white/[0.06]"} ${vs?.bg || "hover:bg-white/[0.02]"} bg-card/60 backdrop-blur-sm`}>
                <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-bold font-mono text-base leading-none text-foreground">{ticker}</span>
                                {sector && (
                                    <span className="text-[10px] text-muted-foreground/50 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                        {sector}
                                    </span>
                                )}
                            </div>
                            {companyName && (
                                <div className="text-xs text-muted-foreground/70 mt-1 truncate max-w-[160px]">{companyName}</div>
                            )}
                        </div>
                        {vs && (
                            <Badge variant="outline" className={`${vs.badge} text-[11px] font-bold border shrink-0`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${vs.dot} me-1.5 inline-block`} />
                                {vs.text}
                            </Badge>
                        )}
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-2xl font-bold font-mono tracking-tight">${price?.toFixed(2) ?? "—"}</span>
                        {discountPct != null && (
                            <span className={`flex items-center gap-0.5 text-xs font-bold ${discountPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {discountPct > 0
                                    ? <TrendingUp className="h-3 w-3" />
                                    : <TrendingDown className="h-3 w-3" />}
                                {discountPct > 0 ? "+" : ""}{discountPct.toFixed(0)}%
                            </span>
                        )}
                    </div>

                    {/* 3 Key Metrics */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {/* Moat Score */}
                        <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                            <div className="flex items-center justify-center gap-0.5 mb-1">
                                <Shield className="h-3 w-3 text-muted-foreground/50" />
                                <InfoTooltip termKey="moat" size="sm" />
                            </div>
                            <div className={`font-mono font-bold text-sm ${
                                moatScore != null
                                    ? moatScore >= 7 ? "text-emerald-400" : moatScore >= 5 ? "text-yellow-400" : "text-red-400"
                                    : "text-muted-foreground/40"
                            }`}>
                                {moatScore != null && moatScore > 0 ? `${moatScore}/10` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5">חפיר</div>
                        </div>

                        {/* Big 5 */}
                        <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                            <div className="flex items-center justify-center gap-0.5 mb-1">
                                <BarChart3 className="h-3 w-3 text-muted-foreground/50" />
                                <InfoTooltip termKey="big5Count" size="sm" />
                            </div>
                            <div className={`font-mono font-bold text-sm ${
                                big5PassCount != null
                                    ? big5PassCount === big5Total ? "text-emerald-400" : big5PassCount >= 3 ? "text-yellow-400" : "text-red-400"
                                    : "text-muted-foreground/40"
                            }`}>
                                {big5PassCount != null ? `${big5PassCount}/${big5Total}` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5">צמיחה</div>
                        </div>

                        {/* Payback Time */}
                        <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                            <div className="flex items-center justify-center gap-0.5 mb-1">
                                <Clock className="h-3 w-3 text-muted-foreground/50" />
                                <InfoTooltip termKey="paybackTime" size="sm" />
                            </div>
                            <div className={`font-mono font-bold text-sm ${
                                paybackTime != null
                                    ? paybackTime <= 8 ? "text-emerald-400" : "text-red-400"
                                    : "text-muted-foreground/40"
                            }`}>
                                {paybackTime != null ? `${paybackTime}y` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5">החזר</div>
                        </div>
                    </div>

                    {/* MOS Price row */}
                    <div className="flex items-center justify-between border-t border-white/[0.04] pt-2.5 text-xs">
                        <div className="flex items-center gap-1">
                            <span className="text-muted-foreground/50">מרווח ביטחון:</span>
                            <span className={`font-mono font-medium ${isUndervalued ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {mosPrice ? `$${mosPrice.toFixed(0)}` : "—"}
                            </span>
                            <InfoTooltip termKey="mos" size="sm" />
                        </div>
                        {signal && (
                            <span className={`flex items-center gap-1 text-[11px] font-medium ${signal === "Green" ? "text-emerald-400" : "text-red-400"}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${signal === "Green" ? "bg-emerald-500" : "bg-red-500"}`} />
                                {signal === "Green" ? "ירוק" : "אדום"}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

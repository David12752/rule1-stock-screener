"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, ScanSearch, Download, BarChart3 } from "lucide-react";

interface ScanProgressProps {
    isScanning: boolean;
    progress: number; // 0-100, or -1 for indeterminate (download phase)
    currentTicker?: string;
    scannedCount: number;
    totalCount: number;
    patternsFound: number;
    error?: string;
}

export function ScanProgress({
    isScanning,
    progress,
    currentTicker,
    scannedCount,
    totalCount,
    patternsFound,
    error,
}: ScanProgressProps) {
    if (!isScanning && scannedCount === 0 && !error) {
        return null;
    }

    const isComplete = !isScanning && scannedCount > 0;
    const isIndeterminate = progress === -1; // download phase, no ticker progress yet

    // Detect which phase we're in from the stage message
    const isDownloadPhase = isIndeterminate || (currentTicker?.includes("ownload") ?? false) || (currentTicker?.includes("batch") ?? false);
    const isDetectionPhase = currentTicker?.includes("etect") || currentTicker?.includes("rocess") || scannedCount > 0;

    const phaseLabel = isDownloadPhase
        ? "הורדת נתוני מניות..."
        : isDetectionPhase
        ? "זיהוי תבניות..."
        : "סריקה...";

    return (
        <Card
            className={`transition-all ${
                isScanning
                    ? "border-primary/40 bg-primary/[0.04]"
                    : error
                    ? "border-red-500/50 bg-red-950/10"
                    : isComplete
                    ? "border-green-500/50 bg-green-950/10"
                    : "border-border"
            }`}
        >
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    {isScanning ? (
                        isDownloadPhase ? (
                            <Download className="h-5 w-5 text-primary animate-pulse shrink-0" />
                        ) : (
                            <BarChart3 className="h-5 w-5 text-primary animate-pulse shrink-0" />
                        )
                    ) : error ? (
                        <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                    ) : isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                    ) : (
                        <ScanSearch className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                        {/* Status row */}
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">
                                {isScanning
                                    ? phaseLabel
                                    : error
                                    ? "הסריקה נכשלה"
                                    : isComplete
                                    ? "הסריקה הושלמה"
                                    : "מוכן לסריקה"}
                            </p>
                            {(isScanning || isComplete) && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                    {scannedCount > 0 && (
                                        <span>{scannedCount}/{totalCount > 0 ? totalCount : "?"} מניות</span>
                                    )}
                                    {patternsFound > 0 && (
                                        <span className="text-green-400 font-semibold">
                                            {patternsFound} תוצאות ✓
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Stage detail message */}
                        {isScanning && currentTicker && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {currentTicker}
                            </p>
                        )}

                        {/* Progress bar */}
                        {(isScanning || isComplete) && (
                            <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                {isIndeterminate && isScanning ? (
                                    /* Indeterminate: animated shimmer during download phase */
                                    <div
                                        className="h-full w-1/3 rounded-full bg-primary/70 animate-[shimmer_1.5s_ease-in-out_infinite]"
                                        style={{
                                            background: "linear-gradient(90deg, transparent, oklch(0.68 0.16 205 / 0.8), transparent)",
                                            backgroundSize: "200% 100%",
                                            animation: "shimmer 1.5s linear infinite",
                                        }}
                                    />
                                ) : (
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            isComplete ? "bg-green-500" : "bg-primary"
                                        }`}
                                        style={{ width: `${Math.max(2, Math.min(progress, 100))}%` }}
                                    />
                                )}
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <p className="text-xs text-red-400 mt-1">{error}</p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

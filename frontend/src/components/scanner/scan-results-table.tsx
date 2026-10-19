"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { WatchlistButton } from "@/components/watchlist-button";

interface PatternInfo {
    pattern_type: string;
    confidence: number;
    start_date: string;
    end_date: string;
    target_price?: number;
    description: string;
    key_points: any[];
}

interface ScanResult {
    symbol: string;
    company_name: string;
    sector: string;
    patterns: PatternInfo[];
    current_price: number;
    market_cap: number;
    avg_volume: number;
    beta?: number;
    rsi?: number;
    above_sma_200: boolean;
    rule1_quality?: {
        passes: boolean;
        summary: string;
    };
    hot_sector?: boolean;
}

interface ScanResultsTableProps {
    results: ScanResult[];
    onSelectResult: (result: ScanResult) => void;
    selectedSymbol?: string;
}

const PATTERN_LABELS: Record<string, string> = {
    cup_and_handle: "גביע וידית",
    head_and_shoulders: "ראש וכתפיים",
    inverse_head_and_shoulders: "H&S הפוך",
    double_bottom: "תחתית כפולה",
    double_top: "פסגה כפולה",
    ascending_triangle: "משולש עולה",
    descending_triangle: "משולש יורד",
    bull_flag: "דגל שורי",
    bear_flag: "דגל דובי",
};

const BULLISH_PATTERNS = [
    "cup_and_handle",
    "inverse_head_and_shoulders",
    "double_bottom",
    "ascending_triangle",
    "bull_flag",
];

function formatMarketCap(value: number): string {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toFixed(0)}`;
}

function formatVolume(value: number): string {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(0);
}

function confidenceStars(confidence: number): string {
    if (confidence >= 0.9) return "★★★★★";
    if (confidence >= 0.8) return "★★★★";
    if (confidence >= 0.7) return "★★★";
    if (confidence >= 0.6) return "★★";
    return "★";
}

export function ScanResultsTable({
    results,
    onSelectResult,
    selectedSymbol,
}: ScanResultsTableProps) {
    if (results.length === 0) {
        return (
            <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg">No patterns found</p>
                <p className="text-sm mt-1">Try adjusting your filters or patterns selection</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    תוצאות ({results.length})
                </h3>
            </div>

            {results.map((result) => {
                const bestPattern = result.patterns[0];
                const isBullish = BULLISH_PATTERNS.includes(bestPattern.pattern_type);
                const isSelected = result.symbol === selectedSymbol;

                return (
                    <Card
                        key={result.symbol}
                        className={`cursor-pointer transition-all hover:border-blue-500/50 ${
                            isSelected
                                ? "border-blue-500 bg-blue-950/20"
                                : "border-border"
                        }`}
                        onClick={() => onSelectResult(result)}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                {/* Left: Symbol + Pattern */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/stock/${result.symbol}`}
                                            className="text-lg font-bold font-mono hover:text-blue-400 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {result.symbol}
                                        </Link>
                                        <WatchlistButton symbol={result.symbol} size="sm" stopPropagation />
                                        <Badge
                                            className={`text-[10px] ${
                                                isBullish
                                                    ? "bg-green-950/50 text-green-400 border-green-500/50"
                                                    : "bg-red-950/50 text-red-400 border-red-500/50"
                                            }`}
                                            variant="outline"
                                        >
                                            {isBullish ? "▲" : "▼"}{" "}
                                            {PATTERN_LABELS[bestPattern.pattern_type] || bestPattern.pattern_type}
                                        </Badge>
                                        {result.rule1_quality?.passes && (
                                            <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[10px]" variant="outline">
                                                R1 ✓
                                            </Badge>
                                        )}
                                        {result.hot_sector && (
                                            <Badge className="bg-orange-600/20 text-orange-400 border-orange-500/30 text-[10px]" variant="outline">
                                                🔥 סקטור חם
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {result.company_name} • {result.sector}
                                    </p>

                                    {/* Confidence + extra patterns */}
                                    <div className="flex items-center gap-3 mt-2">
                                        <span
                                            className={`text-xs font-bold ${
                                                bestPattern.confidence >= 0.8
                                                    ? "text-green-400"
                                                    : bestPattern.confidence >= 0.6
                                                    ? "text-yellow-400"
                                                    : "text-orange-400"
                                            }`}
                                        >
                                            {confidenceStars(bestPattern.confidence)}{" "}
                                            {(bestPattern.confidence * 100).toFixed(0)}%
                                        </span>
                                        {bestPattern.target_price && (
                                            <span className="text-xs text-blue-400">
                                                יעד: ${bestPattern.target_price.toFixed(2)}
                                            </span>
                                        )}
                                        {result.patterns.length > 1 && (
                                            <span className="text-xs text-muted-foreground">
                                                +{result.patterns.length - 1} דפוסים נוספים
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Price + Stats */}
                                <div className="text-right shrink-0 ml-4">
                                    <span className="text-lg font-bold font-mono">
                                        ${result.current_price.toFixed(2)}
                                    </span>
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                        <div>Cap: {formatMarketCap(result.market_cap)}</div>
                                        <div>Vol: {formatVolume(result.avg_volume)}</div>
                                        {result.rsi && (
                                            <div
                                                className={
                                                    result.rsi < 30
                                                        ? "text-green-400"
                                                        : result.rsi > 70
                                                        ? "text-red-400"
                                                        : ""
                                                }
                                            >
                                                RSI: {result.rsi.toFixed(0)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

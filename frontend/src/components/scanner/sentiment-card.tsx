"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Globe,
    TrendingUp,
    TrendingDown,
    Flame,
    Newspaper,
    Rocket,
} from "lucide-react";

interface TrendItem {
    keyword: string;
    interest: number;
    direction: "rising" | "falling" | "stable";
}

interface NewsItem {
    title: string;
    source: string;
    url: string;
    is_funding: boolean;
}

interface SectorHeat {
    sector: string;
    heat_score: number;
    trend_score: number;
    news_score: number;
}

interface MarketPulse {
    hot_sectors: SectorHeat[];
    trending_keywords: TrendItem[];
    recent_funding_news: NewsItem[];
}

interface SentimentCardProps {
    data: MarketPulse | null;
    isLoading: boolean;
}

function heatColor(score: number): string {
    if (score >= 80) return "text-red-400";
    if (score >= 60) return "text-orange-400";
    if (score >= 40) return "text-yellow-400";
    if (score >= 20) return "text-blue-400";
    return "text-muted-foreground";
}

function heatBg(score: number): string {
    if (score >= 80) return "bg-red-950/30 border-red-500/30";
    if (score >= 60) return "bg-orange-950/30 border-orange-500/30";
    if (score >= 40) return "bg-yellow-950/30 border-yellow-500/30";
    return "bg-muted/30 border-border";
}

export function SentimentCard({ data, isLoading }: SentimentCardProps) {
    if (isLoading) {
        return (
            <Card className="border-border">
                <CardContent className="p-6 flex items-center justify-center">
                    <div className="animate-pulse flex flex-col items-center gap-2">
                        <Globe className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            טוען מידע שוק...
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!data) {
        return (
            <Card className="border-border">
                <CardContent className="p-6 text-center text-muted-foreground">
                    <p className="text-sm">נתוני ניתוח אינם זמינים</p>
                    <p className="text-xs mt-1">
                        דורש pytrends ו/או מפתח NewsAPI
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Hot Sectors */}
            {data.hot_sectors && data.hot_sectors.length > 0 && (
                <Card className="border-orange-500/20">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Flame className="h-4 w-4 text-orange-400" />
                            סקטורים חמים
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-1.5">
                            {data.hot_sectors.slice(0, 5).map((sector) => {
                                // heat_score is 0-1, convert to 0-100 for display
                                const pct = Math.round(sector.heat_score * 100);
                                return (
                                    <div
                                        key={sector.sector}
                                        className={`flex items-center justify-between rounded-md px-2.5 py-1.5 border ${heatBg(pct)}`}
                                    >
                                        <span className="text-xs font-medium truncate">
                                            {sector.sector}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${pct >= 60 ? "bg-orange-500" : pct >= 40 ? "bg-yellow-500" : "bg-blue-500"}`}
                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-bold tabular-nums ${heatColor(pct)}`}>
                                                {pct}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Trending Keywords */}
            {data.trending_keywords && data.trending_keywords.length > 0 && (
                <Card className="border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                            נושאים מגמתיים
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="flex flex-wrap gap-1.5">
                            {data.trending_keywords.slice(0, 12).map((trend) => (
                                <Badge
                                    key={trend.keyword}
                                    variant="outline"
                                    className={`text-[10px] ${
                                        trend.direction === "rising"
                                            ? "border-green-500/40 text-green-400"
                                            : trend.direction === "falling"
                                            ? "border-red-500/40 text-red-400"
                                            : "border-border text-muted-foreground"
                                    }`}
                                >
                                    {trend.direction === "rising" ? "↑" : trend.direction === "falling" ? "↓" : "→"}{" "}
                                    {trend.keyword}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Funding News */}
            {data.recent_funding_news && data.recent_funding_news.length > 0 && (
                <Card className="border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-purple-400" />
                            חדשות גיוס הון ו-IPO
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                            {data.recent_funding_news.slice(0, 5).map((news, i) => (
                                <a
                                    key={i}
                                    href={news.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs hover:text-blue-400 transition-colors"
                                >
                                    <div className="flex items-start gap-2">
                                        <Newspaper className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                                        <div>
                                            <p className="line-clamp-2">{news.title}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                {news.source}
                                            </p>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

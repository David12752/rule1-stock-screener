"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StickerPriceGauge } from "@/components/sticker-price-gauge";
import { InfoTooltip, GlossaryLabel } from "@/components/info-tooltip";
import { TechnicalCharts } from "@/components/stock/technical-charts";
import { CandlestickChart } from "@/components/candlestick-chart";
import { AIChatPanel } from "@/components/ai-chat-panel";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
    ResponsiveContainer, ReferenceLine, Cell, Legend
} from "recharts";
import {
    TrendingUp, ScanSearch, CheckCircle2, XCircle,
    Building2, Users, BarChart3, ShieldCheck, AlertTriangle,
    DollarSign, Calculator, Brain, Activity, Target, Shield, Clock,
    Gauge, PieChart, TrendingDown, Sparkles
} from "lucide-react";
import { fmt, pct, money, compact } from "@/lib/format";
import { BIG5_LABELS } from "../constants";

const fmtPct = (n: number | null | undefined) => pct(n);
const fmtCap = (n: number | null | undefined) => money(n);
const fmtNum = (n: number | null | undefined) => compact(n);

export function OverviewTab({
  data,
  normalizedData,
  checklist,
  checklistPassCount,
  md,
  marketCards,
}: {
  data: any;
  normalizedData: any[];
  checklist: any[];
  checklistPassCount: number;
  md: any;
  marketCards?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {marketCards}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Sticker Price Gauge */}
                            <Card className="glass border-white/[0.06]">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Gauge className="h-5 w-5 text-primary" />
                                        מד שווי
                                        <InfoTooltip termKey="stickerPrice" size="sm" />
                                    </CardTitle>
                                    <CardDescription>מיקום המחיר הנוכחי ביחס למחיר ההוגן ומרווח הביטחון</CardDescription>
                                </CardHeader>
                                <CardContent className="flex justify-center py-4">
                                    <StickerPriceGauge
                                        currentPrice={data.price}
                                        stickerPrice={data.sticker_price}
                                        mosPrice={data.mos_price}
                                    />
                                </CardContent>
                            </Card>

                            {/* Rule #1 Checklist */}
                            <Card className="glass border-white/[0.06]">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-primary" />
                                        רשימת בדיקת כלל מספר 1
                                        <InfoTooltip termKey="rule1" size="sm" />
                                    </CardTitle>
                                    <CardDescription>
                                        <span className={checklistPassCount >= 4 ? "text-green-400" : checklistPassCount >= 2 ? "text-yellow-400" : "text-red-400"}>
                                            {checklistPassCount}/{checklist.length}
                                        </span>
                                        {" "}קריטריונים עוברים
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2.5">
                                    {checklist.map((item, i) => (
                                        <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${item.pass
                                            ? "bg-green-950/10 border-green-500/20"
                                            : "bg-red-950/10 border-red-500/20"
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                {item.pass
                                                    ? <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                                                    : <XCircle className="h-5 w-5 text-red-400 shrink-0" />}
                                                <span className="text-sm font-medium">{item.label}</span>
                                                <InfoTooltip termKey={item.key} size="sm" />
                                            </div>
                                            <span className={`text-xs font-mono ${item.pass ? "text-green-400" : "text-red-400"}`}>
                                                {item.detail}
                                            </span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Big 5 Growth Chart */}
                        <Card className="glass border-white/[0.06]">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-green-400" />
                                    מגמות צמיחת Big 5
                                    <InfoTooltip termKey="big5" size="sm" />
                                </CardTitle>
                                <CardDescription>צמיחה מנורמלת ל-10 שנים — 100 מייצג את נקודת ההתחלה. קו שעולה = צמיחה בריאה.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={normalizedData}>
                                        <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                                        <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                                        <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                                        <Line type="monotone" dataKey="eps_norm" stroke="#22c55e" strokeWidth={2} dot={false} name="EPS" />
                                        <Line type="monotone" dataKey="sales_norm" stroke="#eab308" strokeWidth={2} dot={false} name="מכירות" />
                                        <Line type="monotone" dataKey="equity_norm" stroke="#3b82f6" strokeWidth={2} dot={false} name="הון" />
                                        <Line type="monotone" dataKey="fcf_norm" stroke="#ec4899" strokeWidth={2} dot={false} name="FCF" />
                                        <Legend />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        {/* Analyst Info */}
                        {(md.analyst_target_price || md.analyst_recommendation) && (
                            <Card className="glass border-white/[0.06]">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Target className="h-5 w-5 text-blue-400" />
                                        המלצות אנליסטים
                                    </CardTitle>
                                    <CardDescription>ממוצע הערכות אנליסטים בוול סטריט — לא להסתמך בלעדית</CardDescription>
                                </CardHeader>
                                <CardContent className="flex gap-6 flex-wrap">
                                    {md.analyst_target_price && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">מחיר יעד ממוצע</div>
                                            <div className="text-2xl font-bold font-mono">${fmt(md.analyst_target_price)}</div>
                                            {data.price > 0 && (
                                                <div className={`text-sm font-mono ${md.analyst_target_price > data.price ? "text-green-400" : "text-red-400"}`}>
                                                    {md.analyst_target_price > data.price ? "+" : ""}{(((md.analyst_target_price - data.price) / data.price) * 100).toFixed(1)}% מהמחיר הנוכחי
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {md.analyst_recommendation && (
                                        <div>
                                            <div className="text-xs text-muted-foreground mb-1">המלצה</div>
                                            <Badge className={`text-sm ${md.analyst_recommendation === "buy" || md.analyst_recommendation === "strong_buy"
                                                ? "bg-green-700" : md.analyst_recommendation === "hold"
                                                    ? "bg-yellow-700" : "bg-red-700"}`}>
                                                {md.analyst_recommendation.replace("_", " ").toUpperCase()}
                                            </Badge>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
    </div>
  );
}

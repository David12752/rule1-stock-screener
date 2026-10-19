"use client";

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
import { BIG5_METRICS, CONSISTENCY_HE } from "@/lib/metrics";
import { InfoHint } from "@/components/info-hint";

const fmtPct = (n: number | null | undefined) => pct(n);
const fmtCap = (n: number | null | undefined) => money(n);
const fmtNum = (n: number | null | undefined) => compact(n);

export function Big5Tab({ data, normalizedData }: { data: any; normalizedData: any[] }) {
  return (
    <div className="space-y-6">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(data.big_5 || {}).map(([key, val]: [string, any]) => {
                                const info = BIG5_METRICS[key];
                                const bars = [
                                    { period: "1Y", value: val?.cagr_1y },
                                    { period: "3Y", value: val?.cagr_3y },
                                    { period: "5Y", value: val?.cagr_5y },
                                    { period: "10Y", value: val?.cagr_10y },
                                ].filter(b => b.value !== null && b.value !== undefined);

                                const barChartData = bars.map(b => ({
                                    period: b.period,
                                    value: parseFloat((b.value! * 100).toFixed(1)),
                                }));

                                return (
                                    <Card key={key} className={`border-2 ${val?.consistent_growth ? "border-green-700" : "border-red-800"}`}>
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <CardTitle className="flex items-center gap-1 text-base">
                                                    {info?.label || key.toUpperCase()}
                                                    {info && <InfoHint info={info} />}
                                                </CardTitle>
                                                <Badge className={val?.consistent_growth ? "bg-green-700" : "bg-red-700"}>
                                                    {val?.consistent_growth ? CONSISTENCY_HE.pass : CONSISTENCY_HE.fail}
                                                </Badge>
                                            </div>
                                            <CardDescription className="text-xs">
                                                {info?.what}
                                                {info?.rule ? ` · ${info.rule}` : ""}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {barChartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height={120}>
                                                    <BarChart data={barChartData} margin={{ top: 4, bottom: 0, left: -10, right: 4 }}>
                                                        <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} />
                                                        <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                                        <RechartsTooltip formatter={(v: any) => [`${v}%`, "CAGR"]} />
                                                        <ReferenceLine y={10} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "10%", fill: "#22c55e", fontSize: 10 }} />
                                                        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                                            {barChartData.map((entry, index) => (
                                                                <Cell key={index} fill={entry.value >= 10 ? "#22c55e" : entry.value >= 5 ? "#eab308" : "#ef4444"} />
                                                            ))}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">אין נתונים</div>
                                            )}
                                            <div className="grid grid-cols-4 gap-1 mt-2 text-xs text-center">
                                                {[
                                                    { p: "1Y", v: val?.cagr_1y },
                                                    { p: "3Y", v: val?.cagr_3y },
                                                    { p: "5Y", v: val?.cagr_5y },
                                                    { p: "10Y", v: val?.cagr_10y },
                                                ].map(({ p, v }) => (
                                                    <div key={p}>
                                                        <div className="text-muted-foreground">{p}</div>
                                                        <div className={`font-bold ${v != null && v >= 0.10 ? "text-green-400" : v != null && v >= 0.05 ? "text-yellow-400" : "text-red-400"}`}>
                                                            {v != null ? `${(v * 100).toFixed(1)}%` : "N/A"}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>

                        {/* Historical Table */}
                        <Card className="border-border">
                            <CardHeader>
                                <CardTitle>נתונים היסטוריים</CardTitle>
                                <CardDescription>כל השנים הזמינות – ממוין מהישן לחדש</CardDescription>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                <table className="w-full text-sm font-mono">
                                    <thead>
                                        <tr className="border-b border-border text-muted-foreground">
                                            <th className="text-left py-2 pr-4">שנה</th>
                                            <th className="text-right py-2 px-3">מכירות</th>
                                            <th className="text-right py-2 px-3">EPS</th>
                                            <th className="text-right py-2 px-3">הון/מניה</th>
                                            <th className="text-right py-2 px-3">FCF</th>
                                            <th className="text-right py-2 px-3">ROIC</th>
                                            <th className="text-right py-2 px-3">ROE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.financial_history.map((row: any, i: number) => (
                                            <tr key={i} className="border-b border-border/40 hover:bg-muted/10">
                                                <td className="py-2 pr-4">{row.date ? new Date(row.date).getFullYear() : i}</td>
                                                <td className="text-right py-2 px-3">{row.sales ? `$${(row.sales / 1e9).toFixed(1)}B` : "N/A"}</td>
                                                <td className="text-right py-2 px-3">{row.eps ? `$${Number(row.eps).toFixed(2)}` : "N/A"}</td>
                                                <td className="text-right py-2 px-3">{row.equity ? `$${Number(row.equity).toFixed(2)}` : "N/A"}</td>
                                                <td className="text-right py-2 px-3">{row.fcf ? `$${(row.fcf / 1e9).toFixed(1)}B` : "N/A"}</td>
                                                <td className={`text-right py-2 px-3 ${row.roic >= 0.10 ? "text-green-400" : "text-red-400"}`}>
                                                    {row.roic ? `${(row.roic * 100).toFixed(1)}%` : "N/A"}
                                                </td>
                                                <td className={`text-right py-2 px-3 ${row.roe >= 0.15 ? "text-green-400" : "text-yellow-400"}`}>
                                                    {row.roe ? `${(row.roe * 100).toFixed(1)}%` : "N/A"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
    </div>
  );
}

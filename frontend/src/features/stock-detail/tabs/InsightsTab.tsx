"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

export function InsightsTab({ data, md, symbol }: { data: any; md: any; symbol: string }) {
  return (
    <div className="space-y-6">
<div className="space-y-6">
                            {/* Moat Score Visual */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="border-border">
                                    <CardContent className="pt-6 text-center">
                                        <div className="text-sm text-muted-foreground mb-2">ציון חפיר</div>
                                        <div className={`text-6xl font-bold ${(data.ai_analysis?.moat_score || 0) >= 8 ? "text-green-400" : (data.ai_analysis?.moat_score || 0) >= 5 ? "text-yellow-400" : "text-red-400"}`}>
                                            {data.ai_analysis?.moat_score || 0}
                                        </div>
                                        <div className="text-muted-foreground">/10</div>
                                        <div className="text-sm mt-2 font-medium">{data.ai_analysis?.moat_type || "לא ידוע"}</div>
                                    </CardContent>
                                </Card>
                                <Card className="border-border md:col-span-2">
                                    <CardHeader>
                                        <CardTitle>ניתוח חפיר תחרותי</CardTitle>
                                        <CardDescription>מופעל על ידי Gemini AI</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-sm leading-relaxed text-muted-foreground">
                                        {data.ai_analysis?.moat_analysis || "ניתוח AI לא זמין"}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Management */}
                            <Card className={`border-2 ${data.ai_analysis?.management_integrity ? "border-green-700" : "border-yellow-700"}`}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Users className="h-5 w-5" />
                                        יושרת ההנהלה
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3 mb-3">
                                        {data.ai_analysis?.management_integrity
                                            ? <CheckCircle2 className="h-6 w-6 text-green-400" />
                                            : <AlertTriangle className="h-6 w-6 text-yellow-400" />}
                                        <span className="font-medium">
                                            {data.ai_analysis?.management_integrity
                                                ? "ההנהלה מפגינה כנות ומחוייבות לבעלי המניות"
                                                : "זוהו דגלי אזהרה בנוגע להנהלה"}
                                        </span>
                                    </div>
                                    {data.ai_analysis?.management_description && (
                                        <p className="text-sm text-muted-foreground">{data.ai_analysis.management_description}</p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Red Flags */}
                            {data.ai_analysis?.red_flags?.length > 0 && (
                                <Card className="border-red-700 border-2">
                                    <CardHeader>
                                        <CardTitle className="text-red-400 flex items-center gap-2">
                                            <AlertTriangle className="h-5 w-5" />
                                            דגלים אדומים ({data.ai_analysis.red_flags.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {data.ai_analysis.red_flags.map((flag: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                                                    <span className="text-red-500 mt-0.5">•</span>
                                                    {flag}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Company Summary */}
                            {md.long_business_summary && (
                                <Card className="border-border">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Building2 className="h-5 w-5" />
                                            על החברה
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-sm text-muted-foreground leading-relaxed">
                                        {md.long_business_summary}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                                        <div>
                                            <AIChatPanel ticker={symbol} />
                                        </div>
    </div>
  );
}

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
import { BIG5_LABELS } from "../constants";

const fmtPct = (n: number | null | undefined) => pct(n);
const fmtCap = (n: number | null | undefined) => money(n);
const fmtNum = (n: number | null | undefined) => compact(n);

export function TechnicalsTab({ data, ta, taDetails, chartData, patternData, patternLoading, loadPatterns, symbol }: { data: any; ta: any; taDetails: any; chartData: any; patternData: any; patternLoading: boolean; loadPatterns: () => void; symbol: string }) {
  return (
    <div className="space-y-6">
{/* Signal Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                {
                                    tool: "MACD (8, 17, 9)",
                                    pass: taDetails.macd_bullish,
                                    desc: "קו MACD מעל לקו האיתות",
                                    detail: taDetails.macd_value != null
                                        ? `MACD: ${taDetails.macd_value?.toFixed(3)} | Signal: ${taDetails.macd_signal?.toFixed(3)}`
                                        : "N/A",
                                    explain: "כשקו ה-MACD חוצה מעלה את קו האיתות, זה סימן לתנופה קנייה.",
                                },
                                {
                                    tool: "סטוכסטיק (14, 5)",
                                    pass: taDetails.stoch_bullish,
                                    desc: "קו K מעל קו D",
                                    detail: taDetails.stoch_k != null
                                        ? `K: ${taDetails.stoch_k?.toFixed(1)} | D: ${taDetails.stoch_d?.toFixed(1)}`
                                        : "N/A",
                                    explain: "קריאה מתחת ל-20 עם חציית K מעל D = אזור קנייה.",
                                },
                                {
                                    tool: "ממוצע נע (10 ימים)",
                                    pass: taDetails.ma_bullish,
                                    desc: "מחיר מעל SMA-10",
                                    detail: taDetails.current_price != null
                                        ? `מחיר: $${taDetails.current_price?.toFixed(2)} | SMA10: $${taDetails.sma_10?.toFixed(2)}`
                                        : "N/A",
                                    explain: "מחיר מעל הממוצע הנע = מגמה חיובית קצרת-טווח.",
                                },
                            ].map((t) => (
                                <Card key={t.tool} className={`border-2 ${t.pass ? "border-green-700" : "border-red-700"}`}>
                                    <CardContent className="pt-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-bold text-sm">{t.tool}</span>
                                            <Badge className={t.pass ? "bg-green-700" : "bg-red-700"}>
                                                {t.pass ? "✅ ירוק" : "❌ אדום"}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-1">{t.desc}</p>
                                        <p className="text-xs font-mono text-blue-300 mb-2">{t.detail}</p>
                                        <p className="text-xs text-muted-foreground border-t border-border pt-2">{t.explain}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        <TechnicalCharts chartData={chartData} />

                        {!chartData.dates && (
                            <div className="text-center py-16 text-muted-foreground">
                                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                <p>נתוני גרף לא זמינים</p>
                            </div>
                        )}
                                        <div className="pt-2">
                                            {!patternData && !patternLoading && (
                                                <button
                                                    type="button"
                                                    onClick={loadPatterns}
                                                    className="mb-4 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                >
                                                    טען דפוסי גרף
                                                </button>
                                            )}
<div className="space-y-6">
                            {patternLoading ? (
                                <div className="text-center py-20 text-muted-foreground">
                                    <ScanSearch className="h-8 w-8 mx-auto mb-3 animate-pulse" />
                                    <p>מזהה דפוסים...</p>
                                </div>
                            ) : patternData ? (
                                <>
                                    <Card className="border-border">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <ScanSearch className="h-5 w-5 text-blue-400" />
                                                דפוסים טכניים
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <CandlestickChart data={patternData.ohlc || []} patterns={patternData.patterns || []} height={450} />
                                        </CardContent>
                                    </Card>
                                    {patternData.patterns?.length > 0 ? (
                                        <Card className="border-border">
                                            <CardHeader>
                                                <CardTitle>{patternData.patterns.length} דפוסים זוהו</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {patternData.patterns.map((p: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/20 border border-border">
                                                        <div>
                                                            <span className="font-bold text-sm">
                                                                {p.pattern_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                                            </span>
                                                            <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                                                            <p className="text-xs text-muted-foreground">{p.start_date} → {p.end_date}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <Badge variant="outline" className={p.confidence >= 0.8 ? "border-green-500/40 text-green-400" : p.confidence >= 0.6 ? "border-yellow-500/40 text-yellow-400" : "border-orange-500/40 text-orange-400"}>
                                                                {(p.confidence * 100).toFixed(0)}%
                                                            </Badge>
                                                            {p.target_price && <p className="text-xs text-blue-400 mt-1">יעד: ${p.target_price.toFixed(2)}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <p className="text-lg">לא זוהו דפוסים</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-20 text-muted-foreground">
                                    <p>לחץ על הכרטיסייה לטעינת ניתוח דפוסים</p>
                                </div>
                            )}
                        </div>
                                        </div>
    </div>
  );
}

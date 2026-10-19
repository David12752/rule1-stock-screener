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
import { STICKER_BREAKDOWN, VALUATION_METRICS } from "@/lib/metrics";
import { InfoHint } from "@/components/info-hint";

const fmtPct = (n: number | null | undefined) => pct(n);
const fmtCap = (n: number | null | undefined) => money(n);
const fmtNum = (n: number | null | undefined) => compact(n);

export function ValuationTab({ data, bd, md, calcGrowth, setCalcGrowth, calcROR, setCalcROR, calcMOS, setCalcMOS, isUndervalued }: { data: any; bd: any; md: any; calcGrowth: number | null; setCalcGrowth: (n: number | null) => void; calcROR: number; setCalcROR: (n: number) => void; calcMOS: number; setCalcMOS: (n: number) => void; isUndervalued: boolean }) {
  return (
    <div className="space-y-6">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Gauge */}
                            <Card className="border-border">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-1.5">
                                        מד שווי
                                        <InfoHint info={VALUATION_METRICS.sticker_price} />
                                    </CardTitle>
                                    <CardDescription>מחיר נוכחי יחסית למחיר המדבקה</CardDescription>
                                </CardHeader>
                                <CardContent className="flex justify-center py-4">
                                    <StickerPriceGauge
                                        currentPrice={data.price}
                                        stickerPrice={data.sticker_price}
                                        mosPrice={data.mos_price}
                                    />
                                </CardContent>
                            </Card>

                            {/* Sticker Price Breakdown */}
                            <Card className="border-border">
                                <CardHeader>
                                    <CardTitle>חישוב מחיר המדבקה – שלב אחר שלב</CardTitle>
                                    <CardDescription>שיטת פיל טאון – כלל מספר 1</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3 font-mono text-sm">
                                    {[
                                        {
                                            step: 1,
                                            label: STICKER_BREAKDOWN.current_eps.label,
                                            metricKey: "current_eps" as const,
                                            value: `$${fmt(bd.current_eps || data.ai_analysis?.current_eps || 0)}`,
                                            explain: STICKER_BREAKDOWN.current_eps.what,
                                        },
                                        {
                                            step: 2,
                                            label: STICKER_BREAKDOWN.estimated_growth.label,
                                            metricKey: "estimated_growth" as const,
                                            value: fmtPct(bd.estimated_growth),
                                            explain: STICKER_BREAKDOWN.estimated_growth.what,
                                        },
                                        {
                                            step: 3,
                                            label: STICKER_BREAKDOWN.future_eps.label,
                                            metricKey: "future_eps" as const,
                                            value: `$${fmt(bd.future_eps)}`,
                                            explain: `EPS × (1 + ${fmtPct(bd.estimated_growth)})^10`,
                                        },
                                        {
                                            step: 4,
                                            label: STICKER_BREAKDOWN.future_pe.label,
                                            metricKey: "future_pe" as const,
                                            value: fmt(bd.future_pe),
                                            explain: STICKER_BREAKDOWN.future_pe.what,
                                        },
                                        {
                                            step: 5,
                                            label: "מחיר עתידי",
                                            value: `$${fmt(bd.future_price)}`,
                                            explain: `EPS עתידי × P/E עתידי`,
                                        },
                                        {
                                            step: 6,
                                            label: VALUATION_METRICS.sticker_price.label,
                                            metricKey: "sticker_price" as const,
                                            value: `$${fmt(bd.sticker_price)}`,
                                            explain: `מחיר עתידי / (1.15)^10 = תשואה של 15% לשנה`,
                                            highlight: true,
                                        },
                                        {
                                            step: 7,
                                            label: VALUATION_METRICS.mos_price.label,
                                            metricKey: "mos_price" as const,
                                            value: `$${fmt(bd.mos_price)}`,
                                            explain: `מחיר המדבקה × 50% – שולי הביטחון`,
                                            highlight: true,
                                        },
                                    ].map((s) => (
                                        <div key={s.step} className={`flex justify-between items-start p-3 rounded-lg ${s.highlight ? "bg-green-950/20 border border-green-800" : "bg-muted/10 border border-border"}`}>
                                            <div>
                                                <span className="text-muted-foreground text-xs">שלב {s.step}: </span>
                                                <span className={`inline-flex items-center gap-1 font-bold ${s.highlight ? "text-green-300" : ""}`}>
                                                    {s.label}
                                                    {"metricKey" in s && s.metricKey && STICKER_BREAKDOWN[s.metricKey as keyof typeof STICKER_BREAKDOWN] ? (
                                                        <InfoHint info={STICKER_BREAKDOWN[s.metricKey as keyof typeof STICKER_BREAKDOWN]} />
                                                    ) : "metricKey" in s && s.metricKey && VALUATION_METRICS[s.metricKey as keyof typeof VALUATION_METRICS] ? (
                                                        <InfoHint info={VALUATION_METRICS[s.metricKey as keyof typeof VALUATION_METRICS]} />
                                                    ) : null}
                                                </span>
                                                <p className="text-xs text-muted-foreground mt-0.5">{s.explain}</p>
                                            </div>
                                            <span className={`text-base font-bold shrink-0 ml-4 ${s.highlight ? "text-green-300" : ""}`}>{s.value}</span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Price Zones Summary */}
                        <Card className="border-border">
                            <CardHeader>
                                <CardTitle>אזורי מחיר</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    {[
                                        {
                                            label: "מחיר נוכחי",
                                            value: `$${fmt(data.price)}`,
                                            color: isUndervalued ? "text-green-400" : "text-yellow-400",
                                            bg: isUndervalued ? "bg-green-950/20 border-green-700" : "bg-yellow-950/20 border-yellow-700"
                                        },
                                        {
                                            label: "מחיר MOS (50% ביטחון)",
                                            value: `$${fmt(data.mos_price)}`,
                                            sublabel: "קנה כאן",
                                            color: "text-green-400",
                                            bg: "bg-green-950/20 border-green-700"
                                        },
                                        {
                                            label: "מחיר מדבקה",
                                            value: `$${fmt(data.sticker_price)}`,
                                            sublabel: "שווי הוגן",
                                            color: "text-yellow-400",
                                            bg: "bg-yellow-950/20 border-yellow-700"
                                        },
                                        {
                                            label: "מחיר יעד אנליסטים",
                                            value: md.analyst_target_price ? `$${fmt(md.analyst_target_price)}` : "N/A",
                                            color: "text-blue-400",
                                            bg: "bg-blue-950/20 border-blue-700"
                                        },
                                    ].map((z) => (
                                        <div key={z.label} className={`p-4 rounded-lg border ${z.bg}`}>
                                            <div className="text-xs text-muted-foreground mb-1">{z.label}</div>
                                            <div className={`text-2xl font-bold ${z.color}`}>{z.value}</div>
                                            {z.sublabel && <div className="text-xs text-muted-foreground mt-1">{z.sublabel}</div>}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Interactive Sticker Price Calculator */}
                        {bd.current_eps > 0 && (() => {
                            const defaultGrowth = Math.round((bd.estimated_growth || 0.10) * 100);
                            const g = (calcGrowth ?? defaultGrowth) / 100;
                            const ror = calcROR / 100;
                            const mosFactor = calcMOS / 100;
                            const futureEPS = (bd.current_eps || 0) * Math.pow(1 + g, 10);
                            const futurePE = Math.min(g * 2 * 100, 80);
                            const futurePrice = futureEPS * futurePE;
                            const calcSticker = futurePrice / Math.pow(1 + ror, 10);
                            const calcMOSPrice = calcSticker * (1 - mosFactor);
                            const currentPrice = data.price;
                            const underCalc = currentPrice < calcMOSPrice;

                            return (
                                <Card className="border-blue-700/50 bg-blue-950/10">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-blue-300">
                                            מחשבון מחיר מדבקה אינטראקטיבי
                                        </CardTitle>
                                        <CardDescription>שנה את הפרמטרים וראה את השפעתם בזמן אמת</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {/* Growth Rate Slider */}
                                            <div>
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-sm font-medium">שיעור צמיחה מוערך</label>
                                                    <span className="text-sm font-bold text-blue-400 font-mono">
                                                        {calcGrowth ?? defaultGrowth}%
                                                    </span>
                                                </div>
                                                <input
                                                    type="range" min={1} max={30} step={1}
                                                    value={calcGrowth ?? defaultGrowth}
                                                    onChange={e => setCalcGrowth(Number(e.target.value))}
                                                    className="w-full accent-blue-500 cursor-pointer"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                    <span>1%</span>
                                                    <span className="text-green-400">ברירת מחדל: {defaultGrowth}%</span>
                                                    <span>30%</span>
                                                </div>
                                            </div>

                                            {/* Required Rate of Return */}
                                            <div>
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-sm font-medium">תשואה נדרשת (ROR)</label>
                                                    <span className="text-sm font-bold text-blue-400 font-mono">{calcROR}%</span>
                                                </div>
                                                <input
                                                    type="range" min={5} max={25} step={1}
                                                    value={calcROR}
                                                    onChange={e => setCalcROR(Number(e.target.value))}
                                                    className="w-full accent-blue-500 cursor-pointer"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                    <span>5%</span>
                                                    <span className="text-green-400">ברירת מחדל: 15%</span>
                                                    <span>25%</span>
                                                </div>
                                            </div>

                                            {/* Margin of Safety */}
                                            <div>
                                                <div className="flex justify-between mb-2">
                                                    <label className="text-sm font-medium">שולי ביטחון (MOS)</label>
                                                    <span className="text-sm font-bold text-blue-400 font-mono">{calcMOS}%</span>
                                                </div>
                                                <input
                                                    type="range" min={10} max={70} step={5}
                                                    value={calcMOS}
                                                    onChange={e => setCalcMOS(Number(e.target.value))}
                                                    className="w-full accent-blue-500 cursor-pointer"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                    <span>10%</span>
                                                    <span className="text-green-400">ברירת מחדל: 50%</span>
                                                    <span>70%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Results */}
                                        <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl border-2 ${underCalc ? "border-green-600 bg-green-950/20" : "border-red-700 bg-red-950/10"}`}>
                                            <div className="text-center">
                                                <div className="text-xs text-muted-foreground mb-1">EPS עתידי (10Y)</div>
                                                <div className="text-lg font-bold font-mono">${futureEPS.toFixed(2)}</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs text-muted-foreground mb-1">מחיר מדבקה</div>
                                                <div className="text-lg font-bold font-mono text-yellow-400">${calcSticker.toFixed(2)}</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs text-muted-foreground mb-1">מחיר MOS ({calcMOS}%)</div>
                                                <div className={`text-lg font-bold font-mono ${underCalc ? "text-green-400" : "text-red-400"}`}>
                                                    ${calcMOSPrice.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs text-muted-foreground mb-1">מחיר נוכחי</div>
                                                <div className={`text-xl font-bold font-mono ${underCalc ? "text-green-400" : "text-red-400"}`}>
                                                    {underCalc ? "✅ זול!" : "❌ יקר"}
                                                </div>
                                                <div className="text-xs font-mono text-muted-foreground">${fmt(currentPrice)}</div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => { setCalcGrowth(null); setCalcROR(15); setCalcMOS(50); }}
                                            className="text-xs text-muted-foreground hover:text-foreground underline"
                                        >
                                            איפוס לברירות מחדל
                                        </button>
                                    </CardContent>
                                </Card>
                            );
                        })()}
    </div>
  );
}

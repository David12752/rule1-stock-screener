"use client";

import { memo, useMemo } from "react";
import {
    Bar,
    Cell,
    ComposedChart,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface TechnicalChartData {
    dates?: string[];
    prices?: number[];
    sma_10?: number[];
    sma_30?: number[];
    macd_line?: number[];
    macd_signal_line?: number[];
    macd_histogram?: number[];
    stoch_k?: number[];
    stoch_d?: number[];
}

const TOOLTIP_STYLE = { backgroundColor: "var(--card)", borderColor: "var(--border)" };
const formatTick = (v: string) => v?.slice(5);

/**
 * The three technical charts, split out of the stock page.
 *
 * They were inlined in the page body, so every one of the ~250-point series was
 * rebuilt on each render - including on every drag tick of the sticker-price
 * sliders, which have nothing to do with technicals. Recharts also re-renders
 * whenever its `data` prop changes identity, so the fresh arrays defeated its own
 * bail-outs. Memoizing the series and wrapping the component in `memo` means the
 * charts only recompute when the underlying series actually change.
 */
export const TechnicalCharts = memo(function TechnicalCharts({
    chartData,
}: {
    chartData: TechnicalChartData;
}) {
    const { dates, prices, sma_10, sma_30 } = chartData;
    const { macd_line, macd_signal_line, macd_histogram } = chartData;
    const { stoch_k, stoch_d } = chartData;

    const priceSeries = useMemo(
        () =>
            (dates ?? []).map((d, i) => ({
                date: d,
                price: prices?.[i],
                sma10: sma_10?.[i],
                sma30: sma_30?.[i],
            })),
        [dates, prices, sma_10, sma_30]
    );

    const macdSeries = useMemo(
        () =>
            (dates ?? []).map((d, i) => ({
                date: d,
                hist: macd_histogram?.[i],
                macd: macd_line?.[i],
                signal: macd_signal_line?.[i],
            })),
        [dates, macd_histogram, macd_line, macd_signal_line]
    );

    const stochSeries = useMemo(
        () =>
            (dates ?? []).map((d, i) => ({
                date: d,
                k: stoch_k?.[i],
                d: stoch_d?.[i],
            })),
        [dates, stoch_k, stoch_d]
    );

    if (!dates || dates.length === 0) return null;

    return (
        <>
            <Card className="border-border">
                <CardHeader>
                    <CardTitle>מחיר + ממוצעים נעים</CardTitle>
                    <CardDescription>
                        90 יום אחרונים | SMA-10 (ירוק) • SMA-30 (כחול)
                    </CardDescription>
                </CardHeader>
                <CardContent className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceSeries}>
                            <XAxis
                                dataKey="date"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatTick}
                                interval={14}
                            />
                            <YAxis
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                domain={["auto", "auto"]}
                            />
                            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="price" stroke="#e2e8f0" strokeWidth={2} dot={false} name="מחיר" />
                            <Line type="monotone" dataKey="sma10" stroke="#22c55e" strokeWidth={1.5} dot={false} name="SMA-10" strokeDasharray="4 2" />
                            <Line type="monotone" dataKey="sma30" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="SMA-30" strokeDasharray="4 2" />
                            <Legend />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle>MACD (8, 17, 9)</CardTitle>
                    <CardDescription>
                        קו MACD (ירוק) • קו איתות (כתום) • היסטוגרמה
                    </CardDescription>
                </CardHeader>
                <CardContent className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={macdSeries}>
                            <XAxis
                                dataKey="date"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatTick}
                                interval={14}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} />
                            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                            <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                            <Bar dataKey="hist" name="היסטוגרמה">
                                {(macd_histogram ?? []).map((v, i) => (
                                    <Cell key={i} fill={v >= 0 ? "#22c55e" : "#ef4444"} />
                                ))}
                            </Bar>
                            <Line type="monotone" dataKey="macd" stroke="#22c55e" strokeWidth={1.5} dot={false} name="MACD" />
                            <Line type="monotone" dataKey="signal" stroke="#f97316" strokeWidth={1.5} dot={false} name="איתות" />
                            <Legend />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle>סטוכסטיק (14, 5)</CardTitle>
                    <CardDescription>
                        K (ירוק) • D (כחול) | אזור קנייה: מתחת ל-20 | אזור מכירה: מעל ל-80
                    </CardDescription>
                </CardHeader>
                <CardContent className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stochSeries}>
                            <XAxis
                                dataKey="date"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatTick}
                                interval={14}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                            <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "80", fill: "#ef4444", fontSize: 10 }} />
                            <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "20", fill: "#22c55e", fontSize: 10 }} />
                            <Line type="monotone" dataKey="k" stroke="#22c55e" strokeWidth={1.5} dot={false} name="K" />
                            <Line type="monotone" dataKey="d" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="D" />
                            <Legend />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </>
    );
});

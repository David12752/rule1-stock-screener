"use client";

import { useEffect, useRef, useCallback } from "react";
import {
    createChart,
    ColorType,
    IChartApi,
    ISeriesApi,
    CandlestickData,
    HistogramData,
    Time,
    CandlestickSeries,
    HistogramSeries,
} from "lightweight-charts";

interface OHLCData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

interface PatternKeyPoint {
    date: string;
    price: number;
    label: string;
    index?: number;
}

interface PatternOverlay {
    pattern_type: string;
    confidence: number;
    key_points: PatternKeyPoint[];
    target_price?: number;
}

interface CandlestickChartProps {
    data: OHLCData[];
    patterns?: PatternOverlay[];
    height?: number;
    showVolume?: boolean;
    className?: string;
}

// Color palette
const COLORS = {
    background: "#0a0a0a",
    gridLines: "#1a1a2e",
    text: "#9ca3af",
    upColor: "#22c55e",
    downColor: "#ef4444",
    volumeUp: "rgba(34, 197, 94, 0.3)",
    volumeDown: "rgba(239, 68, 68, 0.3)",
    patternLine: "#eab308",
    targetLine: "#3b82f6",
    markerBullish: "#22c55e",
    markerBearish: "#ef4444",
};

export function CandlestickChart({
    data,
    patterns = [],
    height = 500,
    showVolume = true,
    className = "",
}: CandlestickChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<any>(null);
    const volumeSeriesRef = useRef<any>(null);

    const initChart = useCallback(() => {
        if (!chartContainerRef.current || !data.length) return;

        // Clean up existing chart
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: COLORS.background },
                textColor: COLORS.text,
                fontFamily: "'Inter', 'Roboto Mono', monospace",
            },
            grid: {
                vertLines: { color: COLORS.gridLines },
                horzLines: { color: COLORS.gridLines },
            },
            width: chartContainerRef.current.clientWidth,
            height: height,
            crosshair: {
                mode: 0, // Normal
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: {
                    top: 0.1,
                    bottom: showVolume ? 0.25 : 0.1,
                },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: false,
            },
        });

        chartRef.current = chart;

        // Candlestick series
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: COLORS.upColor,
            downColor: COLORS.downColor,
            borderUpColor: COLORS.upColor,
            borderDownColor: COLORS.downColor,
            wickUpColor: COLORS.upColor,
            wickDownColor: COLORS.downColor,
        });

        const candleData: CandlestickData[] = data.map((d) => ({
            time: d.time as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));
        candleSeries.setData(candleData);
        candleSeriesRef.current = candleSeries;

        // Volume series
        if (showVolume) {
            const volumeSeries = chart.addSeries(HistogramSeries, {
                priceFormat: { type: "volume" },
                priceScaleId: "volume",
            });

            chart.priceScale("volume").applyOptions({
                scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                },
            });

            const volData: HistogramData[] = data.map((d) => ({
                time: d.time as Time,
                value: d.volume || 0,
                color: d.close >= d.open ? COLORS.volumeUp : COLORS.volumeDown,
            }));
            volumeSeries.setData(volData);
            volumeSeriesRef.current = volumeSeries;
        }

        // Pattern overlays — price lines for key points
        if (patterns.length > 0 && candleSeries) {
            for (const pattern of patterns) {
                // Add target price line if available
                if (pattern.target_price) {
                    candleSeries.createPriceLine({
                        price: pattern.target_price,
                        color: COLORS.targetLine,
                        lineWidth: 1,
                        lineStyle: 2, // Dashed
                        axisLabelVisible: true,
                        title: `יעד: $${pattern.target_price.toFixed(2)}`,
                    });
                }

                // Add key point price lines
                const isBullish = [
                    "cup_and_handle",
                    "inverse_head_and_shoulders",
                    "double_bottom",
                    "ascending_triangle",
                    "bull_flag",
                ].includes(pattern.pattern_type);

                for (const kp of pattern.key_points) {
                    candleSeries.createPriceLine({
                        price: kp.price,
                        color: isBullish ? COLORS.markerBullish : COLORS.markerBearish,
                        lineWidth: 1,
                        lineStyle: 3, // Dotted
                        axisLabelVisible: false,
                        title: kp.label,
                    });
                }
            }
        }

        // Fit content
        chart.timeScale().fitContent();
    }, [data, patterns, height, showVolume]);

    // Initialize chart
    useEffect(() => {
        initChart();
        return () => {
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [initChart]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    if (!data.length) {
        return (
            <div className={`flex items-center justify-center h-[${height}px] text-muted-foreground ${className}`}>
                No chart data available
            </div>
        );
    }

    return <div ref={chartContainerRef} className={`w-full ${className}`} />;
}

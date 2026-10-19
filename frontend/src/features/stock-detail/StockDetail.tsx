"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TabShell } from "@/components/ui/tab-shell";
import {
    Users, BarChart3, AlertTriangle, ChevronRight,
    DollarSign, Calculator, Brain, Activity, Target, Clock,
    Gauge, PieChart, TrendingUp, TrendingDown,
} from "lucide-react";
import { WatchlistButton } from "@/components/watchlist-button";
import { FalseNegativeButton } from "@/components/false-negative-button";
import { fmt, pct, money, compact } from "@/lib/format";
import {
    VERDICT_CLS,
    VERDICT_EXPLANATION,
    VERDICT_HE_RICH,
} from "@/lib/verdict";
import { MARKET_RATIOS, VALUATION_METRICS, BIG5_METRICS } from "@/lib/metrics";
import { InfoHint } from "@/components/info-hint";
import { apiGet } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { OverviewTab } from "./tabs/OverviewTab";
import { ValuationTab } from "./tabs/ValuationTab";
import { DeepAnalysisTab } from "./tabs/DeepAnalysisTab";
import { TechnicalsTab } from "./tabs/TechnicalsTab";

const fmtPct = (n: number | null | undefined) => pct(n);
const fmtCap = (n: number | null | undefined) => money(n);
const fmtNum = (n: number | null | undefined) => compact(n);

/** 4 clear tabs — old ids (report/big5/financials/insights) alias to deep. */
const STOCK_TABS = [
    { id: "overview", label: "סקירה", icon: Gauge },
    { id: "valuation", label: "שווי", icon: Calculator },
    { id: "deep", label: "ניתוח עומק", icon: Brain },
    { id: "technicals", label: "טכני", icon: Activity },
];

const TAB_ALIASES: Record<string, string> = {
    report: "deep",
    big5: "deep",
    financials: "deep",
    insights: "deep",
    analysis: "deep",
};

function MetricCard({
    label,
    value,
    metricKey,
    highlight,
    icon: Icon,
}: {
    label: string;
    value: string;
    metricKey?: string;
    highlight?: "green" | "red";
    icon?: ComponentType<{ className?: string }>;
}) {
    const info =
        metricKey
            ? MARKET_RATIOS[metricKey] || BIG5_METRICS[metricKey] || undefined
            : undefined;
    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-center hover:border-white/[0.12] transition-colors">
            <div className="mb-0.5 flex items-center justify-center gap-1">
                {Icon && <Icon className="h-3 w-3 text-muted-foreground/60" />}
                <span className="text-[10px] text-muted-foreground">{label}</span>
                {info && <InfoHint info={info} />}
            </div>
            <div className={"text-sm font-bold font-mono " + (highlight === "green" ? "text-emerald-400" : highlight === "red" ? "text-red-400" : "text-foreground")}>
                {value}
            </div>
        </div>
    );
}

function HeroMetric({
    label,
    value,
    infoKey,
}: {
    label: string;
    value: string;
    infoKey: keyof typeof VALUATION_METRICS;
}) {
    const info = VALUATION_METRICS[infoKey];
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>{label}</span>
            {info ? <InfoHint info={info} /> : null}
            <span className="font-mono text-foreground">{value}</span>
        </span>
    );
}

export default function StockDetail() {
    const { ticker } = useParams();
    const symbol = String(ticker || "").toUpperCase();

    const [patternData, setPatternData] = useState<any>(null);
    const [patternLoading, setPatternLoading] = useState(false);
    const [calcGrowth, setCalcGrowth] = useState<number | null>(null);
    const [calcROR, setCalcROR] = useState(15);
    const [calcMOS, setCalcMOS] = useState(50);

    const {
        data,
        isPending: loading,
        error: queryError,
    } = useQuery({
        queryKey: queryKeys.stock(symbol),
        queryFn: ({ signal }) => apiGet<any>(`/stock/${encodeURIComponent(symbol)}`, signal),
        enabled: !!symbol,
        // Backend overlays a live quote on every response; poll so the header
        // price tracks the tape without re-running fundamentals.
        refetchInterval: 15_000,
        staleTime: 8_000,
        refetchOnWindowFocus: true,
    });
    const error = queryError
        ? queryError instanceof Error
            ? queryError.message
            : "Unknown error"
        : null;

    const normalizedData = useMemo(
        () =>
            data?.financial_history?.map((item: any, idx: number, arr: any[]) => {
                const first = arr[0];
                return {
                    ...item,
                    year: item.date ? new Date(item.date).getFullYear() : idx,
                    sales_norm: first.sales ? (item.sales / first.sales) * 100 : 100,
                    eps_norm: first.eps ? (item.eps / first.eps) * 100 : 100,
                    equity_norm: first.equity ? (item.equity / first.equity) * 100 : 100,
                    fcf_norm: first.fcf ? (item.fcf / first.fcf) * 100 : 100,
                };
            }) || [],
        [data?.financial_history]
    );

    const loadPatterns = async () => {
        if (!symbol || patternData || patternLoading) return;
        setPatternLoading(true);
        try {
            const payload = await apiGet<any>(
                `/scanner/stock/${encodeURIComponent(symbol)}/patterns`
            );
            setPatternData(payload);
        } catch {
            /* ignore */
        } finally {
            setPatternLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
                <Skeleton className="h-14 w-full shrink-0 rounded-lg" />
                <Skeleton className="min-h-0 flex-1 rounded-xl" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-7xl space-y-4 p-8">
                <Link href="/?tab=quality" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-4 w-4 rotate-180" /> חזרה ללוח בקרה
                </Link>
                <div className="py-20 text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-950/30">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                    </div>
                    <h2 className="mb-2 text-2xl font-bold text-red-400">שגיאה בטעינת הנתונים</h2>
                    <p className="mx-auto max-w-md text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return <div className="p-8 text-center text-muted-foreground">אין נתונים זמינים</div>;
    }

    const md = data.market_data || {};
    const bd = data.sticker_price_breakdown || {};
    const vd = data.verdict_details || {};
    const ta = data.technical_analysis || {};
    const taDetails = ta.details || {};
    const chartData = ta.chart_data || {};

    const isUndervalued = data.price > 0 && data.mos_price > 0 && data.price < data.mos_price;
    const discountPct = data.sticker_price > 0
        ? ((data.sticker_price - data.price) / data.sticker_price * 100).toFixed(0)
        : null;

    const big5Entries = Object.entries(data.big_5 || {});
    const big5PassCount = big5Entries.filter(([, v]: any) => v?.consistent_growth).length;
    const big5Total = big5Entries.length;

    const checklist = [
        { label: "Big 5 צמיחה עקבית >10%", pass: vd.big5_pass, detail: `${big5PassCount}/${big5Total} מדדים עוברים`, key: "big5" },
        { label: "זמן החזר חוב <3 שנים", pass: vd.payback_ok ?? (data.payback_time <= 3), detail: `${data.payback_time} שנים`, key: "debtPayoff" },
        { label: "מחיר מתחת ל-MOS (50% הנחה)", pass: vd.undervalued, detail: isUndervalued ? `${discountPct}% הנחה` : "מחיר גבוה מ-MOS", key: "mos" },
        { label: "איתות טכני ירוק (3 כלים)", pass: vd.green_signal, detail: ta.signal === "Green" ? "MACD + Stoch + MA ירוקים" : "איתות אדום", key: "rule1" },
        { label: "ציון חפיר ≥7", pass: (data.ai_analysis?.moat_score || 0) >= 7, detail: `ציון ${data.ai_analysis?.moat_score || 0}/10`, key: "moat" },
    ];
    const checklistPassCount = checklist.filter((c) => c.pass).length;

    const marketCards = (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCard label="שווי שוק" value={fmtCap(md.market_cap)} metricKey="market_cap" icon={PieChart} />
            <MetricCard label="מכפיל רווח" value={fmt(md.pe_ratio, 1)} metricKey="pe_ratio" icon={Target} />
            <MetricCard label="מכפיל מכירות" value={md.ps_ratio ? fmt(md.ps_ratio, 1) : "—"} metricKey="ps_ratio" icon={DollarSign} />
            <MetricCard label="EV/EBITDA" value={fmt(md.ev_ebitda, 1)} metricKey="ev_ebitda" icon={Gauge} />
            <MetricCard label="חוב/הון" value={md.debt_to_equity ? fmt(md.debt_to_equity / 100, 2) : "—"} metricKey="debt_to_equity" icon={TrendingDown} />
            <MetricCard label="בטא" value={fmt(md.beta, 2)} metricKey="beta" icon={Activity} />
            <MetricCard label="תשואה על הון" value={fmtPct(md.return_on_equity)} metricKey="roe" icon={TrendingUp} />
            <MetricCard label="מרווח נקי" value={fmtPct(md.profit_margins)} metricKey="profit_margins" icon={DollarSign} />
            <MetricCard label="מרווח גולמי" value={fmtPct(md.gross_margins)} metricKey="gross_margins" icon={BarChart3} />
            <MetricCard label="דיבידנד" value={md.dividend_yield ? fmtPct(md.dividend_yield) : "אין"} metricKey="dividend_yield" icon={DollarSign} />
            <MetricCard label="זמן החזר" value={`${data.payback_time} שנים`} highlight={data.payback_time <= 3 ? "green" : "red"} icon={Clock} />
            <MetricCard label="עובדים" value={fmtNum(md.employees)} metricKey="employees" icon={Users} />
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
            {/* Compact sticky hero — tabs own remaining viewport */}
            <header className="shrink-0 border-b border-white/[0.06] px-3 py-1.5 md:px-4">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Link
                        href="/?tab=quality"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        לוח בקרה
                    </Link>
                    <ChevronRight className="h-3 w-3 opacity-40" />
                    <h1 className="font-mono text-lg font-bold tracking-tight md:text-xl">
                        {data.symbol}
                    </h1>
                    <span className="max-w-[10rem] truncate text-xs text-muted-foreground md:max-w-[14rem]">
                        {data.company_name}
                    </span>
                    <span className="font-mono text-base font-bold">${fmt(data.price)}</span>
                    {data.price_change_pct != null && (
                        <span
                            className={`font-mono text-xs font-semibold ${
                                data.price_change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                        >
                            {data.price_change_pct >= 0 ? "+" : ""}
                            {fmt(data.price_change_pct, 2)}%
                        </span>
                    )}
                    {data.price_live && (
                        <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20"
                            title={data.price_as_of ? `עודכן ${data.price_as_of}` : "מחיר חי"}
                        >
                            LIVE
                        </span>
                    )}
                    <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            VERDICT_CLS[data.verdict] || "bg-muted text-muted-foreground"
                        }`}
                    >
                        {VERDICT_HE_RICH[data.verdict] || data.verdict}
                    </span>
                    <Badge
                        variant="outline"
                        className={`text-[10px] ${
                            ta.signal === "Green"
                                ? "border-green-500/50 bg-green-950/20 text-green-400"
                                : "border-red-500/50 bg-red-950/20 text-red-400"
                        }`}
                    >
                        {ta.signal === "Green" ? "איתות קנייה" : "איתות המתנה"}
                    </Badge>
                    {isUndervalued && (
                        <Badge className="bg-green-600/80 text-[10px] text-white">
                            {discountPct}% מתחת לשווי
                        </Badge>
                    )}
                    <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                        <HeroMetric
                            label="מרווח ביטחון"
                            value={`$${fmt(data.mos_price)}`}
                            infoKey="mos_price"
                        />
                        <HeroMetric
                            label="מחיר מדבקה"
                            value={`$${fmt(data.sticker_price)}`}
                            infoKey="sticker_price"
                        />
                        <HeroMetric
                            label="חפיר"
                            value={`${data.ai_analysis?.moat_score ?? 0}/10`}
                            infoKey="moat_score"
                        />
                        <WatchlistButton symbol={data.symbol} size="sm" />
                        <FalseNegativeButton symbol={data.symbol} verdict={data.verdict} />
                    </div>
                </div>
                {(VERDICT_EXPLANATION[data.verdict] || data.verdict_reason) && (
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                        {VERDICT_EXPLANATION[data.verdict] || data.verdict_reason}
                    </p>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-1.5 md:px-3">
                <TabShell
                    tabs={[...STOCK_TABS]}
                    defaultTab="overview"
                    aliases={TAB_ALIASES}
                    className="h-full rounded-xl border border-white/[0.06] bg-black/10"
                >
                    {(tab) => (
                        <>
                            {tab === "overview" && (
                                <OverviewTab
                                    data={data}
                                    normalizedData={normalizedData}
                                    checklist={checklist}
                                    checklistPassCount={checklistPassCount}
                                    md={md}
                                    marketCards={marketCards}
                                />
                            )}
                            {tab === "valuation" && (
                                <ValuationTab
                                    data={data}
                                    bd={bd}
                                    md={md}
                                    calcGrowth={calcGrowth}
                                    setCalcGrowth={setCalcGrowth}
                                    calcROR={calcROR}
                                    setCalcROR={setCalcROR}
                                    calcMOS={calcMOS}
                                    setCalcMOS={setCalcMOS}
                                    isUndervalued={isUndervalued}
                                />
                            )}
                            {tab === "deep" && (
                                <DeepAnalysisTab
                                    data={data}
                                    normalizedData={normalizedData}
                                    md={md}
                                    symbol={symbol}
                                />
                            )}
                            {tab === "technicals" && (
                                <TechnicalsTab
                                    data={data}
                                    ta={ta}
                                    taDetails={taDetails}
                                    chartData={chartData}
                                    patternData={patternData}
                                    patternLoading={patternLoading}
                                    loadPatterns={loadPatterns}
                                    symbol={symbol}
                                />
                            )}
                        </>
                    )}
                </TabShell>
            </div>
        </div>
    );
}

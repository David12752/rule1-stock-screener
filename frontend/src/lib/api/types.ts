/**
 * Response shapes for the endpoints the Workspace reads.
 *
 * Only the fields the UI actually renders are declared. The backend returns a
 * good deal more, and typing all of it would rot faster than it would help.
 */

export interface Big5Metric {
    cagr_1y?: number | null;
    cagr_3y?: number | null;
    cagr_5y?: number | null;
    cagr_10y?: number | null;
    consistent_growth?: boolean;
    latest_value?: number | null;
    /** `"ratio"` for ROIC/ROE levels; omitted/growth for CAGR metrics. */
    unit?: "ratio" | "currency" | string | null;
}

export interface StockAnalysis {
    symbol: string;
    company_name?: string;
    short_name?: string;
    sector?: string | null;
    price: number;
    sticker_price: number;
    mos_price: number;
    verdict?: string;
    verdict_reason?: string;
    /** Structured codes for localised reasoning (preferred over English prose). */
    verdict_primary?: string;
    verdict_modifiers?: { code: string }[];
    verdict_failures?: Array<{ code: string; years?: number; limit?: number }>;
    payback_time?: number;
    big_5?: Record<string, Big5Metric | undefined>;
    sticker_price_breakdown?: {
        current_eps: number;
        estimated_growth: number;
        future_eps: number;
        future_pe: number;
        future_price: number;
    };
    technical_analysis?: { signal?: string };
    ai_analysis?: {
        moat_score?: number;
        moat_type?: string;
        moat_analysis?: string;
    };
    market_data?: {
        sector?: string | null;
        market_cap?: number;
        long_business_summary?: string;
        long_business_summary_en?: string | null;
    };
    data_quality?: { incomplete?: boolean; issues?: string[] };
    split_adjustment?: { applied?: boolean; max_factor?: number; split_events?: number };
}

/** `/portfolio` has been served by two writers, hence the alias fields. */
export interface Holding {
    symbol?: string;
    ticker?: string;
    shares?: number;
    quantity?: number;
    avg_cost?: number;
    cost_basis?: number;
    current_price?: number;
    pnl?: number;
    pnl_pct?: number;
}

export interface PerformanceSummary {
    library?: {
        buy_count?: number;
        incomplete_pct?: number;
        verdicts?: Record<string, number>;
    };
    scanner?: { overlap_with_quality?: number };
    portfolio?: { pnl?: number; pnl_pct?: number };
    database?: {
        archives?: number;
        persisted_analyses?: number;
        recent_archives?: Array<{
            id: number | string;
            kind?: string;
            title?: string;
            universe?: string;
            created_at?: string;
            row_count?: number;
        }>;
    };
}

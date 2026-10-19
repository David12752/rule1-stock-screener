/**
 * Shared number formatting for dense financial tables.
 *
 * `fmt` groups thousands, which matters for index levels and prices that run
 * into four figures. Missing values render as an em dash rather than "N/A" so
 * that columns of numbers stay visually aligned.
 */
export function fmt(n: number | null | undefined, decimals = 2): string {
    if (n == null || Number.isNaN(n)) return "—";
    return n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Format a 0–1 (or already-percent) ratio as `12.3%`. */
export function pct(
    n: number | null | undefined,
    { alreadyPercent = false, decimals = 1 }: { alreadyPercent?: boolean; decimals?: number } = {}
): string {
    if (n == null || Number.isNaN(n)) return "—";
    const v = alreadyPercent ? n : n * 100;
    return `${v.toFixed(decimals)}%`;
}

/** Compact market-cap style: $1.2T / $3.4B / $56M. */
export function money(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n) || n === 0) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
    return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Compact count: 1.2B / 3.4M / 56K. */
export function compact(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n) || n === 0) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
    return `${sign}${abs.toString()}`;
}

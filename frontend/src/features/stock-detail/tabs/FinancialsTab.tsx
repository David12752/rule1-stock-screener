"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmt, pct } from "@/lib/format";
import {
  BIG5_METRICS,
  CONSISTENCY_HE,
  MARKET_RATIOS,
} from "@/lib/metrics";
import { InfoHint } from "@/components/info-hint";

const RATIO_KEYS = [
  "gross_margins",
  "operating_margins",
  "profit_margins",
  "return_on_assets",
  "current_ratio",
  "pe_ratio",
  "ev_ebitda",
  "pb_ratio",
] as const;

function formatRatio(key: string, raw: unknown): string {
  if (raw == null) return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return "—";
  if (
    key === "gross_margins" ||
    key === "operating_margins" ||
    key === "profit_margins" ||
    key === "return_on_assets" ||
    key === "dividend_yield"
  ) {
    return pct(n);
  }
  return fmt(n, key === "current_ratio" ? 2 : 1);
}

export function FinancialsTab({ data, md }: { data: any; md: any }) {
  return (
    <div className="">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RATIO_KEYS.map((key) => {
            const info = MARKET_RATIOS[key];
            if (!info) return null;
            return (
              <div
                key={key}
                className="rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="mb-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  {info.label}
                  <InfoHint info={info} />
                </div>
                <div className="text-center text-lg font-bold font-mono">
                  {formatRatio(key, md?.[key])}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  {info.what}
                  {info.rule ? ` · ${info.rule}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {Object.keys(data.big_5 || {}).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Big 5 – שיעורי צמיחה</CardTitle>
              <CardDescription>
                CAGR לאורך טווחי זמן שונים (&gt;10% = עובר לפי Rule #1)
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4 text-left">מדד</th>
                    <th className="px-4 py-2 text-right">1Y</th>
                    <th className="px-4 py-2 text-right">3Y</th>
                    <th className="px-4 py-2 text-right">5Y</th>
                    <th className="px-4 py-2 text-right">10Y</th>
                    <th className="py-2 pl-4 text-right">עקבי?</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.big_5).map(([key, val]: [string, any]) => {
                    const info = BIG5_METRICS[key];
                    return (
                      <tr key={key} className="border-b border-border/40">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1 font-bold font-sans text-sm">
                            {info?.label || key.toUpperCase()}
                            {info && <InfoHint info={info} />}
                          </div>
                          {info && (
                            <div className="mt-0.5 max-w-[220px] font-sans text-[10px] font-normal text-muted-foreground leading-snug">
                              {info.what}
                            </div>
                          )}
                        </td>
                        {[val?.cagr_1y, val?.cagr_3y, val?.cagr_5y, val?.cagr_10y].map(
                          (v: any, i: number) => (
                            <td
                              key={i}
                              className={`px-4 py-2 text-right font-mono ${
                                v >= 0.1
                                  ? "text-green-400"
                                  : v >= 0.05
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }`}
                            >
                              {v != null ? `${(v * 100).toFixed(1)}%` : "N/A"}
                            </td>
                          )
                        )}
                        <td
                          className={`py-2 pl-4 text-right font-bold font-sans text-xs ${
                            val?.consistent_growth ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {val?.consistent_growth
                            ? CONSISTENCY_HE.pass
                            : CONSISTENCY_HE.fail}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>נתונים היסטוריים</CardTitle>
            <CardDescription>
              סדרות שנתיות שמהן נגזרים מדדי ה־Big 5
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {(data.financial_history?.length ?? 0) > 0 ? (
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4 text-left">שנה</th>
                    <th className="px-3 py-2 text-right">מכירות</th>
                    <th className="px-3 py-2 text-right">EPS</th>
                    <th className="px-3 py-2 text-right">הון/מניה</th>
                    <th className="px-3 py-2 text-right">FCF</th>
                    <th className="px-3 py-2 text-right">ROIC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.financial_history.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-border/40">
                      <td className="py-2 pr-4">
                        {row.date ? new Date(row.date).getFullYear() : idx}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.sales != null ? Number(row.sales).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(row.eps)}</td>
                      <td className="px-3 py-2 text-right">{fmt(row.equity)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.fcf != null ? Number(row.fcf).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.roic != null ? pct(row.roic) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                אין היסטוריה פיננסית זמינה
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

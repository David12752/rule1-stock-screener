"use client";

import { Big5Tab } from "./Big5Tab";
import { FinancialsTab } from "./FinancialsTab";
import { InsightsTab } from "./InsightsTab";
import { CompanyReport } from "../CompanyReport";

/**
 * Merged "ניתוח עומק" — Big 5 + דוחות + AI + דוח מלא as scrollable sections
 * (replaces three separate tabs).
 */
export function DeepAnalysisTab({
  data,
  normalizedData,
  md,
  symbol,
}: {
  data: any;
  normalizedData: any[];
  md: any;
  symbol: string;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          חמשת המדדים
        </h3>
        <p className="text-xs text-muted-foreground">
          צמיחה עקבית של 10%+ ב־5 מדדים — הבסיס לאיכות לפי כלל מספר 1.
        </p>
        <Big5Tab data={data} normalizedData={normalizedData} />
      </section>

      <section className="space-y-2 border-t border-white/[0.06] pt-6">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          דוחות פיננסיים
        </h3>
        <FinancialsTab data={data} md={md} />
      </section>

      <section className="space-y-2 border-t border-white/[0.06] pt-6">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          ניתוח AI וחפיר
        </h3>
        <InsightsTab data={data} md={md} symbol={symbol} />
      </section>

      <section className="space-y-2 border-t border-white/[0.06] pt-6">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          דוח חברה מלא
        </h3>
        <CompanyReport data={data} />
      </section>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmt, pct, money, compact } from "@/lib/format";
import {
  BIG5_METRICS,
  CONSISTENCY_HE,
  MARKET_RATIOS,
  QUALITY_BADGES,
  SIGNAL_HE,
  STICKER_BREAKDOWN,
  VALUATION_METRICS,
  type MetricInfo,
} from "@/lib/metrics";
import {
  VERDICT_CLS,
  VERDICT_EXPLAIN,
  VERDICT_HE,
  verdictReasonsHe,
} from "@/lib/verdict";
import { Download, Printer } from "lucide-react";

type Big5Row = {
  cagr_1y?: number | null;
  cagr_3y?: number | null;
  cagr_5y?: number | null;
  cagr_10y?: number | null;
  consistent_growth?: boolean;
  latest_value?: number | null;
  unit?: string | null;
};

type HistoryRow = {
  date?: string;
  sales?: number;
  eps?: number;
  equity?: number;
  fcf?: number;
  roic?: number;
  total_debt?: number;
};

export type CompanyReportData = {
  symbol: string;
  company_name?: string;
  price: number;
  sticker_price: number;
  mos_price: number;
  payback_time?: number;
  verdict?: string;
  verdict_primary?: string;
  verdict_modifiers?: { code: string }[];
  verdict_failures?: Array<{ code: string; years?: number; limit?: number }>;
  big_5?: Record<string, Big5Row | undefined>;
  sticker_price_breakdown?: Record<string, number>;
  technical_analysis?: { signal?: string };
  ai_analysis?: {
    moat_score?: number;
    moat_type?: string;
    moat_analysis?: string;
    management_description?: string;
    red_flags?: string[];
  };
  market_data?: Record<string, unknown>;
  financial_history?: HistoryRow[];
  data_quality?: { incomplete?: boolean };
  split_adjustment?: { applied?: boolean; max_factor?: number };
};

function ParamRow({
  info,
  value,
  tone,
}: {
  info: MetricInfo;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="border-b border-white/[0.05] py-2.5 last:border-0 print:border-black/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {info.label}
            {info.term && (
              <span className="ms-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                {info.term}
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 font-mono text-sm font-semibold",
            tone === "good" && "text-emerald-400 print:text-emerald-700",
            tone === "bad" && "text-red-400 print:text-red-700"
          )}
        >
          {value}
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground print:text-neutral-600">
        {info.what}
        {info.rule ? ` · ${info.rule}` : ""}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 break-inside-avoid rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 print:border-neutral-300 print:bg-white">
      <h3 className="mb-2 font-heading text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function fmtCagr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatMarketValue(key: string, raw: unknown): string {
  if (raw == null || raw === "") return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(n)) return String(raw);
  switch (key) {
    case "market_cap":
      return money(n);
    case "employees":
      return compact(n);
    case "gross_margins":
    case "operating_margins":
    case "profit_margins":
    case "return_on_assets":
    case "dividend_yield":
      return pct(n);
    case "debt_to_equity":
      // Yahoo often reports as percent-like (e.g. 150 = 1.5x)
      return n > 10 ? fmt(n / 100, 2) : fmt(n, 2);
    case "pe_ratio":
    case "pb_ratio":
    case "ps_ratio":
    case "ev_ebitda":
    case "current_ratio":
    case "beta":
    case "week_52_high":
    case "week_52_low":
      return fmt(n, key.includes("week") || key === "beta" || key === "current_ratio" ? 2 : 1);
    default:
      return fmt(n);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build a standalone printable HTML document from the same explanations. */
export function buildCompanyReportHtml(data: CompanyReportData): string {
  const md = data.market_data || {};
  const reasons = verdictReasonsHe(data);
  const verdictLabel = VERDICT_HE[data.verdict || ""] || data.verdict || "—";
  const signal = data.technical_analysis?.signal;
  const rows: string[] = [];

  const push = (title: string, body: string) => {
    rows.push(`<section><h2>${escapeHtml(title)}</h2>${body}</section>`);
  };

  push(
    "פסיקה",
    `<p><strong>${escapeHtml(verdictLabel)}</strong> — ${escapeHtml(VERDICT_EXPLAIN[data.verdict || ""] || "")}</p>
     <ul>${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
  );

  const valKeys = ["price", "sticker_price", "mos_price", "payback_time"] as const;
  push(
    "שווי Rule #1",
    valKeys
      .map((k) => {
        const info = VALUATION_METRICS[k];
        let value = "—";
        if (k === "price") value = fmt(data.price);
        else if (k === "sticker_price") value = fmt(data.sticker_price);
        else if (k === "mos_price") value = fmt(data.mos_price);
        else if (k === "payback_time")
          value =
            data.payback_time != null && data.payback_time < 900
              ? `${fmt(data.payback_time, 1)} שנים`
              : "∞";
        return `<div class="row"><div class="lab">${escapeHtml(info.label)} <span class="term">${escapeHtml(info.term || "")}</span></div><div class="val">${escapeHtml(value)}</div><p>${escapeHtml(info.what)}${info.rule ? " · " + escapeHtml(info.rule) : ""}</p></div>`;
      })
      .join("")
  );

  const big5Body = Object.entries(data.big_5 || {})
    .map(([key, m]) => {
      const info = BIG5_METRICS[key] || { label: key, what: "" };
      const pass = !!m?.consistent_growth;
      const level =
        m?.unit === "ratio" && m.latest_value != null
          ? pct(m.latest_value)
          : m?.latest_value != null
            ? fmt(m.latest_value)
            : null;
      return `<div class="row"><div class="lab">${escapeHtml(info.label)} <span class="term">${escapeHtml(info.term || "")}</span></div>
        <div class="val">${pass ? "עומד" : "לא עומד"}${level ? ` · ${escapeHtml(level)}` : ""}</div>
        <p>1Y ${fmtCagr(m?.cagr_1y)} · 3Y ${fmtCagr(m?.cagr_3y)} · 5Y ${fmtCagr(m?.cagr_5y)} · 10Y ${fmtCagr(m?.cagr_10y)}</p>
        <p>${escapeHtml(info.what)}${info.rule ? " · " + escapeHtml(info.rule) : ""}</p></div>`;
    })
    .join("");
  if (big5Body) push("Big 5", big5Body);

  const marketBody = Object.entries(MARKET_RATIOS)
    .map(([key, info]) => {
      const raw = md[key];
      if (raw == null) return "";
      return `<div class="row"><div class="lab">${escapeHtml(info.label)} <span class="term">${escapeHtml(info.term || "")}</span></div><div class="val">${escapeHtml(formatMarketValue(key, raw))}</div><p>${escapeHtml(info.what)}${info.rule ? " · " + escapeHtml(info.rule) : ""}</p></div>`;
    })
    .filter(Boolean)
    .join("");
  if (marketBody) push("יחסי שוק ופנדמנטלס", marketBody);

  const summary = (md.long_business_summary as string) || "";
  if (summary) {
    push("תמצית עסק", `<p>${escapeHtml(summary)}</p>`);
  }

  const ai = data.ai_analysis;
  if (ai?.moat_analysis || ai?.moat_score != null) {
    const moatInfo = VALUATION_METRICS.moat_score;
    push(
      "חומה תחרותית",
      `<div class="row"><div class="lab">${escapeHtml(moatInfo.label)}</div><div class="val">${ai.moat_score ?? "—"}/10${ai.moat_type ? ` (${escapeHtml(ai.moat_type)})` : ""}</div>
       <p>${escapeHtml(moatInfo.what)}${moatInfo.rule ? " · " + escapeHtml(moatInfo.rule) : ""}</p>
       <p>${escapeHtml(ai.moat_analysis || "")}</p></div>`
    );
  }

  const hist = (data.financial_history || []).slice(-8);
  if (hist.length) {
    const head =
      "<tr><th>שנה</th><th>מכירות</th><th>EPS</th><th>הון/מניה</th><th>FCF</th><th>ROIC</th></tr>";
    const body = hist
      .map((h) => {
        const y = h.date ? new Date(h.date).getFullYear() : "—";
        return `<tr><td>${y}</td><td>${escapeHtml(compact(h.sales))}</td><td>${escapeHtml(fmt(h.eps))}</td><td>${escapeHtml(fmt(h.equity))}</td><td>${escapeHtml(compact(h.fcf))}</td><td>${escapeHtml(h.roic != null ? pct(h.roic) : "—")}</td></tr>`;
      })
      .join("");
    push("היסטוריה שנתית", `<table>${head}${body}</table>`);
  }

  const now = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>דוח Rule #1 — ${escapeHtml(data.symbol)}</title>
<style>
  body{font-family:Segoe UI,Tahoma,Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#111;line-height:1.45}
  h1{font-size:1.6rem;margin:0 0 4px}
  .meta{color:#555;font-size:.9rem;margin-bottom:20px}
  h2{font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:4px;margin:28px 0 10px}
  .row{padding:10px 0;border-bottom:1px solid #eee}
  .lab{font-weight:600}.term{font-family:ui-monospace,monospace;font-size:.75rem;color:#666;margin-inline-start:6px}
  .val{font-family:ui-monospace,monospace;font-weight:700;float:left}
  p{margin:4px 0 0;font-size:.85rem;color:#444}
  table{width:100%;border-collapse:collapse;font-size:.8rem;font-family:ui-monospace,monospace}
  th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:right}
  ul{margin:6px 0;padding-inline-start:1.2rem}
</style>
</head>
<body>
  <h1>${escapeHtml(data.symbol)} — ${escapeHtml(data.company_name || "")}</h1>
  <div class="meta">דוח Rule #1 מלא · ${now} · פסיקה: ${escapeHtml(verdictLabel)} · איתות: ${escapeHtml(SIGNAL_HE[signal || ""] || signal || "—")}</div>
  ${rows.join("\n")}
</body>
</html>`;
}

export function downloadCompanyReportHtml(data: CompanyReportData) {
  const html = buildCompanyReportHtml(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rule1-report-${data.symbol}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompanyReport({ data }: { data: CompanyReportData }) {
  const printRef = useRef<HTMLDivElement>(null);
  const md = data.market_data || {};
  const bd = data.sticker_price_breakdown || {};
  const reasons = verdictReasonsHe(data);
  const signal = data.technical_analysis?.signal;
  const payback =
    data.payback_time != null && data.payback_time < 900
      ? `${fmt(data.payback_time, 1)} שנים`
      : "∞";
  const undervalued =
    data.price > 0 && data.mos_price > 0 && data.price < data.mos_price;
  const history = (data.financial_history || []).slice(-10);

  const onPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h2 className="font-heading text-base font-semibold">דוח מלא — Rule #1</h2>
          <p className="text-xs text-muted-foreground">
            כל פרמטר עם ערך והסבר. מתאים להדפסה או לשמירה כ־HTML.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onPrint}>
            <Printer className="me-1 h-3.5 w-3.5" />
            הדפסה
          </Button>
          <Button size="sm" onClick={() => downloadCompanyReportHtml(data)}>
            <Download className="me-1 h-3.5 w-3.5" />
            הורד HTML
          </Button>
        </div>
      </div>

      <div ref={printRef} id="company-report-print" className="space-y-1">
        <div className="mb-4 hidden print:block">
          <div className="text-xl font-bold">
            {data.symbol} — {data.company_name}
          </div>
          <div className="text-sm text-neutral-600">דוח Rule #1 מלא</div>
        </div>

        <Section title="פסיקה">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {data.verdict && (
              <span className={cn("rounded px-2 py-0.5 text-xs", VERDICT_CLS[data.verdict])}>
                {VERDICT_HE[data.verdict] || data.verdict}
              </span>
            )}
            {undervalued && (
              <Badge className="bg-emerald-500/15 text-[10px] text-emerald-400">
                {QUALITY_BADGES.below_mos.label}
              </Badge>
            )}
            {data.data_quality?.incomplete && (
              <Badge className="bg-orange-500/15 text-[10px] text-orange-300">
                {QUALITY_BADGES.incomplete.label}
              </Badge>
            )}
            {data.split_adjustment?.applied && (
              <Badge className="bg-sky-500/15 text-[10px] text-sky-300">
                {QUALITY_BADGES.split_adjusted.label}
              </Badge>
            )}
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {VERDICT_EXPLAIN[data.verdict || ""] || ""}
          </p>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {reasons.map((line, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-muted-foreground/50">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="שווי Rule #1">
          <ParamRow info={VALUATION_METRICS.price} value={fmt(data.price)} />
          <ParamRow info={VALUATION_METRICS.sticker_price} value={fmt(data.sticker_price)} />
          <ParamRow
            info={VALUATION_METRICS.mos_price}
            value={fmt(data.mos_price)}
            tone={undervalued ? "good" : "neutral"}
          />
          <ParamRow
            info={VALUATION_METRICS.payback_time}
            value={payback}
            tone={data.payback_time != null && data.payback_time <= 3 ? "good" : "bad"}
          />
          {Object.entries(STICKER_BREAKDOWN).map(([key, info]) => {
            const raw = bd[key];
            if (raw == null) return null;
            const display =
              key === "estimated_growth" || key.includes("growth")
                ? pct(raw)
                : fmt(raw);
            return <ParamRow key={key} info={info} value={display} />;
          })}
        </Section>

        <Section title="Big 5 — איכות העסק">
          {Object.entries(data.big_5 || {}).map(([key, m]) => {
            const info = BIG5_METRICS[key];
            if (!info || !m) return null;
            const isLevel = m.unit === "ratio";
            const headline =
              isLevel && m.latest_value != null
                ? pct(m.latest_value)
                : m.latest_value != null
                  ? fmt(m.latest_value)
                  : null;
            const status = m.consistent_growth
              ? CONSISTENCY_HE.pass
              : CONSISTENCY_HE.fail;
            return (
              <div
                key={key}
                className="border-b border-white/[0.05] py-2.5 last:border-0 print:border-black/10"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-medium">
                    {info.label}
                    {info.term && (
                      <span className="ms-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                        {info.term}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-sm font-semibold",
                      m.consistent_growth ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {status}
                    {headline ? ` · ${headline}` : ""}
                  </div>
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  1Y {fmtCagr(m.cagr_1y)} · 3Y {fmtCagr(m.cagr_3y)} · 5Y{" "}
                  {fmtCagr(m.cagr_5y)} · 10Y {fmtCagr(m.cagr_10y)}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {info.what}
                  {info.rule ? ` · ${info.rule}` : ""}
                </p>
              </div>
            );
          })}
        </Section>

        <Section title="יחסי שוק ופנדמנטלס">
          {Object.entries(MARKET_RATIOS).map(([key, info]) => {
            const raw = md[key];
            if (raw == null) return null;
            return (
              <ParamRow key={key} info={info} value={formatMarketValue(key, raw)} />
            );
          })}
        </Section>

        <Section title="תזמון טכני">
          <ParamRow
            info={VALUATION_METRICS.signal}
            value={SIGNAL_HE[signal || ""] || signal || "—"}
            tone={signal === "Green" ? "good" : signal === "Red" ? "bad" : "neutral"}
          />
        </Section>

        {(data.ai_analysis?.moat_score != null || data.ai_analysis?.moat_analysis) && (
          <Section title="חומה תחרותית וניהול">
            <ParamRow
              info={VALUATION_METRICS.moat_score}
              value={`${data.ai_analysis?.moat_score ?? "—"}/10${
                data.ai_analysis?.moat_type ? ` · ${data.ai_analysis.moat_type}` : ""
              }`}
            />
            {data.ai_analysis?.moat_analysis && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {data.ai_analysis.moat_analysis}
              </p>
            )}
            {data.ai_analysis?.management_description && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                ניהול: {data.ai_analysis.management_description}
              </p>
            )}
            {(data.ai_analysis?.red_flags?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-red-300/90">
                {data.ai_analysis!.red_flags!.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {typeof md.long_business_summary === "string" && md.long_business_summary && (
          <Section title="תמצית עסק">
            <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {md.long_business_summary}
            </p>
          </Section>
        )}

        {history.length > 0 && (
          <Section title="היסטוריה שנתית (מקוצרת)">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-muted-foreground">
                    <th className="py-1.5 pe-2 text-start font-medium">שנה</th>
                    <th className="px-2 py-1.5 text-end font-medium">מכירות</th>
                    <th className="px-2 py-1.5 text-end font-medium">EPS</th>
                    <th className="px-2 py-1.5 text-end font-medium">הון/מניה</th>
                    <th className="px-2 py-1.5 text-end font-medium">FCF</th>
                    <th className="ps-2 py-1.5 text-end font-medium">ROIC</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      <td className="py-1 pe-2">
                        {h.date ? new Date(h.date).getFullYear() : "—"}
                      </td>
                      <td className="px-2 py-1 text-end">{compact(h.sales)}</td>
                      <td className="px-2 py-1 text-end">{fmt(h.eps)}</td>
                      <td className="px-2 py-1 text-end">{fmt(h.equity)}</td>
                      <td className="px-2 py-1 text-end">{compact(h.fcf)}</td>
                      <td className="ps-2 py-1 text-end">
                        {h.roic != null ? pct(h.roic) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {BIG5_METRICS.sales.what} מדדי ה־Big 5 נגזרים מהסדרה הזו לאורך השנים.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}

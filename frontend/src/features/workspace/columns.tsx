"use client";

import { fmt } from "@/lib/format";
import type { QualityStock, CandidateRow } from "@/components/workspace/workspace-context";
import type { TimingResult } from "@/stores/scan-store";
import type { VirtualColumn } from "@/components/workspace/virtual-table";
import { WatchlistButton } from "@/components/watchlist-button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DotRating } from "@/components/ui/dot-rating";
import { ScoreRing } from "@/components/ui/score-ring";
import { DeltaText } from "@/components/ui/delta-text";
import { SIGNAL_HE, VALUATION_METRICS, TECHNICAL_METRICS, QUALITY_BADGES } from "@/lib/metrics";
import { HeaderWithHint } from "./shared";
import { InfoHint } from "@/components/info-hint";

const PATTERN_HE: Record<string, string> = {
  cup_and_handle: "כוס וידית",
  head_and_shoulders: "ראש וכתפיים",
  inverse_head_and_shoulders: "ראש-כתפיים הפוך",
  double_bottom: "תחתית כפולה",
  double_top: "פסגה כפולה",
  ascending_triangle: "משולש עולה",
  descending_triangle: "משולש יורד",
  bull_flag: "דגל שורי",
  bear_flag: "דגל דובי",
};

/** Hebrew label for chart pattern ids used in timing / candidates / startup tables. */
export function patternLabelHe(id?: string | null): string {
  if (!id) return "—";
  return PATTERN_HE[id] || id.replace(/_/g, " ");
}

/**
 * Column definitions live at module scope so they keep a stable identity and are
 * not rebuilt on every panel render.
 */
export const QUALITY_COLUMNS: VirtualColumn<QualityStock>[] = [
  {
    key: "symbol",
    header: "סימול",
    width: "80px",
    cell: (s) => <span className="font-mono font-semibold">{s.symbol}</span>,
  },
  { key: "name", header: "שם", width: "auto", cell: (s) => s.company_name },
  {
    key: "verdict",
    header: "פסיקה",
    width: "92px",
    cell: (s) => <StatusBadge verdict={s.verdict} />,
  },
  {
    key: "price",
    header: "מחיר",
    width: "80px",
    align: "end",
    className: "font-mono",
    cell: (s) => fmt(s.price),
  },
  {
    key: "mos",
    header: <HeaderWithHint info={VALUATION_METRICS.mos_price} short="מרווח ביטחון" />,
    width: "104px",
    align: "end",
    className: "font-mono",
    cell: (s) => fmt(s.mos_price),
  },
  {
    key: "discount",
    header: <HeaderWithHint info={VALUATION_METRICS.sticker_price} short="הנחה%" />,
    width: "78px",
    align: "end",
    cell: (s) => {
      if (!s.sticker_price || !s.price) {
        return <span className="text-muted-foreground">—</span>;
      }
      const pct = ((s.sticker_price - s.price) / s.sticker_price) * 100;
      const good = pct > 0;
      return (
        <span className={`font-mono text-[11px] font-semibold ${good ? "text-emerald-400" : "text-red-400"}`}>
          {good ? "+" : ""}
          {pct.toFixed(0)}%
        </span>
      );
    },
  },
  {
    key: "moat",
    header: <HeaderWithHint info={VALUATION_METRICS.moat_score} short="חומה" />,
    width: "76px",
    align: "end",
    cell: (s) => {
      const score = s.ai_analysis?.moat_score;
      if (score == null) return <span className="text-muted-foreground">—</span>;
      // Backend moat is /10; DotRating is a 5-dot scale.
      return <DotRating value={Number(score) / 2} />;
    },
  },
  {
    key: "signal",
    header: <HeaderWithHint info={VALUATION_METRICS.signal} short="איתות" />,
    width: "84px",
    align: "end",
    cell: (s) => SIGNAL_HE[s.technical_analysis?.signal ?? ""] ?? s.technical_analysis?.signal ?? "—",
  },
  {
    key: "data",
    header: (
      <span className="inline-flex items-center gap-0.5">
        איכות נתונים
        <InfoHint info={QUALITY_BADGES.incomplete} />
      </span>
    ),
    width: "108px",
    cell: (s) =>
      s.data_quality?.incomplete ? (
        <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-300">
          חלקי
        </span>
      ) : s.split_adjustment?.applied ? (
        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
          פיצול✓
        </span>
      ) : (
        <span className="text-muted-foreground">תקין</span>
      ),
  },
  {
    key: "watch",
    header: "",
    width: "40px",
    isolate: true,
    cell: (s) => <WatchlistButton symbol={s.symbol} size="sm" />,
  },
];

export const TIMING_COLUMNS: VirtualColumn<TimingResult>[] = [
  {
    key: "symbol",
    header: "סימול",
    width: "80px",
    cell: (r) => <span className="font-mono font-semibold">{r.symbol}</span>,
  },
  { key: "name", header: "שם", width: "auto", cell: (r) => r.company_name },
  {
    key: "pattern",
    header: <HeaderWithHint info={TECHNICAL_METRICS.pattern} short="תבנית ראשית" />,
    width: "140px",
    className: "text-[11px]",
    cell: (r) => patternLabelHe(r.patterns?.[0]?.pattern_type),
  },
  {
    key: "confidence",
    header: <HeaderWithHint info={TECHNICAL_METRICS.confidence} short="ביטחון" />,
    width: "70px",
    align: "end",
    className: "font-mono",
    cell: (r) => {
      const top = r.patterns?.[0];
      return top ? `${Math.round(top.confidence * 100)}%` : "—";
    },
  },
  {
    key: "count",
    header: "תבניות",
    width: "70px",
    align: "end",
    className: "font-mono",
    cell: (r) => r.patterns?.length ?? 0,
  },
  {
    key: "price",
    header: "מחיר",
    width: "80px",
    align: "end",
    className: "font-mono",
    cell: (r) => fmt(r.current_price),
  },
  {
    key: "r1",
    header: "פסיקת כלל 1",
    width: "92px",
    cell: (r) =>
      r.rule1_verdict ? (
        <StatusBadge verdict={r.rule1_verdict} />
      ) : r.rule1_quality?.passes ? (
        "✓"
      ) : r.rule1_quality ? (
        "—"
      ) : (
        ""
      ),
  },
];

export const CANDIDATE_COLUMNS: VirtualColumn<CandidateRow>[] = [
  {
    key: "score",
    header: <HeaderWithHint info={TECHNICAL_METRICS.candidate_score} short="ציון" />,
    width: "48px",
    cell: (c) => <ScoreRing score={c.score} size={32} />,
  },
  {
    key: "source",
    header: "מקור",
    width: "110px",
    cell: (c) => (
      <Badge variant="outline" className="text-[10px]">
        {c.source === "both" ? "איכות+תזמון" : c.source === "quality" ? "איכות" : "תזמון"}
      </Badge>
    ),
  },
  {
    key: "symbol",
    header: "סימול",
    width: "80px",
    cell: (c) => <span className="font-mono font-semibold">{c.symbol}</span>,
  },
  {
    key: "verdict",
    header: "פסיקה",
    width: "92px",
    cell: (c) => (c.verdict ? <StatusBadge verdict={c.verdict} /> : null),
  },
  {
    key: "price",
    header: "מחיר",
    width: "80px",
    align: "end",
    className: "font-mono",
    cell: (c) => fmt(c.price),
  },
  {
    key: "mos",
    header: <HeaderWithHint info={VALUATION_METRICS.mos_price} short="הנחה%" />,
    width: "78px",
    align: "end",
    cell: (c) => <DeltaText value={c.discountPct} digits={0} />,
  },
  {
    key: "pattern",
    header: <HeaderWithHint info={TECHNICAL_METRICS.pattern} short="תבנית" />,
    width: "auto",
    className: "text-[11px]",
    cell: (c) => patternLabelHe(c.topPattern),
  },
  {
    key: "confidence",
    header: <HeaderWithHint info={TECHNICAL_METRICS.confidence} short="ביטחון" />,
    width: "70px",
    align: "end",
    className: "font-mono",
    cell: (c) => (c.confidence != null ? `${Math.round(c.confidence * 100)}%` : "—"),
  },
  {
    key: "signal",
    header: <HeaderWithHint info={VALUATION_METRICS.signal} short="איתות" />,
    width: "70px",
    align: "end",
    cell: (c) => SIGNAL_HE[c.signal ?? ""] ?? c.signal ?? "—",
  },
];

const PHASE_LABEL: Record<string, string> = {
  forming: "נוצרת",
  near: "קרוב",
  broken: "פרצה",
};

function fmtCap(cap?: number | null): string {
  if (cap == null || cap <= 0) return "—";
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString("en-US")}`;
}

export const STARTUP_COLUMNS: VirtualColumn<TimingResult>[] = [
  {
    key: "score",
    header: "ציון",
    width: "48px",
    cell: (r) => <ScoreRing score={r.startup_score ?? 0} size={32} />,
  },
  {
    key: "symbol",
    header: "סימול",
    width: "80px",
    cell: (r) => <span className="font-mono font-semibold">{r.symbol}</span>,
  },
  { key: "name", header: "שם", width: "auto", cell: (r) => r.company_name },
  {
    key: "cap",
    header: "שווי",
    width: "72px",
    align: "end",
    className: "font-mono text-[11px]",
    cell: (r) => fmtCap(r.market_cap),
  },
  {
    key: "age",
    header: "גיל הנפקה",
    width: "72px",
    align: "end",
    className: "font-mono text-[11px]",
    cell: (r) =>
      r.listing_age_years != null
        ? `${r.listing_age_years.toFixed(1)} ש׳`
        : "—",
  },
  {
    key: "phase",
    header: "שלב",
    width: "80px",
    cell: (r) => {
      const phase = r.breakout_phase || "";
      return (
        <Badge
          variant={phase === "near" ? "default" : "outline"}
          className="text-[10px]"
        >
          {PHASE_LABEL[phase] || phase || "—"}
        </Badge>
      );
    },
  },
  {
    key: "pattern",
    header: "תבנית",
    width: "120px",
    className: "text-[11px]",
    cell: (r) => patternLabelHe(r.top_pattern || r.patterns?.[0]?.pattern_type),
  },
  {
    key: "confidence",
    header: "ביטחון",
    width: "70px",
    align: "end",
    className: "font-mono",
    cell: (r) => {
      const c = r.patterns?.[0]?.confidence;
      return c != null ? `${Math.round(c * 100)}%` : "—";
    },
  },
  {
    key: "price",
    header: "מחיר",
    width: "72px",
    align: "end",
    className: "font-mono",
    cell: (r) => fmt(r.current_price),
  },
];

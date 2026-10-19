/**
 * Verdict tokens — one place for labels, colors, and badge mapping.
 *
 * Hardcoded green/yellow/red strings used to be scattered across the workspace
 * shell and the stock page. Consumers should import from here so a redesign of
 * the palette only touches this file.
 */

export type Verdict =
    | "BUY"
    | "WAIT"
    | "WATCHLIST"
    | "WARY"
    | "DISQUALIFIED";

export type VerdictToken =
    | "success"
    | "warning"
    | "info"
    | "caution"
    | "destructive"
    | "muted";

export const VERDICT_HE: Record<string, string> = {
    BUY: "קנה",
    WAIT: "המתן",
    WATCHLIST: "מעקב",
    WARY: "זהירות",
    DISQUALIFIED: "פסול",
    PENDING: "ממתין",
    UNKNOWN: "ללא פסיקה",
};

export const VERDICT_HE_RICH: Record<string, string> = {
    BUY: "✅ קנה",
    WAIT: "⏳ המתן",
    WATCHLIST: "👁 רשימת מעקב",
    WARY: "⚠️ זהירות",
    DISQUALIFIED: "❌ פסול",
};

export const VERDICT_EXPLANATION: Record<string, string> = {
    BUY: "המניה עומדת בכל קריטריוני כלל מספר 1 — צמיחה עקבית, חפיר חזק, מחיר מתחת למרווח הביטחון, ואיתות טכני חיובי.",
    WAIT: "המניה מבטיחה אך המחיר עדיין גבוה מדי. המתן לירידת מחיר למרווח הביטחון.",
    WATCHLIST: "חלק מהקריטריונים עוברים — שווה לעקוב ולהמתין לשיפור.",
    WARY: "נמצאו חולשות משמעותיות. נדרש מחקר נוסף לפני כל החלטה.",
    DISQUALIFIED: "המניה לא עומדת בקריטריונים הבסיסיים של כלל מספר 1.",
    PENDING: "המניה ביקום שנבחר — ממתין לסריקה אוטומטית מנתוני Yahoo Finance.",
};

/** Alias used by the Workspace quality filters. */
export const VERDICT_EXPLAIN = VERDICT_EXPLANATION;

/** Display order for verdict filter chips. */
export const VERDICT_ORDER: Verdict[] = [
    "BUY",
    "WAIT",
    "WATCHLIST",
    "WARY",
    "DISQUALIFIED",
];

/**
 * Turn backend `verdict_reason` / checklist flags into short Hebrew bullets for
 * the analysis panel. Falls back to splitting the English reason string.
 */
export function verdictReasonsHe(data: {
    verdict?: string | null;
    verdict_reason?: string | null;
    verdict_details?: {
        big5_pass?: boolean;
        payback_ok?: boolean;
        undervalued?: boolean;
        green_signal?: boolean;
        incomplete_data?: boolean;
    } | null;
}): string[] {
    const lines: string[] = [];
    const vd = data.verdict_details;
    if (vd) {
        if (vd.big5_pass === false) lines.push("צמיחה לא עקבית ב-Big 5 (מתחת ל-10% לטווח ארוך)");
        if (vd.payback_ok === false) lines.push("זמן החזר חוב ארוך מדי (>3 שנים)");
        if (vd.undervalued === false) lines.push("המחיר גבוה ממרווח הביטחון");
        if (vd.green_signal === false) lines.push("אין איתות טכני ירוק");
        if (vd.incomplete_data) lines.push("נתונים חלקיים — יש להיזהר במסקנות");
    }
    if (lines.length === 0 && data.verdict_reason) {
        for (const part of data.verdict_reason.split(/[.;•]/).map((p) => p.trim()).filter(Boolean)) {
            lines.push(part);
        }
    }
    if (lines.length === 0 && data.verdict) {
        lines.push(VERDICT_EXPLANATION[data.verdict] ?? data.verdict);
    }
    return lines;
}

/** Maps a verdict string to a semantic token used by StatusBadge / badge variants. */
export function verdictToken(verdict: string | null | undefined): VerdictToken {
    switch (verdict) {
        case "BUY":
            return "success";
        case "WAIT":
            return "warning";
        case "WATCHLIST":
            return "info";
        case "WARY":
            return "caution";
        case "DISQUALIFIED":
            return "destructive";
        default:
            return "muted";
    }
}

/** Tailwind utility classes for dense table cells / pills (legacy-compatible). */
export const VERDICT_CLS: Record<string, string> = {
    BUY: "bg-emerald-500/15 text-emerald-400",
    WAIT: "bg-yellow-500/15 text-yellow-400",
    WATCHLIST: "bg-blue-500/15 text-blue-400",
    WARY: "bg-orange-500/15 text-orange-400",
    DISQUALIFIED: "bg-red-500/15 text-red-400",
    PENDING: "bg-white/10 text-muted-foreground",
    UNKNOWN: "bg-white/10 text-muted-foreground",
};

export const VERDICT_BORDER: Record<string, string> = {
    BUY: "from-green-500/20 to-green-900/10 border-green-500/60",
    WAIT: "from-yellow-500/20 to-yellow-900/10 border-yellow-500/60",
    WATCHLIST: "from-blue-500/20 to-blue-900/10 border-blue-500/60",
    WARY: "from-orange-500/20 to-orange-900/10 border-orange-500/60",
    DISQUALIFIED: "from-red-500/20 to-red-900/10 border-red-500/60",
};

export const VERDICT_TEXT: Record<string, string> = {
    BUY: "text-green-400",
    WAIT: "text-yellow-400",
    WATCHLIST: "text-blue-400",
    WARY: "text-orange-400",
    DISQUALIFIED: "text-red-400",
};

export const VERDICT_SCORE: Record<string, number> = {
    BUY: 100,
    WAIT: 70,
    WATCHLIST: 55,
    WARY: 30,
    DISQUALIFIED: 0,
};

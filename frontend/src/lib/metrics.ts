/**
 * Hebrew labels and explanations for every Rule #1 parameter shown in the UI.
 *
 * Single source of truth. Metric names used to leak to the screen as raw backend
 * keys ("ROIC", "EQUITY", "FCF", "g", "Future PE"), with no indication of what
 * they mean or which threshold makes them pass.
 *
 * Every number below was read off the implementation rather than from the book,
 * so the help text matches what this codebase actually computes:
 *   - growth threshold 10%              backend/app/calculations.py:8
 *   - growth cap for projection 24%     backend/app/calculations.py:9
 *   - discount rate 15%                 backend/app/calculations.py:10
 *   - margin of safety 50%              backend/app/calculations.py:11
 *   - debt payback limit 3 years        backend/app/api.py:511
 *   - future P/E = min(2 x growth, historic mean P/E)   calculations.py:219-227
 */

export interface MetricInfo {
    /** Hebrew label shown in the UI. */
    label: string;
    /** The original term, kept visible because users read English filings too. */
    term?: string;
    /** What it is, in one sentence. */
    what: string;
    /** What counts as good, per Rule #1 as implemented here. */
    rule?: string;
}

/** The Big 5 (plus ROE, which is supplemental and does not gate the verdict). */
export const BIG5_METRICS: Record<string, MetricInfo> = {
    roic: {
        label: "תשואה על ההון המושקע",
        term: "ROIC",
        what: "כמה רווח החברה מייצרת על כל שקל הון שהושקע בה — מדד ליעילות ההנהלה בהקצאת כספים.",
        rule: "נדרש 10% ומעלה. כאן נבדקת הרמה עצמה (ממוצע עד 3 השנים האחרונות), לא קצב השינוי שלה.",
    },
    equity: {
        label: "הון עצמי למניה",
        term: "Equity / BVPS",
        what: "השווי החשבונאי של החברה שמיוחס לכל מניה. פיל טאון רואה בו את המדד החשוב מבין החמישה.",
        rule: "צמיחה של 10% ומעלה בשנה, לפי ממוצע ה-CAGR ל-10 ו-5 שנים.",
    },
    eps: {
        label: "רווח למניה",
        term: "EPS",
        what: "הרווח הנקי חלקי מספר המניות — כמה החברה מרוויחה עבור כל מניה.",
        rule: "צמיחה של 10% ומעלה בשנה לטווח ארוך.",
    },
    sales: {
        label: "מכירות",
        term: "Sales / Revenue",
        what: "סך ההכנסות מפעילות. צמיחה עקבית מעידה שהשוק של החברה מתרחב ולא רק שהיא מקצצת בעלויות.",
        rule: "צמיחה של 10% ומעלה בשנה לטווח ארוך.",
    },
    fcf: {
        label: "תזרים מזומנים חופשי",
        term: "FCF",
        what: "המזומן שנשאר בידי החברה אחרי השקעות הוניות — הכסף שממנו אפשר להחזיר חוב, לחלק דיבידנד או לרכוש מניות.",
        rule: "צמיחה של 10% ומעלה בשנה לטווח ארוך.",
    },
    roe: {
        label: "תשואה על ההון העצמי",
        term: "ROE",
        what: "הרווח הנקי ביחס להון העצמי. משלים את ROIC, אך אינו חוסם את הפסיקה.",
        rule: "נדרש 10% ומעלה. נבדקת הרמה, לא קצב השינוי.",
    },
};

/** Valuation and risk figures. */
export const VALUATION_METRICS: Record<string, MetricInfo> = {
    price: {
        label: "מחיר נוכחי",
        term: "Price",
        what: "מחיר המניה בשוק כרגע.",
    },
    sticker_price: {
        label: "מחיר מדבקה",
        term: "Sticker Price",
        what: "השווי ההוגן המשוער: הרווח העתידי הצפוי בעוד 10 שנים, מוכפל במכפיל העתידי ומהוון להיום ב-15% לשנה.",
        rule: "זה מחיר מלא — לא מחיר קנייה. קונים רק במרווח ביטחון מתחתיו.",
    },
    mos_price: {
        label: "מרווח ביטחון",
        term: "Margin of Safety (MOS)",
        what: "מחצית ממחיר המדבקה. זה מחיר הקנייה שאליו מחכים, וההנחה היא הכרית שמגנה מפני טעות בהערכה.",
        rule: "מחיר שוק מתחת ל-MOS נחשב הזדמנות.",
    },
    payback_time: {
        label: "זמן החזר חוב",
        term: "Debt Payback Time",
        what: "כמה שנים ייקח לחברה לכסות את כל חובה מתוך התזרים החופשי השנתי. החישוב: סך חוב חלקי FCF.",
        rule: "נדרש עד 3 שנים. תזרים שלילי מסומן כאין-סופי.",
    },
    signal: {
        label: "איתות טכני",
        term: "Technical Signal",
        what: "בדיקת תזמון כניסה לפי שלושה מדדים (ממוצעים נעים, MACD, סטוכסטיק).",
        rule: "«ירוק» = שלושת המדדים תומכים בכניסה.",
    },
    moat_score: {
        label: "חוזק החומה",
        term: "Moat",
        what: "עד כמה לחברה יתרון תחרותי בר-קיימא שמגן על רווחיה ממתחרים — מותג, פטנטים, עלויות מעבר או יתרון לגודל. כשאין מפתח AI, מוצג ציון שיטתי מ־ROIC+Big5 (מקסימום 7) — לא ניתוח Gemini.",
        rule: "ציון 1–10. מ-8 ומעלה נחשב חומה חזקה; 2 ומטה מוריד דירוג של «קנייה». שיטתי ≠ AI.",
    },
};

/** The four inputs behind the sticker price calculation. */
export const STICKER_BREAKDOWN: Record<string, MetricInfo> = {
    current_eps: {
        label: "רווח למניה נוכחי",
        term: "Current EPS",
        what: "נקודת הפתיחה לתחזית — הרווח למניה בפועל היום.",
    },
    estimated_growth: {
        label: "קצב צמיחה מוערך",
        term: "Estimated Growth (g)",
        what: "הקצב שבו מניחים שהרווח יצמח. נבחר השמרני מכולם: המינימום מבין תחזית האנליסטים, צמיחת הרווח וצמיחת ההון העצמי — רק ערכים חיוביים אמיתיים מהנתונים (בלי ברירת מחדל של 10%).",
        rule: "נלקחות רק הערכות חיוביות, והתוצאה נחסמת ב-24%. מקור הצמיחה מוצג ליד המספר.",
    },
    future_eps: {
        label: "רווח למניה בעוד 10 שנים",
        term: "Future EPS",
        what: "הרווח הנוכחי מוכפל בקצב הצמיחה במשך 10 שנים.",
    },
    future_pe: {
        label: "מכפיל רווח עתידי",
        term: "Future P/E",
        what: "המכפיל שבו מניחים שהמניה תיסחר בעתיד.",
        rule: "השמרני מבין השניים: כפליים קצב הצמיחה, או המכפיל ההיסטורי הממוצע.",
    },
};

/**
 * Market ratios and company fundamentals shown on the stock page / full report.
 * These do not gate the Rule #1 verdict by themselves, but they contextualise it.
 */
export const MARKET_RATIOS: Record<string, MetricInfo> = {
    market_cap: {
        label: "שווי שוק",
        term: "Market Cap",
        what: "מחיר המניה כפול מספר המניות — גודל החברה כפי שהשוק מתמחר אותה.",
    },
    pe_ratio: {
        label: "מכפיל רווח",
        term: "P/E",
        what: "כמה משלמים על כל יחידת רווח נוכחית. מכפיל גבוה = ציפיות צמיחה גבוהות או מחיר יקר.",
    },
    pb_ratio: {
        label: "מכפיל הון",
        term: "P/B",
        what: "מחיר המניה חלקי הון עצמי למניה — כמה משלמים מעל (או מתחת) לשווי החשבונאי.",
    },
    ps_ratio: {
        label: "מכפיל מכירות",
        term: "P/S",
        what: "שווי השוק חלקי ההכנסות השנתיות. שימושי כשהרווח זמנית נמוך או שלילי.",
    },
    ev_ebitda: {
        label: "EV / EBITDA",
        term: "Enterprise Value / EBITDA",
        what: "שווי הפעילות (כולל חוב) ביחס לרווח התפעולי לפני פחת — מכפיל שמשווה חברות עם מבני חוב שונים.",
    },
    gross_margins: {
        label: "מרווח גולמי",
        term: "Gross Margin",
        what: "אחוז הרווח אחרי עלות המכר. מרווח גבוה ויציב תומך בחומה תחרותית.",
    },
    operating_margins: {
        label: "מרווח תפעולי",
        term: "Operating Margin",
        what: "אחוז הרווח אחרי הוצאות תפעול — יעילות הליבה של העסק.",
    },
    profit_margins: {
        label: "מרווח נקי",
        term: "Net Margin",
        what: "אחוז הרווח הנקי מהמכירות — כמה נשאר בסוף לכל שקל הכנסה.",
    },
    return_on_assets: {
        label: "תשואה על הנכסים",
        term: "ROA",
        what: "הרווח הנקי ביחס לסך הנכסים — כמה יעילה החברה בשימוש בכל המשאבים שבמאזן.",
    },
    current_ratio: {
        label: "יחס שוטף",
        term: "Current Ratio",
        what: "נכסים שוטפים חלקי התחייבויות שוטפות — יכולת לכסות חובות קצרי טווח.",
        rule: "מעל 1 נפוץ כסף נזילות בסיסית; נמוך מ-1 דורש בדיקה.",
    },
    debt_to_equity: {
        label: "חוב להון",
        term: "Debt / Equity",
        what: "כמה חוב יש ביחס להון העצמי. מינוף גבוה מגדיל סיכון בתקופות קשות.",
    },
    beta: {
        label: "בטא",
        term: "Beta",
        what: "רגישות המניה לתנודות השוק. 1 ≈ כמו השוק; מעל 1 תנודתית יותר.",
    },
    dividend_yield: {
        label: "תשואת דיבידנד",
        term: "Dividend Yield",
        what: "הדיבידנד השנתי כאחוז ממחיר המניה — הכנסה שוטפת למשקיע, אם מחולק.",
    },
    employees: {
        label: "עובדים",
        term: "Employees",
        what: "מספר העובדים המדווח — אינדיקציה לגודל התפעולי של הארגון.",
    },
    week_52_high: {
        label: "שיא 52 שבועות",
        term: "52W High",
        what: "המחיר הגבוה ביותר ב־12 החודשים האחרונים.",
    },
    week_52_low: {
        label: "שפל 52 שבועות",
        term: "52W Low",
        what: "המחיר הנמוך ביותר ב־12 החודשים האחרונים.",
    },
};

/** Technical timing tools (the three-tool Rule #1 checklist). */
export const TECHNICAL_METRICS: Record<string, MetricInfo> = {
    sma: {
        label: "ממוצעים נעים",
        term: "Moving Averages",
        what: "מחיר ביחס לממוצע לטווח קצר וארוך — מגמה עולה כשהמחיר מעל הממוצעים והקצר מעל הארוך.",
    },
    macd: {
        label: "MACD",
        term: "MACD",
        what: "הפרש בין ממוצעים נעים אקספוננציאליים — איתות מומנטום לקנייה או מכירה.",
    },
    stochastic: {
        label: "סטוכסטיק",
        term: "Stochastic",
        what: "מיקום המחיר בטווח האחרון — מזהה מצבי קנייה־יתר או מכירה־יתר לטווח קצר.",
    },
    pattern: {
        label: "תבנית מחיר",
        term: "Chart Pattern",
        what: "צורת מחיר חוזרת (כוס וידית, דגל, משולש) שעשויה לרמז על המשך או היפוך מגמה.",
    },
    confidence: {
        label: "ביטחון בתבנית",
        term: "Pattern Confidence",
        what: "כמה האלגוריתם בטוח בזיהוי התבנית — אחוז גבוה = התאמה ברורה יותר לצורת הייחוס.",
        rule: "מעל 70% נחשב זיהוי חזק יחסית.",
    },
    candidate_score: {
        label: "ציון מועמד",
        term: "Candidate Score",
        what: "דירוג משולב של איכות Rule #1, תבנית תזמון ומרווח ביטחון — גבוה יותר = עדיפות לבדיקה.",
    },
};

/** Every metric in one lookup, for generic call sites. */
export const ALL_METRICS: Record<string, MetricInfo> = {
    ...BIG5_METRICS,
    ...VALUATION_METRICS,
    ...STICKER_BREAKDOWN,
    ...MARKET_RATIOS,
    ...TECHNICAL_METRICS,
};

export function metricInfo(key: string): MetricInfo | undefined {
    return ALL_METRICS[key];
}

/** Hebrew for the technical signal values the backend emits. */
export const SIGNAL_HE: Record<string, string> = {
    Green: "ירוק",
    Red: "אדום",
    Yellow: "צהוב",
    Neutral: "ניטרלי",
};

/** Hebrew for the pass/fail state of a Big 5 metric. */
export const CONSISTENCY_HE = {
    pass: "עומד ביעד",
    fail: "לא עומד ביעד",
} as const;

/**
 * Data-quality and adjustment badges.
 * These were rendered as raw English ("Incomplete Data", "Split adj ×4").
 */
export const QUALITY_BADGES: Record<string, MetricInfo> = {
    incomplete: {
        label: "נתונים חסרים",
        what: "לחברה חסרים דוחות או שדות מהותיים, ולכן הניתוח פחות אמין ולא יאושר כ«קנייה» מלאה.",
    },
    split_adjusted: {
        label: "מתואם לפיצול",
        what: "נמצא פיצול מניות שהתרחש אחרי תאריך הדוחות, והנתונים ההיסטוריים תואמו בהתאם.",
    },
    below_mos: {
        label: "מתחת למרווח ביטחון",
        what: "מחיר השוק נמוך ממחיר ה-MOS — כלומר המניה נסחרת בהנחה מול השווי המוערך.",
    },
};

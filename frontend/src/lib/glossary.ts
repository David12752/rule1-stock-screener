/**
 * מילון מונחים פיננסיים - כלל מספר 1
 * Centralized glossary for all Rule #1 financial terms
 */

export interface GlossaryEntry {
  term: string;        // Hebrew display name
  short: string;       // Brief one-line explanation
  detail?: string;     // Longer explanation (optional)
  ideal?: string;      // What's considered "good" for this metric
}

export const glossary: Record<string, GlossaryEntry> = {
  // === Big 5 Growth Rates ===
  roic: {
    term: "תשואה על הון מושקע (ROIC)",
    short: "כמה רווח החברה מייצרת על כל שקל שהושקע בה",
    detail: "Return on Invested Capital — מדד שמראה כמה החברה יעילה בשימוש בהון שנכנס אליה (הון עצמי + חוב). ככל שהערך גבוה יותר — החברה טובה יותר בייצור ערך.",
    ideal: "≥ 10% באופן עקבי",
  },
  equity: {
    term: "הון עצמי (Equity)",
    short: "שווי נכסי החברה פחות חובותיה",
    detail: "Book Value / Equity — מייצג את מה ששייך לבעלי המניות אחרי שמחסירים את כל החובות. קצב צמיחה גבוה מעיד על חברה שמצברת ערך.",
    ideal: "צמיחה ≥ 10% בשנה",
  },
  eps: {
    term: "רווח למניה (EPS)",
    short: "כמה רווח נקי מיוחס לכל מניה",
    detail: "Earnings Per Share — הרווח הנקי של החברה חלקי מספר המניות. עלייה עקבית ב-EPS מעידה על צמיחה בריאה.",
    ideal: "צמיחה ≥ 10% בשנה",
  },
  revenue: {
    term: "הכנסות (Revenue)",
    short: "סך כל המכירות של החברה",
    detail: "Revenue / Sales — הכסף שנכנס לחברה ממכירת מוצרים ושירותים, לפני ניכוי הוצאות.",
    ideal: "צמיחה ≥ 10% בשנה",
  },
  fcf: {
    term: "תזרים מזומנים חופשי (FCF)",
    short: "כמה מזומן נשאר אחרי כל ההוצאות וההשקעות",
    detail: "Free Cash Flow — הכסף שנשאר לחברה אחרי שהיא משלמת את כל ההוצאות התפעוליות ורכישות נכסים. מזומן חופשי = גמישות.",
    ideal: "צמיחה ≥ 10% בשנה",
  },

  // === Valuation Metrics ===
  stickerPrice: {
    term: "מחיר מדבקה",
    short: "המחיר ההוגן של המניה לפי שיטת כלל מספר 1",
    detail: "Sticker Price — מחיר שמחושב על בסיס EPS נוכחי, קצב צמיחה צפוי, ו-PE צפוי. אם מחיר השוק נמוך מ-50% ממחיר המדבקה — יש מרווח ביטחון.",
    ideal: "מחיר שוק < 50% ממחיר מדבקה",
  },
  mos: {
    term: "מרווח ביטחון (MOS)",
    short: "ההנחה שאתה מקבל ביחס למחיר ההוגן",
    detail: "Margin of Safety — ההפרש בין מחיר המדבקה למחיר השוק. כלל מספר 1 דורש מרווח ביטחון של לפחות 50% — כלומר לקנות ב-50% מהמחיר ההוגן.",
    ideal: "≥ 50%",
  },
  paybackTime: {
    term: "זמן החזר",
    short: "כמה שנים ייקח להחזיר את ההשקעה מתוך רווחי החברה",
    detail: "Payback Time — כמה שנים של רווחים (FCF) צריך כדי לכסות את מחיר הקנייה של המניה. שיטה שמחליפה את ה-PE הקלאסי.",
    ideal: "≤ 8 שנים",
  },
  tenCapRate: {
    term: "שיעור תשואה 10-Cap",
    short: "תשואה שנתית צפויה אם קונים ב-10 שנות רווח",
    detail: "Ten Cap Rate — מה תהיה התשואה השנתית אם תשלם 10 פעמים את הרווחים (Owner Earnings) הנוכחיים. ככל שהמספר גבוה יותר — העסקה טובה יותר.",
    ideal: "≥ 10%",
  },

  // === Moat (חפיר) ===
  moat: {
    term: "חפיר כלכלי",
    short: "היתרון התחרותי שמגן על החברה מפני מתחרים",
    detail: "Economic Moat — כמו חפיר סביב טירה, יתרון תחרותי מגן על רווחי החברה לאורך זמן. 5 סוגי חפירים: מותג, סוד, מעבר, מחסום, מחיר.",
    ideal: "ציון ≥ 7/10",
  },
  moatBrand: {
    term: "חפיר מותג",
    short: "לקוחות מוכנים לשלם יותר בגלל שם המותג",
  },
  moatSecret: {
    term: "חפיר סוד",
    short: "פטנטים, טכנולוגיה או ידע ייחודי שקשה להעתיק",
  },
  moatSwitching: {
    term: "חפיר מעבר",
    short: "עלות גבוהה ללקוח לעבור למתחרה",
  },
  moatToll: {
    term: "חפיר מחסום",
    short: "מונופול או שליטה בגישה לשוק",
  },
  moatPrice: {
    term: "חפיר מחיר",
    short: "יכולת לספק מחיר נמוך יותר מכל מתחרה",
  },

  // === Verdicts ===
  verdict: {
    term: "הערכה סופית",
    short: "המלצת הכלי — האם המניה עומדת בכל הקריטריונים",
    detail: "סיכום שמביא בחשבון את כל 4 קריטריוני כלל מספר 1: משמעות, חפיר, הנהלה, ומרווח ביטחון. ירוק = חיובי, אדום = שלילי, צהוב = חלקי.",
  },
  verdictGreen: {
    term: "✅ כדאי לבדוק",
    short: "המניה עומדת ברוב הקריטריונים — שווה מחקר מעמיק",
  },
  verdictYellow: {
    term: "⚠️ נדרש מחקר נוסף",
    short: "המניה עומדת בחלק מהקריטריונים — יש סימני שאלה",
  },
  verdictRed: {
    term: "❌ לא עומד בקריטריונים",
    short: "המניה לא עומדת בקריטריונים — כרגע לא מומלצת",
  },

  // === Rule #1 Concepts ===
  rule1: {
    term: "כלל מספר 1",
    short: "אל תפסיד כסף — שיטת ההשקעות של פיל טאון",
    detail: "Rule #1 Investing — שיטה שמבוססת על 4 עקרונות: (1) משמעות — תבין את העסק, (2) חפיר — יתרון תחרותי, (3) הנהלה — מנהיגות טובה, (4) מרווח ביטחון — קנה בהנחה.",
  },
  meaning: {
    term: "משמעות",
    short: "האם אתה מבין את העסק ומאמין בו?",
    detail: "M — Meaning: העיקרון הראשון — השקע רק בחברות שאתה מבין מה הן עושות, למה הן קיימות, ואתה מאמין בחזון שלהן.",
  },
  management: {
    term: "הנהלה",
    short: "האם המנהלים ישרים, מוכשרים ומכוונים לטווח ארוך?",
    detail: "M — Management: בדוק ROIC, תשואה על הון, ואת ההיסטוריה של ההנהלה. מנהלים טובים מייצרים ערך עקבי.",
  },

  // === Financial Terms ===
  pe: {
    term: "מכפיל רווח (P/E)",
    short: "כמה שנות רווח נוכחי משקפות את מחיר המניה",
    detail: "Price to Earnings — מחיר המניה חלקי הרווח למניה. מכפיל נמוך = יחסית זול, גבוה = יחסית יקר.",
  },
  debtPayoff: {
    term: "יכולת פירעון חוב",
    short: "כמה שנים ייקח לחברה לסגור את כל החוב שלה",
    detail: "Debt Payoff Years — סך החוב חלקי התזרים החופשי. ככל שהמספר נמוך יותר — החברה במצב פיננסי טוב יותר.",
    ideal: "≤ 3 שנים",
  },
  marketCap: {
    term: "שווי שוק",
    short: "הערך הכולל של כל המניות של החברה",
  },
  beta: {
    term: "בטא (β)",
    short: "כמה המניה תנודתית ביחס לשוק",
    detail: "Beta — מדד תנודתיות. β=1 נע עם השוק, β>1 תנודתי יותר, β<1 יציב יותר.",
  },
  rsi: {
    term: "RSI",
    short: "מדד חוזק יחסי — האם המניה בקניית/מכירת יתר",
    detail: "Relative Strength Index — מדד מ-0 עד 100. מעל 70 = קניית יתר (יקר), מתחת ל-30 = מכירת יתר (זול).",
  },

  // === Big 5 Summary ===
  big5: {
    term: "5 הגדולים (Big 5)",
    short: "5 מדדי הצמיחה שכלל מספר 1 בודק",
    detail: "Big 5 Growth Rates — חמישה מדדי צמיחה שחייבים להיות מעל 10% לשנה: הכנסות, EPS, הון עצמי, FCF, ו-ROIC.",
    ideal: "כל 5 ≥ 10%",
  },
  big5Count: {
    term: "ציון B5",
    short: "כמה מתוך 5 מדדי הצמיחה עוברים את רף ה-10%",
    ideal: "5/5",
  },
};

/**
 * Get a glossary entry by key
 */
export function getGlossaryEntry(key: string): GlossaryEntry | undefined {
  return glossary[key];
}

/**
 * Get just the short explanation for a term
 */
export function getTermExplanation(key: string): string {
  return glossary[key]?.short ?? key;
}

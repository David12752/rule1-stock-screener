/** Shared labels + real-world exchange coordinates for universe selection. */

export const LABEL_HE: Record<string, string> = {
  all: "כל היקומים",
  sp500: "S&P 500",
  nasdaq100: "NASDAQ-100",
  sp400: "S&P 400",
  sp600: "S&P 600",
  dowjones: "Dow 30",
  ftse100: "FTSE 100",
  dax: "DAX 40",
  cac40: "CAC 40",
  aex: "AEX 25",
  smi: "SMI 20",
  ibex35: "IBEX 35",
  tsx: "TSX 60",
  asx200: "ASX 200",
  nikkei225: "Nikkei 225",
  hangseng: "Hang Seng",
  ta35: "ת״א-35",
  ta125: "ת״א-125",
};

export const REGION_HE: Record<string, string> = {
  us: "ארה״ב",
  europe: "אירופה",
  americas: "אמריקה",
  apac: "אסיה־פסיפיק",
  israel: "ישראל",
  other: "אחר",
};

/** Exchange / index headquarters — real lat/lon (WGS84). */
export const EXCHANGE_GEO: Record<
  string,
  { lat: number; lon: number; city: string; exchange: string }
> = {
  // New York Stock Exchange / S&P — Wall Street
  sp500: { lat: 40.7069, lon: -74.0113, city: "ניו יורק", exchange: "NYSE" },
  dowjones: { lat: 40.7128, lon: -74.006, city: "ניו יורק", exchange: "DJIA" },
  // Nasdaq MarketSite — Times Square
  nasdaq100: { lat: 40.756, lon: -73.986, city: "ניו יורק", exchange: "NASDAQ" },
  // S&P MidCap — Chicago (CME / Midwest hub)
  sp400: { lat: 41.8781, lon: -87.6298, city: "שיקגו", exchange: "S&P" },
  // SmallCap — slight SE offset (Atlanta Fed region)
  sp600: { lat: 33.749, lon: -84.388, city: "אטלנטה", exchange: "S&P" },
  // Europe
  ftse100: { lat: 51.5155, lon: -0.0922, city: "לונדון", exchange: "LSE" },
  dax: { lat: 50.1109, lon: 8.6821, city: "פרנקפורט", exchange: "FWB" },
  cac40: { lat: 48.8698, lon: 2.3081, city: "פריז", exchange: "Euronext" },
  aex: { lat: 52.3731, lon: 4.8922, city: "אמסטרדם", exchange: "Euronext" },
  smi: { lat: 47.3769, lon: 8.5417, city: "ציריך", exchange: "SIX" },
  ibex35: { lat: 40.4168, lon: -3.7038, city: "מדריד", exchange: "BME" },
  // Americas
  tsx: { lat: 43.6481, lon: -79.3819, city: "טורונטו", exchange: "TSX" },
  // APAC
  asx200: { lat: -33.8688, lon: 151.2093, city: "סידני", exchange: "ASX" },
  nikkei225: { lat: 35.6812, lon: 139.7671, city: "טוקיו", exchange: "TSE" },
  hangseng: { lat: 22.3193, lon: 114.1694, city: "הונג קונג", exchange: "HKEX" },
  // Israel — Tel Aviv Stock Exchange
  ta35: { lat: 32.0644, lon: 34.7712, city: "תל אביב", exchange: "TASE" },
  ta125: { lat: 32.0853, lon: 34.7818, city: "תל אביב", exchange: "TASE" },
};

/** Equirectangular projection → CSS % (use physical `left`/`top`, not RTL logical). */
export function projectToPercent(lat: number, lon: number) {
  return {
    left: ((lon + 180) / 360) * 100,
    top: ((90 - lat) / 180) * 100,
  };
}

export function labelOf(id: string, fallback?: string) {
  return LABEL_HE[id] ?? fallback ?? id;
}

/** Shared regional palette — world map + star map. */
export const REGION_STYLE: Record<
  string,
  { fill: string; fillHover: string; pin: string; glow: string; label: string }
> = {
  us: {
    fill: "#3d8f6e",
    fillHover: "#4db888",
    pin: "#34d399",
    glow: "rgba(52,211,153,0.55)",
    label: "ארה״ב",
  },
  americas: {
    fill: "#2f7d6a",
    fillHover: "#3d9a82",
    pin: "#2dd4bf",
    glow: "rgba(45,212,191,0.5)",
    label: "אמריקה",
  },
  europe: {
    fill: "#4a7ec8",
    fillHover: "#5b92e0",
    pin: "#60a5fa",
    glow: "rgba(96,165,250,0.55)",
    label: "אירופה",
  },
  africa: {
    fill: "#c4a35a",
    fillHover: "#d4b56a",
    pin: "#eab308",
    glow: "rgba(234,179,8,0.45)",
    label: "אפריקה",
  },
  apac: {
    fill: "#c47a4a",
    fillHover: "#d48c5c",
    pin: "#fb923c",
    glow: "rgba(251,146,60,0.55)",
    label: "אסיה־פסיפיק",
  },
  asia: {
    fill: "#b86b8c",
    fillHover: "#c87a9a",
    pin: "#f472b6",
    glow: "rgba(244,114,182,0.45)",
    label: "אסיה",
  },
  israel: {
    fill: "#5b9fd4",
    fillHover: "#6eb0e0",
    pin: "#38bdf8",
    glow: "rgba(56,189,248,0.6)",
    label: "ישראל",
  },
  oceania: {
    fill: "#7a6bc4",
    fillHover: "#8d7cd4",
    pin: "#a78bfa",
    glow: "rgba(167,139,250,0.5)",
    label: "אוקיאניה",
  },
  other: {
    fill: "#5a6a7a",
    fillHover: "#6a7a8a",
    pin: "#94a3b8",
    glow: "rgba(148,163,184,0.4)",
    label: "אחר",
  },
};

/** Map WGS84 point → coarse continent bucket for land coloring. */
export function continentBucket(lat: number, lon: number): keyof typeof REGION_STYLE {
  if (lat < -55) return "other";
  if (lon >= 110 && lat < 10 && lat > -50) return "oceania";
  if (lon >= 25 && lon < 55 && lat >= 29 && lat <= 42) return "israel";
  if (lon >= -30 && lon <= 45 && lat >= 36) return "europe";
  if (lon >= -20 && lon <= 55 && lat < 37 && lat > -35) return "africa";
  if (lon < -25) return lat > 15 ? "us" : "americas";
  if (lon >= 40) return "apac";
  return "other";
}

export function regionStyleForUniverse(region?: string) {
  const key = region && REGION_STYLE[region] ? region : "other";
  return REGION_STYLE[key];
}


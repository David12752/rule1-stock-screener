"use client";

import { InfoTooltip } from "@/components/info-tooltip";

interface StickerPriceGaugeProps {
  currentPrice: number;
  stickerPrice: number;
  mosPrice: number;
}

/**
 * Professional SVG valuation gauge — plan §3.8.
 * Green = below MOS, yellow = between MOS and sticker, red = above sticker.
 */
export function StickerPriceGauge({
  currentPrice,
  stickerPrice,
  mosPrice,
}: StickerPriceGaugeProps) {
  const maxVal = Math.max(stickerPrice * 1.45, currentPrice * 1.1, mosPrice * 1.2, 1);
  const clampedPrice = Math.max(0, Math.min(currentPrice, maxVal));
  const mosFrac = Math.min(Math.max(mosPrice / maxVal, 0), 1);
  const stickerFrac = Math.min(Math.max(stickerPrice / maxVal, 0), 1);

  let priceColor = "#ef4444";
  let zoneLabel = "מעל מחיר המדבקה — יקר";
  if (currentPrice <= mosPrice) {
    priceColor = "#34d399";
    zoneLabel = "מתחת למרווח ביטחון — אטרקטיבי";
  } else if (currentPrice <= stickerPrice) {
    priceColor = "#eab308";
    zoneLabel = "בין MOS למדבקה — לבדוק";
  }

  const cx = 140;
  const cy = 118;
  const r = 96;
  const strokeWidth = 14;

  function arcPath(startFrac: number, endFrac: number): string {
    const startAngle = Math.PI * (1 - startFrac);
    const endAngle = Math.PI * (1 - endFrac);
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy - r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy - r * Math.sin(endAngle);
    const largeArc = Math.abs(startFrac - endFrac) > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  const needleAngle = Math.PI * (1 - clampedPrice / maxVal);
  const needleLen = r - 14;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  const discountToMos =
    mosPrice > 0 ? ((mosPrice - currentPrice) / mosPrice) * 100 : null;

  return (
    <div className="flex flex-col items-center">
      <svg
        width="280"
        height="150"
        viewBox="0 0 280 150"
        className="overflow-visible"
        role="img"
        aria-label={`מחיר ${currentPrice}, MOS ${mosPrice}, מדבקה ${stickerPrice}`}
      >
        <defs>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={priceColor} floodOpacity="0.55" />
          </filter>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
          </linearGradient>
        </defs>

        <path
          d={arcPath(0, 1)}
          fill="none"
          stroke="url(#trackGrad)"
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
        />

        {/* Green: 0 → MOS */}
        {mosFrac > 0.01 && (
          <path
            d={arcPath(1, 1 - mosFrac)}
            fill="none"
            stroke="#34d399"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.85}
          />
        )}
        {/* Yellow: MOS → sticker */}
        {stickerFrac > mosFrac && (
          <path
            d={arcPath(1 - mosFrac, 1 - stickerFrac)}
            fill="none"
            stroke="#eab308"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.8}
          />
        )}
        {/* Red: sticker → max */}
        {stickerFrac < 0.99 && (
          <path
            d={arcPath(1 - stickerFrac, 0)}
            fill="none"
            stroke="#f87171"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.75}
          />
        )}

        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke={priceColor}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
          style={{ transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
        <circle cx={cx} cy={cy} r={6} fill={priceColor} filter="url(#gaugeGlow)" />
        <circle cx={cx} cy={cy} r={2.5} fill="#fff" opacity={0.9} />

        <text x={16} y={cy + 20} className="fill-muted-foreground" fontSize="10">
          $0
        </text>
        <text
          x={280 - 16}
          y={cy + 20}
          className="fill-muted-foreground"
          fontSize="10"
          textAnchor="end"
        >
          ${maxVal.toFixed(0)}
        </text>
      </svg>

      <div className="mt-[-6px] text-center">
        <div className="mb-0.5 flex items-center justify-center gap-1">
          <span className="text-[11px] text-muted-foreground">מחיר נוכחי</span>
          <InfoTooltip termKey="stickerPrice" size="sm" />
        </div>
        <p className="font-mono text-2xl font-bold" style={{ color: priceColor }}>
          ${currentPrice.toFixed(2)}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: priceColor }}>
          {zoneLabel}
          {discountToMos != null && currentPrice <= mosPrice ? (
            <span className="ms-1 font-mono opacity-90">
              ({discountToMos > 0 ? "+" : ""}
              {discountToMos.toFixed(0)}% מול MOS)
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">מרווח ביטחון</span>
            <span className="font-mono text-emerald-400">${mosPrice.toFixed(0)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            <span className="text-muted-foreground">מחיר מדבקה</span>
            <span className="font-mono text-yellow-400">${stickerPrice.toFixed(0)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

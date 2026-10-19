"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { UniverseInfo } from "@/components/workspace/workspace-context";
import {
  EXCHANGE_GEO,
  continentBucket,
  labelOf,
  projectToPercent,
  regionStyleForUniverse,
  REGION_HE,
  REGION_STYLE,
} from "@/features/workspace/universe-meta";
import { Check, Focus, Globe2, Minus, Plus, RotateCcw } from "lucide-react";

type Props = {
  items: UniverseInfo[];
  selectedUniverse: string;
  setSelectedUniverse: (id: string) => void;
  total: number;
  maxCount: number;
};

type LandPath = { d: string; fill: string };

/** Display offsets (%) so dense hubs don't stack on top of each other. */
const DISPLAY_NUDGE: Record<string, { dx: number; dy: number }> = {
  sp500: { dx: -1.2, dy: -1.4 },
  nasdaq100: { dx: 1.4, dy: -1.2 },
  dowjones: { dx: 0.2, dy: 1.6 },
  sp400: { dx: -2.2, dy: 0.4 },
  sp600: { dx: 1.8, dy: 2.2 },
  tsx: { dx: 0, dy: -2.2 },
  ftse100: { dx: -2.8, dy: -1.6 },
  aex: { dx: 0.6, dy: -2.8 },
  cac40: { dx: -2.2, dy: 1.2 },
  dax: { dx: 2.6, dy: -1.0 },
  smi: { dx: 2.8, dy: 1.4 },
  ibex35: { dx: -1.2, dy: 2.8 },
  ta35: { dx: -1.8, dy: -1.4 },
  ta125: { dx: 1.8, dy: 1.4 },
  hangseng: { dx: -1.2, dy: 1.8 },
  nikkei225: { dx: 1.6, dy: -1.2 },
  asx200: { dx: 0, dy: 2.0 },
};

const REGION_FOCUS: Record<string, { lat: number; lon: number; zoom: number }> = {
  us: { lat: 39, lon: -95, zoom: 2.4 },
  americas: { lat: 45, lon: -79, zoom: 2.6 },
  europe: { lat: 48, lon: 8, zoom: 3.2 },
  israel: { lat: 32, lon: 35, zoom: 4.2 },
  apac: { lat: 25, lon: 125, zoom: 2.3 },
  oceania: { lat: -25, lon: 135, zoom: 2.8 },
};

const REGION_ORDER = ["us", "europe", "apac", "americas", "israel"] as const;

const MIN_Z = 1;
const MAX_Z = 5;

function centroidFromPath(d: string) {
  const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sx += nums[i];
    sy += nums[i + 1];
    n += 1;
  }
  if (!n) return { lon: 0, lat: 0 };
  return {
    lon: (sx / n / 1000) * 360 - 180,
    lat: 90 - (sy / n / 500) * 180,
  };
}

/**
 * World map with aligned coordinates, always-visible exchange labels,
 * region jump chips, and a selectable list — navigation that stays readable.
 */
export function UniverseWorldMap({
  items,
  selectedUniverse,
  setSelectedUniverse,
  total,
}: Props) {
  const [landPaths, setLandPaths] = useState<LandPath[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({
    active: false,
    moved: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => {
    let cancelled = false;
    fetch("/maps/world-110m.svg")
      .then((r) => r.text())
      .then((svg) => {
        if (cancelled) return;
        const matches = [...svg.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
        setLandPaths(
          matches.map((d) => {
            const { lon, lat } = centroidFromPath(d);
            return { d, fill: REGION_STYLE[continentBucket(lat, lon)].fill };
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const markers = useMemo(() => {
    return items
      .map((u) => {
        const geo = EXCHANGE_GEO[u.id];
        if (!geo) return null;
        const base = projectToPercent(geo.lat, geo.lon);
        const nudge = DISPLAY_NUDGE[u.id] ?? { dx: 0, dy: 0 };
        return {
          u,
          geo,
          pos: { left: base.left + nudge.dx, top: base.top + nudge.dy },
          style: regionStyleForUniverse(u.region),
        };
      })
      .filter(Boolean) as {
      u: UniverseInfo;
      geo: (typeof EXCHANGE_GEO)[string];
      pos: { left: number; top: number };
      style: (typeof REGION_STYLE)[string];
    }[];
  }, [items]);

  const byRegion = useMemo(() => {
    const map = new Map<string, typeof markers>();
    for (const m of markers) {
      const r = m.u.region || "other";
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(m);
    }
    return map;
  }, [markers]);

  const clampPan = useCallback((x: number, y: number, z: number) => {
    const el = viewportRef.current;
    if (!el || z <= 1) return { x: 0, y: 0 };
    const maxX = ((z - 1) * el.clientWidth) / 2 + 40;
    const maxY = ((z - 1) * el.clientHeight) / 2 + 40;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  /** Fly map so lat/lon sits near viewport center at given zoom. */
  const focusLatLon = useCallback(
    (lat: number, lon: number, z: number) => {
      const el = viewportRef.current;
      const zoomClamped = Math.max(MIN_Z, Math.min(MAX_Z, z));
      setZoom(zoomClamped);
      if (!el || zoomClamped <= 1) {
        setPan({ x: 0, y: 0 });
        return;
      }
      const { left, top } = projectToPercent(lat, lon);
      // Content is aspect 2/1 centered — pan moves the scaled layer
      const w = el.clientWidth;
      const h = el.clientHeight;
      const contentW = Math.min(w, h * 2);
      const contentH = contentW / 2;
      const mapX = ((left / 100) - 0.5) * contentW * zoomClamped;
      const mapY = ((top / 100) - 0.5) * contentH * zoomClamped;
      setPan(clampPan(-mapX, -mapY, zoomClamped));
    },
    [clampPan]
  );

  const setZoomAt = useCallback(
    (nextZ: number, cx?: number, cy?: number) => {
      const el = viewportRef.current;
      const z = Math.max(MIN_Z, Math.min(MAX_Z, nextZ));
      if (!el || z <= 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      const prevZ = zoomRef.current;
      const prevPan = panRef.current;
      const rect = el.getBoundingClientRect();
      const px = cx ?? rect.left + rect.width / 2;
      const py = cy ?? rect.top + rect.height / 2;
      const ox = px - rect.left - rect.width / 2;
      const oy = py - rect.top - rect.height / 2;
      const ratio = z / Math.max(prevZ, 0.001);
      setZoom(z);
      setPan(
        clampPan(ox - (ox - prevPan.x) * ratio, oy - (oy - prevPan.y) * ratio, z)
      );
    },
    [clampPan]
  );

  const focusRegion = (region: string) => {
    const f = REGION_FOCUS[region];
    if (f) focusLatLon(f.lat, f.lon, f.zoom);
  };

  const selectExchange = (id: string) => {
    setSelectedUniverse(id);
    const geo = EXCHANGE_GEO[id];
    if (geo) focusLatLon(geo.lat, geo.lon, 3.4);
  };

  return (
    <div className="flex h-full min-h-0 gap-2 overflow-hidden p-1 sm:p-2">
      {/* Map pane */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-cyan-500/20 bg-[#04101c]">
        {/* Region jump bar */}
        <div className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center gap-1 border-b border-white/10 bg-black/55 p-1.5 backdrop-blur-md">
          <span className="px-1 text-[10px] text-muted-foreground">קפיצה:</span>
          {REGION_ORDER.filter((r) => byRegion.has(r)).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => focusRegion(r)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-white/10"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: REGION_STYLE[r].pin }}
              />
              {REGION_HE[r]}
              <span className="font-mono text-muted-foreground">
                {byRegion.get(r)?.length ?? 0}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="ms-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            הכל
          </button>
        </div>

        <div
          ref={viewportRef}
          className={cn(
            "absolute inset-0 top-9 overflow-hidden",
            zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          )}
          onWheel={(e) => {
            e.preventDefault();
            setZoomAt(zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = {
              active: true,
              moved: false,
              sx: e.clientX,
              sy: e.clientY,
              ox: pan.x,
              oy: pan.y,
            };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d.active) return;
            const dx = e.clientX - d.sx;
            const dy = e.clientY - d.sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            setPan(clampPan(d.ox + dx, d.oy + dy, zoom));
          }}
          onPointerUp={() => {
            dragRef.current.active = false;
          }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {/* Shared aspect box — map + pins share the same coordinate space */}
            <div className="relative aspect-[2/1] h-auto max-h-full w-full max-w-full">
              <svg
                viewBox="0 0 1000 500"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0b2740" />
                    <stop offset="100%" stopColor="#03101c" />
                  </linearGradient>
                </defs>
                <rect width="1000" height="500" fill="url(#oceanGrad)" />
                <g stroke="rgba(255,255,255,0.14)" strokeWidth="0.4">
                  {landPaths.map((p, i) => (
                    <path key={i} d={p.d} fill={p.fill} fillOpacity={0.95} />
                  ))}
                </g>
              </svg>

              {markers.map(({ u, geo, pos, style }) => {
                const active = selectedUniverse === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    title={`${labelOf(u.id, u.label)} · ${geo.city}`}
                    onClick={() => {
                      if (dragRef.current.moved) return;
                      selectExchange(u.id);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5",
                      active ? "z-30" : "z-20"
                    )}
                    style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                  >
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-md border px-1.5 py-0.5 font-heading text-[10px] font-bold leading-none shadow-md md:text-[11px]",
                        active ? "border-white text-white" : "border-black/30 text-white"
                      )}
                      style={{
                        background: active ? style.pin : `${style.fill}`,
                        boxShadow: `0 0 12px ${style.glow}`,
                      }}
                    >
                      {labelOf(u.id, u.label)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border-2 border-white shadow-md",
                        active ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
                      )}
                      style={{
                        background: style.pin,
                        boxShadow: `0 0 10px ${style.glow}`,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-3 start-3 z-40 flex flex-col gap-1">
          <CtrlBtn label="הגדל" onClick={() => setZoomAt(zoom * 1.35)}>
            <Plus className="h-4 w-4" />
          </CtrlBtn>
          <CtrlBtn label="הקטן" onClick={() => setZoomAt(zoom / 1.35)}>
            <Minus className="h-4 w-4" />
          </CtrlBtn>
          <CtrlBtn
            label="איפוס"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </CtrlBtn>
          <div className="rounded-md border border-white/10 bg-black/70 px-1.5 py-1 text-center font-mono text-[9px] text-cyan-100">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSelectedUniverse("all")}
          className={cn(
            "absolute bottom-3 end-3 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur-md",
            selectedUniverse === "all"
              ? "border-primary/60 bg-primary/30"
              : "border-white/15 bg-black/65 hover:bg-black/80"
          )}
        >
          <Globe2 className="h-3.5 w-3.5 text-primary" />
          כל היקומים
          <span className="font-mono text-primary">{total.toLocaleString("he-IL")}</span>
          {selectedUniverse === "all" ? <Check className="h-3 w-3" /> : null}
        </button>
      </div>

      {/* Always-visible exchange list */}
      <aside className="flex w-[min(42vw,220px)] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:w-[240px]">
        <div className="border-b border-white/10 px-2.5 py-2">
          <div className="font-heading text-xs font-semibold">בורסות לבחירה</div>
          <div className="text-[10px] text-muted-foreground">לחיצה = בחירה + מיקוד במפה</div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => {
              setSelectedUniverse("all");
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-start text-xs transition-colors",
              selectedUniverse === "all"
                ? "border-primary/50 bg-primary/20"
                : "border-white/10 hover:bg-white/[0.04]"
            )}
          >
            <span className="font-heading font-semibold">כל היקומים</span>
            <span className="font-mono text-primary">{total.toLocaleString("he-IL")}</span>
          </button>

          {REGION_ORDER.filter((r) => byRegion.has(r)).map((region) => {
            const list = byRegion.get(region)!;
            const rs = REGION_STYLE[region];
            return (
              <div key={region}>
                <button
                  type="button"
                  onClick={() => focusRegion(region)}
                  className="mb-1 flex w-full items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: rs.pin }} />
                  {REGION_HE[region]}
                  <Focus className="ms-auto h-3 w-3 opacity-50" />
                </button>
                <div className="space-y-0.5">
                  {list.map(({ u, geo, style }) => {
                    const active = selectedUniverse === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => selectExchange(u.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-start transition-colors",
                          active
                            ? "border-white/30 bg-white/10"
                            : "border-transparent hover:bg-white/[0.04]"
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: style.pin, boxShadow: `0 0 8px ${style.glow}` }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-heading text-[11px] font-semibold">
                            {labelOf(u.id, u.label)}
                          </span>
                          <span className="block truncate text-[9px] text-muted-foreground">
                            {geo.city} · {geo.exchange}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-foreground/80">
                          {(u.count || 0).toLocaleString("he-IL")}
                        </span>
                        {active ? <Check className="h-3 w-3 shrink-0 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function CtrlBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/70 text-foreground backdrop-blur-md hover:bg-black/90"
    >
      {children}
    </button>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Layers, Compass } from 'lucide-react';
import type { RadarTarget, ThreatType } from '../types';
import { skinOf, neptunSkin } from './threatIcons';

interface TacticalMapProps {
  targets: RadarTarget[];
  selectedTargetId: string | null;
  onSelectTarget: (target: RadarTarget) => void;
  viewMode: '2D' | '3D';
  onToggleViewMode: () => void;
}

// Tactical region labels matching military monitoring maps
const REGION_LABELS = [
  { name: 'УКРАЇНА', coords: [31.2, 49.0], color: '#38bdf8', size: 'text-sm font-black' },
  { name: 'СМОЛЕНСЬКА ОБЛАСТЬ', coords: [32.0, 54.8], color: '#f87171', size: 'text-xs font-bold' },
  { name: 'БРЯНСЬКА ОБЛАСТЬ', coords: [34.3, 52.8], color: '#f87171', size: 'text-xs font-bold' },
  { name: 'КУРСЬКА ОБЛАСТЬ', coords: [36.2, 51.7], color: '#f87171', size: 'text-xs font-bold' },
  { name: 'БЄЛГОРОДСЬКА ОБЛАСТЬ', coords: [36.6, 50.6], color: '#f87171', size: 'text-xs font-bold' },
  { name: 'БІЛОРУСЬ', coords: [28.0, 53.2], color: '#94a3b8', size: 'text-xs font-bold' },
  { name: 'ПОЛЬЩА', coords: [23.1, 51.5], color: '#94a3b8', size: 'text-xs font-bold' },
  { name: 'МОЛДОВА', coords: [28.8, 47.0], color: '#94a3b8', size: 'text-xs font-bold' },
  { name: 'РУМУНІЯ', coords: [26.0, 45.8], color: '#94a3b8', size: 'text-xs font-bold' },
  { name: 'м. ЧАУДА (ТОТ КРИМ)', coords: [35.84, 45.01], color: '#fbbf24', size: 'text-[11px] font-bold' },
];

// ---------------------------------------------------------------------------
// Altitude model (single source of truth for badge + overlay + marker lift).
// Ground track comes from backend AS IS (original curved shape);
// the visible lift is added here in screen space.
// ---------------------------------------------------------------------------
function getApogeeMeters(threatType: string): number {
  switch (threatType) {
    case 'BALLISTIC':
      return 100000; // ~100 km suborbital apogee (Iskander-M / Kinzhal class)
    case 'KAB':
      return 9000;
    case 'CRUISE_MISSILE':
      return 1800;
    case 'SHAHED':
      return 900;
    case 'JET_SHAHED':
      return 2500;
    case 'RECON_UAV':
      return 1500;
    default:
      return 1000;
  }
}

/** Vertical profile by threat kind.
 * BALLISTIC: 0 at launch & impact, 1.0 at apogee (suborbital arc).
 * KAB: monotonic glide descent, release altitude -> 0 at impact.
 * Others: low-level ripple (near-ground flight). */
function altitudeAt(progress: number, apogee: number, threatType: string = 'BALLISTIC'): number {
  const p = Math.min(Math.max(progress, 0), 1);
  if (threatType === 'KAB') return (1 - p) * apogee;
  return Math.sin(Math.PI * p) * apogee;
}

/** Display (schematic) apogee for the 3D picture. Low flyers (cruise ~50 m,
 * Shaheds) would lie flat on the map at true scale, so in 3D they get an
 * exaggerated but characteristic lift. The ВИС badge always shows the REAL
 * physical altitude from altitudeAt(), never this number. */
function visualApogeeMeters(threatType: string): number {
  switch (threatType) {
    case 'BALLISTIC':
      return 100000;
    case 'KAB':
      return 9000;
    case 'CRUISE_MISSILE':
      return 12000;
    case 'JET_SHAHED':
      return 9000;
    case 'SHAHED':
      return 7000;
    case 'RECON_UAV':
      return 4000;
    default:
      return 5000;
  }
}

/** Display altitude used by the overlay line AND the flying icon (3D only).
 * Ballistic/KAB use the true profile; low threats use the schematic arc. */
function visualAltAt(progress: number, threatType: string): number {
  if (threatType === 'BALLISTIC' || threatType === 'KAB') {
    return altitudeAt(progress, getApogeeMeters(threatType), threatType);
  }
  const p = Math.min(Math.max(progress, 0), 1);
  return Math.sin(Math.PI * p) * visualApogeeMeters(threatType);
}

/** Map a NEPTUN family to the simulation threat key driving the 3D lift.
 * Fast Shaheds (>=400 km/h) fly the JET_SHAHED profile like the simulator. */
function neptunLiftKey(family: string, speedKmh: number | null): ThreatType {
  if (family === 'BALLISTIC' || family === 'MIG31K') return 'BALLISTIC';
  if (family === 'CRUISE_MISSILE') return 'CRUISE_MISSILE';
  if (family === 'KAB') return 'KAB';
  if (family === 'RECON_UAV') return 'RECON_UAV';
  if (family === 'SHAHED' || family === 'FPV') {
    return speedKmh != null && speedKmh >= 400 ? 'JET_SHAHED' : 'SHAHED';
  }
  return 'RECON_UAV';
}

/** Marching-ants stroke for a NEPTUN track — same character as simulation. */
function neptunDashFor(key: string): { dash: number[]; dashMult: number } {
  if (key === 'SHAHED') return { dash: [10, 7], dashMult: 0.7 };
  if (key === 'JET_SHAHED') return { dash: [12, 6], dashMult: 2.3 };
  if (key === 'CRUISE_MISSILE') return { dash: [16, 9], dashMult: 1.5 };
  if (key === 'RECON_UAV') return { dash: [2, 7], dashMult: 0.45 };
  return { dash: [], dashMult: 1 };
}

// ---------------------------------------------------------------------------
// Persistent per-track colors: EVERY live track (simulation + NEPTUN) keeps
// its own distinct color for its whole lifetime — stable across zoom and
// time, so you can always tell which flies where. The first track of a
// kind keeps its per-type palette color; duplicates take overflow colors.
// ---------------------------------------------------------------------------
const OVERFLOW_PALETTE = [
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#a3e635', // lime
  '#facc15', // yellow
  '#f8fafc', // white
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#a5b4fc', // light indigo
];

/** Paint (or clear, when color is null) the cluster chip on a sim marker. */
function paintSimCluster(
  m: { rotorEl: HTMLElement | null; haloEl: HTMLElement | null; svgEl: Element | null; badgeEl: HTMLElement | null },
  color: string | null,
) {
  if (m.haloEl) {
    m.haloEl.style.backgroundColor = color ? `${color}44` : '';
    m.haloEl.style.boxShadow = color ? `0 0 14px ${color}` : '';
  }
  if (m.rotorEl) {
    m.rotorEl.style.backgroundColor = color ?? '';
    m.rotorEl.style.borderRadius = color ? '9999px' : '';
    m.rotorEl.style.padding = color ? '2px' : '';
  }
  if (m.svgEl instanceof SVGElement) {
    (m.svgEl as unknown as HTMLElement).style.filter = color ? 'brightness(0) invert(1)' : '';
  }
  if (m.badgeEl) m.badgeEl.style.borderColor = color ?? '';
}

/** Paint (or clear) the cluster chip on a NEPTUN live marker. */
function paintNeptunCluster(
  r: { rotorEl: HTMLElement | null; haloEl: HTMLElement | null },
  color: string | null,
) {
  if (r.haloEl) {
    r.haloEl.style.backgroundColor = color ? `${color}44` : '';
    r.haloEl.style.boxShadow = color ? `0 0 14px ${color}` : '';
  }
  if (r.rotorEl) {
    r.rotorEl.style.backgroundColor = color ?? '';
    r.rotorEl.style.borderRadius = color ? '9999px' : '';
    r.rotorEl.style.padding = color ? '1px' : '';
    // NEPTUN silhouettes already render white via inline filter — keep it.
  }
}

/** Oblast alert rollup for the legend. */
interface OblastMeta {
  updatedAt: number;
  upstream: string;
  red: number;
  yellow: number;
  error: string;
}

/** Screen-space exaggeration so 100 km reads clearly at country zoom. */
const ALT_PX_EXAGGERATION = 2.0;

/** Max arc height as a fraction of the leg's on-screen length. Without
 * this, close zoom turns every short hop into a giant take-off-and-
 * landing loop (7000 m schematic lift vs tens of px of leg). */
const MAX_LIFT_FRAC = 0.45;

/** 0..1 shrink factor for a leg's 3D lift: full height on long legs,
 * proportionally flattened on short ones, near-flat on dots. */
function liftScaleFor(legScreenPx: number, maxLiftPx: number): number {
  if (!(maxLiftPx > 0)) return 1;
  if (!isFinite(legScreenPx) || legScreenPx < 0) return 1;
  const cap = Math.max(legScreenPx, 8) * MAX_LIFT_FRAC;
  return Math.min(1, cap / maxLiftPx);
}

/** Local flight progress 0..1 from wall clock (matches animation loop). */
function progressOf(t: RadarTarget, nowS: number): number {
  const total = Math.max(t.eta_seconds, 1.0);
  return Math.min(Math.max((nowS - t.start_time) / total, 0), 1);
}

/** One NEPTUN live threat (see backend neptun_threats.py / developers docs). */
export interface NeptunThreat {
  id: string;
  ntype: string;
  family: string;
  title: string;
  region: string;
  district: string;
  locality: string;
  lat: number;
  lon: number;
  heading: number | null;
  confidence: string;
  sourceCount: number;
  count: number;
  status: string;
  updatedAt: string;
  confirmedAt: string;
  speedKmh: number | null;
  bearingDeg: number | null;
  advisory: boolean;
  areaOnly: boolean;
  explanation: string;
  launch?: { lat: number; lon: number; name: string } | null;
  destination?: { lat: number; lon: number; name: string } | null;
  expectedTrajectory?: number[][];
  /** Flown history (launch -> live fix), drawn solid in the same color. */
  flownTrajectory?: number[][];
  /** Flown fraction of the full launch->dest flight (backend estimate).
   * The trajectory itself is forward-only (live fix -> dest). */
  progressBase?: number | null;
}

/** Great-circle destination point. */
function destPoint(lat: number, lon: number, bearingDeg: number, km: number): [number, number] {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const la1 = (lat * Math.PI) / 180;
  const lo1 = (lon * Math.PI) / 180;
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(km / R) + Math.cos(la1) * Math.sin(km / R) * Math.cos(br),
  );
  const lo2 =
    lo1 + Math.atan2(Math.sin(br) * Math.sin(km / R) * Math.cos(la1), Math.cos(km / R) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}

/** Dead-reckon a NEPTUN threat like their SDK predict(): velocity * time
 * since confirmedAt. Static otherwise (and always static for areaOnly).
 * confirmedMs is pre-parsed once per fetch (never Date.parse in the loop). */
function predictNeptun(t: NeptunThreat, nowMs: number, confirmedMs: number | null): { lat: number; lon: number; heading: number | null } {
  const h = t.heading ?? t.bearingDeg ?? null;
  if (!t.areaOnly && t.status === 'active' && t.speedKmh && t.bearingDeg != null && confirmedMs != null) {
    const dtH = Math.max(0, (nowMs - confirmedMs) / 3600000);
    if (dtH > 0 && dtH <= 0.25) {
      const distKm = Math.min(25, t.speedKmh * dtH);
      const [la, lo] = destPoint(t.lat, t.lon, t.bearingDeg, distKm);
      return { lat: la, lon: lo, heading: h };
    }
  }
  return { lat: t.lat, lon: t.lon, heading: h };
}

/** Full-flight progress for a NEPTUN forward arc: the arc itself starts at
 * the live fix, so the backend-sent flown fraction is added on top. */
function neptunProgress(t: NeptunThreat, frac: number): number {
  const base = t.progressBase ?? 0.5;
  const f = Math.min(Math.max(frac, 0), 1);
  return Math.min(Math.max(base + (1 - base) * f, 0), 1);
}

/** Snap a dead-reckoned fix onto the displayed trajectory (segment
 * projection, equirectangular with cos(lat) lon weight). Returns the
 * snapped point + its 0..1 fraction along the arc, or null without a track.
 * Keeps the marker glued to its line even when reported heading drifts
 * off the drawn arc. */
function snapToTraj(lat: number, lon: number, traj: number[][]): { lat: number; lon: number; frac: number } | null {
  if (!traj || traj.length < 2) return null;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  let best: { d: number; la: number; lo: number; frac: number } | null = null;
  for (let i = 0; i < traj.length - 1; i++) {
    const ax = (traj[i][1] - lon) * cosLat;
    const ay = traj[i][0] - lat;
    const dx = (traj[i + 1][1] - traj[i][1]) * cosLat;
    const dy = traj[i + 1][0] - traj[i][0];
    const len2 = dx * dx + dy * dy;
    let s = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    s = Math.min(Math.max(s, 0), 1);
    const px = ax + dx * s;
    const py = ay + dy * s;
    const d = px * px + py * py;
    if (!best || d < best.d) {
      best = { d, la: lat + py, lo: lon + px / cosLat, frac: (i + s) / (traj.length - 1) };
    }
  }
  return best ? { lat: best.la, lon: best.lo, frac: best.frac } : null;
}

/** Rigid-shift a track by (dLat, dLon) degrees. Used to anchor static
 * fetch-time arcs to the plane's live coordinates (dead-reckoning delta),
 * so the marker always sits exactly on the history->forward junction. */
function shiftTraj(traj: number[][], dLat: number, dLon: number): number[][] {
  if (!dLat && !dLon) return traj;
  return traj.map((pt) => [pt[0] + dLat, pt[1] + dLon]);
}

/** Max dead-reckoning shift applied to drawn arcs (km). Beyond this the
 * upstream fix is considered stale and arcs stay as fetched. */
const LIVE_SHIFT_CAP_KM = 30;

/** Rigid shift anchoring fetch-time arcs to the plane's live coordinates.
 * Returns {0,0} when there is nothing to anchor or the fix looks stale. */
function neptunShift(t: NeptunThreat, live: { lat: number; lon: number }): { dLa: number; dLo: number } {
  const fwd = t.expectedTrajectory;
  const hist = t.flownTrajectory;
  const anchor = (fwd && fwd.length >= 2)
    ? fwd[0]
    : (hist && hist.length >= 2 ? hist[hist.length - 1] : null);
  if (!anchor) return { dLa: 0, dLo: 0 };
  const dLa = live.lat - anchor[0];
  const dLo = live.lon - anchor[1];
  if ((dLa !== 0 || dLo !== 0) && Math.hypot(dLa, dLo) * 111 <= LIVE_SHIFT_CAP_KM) {
    return { dLa, dLo };
  }
  return { dLa: 0, dLo: 0 };
}

/** Point at 0..1 fraction along a track (linear interp between vertices). */
function pointAtFrac(traj: number[][], frac: number): { lat: number; lon: number } {
  const n = traj.length;
  const f = Math.min(Math.max(frac, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const s = f - i;
  return {
    lat: traj[i][0] + (traj[i + 1][0] - traj[i][0]) * s,
    lon: traj[i][1] + (traj[i + 1][1] - traj[i][1]) * s,
  };
}

/** Parse confirmedAt once (fetch cadence), cache per id for the frame loop. */
function parseNeptunTime(t: NeptunThreat): number | null {
  if (!t.confirmedAt) return null;
  const ct = Date.parse(t.confirmedAt);
  return isNaN(ct) ? null : ct;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  targets,
  selectedTargetId: _selectedTargetId,
  onSelectTarget,
  viewMode,
  onToggleViewMode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const arcCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);

  // Markers references (rotor/badge elements cached at creation so the
  // 60fps loop never touches querySelector/getElementById).
  const htmlMarkersRef = useRef<Map<string, {
    missileMarker: maplibregl.Marker;
    launcherMarker?: maplibregl.Marker;
    destMarker?: maplibregl.Marker;
    altitudeBadge?: maplibregl.Marker;
    rotorEl: HTMLElement | null;
    haloEl: HTMLElement | null;
    svgEl: Element | null;
    badgeEl: HTMLElement | null;
    lastBadgeText: string;
    culled?: boolean;
  }>>(new Map());

  // Lifted-arc overlay cache: static ground projections are re-projected
  // only when the camera moves or tracks change; every frame reuses Path2D.
  const arcCacheRef = useRef<Map<string, {
    path: Path2D;
    glow: string;
    core: string;
    dash: number[];
    dashMult: number;
    /** 0..1 shrink of the 3D lift so short legs don't loop sky-high. */
    lift: number;
  }>>(new Map());
  const arcsDirtyRef = useRef<boolean>(true);
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Targets that already reached the destination (progress >= 1).
  // Their trajectory + missile icon are hidden until backend deletes them.
  const arrivedRef = useRef<Set<string>>(new Set());

  // Oblast polygons (fetched once from /raions.geojson) + alert rollup.
  const oblastGeoRef = useRef<any>(null);
  const [oblastMeta, setOblastMeta] = useState<OblastMeta | null>(null);
  // Full neptun levels (with reasons/since) for zone markers.
  const levelsRef = useRef<Record<string, { level?: string; since?: string; reasons?: string[] }>>({});
  // Neptun zone markers (diamonds, NOT missile icons) + hysteresis switch.
  const neptunMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; sig: string }>>(new Map());
  const showNeptunRef = useRef<boolean>(true);
  // NEPTUN live threat tracks (points with heading, dead-reckoned per frame).
  const neptunRef = useRef<NeptunThreat[]>([]);
  // confirmedAt parsed once per fetch (avoids Date.parse() in the 60fps loop).
  const neptunTimeRef = useRef<Map<string, number | null>>(new Map());
  const neptunLiveRef = useRef<Map<string, {
    marker: maplibregl.Marker;
    launchMarker?: maplibregl.Marker;
    destMarker?: maplibregl.Marker;
    sig: string;
    rotorEl: HTMLElement | null;
    haloEl: HTMLElement | null;
    culled?: boolean;
  }>>(new Map());
  const [neptunMeta, setNeptunMeta] = useState<{ count: number; active: number; updatedAt: number } | null>(null);

  // Persistent per-track color overrides: overlay-cache key -> color.
  // Sim targets keyed by target.id, NEPTUN by `neptun-${id}`.
  // Absent = per-type palette color. Assigned once, stable for life.
  const colorOverrideRef = useRef<Map<string, string>>(new Map());
  // Last live (dead-reckoned) NEPTUN fixes, written every frame by the tick.
  // Ground pushes AND overlay rebuilds anchor drawn arcs to THIS value
  // (single clock) instead of each sampling wall time — otherwise ground,
  // overlay and marker end up with three different junctions.
  const liveFixRef = useRef<Map<string, { lat: number; lon: number }>>(new Map());
  const frameRef = useRef<number>(0);
  // Adaptive overlay quality by live-track count: 2 = full (60fps, dpr<=2,
  // glow+core), 1 = medium (30fps), 0 = low (20fps, dpr 1, core only).
  // Recomputed on the ~2Hz throttle; canvas work dominates when crowded.
  const perfModeRef = useRef<number>(2);

  // Push NEPTUN trajectories GeoJSON lines to map
  const pushNeptunTrajectories = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const src = map.getSource('neptun-trajectories') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const nowMs = Date.now();
      const features: any[] = [];
      neptunRef.current.forEach((t) => {
        if (t.status !== 'active' || t.areaOnly) return;
        // Same palette as the simulation targets of the same kind,
        // or the swarm-disambiguation color when bunched.
        const base = skinOf(neptunLiftKey(t.family, t.speedKmh)).groundGlow;
        const color = colorOverrideRef.current.get(`neptun-${t.id}`) ?? base;
        let fwd = t.expectedTrajectory;
        // Anchor the forecast arc to the plane's live fix from the SINGLE
        // shared clock (liveFixRef, written every frame by the tick).
        // NOTE: flown history ("the past") is intentionally not drawn —
        // only the predicted path stays on the map.
        {
          const live = liveFixRef.current.get(t.id)
            ?? predictNeptun(t, nowMs, neptunTimeRef.current.get(t.id) ?? null);
          const sh = neptunShift(t, live);
          if (sh.dLa !== 0 || sh.dLo !== 0) {
            if (fwd && fwd.length >= 2) fwd = shiftTraj(fwd, sh.dLa, sh.dLo);
          }
        }
        if (fwd && fwd.length >= 2) {
          features.push({
            type: 'Feature',
            properties: { id: `nt-traj-${t.id}`, color },
            geometry: {
              type: 'LineString',
              coordinates: fwd.map((pt) => [pt[1], pt[0]]),
            },
          });
        }
      });
      src.setData({
        type: 'FeatureCollection',
        features,
      });
      // History source stays empty: only the forecast is drawn.
      const histSrc = map.getSource('neptun-history') as maplibregl.GeoJSONSource | undefined;
      if (histSrc) {
        histSrc.setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
    } catch (e) {
      console.warn('[Map] neptun trajectory push failed', e);
    }
  };

  // Persistent per-track colors (runs on the ~2Hz throttle; early-outs when
  // nothing changed). No screen math at all: colors are assigned once per
  // track lifetime, so they survive zoom/pan Flights. First track of a kind
  // keeps its per-type palette color; duplicates take overflow colors.
  const assignTrackColors = () => {
    const nowS = Date.now() / 1000;
    const order: { key: string; base: string }[] = [];
    targetsRef.current
      .filter((t) => t.trajectory_arc && t.trajectory_arc.length >= 2 && progressOf(t, nowS) < 1)
      .map((t) => t.id)
      .sort()
      .forEach((id) => {
        const t = targetsRef.current.find((x) => x.id === id);
        if (t) order.push({ key: id, base: skinOf(t.threat_type).groundGlow });
      });
    neptunRef.current
      .filter((t) => t.status === 'active' && !t.areaOnly && t.expectedTrajectory && t.expectedTrajectory.length >= 2)
      .map((t) => t.id)
      .sort()
      .forEach((id) => {
        const t = neptunRef.current.find((x) => x.id === id);
        if (t) order.push({ key: `neptun-${id}`, base: skinOf(neptunLiftKey(t.family, t.speedKmh)).groundGlow });
      });

    const hashOf = (s: string): number => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };

    const prev = colorOverrideRef.current;
    const next = new Map<string, string>();
    const claimed = new Set<string>();
    order.forEach((o) => {
      const incumbent = prev.get(o.key) ?? o.base;
      if (!claimed.has(incumbent)) {
        claimed.add(incumbent);
        // Plain base color needs no stored override; a still-unique
        // overflow color is kept as is (stability, no flicker).
        if (incumbent !== o.base) next.set(o.key, incumbent);
        return;
      }
      // Collision: this full color is taken — first free overflow color.
      const pick = OVERFLOW_PALETTE.find((p) => !claimed.has(p))
        ?? OVERFLOW_PALETTE[hashOf(o.key) % OVERFLOW_PALETTE.length];
      next.set(o.key, pick);
      claimed.add(pick);
    });

    // Apply only on change.
    let same = prev.size === next.size;
    if (same) {
      next.forEach((c, k) => { if (prev.get(k) !== c) same = false; });
    }
    if (same) return;
    colorOverrideRef.current = next;
    arcsDirtyRef.current = true;
    pushGroundFeatures();
    pushNeptunTrajectories();
    htmlMarkersRef.current.forEach((m, id) => paintSimCluster(m, next.get(id) ?? null));
    neptunLiveRef.current.forEach((r, id) => paintNeptunCluster(r, next.get(`neptun-${id}`) ?? null));
  };

  // Marching-ants dash animation state for low-altitude trajectories.
  const dashOffRef = useRef(0);
  const lastTickRef = useRef(0);

  const targetsRef = useRef<RadarTarget[]>(targets);
  targetsRef.current = targets;
  const viewModeRef = useRef<'2D' | '3D'>(viewMode);
  viewModeRef.current = viewMode;

  // Ground-line features; arrived targets excluded (vanish on impact).
  const buildLineFeatures = (list: RadarTarget[], is3D: boolean, nowS: number) => {
    return list
      .filter((t) => t.trajectory_arc && t.trajectory_arc.length >= 2 && progressOf(t, nowS) < 1)
      .map((t) => {
        // In 3D every trajectory lives on the overlay canvas (lifted);
        // the ground line stays only as a dim shadow underneath.
        const dimmed = is3D;
        const skin = skinOf(t.threat_type);
        // Swarm bunch: distinct color per track instead of the type palette.
        const cc = colorOverrideRef.current.get(t.id);
        return {
          type: 'Feature' as const,
          properties: {
            id: t.id,
            color: cc ?? skin.groundGlow,
            coreColor: cc ?? skin.groundCore,
            glowWidth: dimmed ? 4 : 10,
            glowOpacity: dimmed ? 0.25 : 0.7,
            coreWidth: dimmed ? 1.5 : 4,
            coreOpacity: dimmed ? 0.4 : 1.0,
          },
          geometry: {
            type: 'LineString' as const,
            // Convert [lat, lon] to [lon, lat]
            coordinates: t.trajectory_arc.map((pt) => [pt[1], pt[0]]),
          },
        };
      });
  };

  // Push ground lines to the map (reads live refs — safe from rAF loop).
  const pushGroundFeatures = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const src = map.getSource('active-trajectories') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: buildLineFeatures(targetsRef.current, viewModeRef.current === '3D', Date.now() / 1000),
        });
      }
    } catch (e) {
      console.warn('[Map] trajectory source update failed (style not ready yet)', e);
    }
  };

  // Centroid of a raion polygon for the neptun zone marker ([lon, lat]).
  const centroidOf = (geom: any): [number, number] | null => {
    try {
      let ring: any = null;
      if (geom?.type === 'Polygon') ring = geom.coordinates[0];
      else if (geom?.type === 'MultiPolygon' && geom.coordinates.length) {
        ring = geom.coordinates.reduce((a: any, b: any) => (b[0].length > a[0].length ? b : a))[0];
      }
      if (!ring || !ring.length) return null;
      let sx = 0;
      let sy = 0;
      ring.forEach((c: any) => { sx += c[0]; sy += c[1]; });
      return [sx / ring.length, sy / ring.length];
    } catch {
      return null;
    }
  };

  // Neptun zone markers: one compact diamond per alerted raion (red/yellow),
  // with the upstream reason in the tooltip. Deliberately NOT missile icons.
  // Shown only while live targets are few (hysteresis via showNeptunRef).
  const syncNeptunMarkers = () => {
    const map = mapRef.current;
    const geo = oblastGeoRef.current;
    if (!map) return;
    const show = showNeptunRef.current && !!geo;
    const levels = levelsRef.current;

    // Drop markers that are hidden, unmatched or stale.
    neptunMarkersRef.current.forEach((rec, nk) => {
      let keep = false;
      if (show && geo) {
        const feat = geo.features.find((f: any) => f.properties?.nk === nk);
        const info = feat ? levels[feat.properties.nk] : undefined;
        const lvl = info?.level || 'none';
        if (feat && (lvl === 'red' || lvl === 'yellow')) {
          const sig = `${lvl}|${(info?.reasons || []).join(';')}|${info?.since || ''}`;
          keep = rec.sig === sig;
        }
      }
      if (!keep) {
        rec.marker.remove();
        neptunMarkersRef.current.delete(nk);
      }
    });
    if (!show) return;

    geo.features.forEach((f: any) => {
      const nk: string | undefined = f.properties?.nk;
      if (!nk || neptunMarkersRef.current.has(nk)) return;
      const info = levels[nk];
      const lvl = info?.level || 'none';
      if (lvl !== 'red' && lvl !== 'yellow') return;
      const c = centroidOf(f.geometry);
      if (!c) return;
      const color = lvl === 'red' ? '#ef4444' : '#eab308';
      const reason = (info?.reasons && info.reasons[0]) || (lvl === 'red' ? 'Повітряна тривога' : 'Загроза');
      let sinceTxt = '';
      try {
        sinceTxt = info?.since
          ? ` · з ${new Date(info.since).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
          : '';
      } catch { /* ignore bad date */ }
      const el = document.createElement('div');
      el.className = 'pointer-events-auto select-none cursor-default';
      el.innerHTML = `
        <div class="relative flex flex-col items-center" title="${f.properties?.name || nk} · ${reason}${sinceTxt}">
          ${lvl === 'red' ? '<div class="w-3 h-3 rounded-full bg-red-500/40 animate-ping"></div>' : ''}
          <div class="w-2.5 h-2.5 ${lvl === 'red' ? '-mt-2.5' : ''} rotate-45 border border-white shadow" style="background:${color}"></div>
        </div>`;
      const marker = new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map);
      const sig = `${lvl}|${(info?.reasons || []).join(';')}|${info?.since || ''}`;
      neptunMarkersRef.current.set(nk, { marker, sig });
    });
  };

  // Zone diamonds only while total live tracks are few (<5 show, >5 hide).
  const updateNeptunVisibility = () => {
    const n =
      targetsRef.current.length + neptunRef.current.filter((t) => t.status === 'active').length;
    if (n < 5) showNeptunRef.current = true;
    else if (n > 5) showNeptunRef.current = false;
    syncNeptunMarkers();
  };

  // Create/drop NEPTUN live markers to match the latest fetch (positions
  // themselves are refreshed every animation frame with dead-reckoning).
  const upsertNeptunLive = () => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set(neptunRef.current.map((t) => t.id));
    neptunLiveRef.current.forEach((rec, id) => {
      if (!seen.has(id)) {
        rec.marker.remove();
        rec.launchMarker?.remove();
        rec.destMarker?.remove();
        neptunLiveRef.current.delete(id);
        liveFixRef.current.delete(id);
      }
    });

    neptunRef.current.forEach((t) => {
      const sk = neptunSkin(t.family);
      const stale = t.status !== 'active';
      const sig = `${t.family}|${t.status}|${t.advisory ? 1 : 0}|${t.count}|${t.areaOnly ? 1 : 0}|${t.launch?.name || ''}|${t.destination?.name || ''}`;
      const prev = neptunLiveRef.current.get(t.id);
      if (prev) {
        if (prev.sig === sig) return;
        prev.marker.remove();
        prev.launchMarker?.remove();
        prev.destMarker?.remove();
        neptunLiveRef.current.delete(t.id);
      }
      const el = document.createElement('div');
      el.className = 'pointer-events-auto select-none cursor-default';
      const place = t.locality || t.district || t.region || t.title;
      let upd = '';
      try {
        upd = t.updatedAt ? ` · ${new Date(t.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
      } catch { /* ignore */ }
      const targetCityText = t.destination?.name ? ` ➔ Ціль: ${t.destination.name}` : '';
      const launchText = t.launch?.name ? ` [Пуск: ${t.launch.name}]` : '';
      const tip = `${t.title || t.family}${launchText}${targetCityText}${place ? ` · ${place}` : ''}${t.count > 1 ? ` · ×${t.count}` : ''}${t.explanation ? ` — ${t.explanation}` : ''}${upd} · NEPTUN`;

      if (t.areaOnly) {
        // Docs forbid drawing areaOnly as a place: hollow outline + region label.
        el.innerHTML = `
          <div class="flex flex-col items-center ${stale ? 'opacity-60' : ''}" title="${tip}">
            <div class="w-3.5 h-3.5 rotate-45 border-2 border-dashed border-white/90 bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.35)]"></div>
            <div class="px-1.5 py-px mt-1 text-[10px] font-mono font-semibold tracking-wide text-slate-100 bg-black/85 backdrop-blur-sm rounded-md border border-white/15 whitespace-nowrap shadow-lg">${t.region || t.title}</div>
          </div>`;
      } else {
        const initScreenRot = (((t.heading ?? 0) - (map?.getBearing() ?? 0)) % 360 + 360) % 360;
        el.innerHTML = `
          <div class="relative flex items-center justify-center w-9 h-9 ${stale ? 'opacity-60' : ''}" title="${tip}">
            ${t.advisory ? '' : `<div class="nt-halo absolute inset-0 rounded-full ${sk.haloBg} opacity-70 ring-1 ring-white/25"></div>`}
            <div class="nt-rotor z-10 flex items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]" style="transform: rotate(${initScreenRot.toFixed(0)}deg)">
              <svg class="w-6 h-6 map-marker-svg" viewBox="0 0 24 24" style="filter:brightness(0) invert(1)">${sk.svgInner}</svg>
            </div>
            ${t.count > 1 ? `<div class="absolute -bottom-1 -right-1 px-1.5 py-px rounded-md bg-black/90 border border-white/25 font-mono text-[10px] text-white font-bold shadow-lg">×${t.count}</div>` : ''}
          </div>`;
      }

      let marker: maplibregl.Marker;
      let launchMarker: maplibregl.Marker | undefined;
      let destMarker: maplibregl.Marker | undefined;

      try {
        const nowMs = Date.now();
        const p = predictNeptun(t, nowMs, parseNeptunTime(t));
        marker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);

        // Add launch origin marker if available
        if (t.launch && !t.areaOnly && t.status === 'active') {
          const lEl = document.createElement('div');
          lEl.className = 'pointer-events-none select-none flex flex-col items-center';
          lEl.innerHTML = `
            <div class="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-red-400/60 shadow-[0_0_12px_rgba(239,68,68,0.35)] text-[10px] font-mono font-semibold tracking-wide text-red-200 whitespace-nowrap">
              <span class="relative flex w-1.5 h-1.5">
                <span class="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
                <span class="relative inline-flex w-1.5 h-1.5 rounded-full bg-red-500"></span>
              </span>
              <span>ПУСК: ${t.launch.name}</span>
            </div>
            <div class="w-2 h-2 rounded-full bg-red-500 border-2 border-white mt-1 shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
          `;
          launchMarker = new maplibregl.Marker({ element: lEl })
            .setLngLat([t.launch.lon, t.launch.lat])
            .addTo(map);
        }

        // Add destination target city marker if available
        if (t.destination && !t.areaOnly && t.status === 'active') {
          const dEl = document.createElement('div');
          dEl.className = 'pointer-events-none select-none flex flex-col items-center';
          dEl.innerHTML = `
            <div class="relative flex items-center justify-center w-5 h-5">
              <div class="absolute inset-0 rounded-full border border-sky-400/80 animate-ping"></div>
              <div class="w-2.5 h-2.5 rounded-full border-2 border-sky-400 bg-sky-500/30"></div>
            </div>
            <div class="px-1 py-0.2 rounded bg-black/85 border border-sky-500/60 text-[9px] font-mono text-sky-300 font-bold whitespace-nowrap -mt-0.5">
              ЦІЛЬ: ${t.destination.name}
            </div>
          `;
          destMarker = new maplibregl.Marker({ element: dEl })
            .setLngLat([t.destination.lon, t.destination.lat])
            .addTo(map);
        }

        // Inner elements cached once (per-frame rotation + cluster chips).
        const rotorEl = el.querySelector('.nt-rotor') as HTMLElement | null;
        const haloEl = el.querySelector('.nt-halo') as HTMLElement | null;
        neptunLiveRef.current.set(t.id, { marker, launchMarker, destMarker, sig, rotorEl, haloEl });
      } catch { /* map torn down */ }
    });

    pushNeptunTrajectories();
    // Lifted-arc overlay projections depend on the NEPTUN track set too.
    arcsDirtyRef.current = true;
  };

  // 1. Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'esri-dark': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
          },
          'esri-labels': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
          },
          'borders': {
            type: 'geojson',
            data: '/borders.geojson',
          },
          'active-trajectories': {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          },
          'neptun-trajectories': {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          },
          'neptun-history': {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          },
          'raion-alerts': {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          },
        },
        layers: [
          // Dark military basemap
          {
            id: 'esri-dark-tiles',
            type: 'raster',
            source: 'esri-dark',
            minzoom: 0,
            maxzoom: 18,
          },
          // Neighbor countries border line
          {
            id: 'neighbor-borders-line',
            type: 'line',
            source: 'borders',
            paint: {
              'line-color': '#94a3b8',
              'line-width': 1.6,
              'line-dasharray': [4, 2],
              'line-opacity': 0.85,
            },
          },
          // Ukraine State Border Glow (Outer Neon)
          {
            id: 'ukraine-border-glow',
            type: 'line',
            source: 'borders',
            filter: ['==', ['get', 'name'], 'Ukraine'],
            paint: {
              'line-color': '#0284c7',
              'line-width': 8,
              'line-blur': 4,
              'line-opacity': 0.55,
            },
          },
          // Ukraine State Border Crisp Neon (Inner Core)
          {
            id: 'ukraine-border-core',
            type: 'line',
            source: 'borders',
            filter: ['==', ['get', 'name'], 'Ukraine'],
            paint: {
              'line-color': '#38bdf8',
              'line-width': 2.8,
              'line-opacity': 0.95,
            },
          },
          // Raion alert fill (neptun.in.ua levels -> red / yellow / none)
          {
            id: 'raion-alert-fill',
            type: 'fill',
            source: 'raion-alerts',
            paint: {
              'fill-color': ['match', ['get', 'level'], 'red', '#ef4444', 'yellow', '#eab308', 'rgba(0,0,0,0)'],
              'fill-opacity': ['match', ['get', 'level'], 'red', 0.28, 'yellow', 0.2, 0],
            },
          },
          // Raion boundaries tinted by alert level
          {
            id: 'raion-alert-line',
            type: 'line',
            source: 'raion-alerts',
            paint: {
              'line-color': ['match', ['get', 'level'], 'red', '#f87171', 'yellow', '#facc15', '#334155'],
              'line-width': ['match', ['get', 'level'], 'red', 2, 'yellow', 1.6, 0.7],
              'line-opacity': ['match', ['get', 'level'], 'red', 0.95, 'yellow', 0.9, 0.5],
            },
          },
          // Tactical city labels overlay
          {
            id: 'esri-labels-tiles',
            type: 'raster',
            source: 'esri-labels',
            minzoom: 0,
            maxzoom: 18,
            paint: {
              'raster-opacity': 0.85,
            },
          },
          // Ground trajectory line (original look, as before).
          // In 3D, ballistic ground line is dimmed to a thin shadow so the
          // lifted overlay arc is the hero; never hidden (no empty 3D).
          {
            id: 'trajectories-glow-layer',
            type: 'line',
            source: 'active-trajectories',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['coalesce', ['get', 'glowWidth'], 8],
              'line-blur': 4,
              'line-opacity': ['coalesce', ['get', 'glowOpacity'], 0.6],
            },
          },
          {
            id: 'trajectories-core-layer',
            type: 'line',
            source: 'active-trajectories',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['get', 'coreColor'],
              'line-width': ['coalesce', ['get', 'coreWidth'], 3],
              'line-opacity': ['coalesce', ['get', 'coreOpacity'], 1.0],
              'line-dasharray': [1, 0],
            },
          },
          // NEPTUN expected trajectories (dashed tactical vector)
          {
            id: 'neptun-trajectories-glow-layer',
            type: 'line',
            source: 'neptun-trajectories',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
              'line-width': 7,
              'line-blur': 2,
              'line-opacity': 0.55,
            },
          },
          {
            id: 'neptun-trajectories-core-layer',
            type: 'line',
            source: 'neptun-trajectories',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
              'line-width': 3,
              'line-opacity': 0.95,
              'line-dasharray': [3, 2],
            },
          },
          // NEPTUN history source (kept defined but empty: forecast only)
          {
            id: 'neptun-history-glow-layer',
            type: 'line',
            source: 'neptun-history',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
              'line-width': 7,
              'line-blur': 2,
              'line-opacity': 0.55,
            },
          },
          {
            id: 'neptun-history-core-layer',
            type: 'line',
            source: 'neptun-history',
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
              'line-width': 3,
              'line-opacity': 0.95,
            },
          },
        ],
      },
      center: [31.5, 49.5],
      zoom: 6.2,
      pitch: viewMode === '3D' ? 58 : 0,
      bearing: viewMode === '3D' ? -20 : 0,
      maxPitch: 82,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.on('error', (e) => {
      console.warn('[MapLibre warning]', e);
    });

    let loadFired = false;
    const addRegionBadges = () => {
      // Avoid duplicate region badges on re-fire (idle/load)
      if ((map as any)._regionBadgesAdded) return;
      (map as any)._regionBadgesAdded = true;
      REGION_LABELS.forEach((reg) => {
        const el = document.createElement('div');
        el.className = `pointer-events-none px-2 py-0.5 rounded bg-black/60 border border-slate-700/60 font-mono tracking-wider shadow whitespace-nowrap select-none ${reg.size}`;
        el.style.color = reg.color;
        el.innerText = reg.name;

        new maplibregl.Marker({ element: el })
          .setLngLat(reg.coords as [number, number])
          .addTo(map);
      });
    };

    const markReady = () => {
      if (loadFired) return;
      loadFired = true;
      setMapReady(true);
      addRegionBadges();
      upsertNeptunLive();
      pushNeptunTrajectories();
    };

    map.on('load', markReady);
    // Fallback: worker/GeoJSON stall (Vite dev 504, slow tiles) — don't block markers
    map.on('idle', () => {
      if (!loadFired && map.isStyleLoaded()) markReady();
    });
    const readyTimeout = setTimeout(() => {
      if (!loadFired) {
        console.warn('[Map] load timeout — forcing ready so targets render');
        markReady();
      }
    }, 3500);

    mapRef.current = map;

    // Lifted-arc overlay is screen-space: re-project whenever the camera
    // moves (pan/zoom/rotate/pitch). Rebuilds coalesce to once per frame
    // in drawLiftedArcs via arcsDirtyRef.
    const markArcsDirty = () => {
      arcsDirtyRef.current = true;
    };
    map.on('move', markArcsDirty);
    map.on('zoom', markArcsDirty);
    map.on('rotate', markArcsDirty);
    map.on('pitch', markArcsDirty);

    return () => {
      clearTimeout(readyTimeout);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Camera transition for 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (viewMode === '3D') {
      map.easeTo({
        pitch: 58,
        bearing: -22,
        duration: 1200,
      });
    } else {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000,
      });
    }

    // NEPTUN ground lines mirror the simulation ones: dim shadow under the
    // lifted arc in 3D, full brightness in 2D.
    try {
      const dim = viewMode === '3D';
      map.setPaintProperty('neptun-trajectories-glow-layer', 'line-width', dim ? 5 : 7);
      map.setPaintProperty('neptun-trajectories-core-layer', 'line-width', dim ? 2 : 3);
      map.setPaintProperty('neptun-trajectories-core-layer', 'line-opacity', dim ? 0.4 : 0.95);
      map.setPaintProperty('neptun-history-glow-layer', 'line-width', dim ? 5 : 7);
      map.setPaintProperty('neptun-history-glow-layer', 'line-opacity', dim ? 0.25 : 0.55);
      map.setPaintProperty('neptun-history-core-layer', 'line-width', dim ? 2 : 3);
      map.setPaintProperty('neptun-history-core-layer', 'line-opacity', dim ? 0.4 : 0.95);
    } catch {
      // Style/layers not ready yet — defaults in the style apply.
    }
    arcsDirtyRef.current = true;
  }, [viewMode]);

  // 2b. Oblast alert levels (neptun.in.ua via backend): paint polygons by level.
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;

    const refreshOblastLevels = async () => {
      try {
        if (!oblastGeoRef.current) {
          const r = await fetch('/raions.geojson');
          if (!r.ok) throw new Error(`raions.geojson ${r.status}`);
          oblastGeoRef.current = await r.json();
        }
        const s = await fetch('/api/oblasts').then((r) => {
          if (!r.ok) throw new Error(`/api/oblasts ${r.status}`);
          return r.json();
        });
        if (cancelled) return;
        const levels: Record<string, { level?: string; since?: string; reasons?: string[] }> = s.levels || {};
        levelsRef.current = levels;
        const feats = (oblastGeoRef.current.features || []).map((f: any) => ({
          ...f,
          properties: { ...f.properties, level: levels[f.properties?.nk]?.level || 'none' },
        }));
        const map = mapRef.current;
        const src = map?.getSource('raion-alerts') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: 'FeatureCollection', features: feats } as any);
        }
        let red = 0;
        let yellow = 0;
        feats.forEach((f: any) => {
          if (f.properties?.level === 'red') red++;
          else if (f.properties?.level === 'yellow') yellow++;
        });
        setOblastMeta({ updatedAt: Date.now(), upstream: s.upstream_updated_at || '', red, yellow, error: s.error || '' });
        syncNeptunMarkers();
      } catch (e) {
        console.warn('[Oblasts] refresh failed', e);
      }
    };

    refreshOblastLevels();
    const id = setInterval(refreshOblastLevels, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mapReady]);

  // 2c. NEPTUN live threats: poll snapshot, reconcile markers (positions
  // tick every frame below with dead-reckoning).
  useEffect(() => {
    let cancelled = false;
    const refreshNeptun = async () => {
      try {
        const s = await fetch('/api/neptun/threats').then((r) => {
          if (!r.ok) throw new Error(`/api/neptun/threats ${r.status}`);
          return r.json();
        });
        if (cancelled) return;
        const list: NeptunThreat[] = Array.isArray(s.threats) ? s.threats : [];
        neptunRef.current = list;
        const tm = new Map<string, number | null>();
        list.forEach((t) => tm.set(t.id, parseNeptunTime(t)));
        neptunTimeRef.current = tm;
        upsertNeptunLive();
        setNeptunMeta({
          count: list.length,
          active: list.filter((t) => t.status === 'active').length,
          updatedAt: Date.now(),
        });
        updateNeptunVisibility();
      } catch (e) {
        console.warn('[Neptun] threats refresh failed', e);
      }
    };
    refreshNeptun();
    const id = setInterval(refreshNeptun, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // 3. Synchronize ground GeoJSON + HTML markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Neptun fallback markers only while live tracks are few (<5 show,
    // >5 hide, ==5 keep previous state to avoid flicker).
    updateNeptunVisibility();

    // Prune arrival bookkeeping for ids that left the radar
    const currentTargetIds = new Set(targets.map((t) => t.id));
    arrivedRef.current.forEach((id) => {
      if (!currentTargetIds.has(id)) arrivedRef.current.delete(id);
    });

    // Ground lines (arrived targets excluded — trajectory vanishes on impact)
    pushGroundFeatures();
    // Lifted-arc overlay projections depend on the same track set.
    arcsDirtyRef.current = true;

    // Clean up deleted HTML markers
    htmlMarkersRef.current.forEach((markers, id) => {
      if (!currentTargetIds.has(id)) {
        markers.missileMarker.remove();
        markers.launcherMarker?.remove();
        markers.destMarker?.remove();
        markers.altitudeBadge?.remove();
        htmlMarkersRef.current.delete(id);
      }
    });

    // Spawn new HTML markers
    targets.forEach((target) => {
      if (!target.trajectory_arc || target.trajectory_arc.length < 2) return;

      const skin = skinOf(target.threat_type);

      let markers = htmlMarkersRef.current.get(target.id);
      if (!markers) {
        // Initial heading from first trajectory segment (icon nose points north/0°)
        const arc0 = target.trajectory_arc;
        const dLat0 = arc0[1][0] - arc0[0][0];
        const dLon0 = arc0[1][1] - arc0[0][1];
        const initBearing = (Math.atan2(dLon0, dLat0) * 180) / Math.PI;
        const initScreenRot = ((initBearing - (map.getBearing() ?? 0)) % 360 + 360) % 360;
        // Missile marker (rotor div spins to heading, ping halo stays static)
        const missileEl = document.createElement('div');
        missileEl.className = 'cursor-pointer select-none';
        missileEl.innerHTML = `
          <div class="relative flex items-center justify-center w-11 h-11">
            <div class="absolute inset-0 rounded-full ${skin.haloBg} radar-ping"></div>
            <div class="absolute inset-1 rounded-full ring-1 ring-white/25"></div>
            <div class="missile-rotor z-10 flex items-center justify-center ${skin.rotorShadow}" style="transform: rotate(${initScreenRot.toFixed(1)}deg); transition: transform 0.3s linear;">
              <svg class="w-7 h-7 map-marker-svg" viewBox="0 0 24 24">${skin.svgInner}</svg>
            </div>
          </div>
        `;
        missileEl.onclick = () => onSelectTarget(target);

        const missileMarker = new maplibregl.Marker({ element: missileEl })
          .setLngLat([target.current_position.lon, target.current_position.lat])
          .addTo(map);
        // Cached once: the 60fps loop rotates this without DOM queries.
        const rotorEl = missileEl.querySelector('.missile-rotor') as HTMLElement | null;
        // Cached for swarm-disambiguation chips (halo tint + white silhouette).
        const haloEl = missileEl.querySelector('.radar-ping') as HTMLElement | null;
        const svgEl = rotorEl ? rotorEl.querySelector('svg') : null;

        // Launcher SPU
        let launcherMarker: maplibregl.Marker | undefined;
        if (target.launcher_pos) {
          const lEl = document.createElement('div');
          lEl.className = 'cursor-pointer select-none';
          lEl.innerHTML = `
            <div class="relative flex items-center justify-center w-8 h-8">
              <div class="absolute inset-0 rounded-full bg-amber-500/20 radar-ping"></div>
              <div class="z-10 flex items-center justify-center w-7 h-7 bg-amber-950/80 border border-amber-500/80 rounded shadow-lg shadow-amber-500/30">
                <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 8h-2V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H5a2 2 0 0 0-2 2v7h2a2 2 0 0 0 4 0h6a2 2 0 0 0 4 0h2v-7a2 2 0 0 0-2-2zM9 6h6v2H9V6zm-2 9a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm10 0a1 1 0 1 1 1-1 1 1 0 0 1-1 1zM7 11h10v2H7v-2z"/>
                </svg>
              </div>
            </div>
          `;
          launcherMarker = new maplibregl.Marker({ element: lEl })
            .setLngLat([target.launcher_pos.lon, target.launcher_pos.lat])
            .addTo(map);
        }

        // Destination crosshair
        const dEl = document.createElement('div');
        dEl.innerHTML = `
          <div class="relative flex flex-col items-center select-none">
            <div class="relative flex items-center justify-center w-5 h-5">
              <div class="absolute inline-flex w-full h-full rounded-full bg-rose-500 opacity-60 animate-ping"></div>
              <div class="relative w-3.5 h-3.5 bg-gradient-to-br from-rose-400 to-rose-700 border-2 border-white rounded-full shadow-[0_0_12px_rgba(244,63,94,0.9)]"></div>
            </div>
            <div class="px-2.5 py-1 mt-1.5 text-[11px] font-mono font-bold text-white uppercase bg-black/90 backdrop-blur-sm border border-rose-400/70 rounded-lg tracking-wider shadow-[0_0_14px_rgba(244,63,94,0.35)] whitespace-nowrap">
              ЦІЛЬ · ${target.destination.name}
            </div>
          </div>
        `;
        const destMarker = new maplibregl.Marker({ element: dEl })
          .setLngLat([target.destination.lon, target.destination.lat])
          .addTo(map);

        // Altitude Badge
        const altBadgeEl = document.createElement('div');
        altBadgeEl.className = `pointer-events-none select-none px-2 py-1 rounded-lg bg-black/90 backdrop-blur-sm border ${skin.badgeBorder} font-mono text-[11px] tabular-nums text-white font-bold whitespace-nowrap shadow-lg`;
        altBadgeEl.id = `alt-badge-${target.id}`;
        altBadgeEl.innerText = target.threat_type === 'BALLISTIC' ? 'ВИС: 0 км' : 'ВИС: 1 км';

        const altitudeBadge = new maplibregl.Marker({ element: altBadgeEl, offset: [0, -32] })
          .setLngLat([target.current_position.lon, target.current_position.lat])
          .addTo(map);

        markers = { missileMarker, launcherMarker, destMarker, altitudeBadge, rotorEl, haloEl, svgEl, badgeEl: altBadgeEl, lastBadgeText: '' };
        htmlMarkersRef.current.set(target.id, markers);
      }
    });
  }, [targets, mapReady, viewMode, onSelectTarget]);

  // 4. Smooth 60 FPS loop: markers + lifted 3D overlay (no WebGL sharing).
  useEffect(() => {
    let animId: number;

    // Rebuild cached Path2D arcs — runs ONLY when the camera moves or
    // tracks change. The per-frame draw then just re-strokes cached paths
    // with the marching-ants dash offset (no map.project, no re-tracing).
    const rebuildArcCache = () => {
      const map = mapRef.current;
      if (!map) return;
      const in3D = viewModeRef.current === '3D';
      const pitchRad = (map.getPitch() * Math.PI) / 180;
      const sinP = Math.sin(pitchRad);
      const zoom = map.getZoom();
      const nowS = Date.now() / 1000;
      const nowMs = Math.round(nowS * 1000);
      const cache = arcCacheRef.current;
      cache.clear();
      for (const target of targetsRef.current) {
        if (!target.trajectory_arc || target.trajectory_arc.length < 2) continue;
        // Vanished after impact
        if (progressOf(target, nowS) >= 1) continue;
        const isLiftedType = target.threat_type === 'BALLISTIC' || target.threat_type === 'KAB';
        // In 2D the ground GeoJSON line already shows lifted types 1:1.
        if (!in3D && isLiftedType) continue;
        const arc = target.trajectory_arc;
        const n = arc.length;
        const skin = skinOf(target.threat_type);
        // Two passes: project first, then scale the lift to the leg's
        // on-screen size so short hops stay near-flat in 3D.
        const sp: { x: number; y: number; liftPx: number }[] = [];
        for (let i = 0; i < n; i++) {
          const lat = arc[i][0];
          const lon = arc[i][1];
          const p = map.project([lon, lat]);
          const alt = visualAltAt(i / (n - 1), target.threat_type);
          const mp = (Math.cos((lat * Math.PI) / 180) * 40075016) / (256 * Math.pow(2, zoom));
          sp.push({ x: p.x, y: p.y, liftPx: in3D ? ((alt / mp) * sinP * ALT_PX_EXAGGERATION) : 0 });
        }
        const legPx = Math.hypot(sp[n - 1].x - sp[0].x, sp[n - 1].y - sp[0].y);
        const maxLift = sp.reduce((m, q) => Math.max(m, q.liftPx), 0);
        const liftK = liftScaleFor(legPx, maxLift);
        const path = new Path2D();
        for (let i = 0; i < n; i++) {
          const y = sp[i].y - sp[i].liftPx * liftK;
          if (i === 0) path.moveTo(sp[i].x, y);
          else path.lineTo(sp[i].x, y);
        }

        // Per-type stroke character: ballistic/KAB solid lifted arcs,
        // shaheds slow wide dashes, cruise fast long dashes, recon dots.
        let dash: number[] = [];
        let dashMult = 1;
        if (target.threat_type === 'SHAHED') { dash = [10, 7]; dashMult = 0.7; }
        else if (target.threat_type === 'JET_SHAHED') { dash = [12, 6]; dashMult = 2.3; }
        else if (target.threat_type === 'CRUISE_MISSILE') { dash = [16, 9]; dashMult = 1.5; }
        else if (target.threat_type === 'RECON_UAV') { dash = [2, 7]; dashMult = 0.45; }
        const cc = colorOverrideRef.current.get(target.id);
        cache.set(target.id, { path, glow: cc ?? skin.overlayGlow, core: cc ? '#f8fafc' : skin.overlayCore, dash, dashMult, lift: liftK });
      }
      // NEPTUN live tracks: same lifted treatment as simulation arcs.
      // Backend sends a dense forward track (live fix -> dest); vertical
      // lift uses the same altitude model by mapped family, offset by the
      // flown fraction so apogee lands mid-flight.
      for (const nt of neptunRef.current) {
        if (nt.status !== 'active' || nt.areaOnly) continue;
        let traj: number[][] | undefined = nt.expectedTrajectory;
        if (!traj || traj.length < 2) continue;
        // Same live-anchor shift as the ground push, from the shared clock.
        {
          const live = liveFixRef.current.get(nt.id)
            ?? predictNeptun(nt, nowMs, neptunTimeRef.current.get(nt.id) ?? null);
          const sh = neptunShift(nt, live);
          if (sh.dLa !== 0 || sh.dLo !== 0) traj = shiftTraj(traj, sh.dLa, sh.dLo);
        }
        const key = neptunLiftKey(nt.family, nt.speedKmh);
        // In 2D the ground GeoJSON line already shows lifted types 1:1.
        if (!in3D && (key === 'BALLISTIC' || key === 'KAB')) continue;
        const skin = skinOf(key);
        const n = traj.length;
        const sp: { x: number; y: number; liftPx: number }[] = [];
        for (let i = 0; i < n; i++) {
          const lat = traj[i][0];
          const lon = traj[i][1];
          const p = map.project([lon, lat]);
          const alt = visualAltAt(neptunProgress(nt, i / (n - 1)), key);
          const mp = (Math.cos((lat * Math.PI) / 180) * 40075016) / (256 * Math.pow(2, zoom));
          sp.push({ x: p.x, y: p.y, liftPx: in3D ? ((alt / mp) * sinP * ALT_PX_EXAGGERATION) : 0 });
        }
        const legPx = Math.hypot(sp[n - 1].x - sp[0].x, sp[n - 1].y - sp[0].y);
        const maxLift = sp.reduce((m, q) => Math.max(m, q.liftPx), 0);
        const liftK = liftScaleFor(legPx, maxLift);
        const path = new Path2D();
        for (let i = 0; i < n; i++) {
          const y = sp[i].y - sp[i].liftPx * liftK;
          if (i === 0) path.moveTo(sp[i].x, y);
          else path.lineTo(sp[i].x, y);
        }
        const { dash, dashMult } = neptunDashFor(key);
        const cc = colorOverrideRef.current.get(`neptun-${nt.id}`);
        cache.set(`neptun-${nt.id}`, { path, glow: cc ?? skin.overlayGlow, core: cc ? '#f8fafc' : skin.overlayCore, dash, dashMult, lift: liftK });
      }
      // NOTE: flown history is intentionally not drawn — forecast only.
      arcsDirtyRef.current = false;
    };

    // Overlay canvas was never sized (always 0x0) so lifted arcs never
    // drew. Sync the backing store to the container (dpr-aware) here —
    // cheap compare, real resize only when layout/dpr changes.
    const syncCanvasSize = (): boolean => {
      const canvas = arcCanvasRef.current;
      if (!canvas) return false;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : canvas.clientWidth;
      const h = parent ? parent.clientHeight : canvas.clientHeight;
      if (w < 1 || h < 1) return false;
      // Low mode renders at dpr 1.5: still crisp on hidpi, less fill-rate.
      const dprCap = perfModeRef.current === 0 ? 1.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const prev = canvasSizeRef.current;
      if (prev.w !== w || prev.h !== h || (canvas as any)._dpr !== dpr) {
        prev.w = w;
        prev.h = h;
        (canvas as any)._dpr = dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        arcsDirtyRef.current = true;
      }
      return true;
    };

    const drawLiftedArcs = () => {
      const canvas = arcCanvasRef.current;
      const map = mapRef.current;
      if (!canvas || !map) return;
      // Adaptive frame skipping: full rate only when few tracks are live.
      // Skipped frames keep the previous canvas content (no clear).
      const perfMode = perfModeRef.current;
      if (perfMode === 1 && (frameRef.current % 2 === 1)) return;
      if (perfMode === 0 && (frameRef.current % 3 !== 0)) return;
      if (!syncCanvasSize()) return;
      const { w: W, h: H } = canvasSizeRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // 2D tactical mode keeps the original ground-line look only.
      if (viewModeRef.current !== '3D') return;
      if (arcsDirtyRef.current) rebuildArcCache();
      const dashBase = dashOffRef.current;

      arcCacheRef.current.forEach((e) => {
        const dashOff = e.dash.length ? -dashBase * e.dashMult : 0;
        // Outer neon glow + bright core — same palette/widths as before.
        // No shadowBlur: the wide glow pass already renders the halo at a
        // fraction of the GPU cost. Visually identical at these widths.
        // Low mode skips the 9px glow pass (core only) when crowded.
        if (perfMode !== 0) {
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = e.glow;
          ctx.lineWidth = 9;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.setLineDash(e.dash);
          ctx.lineDashOffset = dashOff;
          ctx.stroke(e.path);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = e.core;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(e.dash);
        ctx.lineDashOffset = dashOff;
        ctx.stroke(e.path);
        ctx.restore();
      });
    };

    const tickAnimation = () => {
      const now = Date.now() / 1000;
      const map = mapRef.current;
      const tList = targetsRef.current;
      const in3D = viewModeRef.current === '3D';
      const pitchRad = map ? (map.getPitch() * Math.PI) / 180 : 0;
      const sinP = Math.sin(pitchRad);
      const zoom = map ? map.getZoom() : 6;
      // Padded viewport bounds (once per frame) for marker culling:
      // off-screen tracks skip all per-frame DOM writes when crowded.
      let cullW = 0;
      let cullE = 0;
      let cullS = 0;
      let cullN = 0;
      let cullOn = false;
      if (map) {
        try {
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const padLon = (ne.lng - sw.lng) * 0.25;
          const padLat = (ne.lat - sw.lat) * 0.25;
          cullW = sw.lng - padLon;
          cullE = ne.lng + padLon;
          cullS = sw.lat - padLat;
          cullN = ne.lat + padLat;
          cullOn = true;
        } catch { /* map torn down */ }
      }

      tList.forEach((target) => {
        const markers = htmlMarkersRef.current.get(target.id);
        if (!markers || !target.trajectory_arc || target.trajectory_arc.length < 2) return;

        const apogee = getApogeeMeters(target.threat_type);

        const elapsed = now - target.start_time;
        const totalDuration = Math.max(target.eta_seconds, 1.0);
        const progress = Math.min(Math.max(elapsed / totalDuration, 0), 1);

        const arc = target.trajectory_arc;
        const idxFloat = progress * (arc.length - 1);
        const idxLow = Math.floor(idxFloat);
        const idxHigh = Math.min(idxLow + 1, arc.length - 1);
        const subT = idxFloat - idxLow;

        const p1 = arc[idxLow];
        const p2 = arc[idxHigh];

        const currLat = p1[0] + (p2[0] - p1[0]) * subT;
        const currLon = p1[1] + (p2[1] - p1[1]) * subT;

        const currAltMeters = altitudeAt(progress, apogee, target.threat_type);
        const currAltKm = (currAltMeters / 1000).toFixed(1);
        // Display altitude for the 3D picture (schematic for low flyers);
        // the badge above always shows the REAL physical altitude.
        const currVisMeters = visualAltAt(progress, target.threat_type);

        // Arrival: hide missile icon + badge, drop the trajectory, stop here.
        // (Launcher SPU + destination crosshair stay as impact annotations
        // until the backend purges the target ~60s later.)
        const arrived = progress >= 1;
        const mEl = markers.missileMarker.getElement() as HTMLElement | null;
        const bMarkerEl = markers.altitudeBadge?.getElement() as HTMLElement | null;
        if (arrived) {
          if (!arrivedRef.current.has(target.id)) {
            arrivedRef.current.add(target.id);
            pushGroundFeatures();
          }
          if (mEl) mEl.style.display = 'none';
          if (bMarkerEl) bMarkerEl.style.display = 'none';
          return;
        }
        if (arrivedRef.current.has(target.id)) arrivedRef.current.delete(target.id);
        if (mEl) mEl.style.display = '';
        if (bMarkerEl) bMarkerEl.style.display = '';

        // Viewport culling: park off-screen markers (skip every DOM write).
        if (cullOn && (currLon < cullW || currLon > cullE || currLat < cullS || currLat > cullN)) {
          if (!markers.culled) {
            markers.culled = true;
            if (mEl) mEl.style.display = 'none';
            if (bMarkerEl) bMarkerEl.style.display = 'none';
          }
          return;
        }
        if (markers.culled) {
          markers.culled = false;
          if (mEl) mEl.style.display = '';
          if (bMarkerEl) bMarkerEl.style.display = '';
        }

        markers.missileMarker.setLngLat([currLon, currLat]);

        // Lift the HTML icon in screen space so it flies along the
        // DISPLAYED arc (schematic lift for low threats in 3D).
        const liftable = in3D && sinP >= 0.05;
        const metersPerPixel = (lat: number) =>
          (Math.cos((lat * Math.PI) / 180) * 40075016) / (256 * Math.pow(2, zoom));
        // Same shrink the drawn arc got (short legs stay near-flat).
        const liftK = arcCacheRef.current.get(target.id)?.lift ?? 1;
        const liftOf = (lat: number, altM: number) =>
          liftable ? ((altM / metersPerPixel(lat)) * sinP * ALT_PX_EXAGGERATION * liftK) : 0;
        const yOffPx = liftOf(currLat, currVisMeters);
        try {
          markers.missileMarker.setOffset([0, -yOffPx]);
          markers.altitudeBadge?.setOffset([0, -32 - yOffPx]);
        } catch {
          // Older MapLibre marker without setOffset — ignore, stays grounded.
        }

        // Orient the nose along the VISIBLE (screen-space, lifted) tangent —
        // never the bearing to the destination — so it can't fly sideways.
        if (map) {
          const idxFloatNext = Math.min(idxFloat + 1.5, arc.length - 1);
          const iLow = Math.floor(idxFloatNext);
          const iHigh = Math.min(iLow + 1, arc.length - 1);
          const iSub = idxFloatNext - iLow;
          const q1 = arc[iLow];
          const q2 = arc[iHigh];
          const nextLat = q1[0] + (q2[0] - q1[0]) * iSub;
          const nextLon = q1[1] + (q2[1] - q1[1]) * iSub;
          const nextAlt = visualAltAt(idxFloatNext / (arc.length - 1), target.threat_type);
          const pc = map.project([currLon, currLat]);
          const pn = map.project([nextLon, nextLat]);
          const dx = pn.x - pc.x;
          const dy = (pn.y - liftOf(nextLat, nextAlt)) - (pc.y - yOffPx);
          if (dx * dx + dy * dy > 0.25) {
            const screenAng = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
            if (markers.rotorEl) markers.rotorEl.style.transform = `rotate(${screenAng.toFixed(1)}deg)`;
          }
        }
        if (markers.altitudeBadge && markers.badgeEl) {
          markers.altitudeBadge.setLngLat([currLon, currLat]);
          // Same text as before — DOM write only when it actually changes
          // (ETA ticks 1Hz, altitude ~a few Hz; not 60fps layout churn).
          const badgeText = `ВИС: ${currAltKm} км | ETA: ${Math.max(0, Math.round(totalDuration - elapsed))}с`;
          if (badgeText !== markers.lastBadgeText) {
            markers.lastBadgeText = badgeText;
            markers.badgeEl.innerText = badgeText;
          }
        }
      });

      // Advance marching-ants dash phase for low-altitude tracks.
      const dt = Math.min(0.1, Math.max(0, now - (lastTickRef.current || now)));
      lastTickRef.current = now;
      dashOffRef.current = (dashOffRef.current + dt * 42) % 2000;

      // Per-track colors + NEPTUN line refresh at ~2Hz (every 30th frame).
      // Lines follow live fixes; colors are persistent (no zoom flicker).
      frameRef.current += 1;
      if (frameRef.current % 30 === 0) {
        assignTrackColors();
        pushNeptunTrajectories();
        arcsDirtyRef.current = true;
        // Adaptive quality follows the live-track count.
        let liveCount = 0;
        for (const t of targetsRef.current) {
          if (t.trajectory_arc && t.trajectory_arc.length >= 2) liveCount++;
        }
        for (const t of neptunRef.current) {
          if (t.status === 'active' && !t.areaOnly && t.expectedTrajectory && t.expectedTrajectory.length >= 2) liveCount++;
        }
        perfModeRef.current = liveCount > 30 ? 0 : liveCount > 12 ? 1 : 2;
      }

      // NEPTUN live markers: dead-reckoned fix snapped onto the displayed
      // arc (like simulation targets, whose position always comes from the
      // arc) + 3D lift along it. Without the snap the marker drifts off
      // its line whenever reported heading differs from the drawn track.
      {
        const nowMs = Date.now();
        const mapBearing = map ? (map.getBearing() ?? 0) : 0;
        const liftable = in3D && sinP >= 0.05 && !!map;
        const mpp = (lat: number) =>
          (Math.cos((lat * Math.PI) / 180) * 40075016) / (256 * Math.pow(2, zoom));
        neptunRef.current.forEach((t) => {
          const rec = neptunLiveRef.current.get(t.id);
          if (!rec) return;
          const raw = predictNeptun(t, nowMs, neptunTimeRef.current.get(t.id) ?? null);
          // Same shift the drawn arcs got, so the marker lands exactly on
          // the displayed (shifted) line, not on the fetch-time one.
          const sh = neptunShift(t, raw);
          let mLat = raw.lat;
          let mLon = raw.lon;
          let frac: number | null = null;
          const fwd = t.expectedTrajectory;
          if (!t.areaOnly && fwd && fwd.length >= 2) {
            const sn = snapToTraj(raw.lat, raw.lon, fwd);
            if (sn) {
              frac = sn.frac;
              const pp = pointAtFrac(fwd, sn.frac);
              mLat = pp.lat + sh.dLa;
              mLon = pp.lon + sh.dLo;
            }
          }
          // Shared clock: raw live fix for ground/overlay anchoring.
          liveFixRef.current.set(t.id, { lat: raw.lat, lon: raw.lon });
          // Viewport culling: park off-screen markers (skip every DOM write).
          if (cullOn && (mLon < cullW || mLon > cullE || mLat < cullS || mLat > cullN)) {
            if (!rec.culled) {
              rec.culled = true;
              const rootEl = rec.marker.getElement() as HTMLElement | null;
              if (rootEl) rootEl.style.display = 'none';
            }
            return;
          }
          if (rec.culled) {
            rec.culled = false;
            const rootEl = rec.marker.getElement() as HTMLElement | null;
            if (rootEl) rootEl.style.display = '';
          }
          try {
            rec.marker.setLngLat([mLon, mLat]);
          } catch { /* torn down */ }
          if (t.areaOnly) return;
          const key = neptunLiftKey(t.family, t.speedKmh);
          const traj = fwd;
          // Progress of the snapped fix along the forward arc, mapped to
          // full-flight progress for the altitude profile.
          const prog = neptunProgress(t, frac ?? 0);
          const liftK = arcCacheRef.current.get(`neptun-${t.id}`)?.lift ?? 1;
          const yOffHere = liftable
            ? ((visualAltAt(prog, key) / mpp(mLat)) * sinP * ALT_PX_EXAGGERATION * liftK)
            : 0;
          try {
            rec.marker.setOffset([0, -yOffHere]);
          } catch { /* older MapLibre without setOffset */ }
          const rotor = rec.rotorEl;
          if (!rotor) return;
          // Nose along the VISIBLE (lifted) tangent like simulation icons.
          if (map && traj && traj.length >= 2 && frac != null) {
            const fi = frac * (traj.length - 1);
            const nxtIdx = Math.min(Math.floor(fi) + 2, traj.length - 1);
            const nxt = traj[nxtIdx];
            const progN = neptunProgress(t, nxtIdx / (traj.length - 1));
            const yOffNext = liftable
              ? ((visualAltAt(progN, key) / mpp(nxt[0])) * sinP * ALT_PX_EXAGGERATION * liftK)
              : 0;
            const pc = map.project([mLon, mLat]);
            const pn = map.project([nxt[1], nxt[0]]);
            const dx = pn.x - pc.x;
            const dy = (pn.y - yOffNext) - (pc.y - yOffHere);
            if (dx * dx + dy * dy > 0.25) {
              rotor.style.transform = `rotate(${(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360).toFixed(1)}deg)`;
              return;
            }
          }
          if (raw.heading != null) {
            rotor.style.transform = `rotate(${(((raw.heading - mapBearing) % 360 + 360) % 360).toFixed(0)}deg)`;
          }
        });
      }

      drawLiftedArcs();
      animId = requestAnimationFrame(tickAnimation);
    };

    animId = requestAnimationFrame(tickAnimation);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="relative w-full h-full bg-[#030509]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      {/* Lifted-arc overlay: same curve as ground line, raised in screen space.
          pointer-events-none so markers stay clickable. */}
      <canvas ref={arcCanvasRef} className="absolute inset-0 w-full h-full z-[1] pointer-events-none" />

      {/* Floating 2D / 3D Mode Switcher on Map */}
      <div className="absolute top-16 left-4 z-20 flex items-center space-x-1.5 p-1 rounded-lg bg-black/80 backdrop-blur-md border border-slate-800 shadow-xl font-mono text-xs">
        <button
          onClick={onToggleViewMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all font-bold tracking-wide ${
            viewMode === '2D'
              ? 'bg-sky-500 text-white shadow-[0_0_16px_rgba(56,189,248,0.5)]'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>2D ТАКТИКА</span>
        </button>

        <button
          onClick={onToggleViewMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all font-bold tracking-wide ${
            viewMode === '3D'
              ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_0_18px_rgba(244,63,94,0.5)]'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>3D ПЕРСПЕКТИВА (СУБОРБІТАЛЬНА)</span>
        </button>
      </div>

      {/* Raion alert levels (neptun.in.ua) */}
      <div className="absolute bottom-6 left-4 z-20 px-3.5 py-2.5 rounded-xl bg-gradient-to-b from-slate-900/90 to-black/90 backdrop-blur-xl border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.6)] font-mono text-[11px] space-y-1.5">
        <div className="text-slate-300 font-bold tracking-[0.14em] uppercase text-[10px]">Тривоги по районах</div>
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-[4px] bg-gradient-to-br from-red-400 to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
            <span className="text-red-300 font-bold tabular-nums">Тривога{oblastMeta ? ` · ${oblastMeta.red}` : ''}</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-[4px] bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
            <span className="text-yellow-200 font-bold tabular-nums">Загроза{oblastMeta ? ` · ${oblastMeta.yellow}` : ''}</span>
          </span>
        </div>
        <div className="text-slate-500 text-[10px]">
          {oblastMeta ? `оновлено ${new Date(oblastMeta.updatedAt).toLocaleTimeString('uk-UA')} · neptun.in.ua` : 'завантаження рівнів…'}
        </div>
        <div className="text-slate-400 text-[10px] pt-1 mt-0.5 border-t border-white/10">
          {neptunMeta ? `NEPTUN live: ${neptunMeta.active} треків` : 'NEPTUN live: …'}
          {' · '}
          <a href="https://neptun.in.ua/" target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300 underline">
            Дані загроз: NEPTUN
          </a>
        </div>
      </div>
    </div>
  );
};

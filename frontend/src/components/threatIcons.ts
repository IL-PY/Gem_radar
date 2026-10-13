import type { ThreatType } from '../types';

/**
 * Per-threat map skins: marker silhouette (nose-up, 24x24), halo/ping
 * styling and trajectory palette.
 *
 * Icon sources:
 * - SHAHED delta silhouette adapts "Paper Plane" by Delapouite,
 *   game-icons.net, CC BY 3.0 (rotated nose-up for the radar).
 * - BALLISTIC / CRUISE_MISSILE / KAB / RECON_UAV silhouettes drawn in-house
 *   in the same tactical style (game-icons.net's jet-fighter/delivery-drone
 *   were evaluated but are too detailed to read at 24px marker size).
 */

export interface ThreatSkin {
  label: string;
  /** Inner SVG markup rendered inside <svg viewBox="0 0 24 24">. */
  svgInner: string;
  haloBg: string;
  rotorShadow: string;
  badgeBorder: string;
  groundGlow: string;
  groundCore: string;
  overlayGlow: string;
  overlayCore: string;
}

const BALLISTIC_SVG = `
  <path d="M12 2.5c0 0-4.5 5.5-4.5 12.5 0 2 .5 4 1 5l3.5-2.5 3.5 2.5c.5-1 1-3 1-5 0-7-4.5-12.5-4.5-12.5z" fill="#f43f5e" stroke="#fff" stroke-width="1.6"/>
  <path d="M12 18.5c-.8 2-1 3.5-1 4.5 0 1 1 1 1 1s1 0 1-1c0-1-.2-2.5-1-4.5z" fill="#facc15"/>`;

// Shahed-136 planform is a cropped delta wing — game-icons "paper-plane"
// rotated nose-up reads as exactly that at marker size.
const SHAHED_SVG = `
  <g transform="translate(12,12) scale(0.046875) translate(-256,-256) rotate(-45 256 256)">
    <path d="M480 40 32 296l112.148 37.383L448 72 209.404 355.135 320 392 480 40zM208 376l-16 96 49.932-83.863L208 376z"
      fill="#f59e0b" stroke="#fff" stroke-width="36" stroke-linejoin="round"/>
  </g>`;

const CRUISE_SVG = `
  <path d="M12 1.8c1.1 0 1.9 1 1.9 2.2v12.4c0 1.7-.8 2.6-1.9 2.6s-1.9-.9-1.9-2.6V4c0-1.2.8-2.2 1.9-2.2z" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
  <path d="M10.1 11.5 3.2 15.4v1.4l6.9-2.9zM13.9 11.5l6.9 3.9v1.4l-6.9-2.9z" fill="#38bdf8" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M10.4 17.2 8.2 21.4l1.9.1 1.2-3.4zM13.6 17.2l2.2 4.2-1.9.1-1.2-3.4z" fill="#38bdf8" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M11 19.4h2l-.4 2.4h-1.2z" fill="#facc15"/>`;

const KAB_SVG = `
  <path d="M12 1.6c2.3 0 3.4 2.3 3.4 4.6v6.6c0 2.6-1.4 4.2-3.4 4.2s-3.4-1.6-3.4-4.2V6.2c0-2.3 1.1-4.6 3.4-4.6z" fill="#fb923c" stroke="#fff" stroke-width="1.5"/>
  <path d="M8.6 12.8 5.8 18.2l2.3-.3 1.4-3.9zM15.4 12.8l2.8 5.4-2.3-.3-1.4-3.9z" fill="#fb923c" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M10.8 17.4h2.4l.5 2.4h-3.4z" fill="#fb923c" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <circle cx="12" cy="7.5" r="1.1" fill="#7c2d12"/>`;

const RECON_SVG = `
  <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="#34d399" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="5.5" cy="5.5" r="2.6" fill="#34d399" stroke="#fff" stroke-width="1.4"/>
  <circle cx="18.5" cy="5.5" r="2.6" fill="#34d399" stroke="#fff" stroke-width="1.4"/>
  <circle cx="5.5" cy="18.5" r="2.6" fill="#34d399" stroke="#fff" stroke-width="1.4"/>
  <circle cx="18.5" cy="18.5" r="2.6" fill="#34d399" stroke="#fff" stroke-width="1.4"/>
  <circle cx="12" cy="12" r="2.6" fill="#34d399" stroke="#fff" stroke-width="1.6"/>
  <circle cx="12" cy="12" r="0.9" fill="#064e3b"/>`;

// Jet Shahed-238: narrow fast dart, violet, with engine exhaust glow.
const JET_SVG = `
  <path d="M12 1.2c.9 0 1.6.9 1.6 2v11.2c0 1.4-.7 2.2-1.6 2.2s-1.6-.8-1.6-2.2V3.2c0-1.1.7-2 1.6-2z" fill="#a78bfa" stroke="#fff" stroke-width="1.5"/>
  <path d="M10.6 10.5 5.4 15.8l-.2 1.2 5.4-3.4zM13.4 10.5l5.2 5.3.2 1.2-5.4-3.4z" fill="#a78bfa" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M10.8 15.2l-1.2 3.6 1.6-.2 1-2.9zM13.2 15.2l1.2 3.6-1.6-.2-1-2.9z" fill="#a78bfa" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M11 16.8h2l-.3 2.4h-1.4z" fill="#facc15"/>`;

export const THREAT_SKINS: Record<ThreatType, ThreatSkin> = {
  BALLISTIC: {
    label: 'Балістика',
    svgInner: BALLISTIC_SVG,
    haloBg: 'bg-rose-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(244,63,94,1)]',
    badgeBorder: 'border-rose-500/80',
    groundGlow: '#f43f5e',
    groundCore: '#ffe4e6',
    overlayGlow: '#f43f5e',
    overlayCore: '#ffe4e6',
  },
  SHAHED: {
    label: 'Shahed-136',
    svgInner: SHAHED_SVG,
    haloBg: 'bg-amber-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(245,158,11,1)]',
    badgeBorder: 'border-amber-500/80',
    groundGlow: '#f59e0b',
    groundCore: '#fef08a',
    overlayGlow: '#f59e0b',
    overlayCore: '#fef08a',
  },
  JET_SHAHED: {
    label: 'Shahed-238 (реакт.)',
    svgInner: JET_SVG,
    haloBg: 'bg-violet-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(167,139,250,1)]',
    badgeBorder: 'border-violet-500/80',
    groundGlow: '#8b5cf6',
    groundCore: '#ede9fe',
    overlayGlow: '#8b5cf6',
    overlayCore: '#ede9fe',
  },
  CRUISE_MISSILE: {
    label: 'Крилаті ракети',
    svgInner: CRUISE_SVG,
    haloBg: 'bg-sky-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(56,189,248,1)]',
    badgeBorder: 'border-sky-500/80',
    groundGlow: '#38bdf8',
    groundCore: '#e0f2fe',
    overlayGlow: '#38bdf8',
    overlayCore: '#e0f2fe',
  },
  KAB: {
    label: 'КАБ',
    svgInner: KAB_SVG,
    haloBg: 'bg-orange-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(251,146,60,1)]',
    badgeBorder: 'border-orange-500/80',
    groundGlow: '#fb923c',
    groundCore: '#ffedd5',
    overlayGlow: '#fb923c',
    overlayCore: '#ffedd5',
  },
  RECON_UAV: {
    label: 'Розвід. БПЛА',
    svgInner: RECON_SVG,
    haloBg: 'bg-emerald-500/30',
    rotorShadow: 'drop-shadow-[0_0_12px_rgba(52,211,153,1)]',
    badgeBorder: 'border-emerald-500/80',
    groundGlow: '#34d399',
    groundCore: '#d1fae5',
    overlayGlow: '#34d399',
    overlayCore: '#d1fae5',
  },
};

export function skinOf(threatType: ThreatType): ThreatSkin {
  return THREAT_SKINS[threatType] ?? THREAT_SKINS.BALLISTIC;
}

// MiG-31K interceptor (Kinzhal carrier), top view, nose-up.
const FIGHTER_SVG = `
  <path d="M12 1.5c.8 0 1.5.8 1.5 1.8v9.5c0 1.2-.7 1.9-1.5 1.9s-1.5-.7-1.5-1.9V3.3c0-1 .7-1.8 1.5-1.8z" fill="#e2e8f0" stroke="#fff" stroke-width="1.4"/>
  <path d="M10.8 8.5 4 14.5l-.3 1.3 7-4.4zM13.2 8.5l6.8 6 .3 1.3-7-4.4z" fill="#e2e8f0" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M10.7 13.5l-1.5 4 1.7-.3 1.2-3.2zM13.3 13.5l1.5 4-1.7-.3-1.2-3.2z" fill="#e2e8f0" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <circle cx="12" cy="7" r="1" fill="#475569"/>`;

const UNKNOWN_SVG = `
  <path d="M12 3l7 9-7 9-7-9z" fill="#64748b" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="1.6" fill="#fff"/>`;

/** Skins for NEPTUN live feed families (rendered white via CSS filter). */
export const NEPTUN_SKINS: Record<string, { svgInner: string; haloBg: string }> = {
  SHAHED: { svgInner: SHAHED_SVG, haloBg: 'bg-amber-500/30' },
  FPV: { svgInner: SHAHED_SVG, haloBg: 'bg-orange-500/30' },
  RECON_UAV: { svgInner: RECON_SVG, haloBg: 'bg-emerald-500/30' },
  CRUISE_MISSILE: { svgInner: CRUISE_SVG, haloBg: 'bg-sky-500/30' },
  BALLISTIC: { svgInner: BALLISTIC_SVG, haloBg: 'bg-rose-500/30' },
  KAB: { svgInner: KAB_SVG, haloBg: 'bg-orange-500/30' },
  MIG31K: { svgInner: FIGHTER_SVG, haloBg: 'bg-red-500/30' },
  UNKNOWN: { svgInner: UNKNOWN_SVG, haloBg: 'bg-slate-500/30' },
};

export function neptunSkin(family: string): { svgInner: string; haloBg: string } {
  return NEPTUN_SKINS[family] ?? NEPTUN_SKINS.UNKNOWN;
}

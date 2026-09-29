import type { WorldKey } from '../core/types';

/** Surface flora painted along the tops of 'earth' terrain. */
export type Flora = 'grass' | 'moss' | 'reeds' | 'frost' | 'fern' | 'paper';

/** Colours for one world. Inks are global (see INK_COLORS) so they always read the same. */
export interface Palette {
  /** Sky gradient stops, top → horizon (the world scenes paint their own richer skies). */
  sky: string[];
  /** Moon / sun disc (world coords). */
  orb: { x: number; y: number; r: number; color: string; glow: string };
  /** Far → near hill silhouettes. */
  hills: string[];
  /** Ink-black terrain body, tinted per world. */
  terrain: string;
  /** Cross-hatching inside terrain. */
  hatch: string;
  /** Moonlit rim on upward-facing edges. */
  rim: string;
  mist: string;
  /** Warm accent (sparks, lamps). */
  accent: string;
  /** Handwritten notes. */
  note: string;
  /** 0..1 star density. */
  stars: number;

  // ── terrain dressing ──
  /** Lit soil just under the surface (the inner glow band of the ground). */
  soil: string;
  /** Flora on earth tops. */
  flora: Flora;
  /** Tiny flowers / glow-caps / berries along the ground. */
  bloom: string[];
  /** World x of the key light (sun / moon): side rims face it. */
  lightX: number;
  /** Material tints (mixed with the terrain ink). */
  wood: string;
  paper: string;
  crystal: string;
  /** Mushroom stems. */
  stem: string;
  /** Horizon haze: the colour distance fades toward. */
  haze: string;
}

export const INK_COLORS = {
  moon: { core: '#F3F7FF', halo: '#8FB8FF', deep: '#4D74C9' },
  spring: { core: '#FFE6F4', halo: '#FF5FAE', deep: '#B8327A' },
  comet: { core: '#FFF3D6', halo: '#FFB23F', deep: '#C7741A' },
} as const;

export const PALETTES: Record<WorldKey, Palette> = {
  dusk: {
    sky: ['#171230', '#2A1B46', '#4E2659', '#8D3B63', '#CF5E60', '#F09067', '#FCC487'],
    orb: { x: 930, y: 468, r: 118, color: '#FFE0A6', glow: 'rgba(255,170,110,0.35)' },
    hills: ['#9C5474', '#6E3559', '#3E1E40'],
    terrain: '#150D1B',
    hatch: 'rgba(214,160,210,0.085)',
    rim: '#FFC98B',
    mist: 'rgba(235,160,142,0.4)',
    accent: '#FFD27A',
    note: 'rgba(255,236,214,0.86)',
    stars: 0.15,
    soil: '#4A2138',
    flora: 'grass',
    bloom: ['#FFB49A', '#FFE2A0', '#F7A6C8'],
    lightX: 930,
    wood: '#3A2118',
    paper: '#3A2436',
    crystal: '#2A2A44',
    stem: '#6A4468',
    haze: '#F09067',
  },
  hollow: {
    sky: ['#070820', '#10123C', '#1E1957', '#352672', '#553A8E', '#7D57AB'],
    orb: { x: 290, y: 140, r: 30, color: '#F1EAFF', glow: 'rgba(190,160,255,0.3)' },
    hills: ['#3F3486', '#2A2264', '#17123A'],
    terrain: '#0D0A20',
    hatch: 'rgba(140,225,235,0.075)',
    rim: '#9EF3DF',
    mist: 'rgba(132,102,214,0.4)',
    accent: '#7CF5D8',
    note: 'rgba(230,225,255,0.86)',
    stars: 0.45,
    soil: '#261D52',
    flora: 'moss',
    bloom: ['#7CF5D8', '#E59BFF', '#A8FFE8'],
    lightX: 290,
    wood: '#2A1E3A',
    paper: '#2A2248',
    crystal: '#1E2A4E',
    stem: '#7A68B0',
    haze: '#7D57AB',
  },
  starwater: {
    sky: ['#02040E', '#040A22', '#081640', '#0F2560', '#193A7A', '#27538F'],
    orb: { x: 920, y: 180, r: 128, color: '#EEF2FF', glow: 'rgba(170,200,255,0.28)' },
    hills: ['#18305F', '#0A1633', '#060D22'],
    terrain: '#060B1A',
    hatch: 'rgba(150,190,255,0.08)',
    rim: '#D4E3FF',
    mist: 'rgba(123,158,220,0.3)',
    accent: '#FFE3A3',
    note: 'rgba(225,235,255,0.86)',
    stars: 1,
    soil: '#13264E',
    flora: 'reeds',
    bloom: ['#CFE0FF', '#FFE3A3'],
    lightX: 920,
    wood: '#1E1A24',
    paper: '#16223E',
    crystal: '#14284A',
    stem: '#4A5A8A',
    haze: '#27538F',
  },
  storm: {
    sky: ['#05070B', '#0A0F16', '#111923', '#1B2632', '#283645', '#384A5D'],
    orb: { x: 1050, y: 150, r: 34, color: '#C9D6E6', glow: 'rgba(170,190,220,0.18)' },
    hills: ['#2C3B4C', '#182330', '#0C131A'],
    terrain: '#080B10',
    hatch: 'rgba(175,205,235,0.075)',
    rim: '#C4D8EC',
    mist: 'rgba(113,134,156,0.4)',
    accent: '#FFD27A',
    note: 'rgba(220,230,240,0.86)',
    stars: 0.05,
    soil: '#1C2836',
    flora: 'frost',
    bloom: ['#BFE8F8', '#8FD8F0'],
    lightX: 1050,
    wood: '#1E1C1C',
    paper: '#1E2630',
    crystal: '#15293A',
    stem: '#4A5868',
    haze: '#384A5D',
  },
  mothwood: {
    sky: ['#010302', '#020805', '#04100A', '#07180F', '#0B2216', '#102C1D'],
    orb: { x: 370, y: 140, r: 30, color: '#E4F5DA', glow: 'rgba(180,255,160,0.15)' },
    hills: ['#153826', '#0B2016', '#040B07'],
    terrain: '#030705',
    hatch: 'rgba(182,255,138,0.06)',
    rim: '#B6FF8A',
    mist: 'rgba(63,126,90,0.35)',
    accent: '#FFE08A',
    note: 'rgba(220,245,215,0.86)',
    stars: 0.6,
    soil: '#0E2618',
    flora: 'fern',
    bloom: ['#B6FF8A', '#E8F59A'],
    lightX: 370,
    wood: '#14120C',
    paper: '#10201A',
    crystal: '#0E2420',
    stem: '#3A5A44',
    haze: '#102C1D',
  },
  daybreak: {
    sky: ['#131230', '#281F4E', '#523265', '#934A72', '#D06C78', '#EF9C84'],
    orb: { x: 700, y: 660, r: 96, color: '#FFE6B4', glow: 'rgba(255,190,130,0.4)' },
    hills: ['#8E5478', '#5E3160', '#321B3C'],
    terrain: '#1B1022',
    hatch: 'rgba(255,196,176,0.09)',
    rim: '#FFE0B0',
    mist: 'rgba(240,168,160,0.4)',
    accent: '#FFE6A0',
    note: 'rgba(255,240,225,0.9)',
    stars: 0.08,
    soil: '#4A2644',
    flora: 'paper',
    bloom: ['#FFD9A0', '#FF9FB0', '#FFF0D8'],
    lightX: 700,
    wood: '#2E1A1E',
    paper: '#3C2446',
    crystal: '#2A2448',
    stem: '#7A4A70',
    haze: '#EF9C84',
  },
};

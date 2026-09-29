import type { WorldKey } from '../core/types';

/** Colours for one world. Inks are global (see INK_COLORS) so they always read the same. */
export interface Palette {
  /** Sky gradient stops, top → horizon. */
  sky: string[];
  /** Moon / sun disc (world coords). */
  orb: { x: number; y: number; r: number; color: string; glow: string };
  /** Far → near hill silhouettes. */
  hills: string[];
  terrain: string;
  hatch: string;
  rim: string;
  mist: string;
  /** Warm accent (sparks, lamps). */
  accent: string;
  /** Handwritten notes. */
  note: string;
  /** 0..1 star density. */
  stars: number;
}

export const INK_COLORS = {
  moon: { core: '#F3F7FF', halo: '#8FB8FF', deep: '#4D74C9' },
  spring: { core: '#FFE6F4', halo: '#FF5FAE', deep: '#B8327A' },
  comet: { core: '#FFF3D6', halo: '#FFB23F', deep: '#C7741A' },
} as const;

export const PALETTES: Record<WorldKey, Palette> = {
  dusk: {
    sky: ['#221838', '#4A2A5C', '#8C4468', '#E07A5F', '#F6B37F'],
    orb: { x: 980, y: 250, r: 70, color: '#FFD9A0', glow: 'rgba(255,170,110,0.35)' },
    hills: ['#6B3A63', '#4A2849', '#2E1A33'],
    terrain: '#150E1C',
    hatch: 'rgba(160,120,190,0.16)',
    rim: '#FFC98B',
    mist: 'rgba(250,170,140,0.28)',
    accent: '#FFD27A',
    note: 'rgba(255,236,214,0.86)',
    stars: 0.15,
  },
  hollow: {
    sky: ['#0E1030', '#1E1E52', '#3A2F78', '#6A58A8', '#9C86C9'],
    orb: { x: 260, y: 180, r: 46, color: '#E9DDFF', glow: 'rgba(190,160,255,0.3)' },
    hills: ['#3B3272', '#262255', '#17153A'],
    terrain: '#0D0B1E',
    hatch: 'rgba(124,245,216,0.12)',
    rim: '#9EF3DF',
    mist: 'rgba(150,120,230,0.25)',
    accent: '#7CF5D8',
    note: 'rgba(230,225,255,0.86)',
    stars: 0.45,
  },
  starwater: {
    sky: ['#040716', '#0A1436', '#14285A', '#1F3D78', '#2E5790'],
    orb: { x: 900, y: 170, r: 92, color: '#EEF2FF', glow: 'rgba(170,200,255,0.28)' },
    hills: ['#1B3163', '#122449', '#0A1631'],
    terrain: '#060B1A',
    hatch: 'rgba(140,180,255,0.13)',
    rim: '#CFE0FF',
    mist: 'rgba(120,170,255,0.22)',
    accent: '#FFE3A3',
    note: 'rgba(225,235,255,0.86)',
    stars: 1,
  },
  storm: {
    sky: ['#07090D', '#10161E', '#1B242F', '#2A3643', '#3A4856'],
    orb: { x: 1100, y: 120, r: 34, color: '#C9D6E6', glow: 'rgba(170,190,220,0.18)' },
    hills: ['#27323E', '#1A222C', '#10161D'],
    terrain: '#080B10',
    hatch: 'rgba(170,200,230,0.12)',
    rim: '#BFD4EA',
    mist: 'rgba(150,175,205,0.22)',
    accent: '#FFD27A',
    note: 'rgba(220,230,240,0.86)',
    stars: 0.05,
  },
  mothwood: {
    sky: ['#020403', '#050B08', '#09140F', '#0E1F17', '#132A1F'],
    orb: { x: 300, y: 140, r: 30, color: '#DDF5D0', glow: 'rgba(180,255,160,0.15)' },
    hills: ['#12261C', '#0C1A13', '#07100C'],
    terrain: '#030605',
    hatch: 'rgba(182,255,138,0.10)',
    rim: '#B6FF8A',
    mist: 'rgba(120,200,140,0.16)',
    accent: '#FFE08A',
    note: 'rgba(220,245,215,0.86)',
    stars: 0.6,
  },
  daybreak: {
    sky: ['#1B1838', '#3F2A5A', '#8A4A6E', '#F08A74', '#FFD3A0'],
    orb: { x: 640, y: 690, r: 120, color: '#FFE7B8', glow: 'rgba(255,190,130,0.4)' },
    hills: ['#9A5A78', '#6A3A5C', '#3A2140'],
    terrain: '#1A1020',
    hatch: 'rgba(255,190,170,0.14)',
    rim: '#FFE0B0',
    mist: 'rgba(255,200,170,0.3)',
    accent: '#FFE6A0',
    note: 'rgba(255,240,225,0.9)',
    stars: 0.08,
  },
};

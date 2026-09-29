import type { Vec } from './math';

// ───────────────────────────────── Inks & materials ─────────────────────────────────

export type InkType = 'moon' | 'spring' | 'comet';
export const INK_TYPES: readonly InkType[] = ['moon', 'spring', 'comet'];

/** Physical behaviour of a collision segment. Hazards are *not* solid (overlap-tested separately). */
export type Material = 'solid' | 'bounce' | 'rush';

// ───────────────────────────────── Level definition ─────────────────────────────────

export type TerrainStyle =
  | 'earth' // default: hatched ink ground with rim-light and grass tufts
  | 'rock' // floating stones / cliffs
  | 'wood' // planks, bridges, posts
  | 'mushroom' // bouncy caps (use with mat 'bounce')
  | 'bramble' // hazard thorns (use with mat 'hazard')
  | 'paper' // folded paper architecture (Daybreak Spires)
  | 'crystal'; // glassy stones (Stormglass)

export interface TerrainDef {
  /** Closed polygon, world units, y down. */
  pts: Vec[];
  /** Default 'solid'. 'hazard' polygons kill on touch and are not solid. */
  mat?: 'solid' | 'bounce' | 'hazard';
  /** Bounce speed override (u/s) for 'bounce' terrain (mushroom caps). */
  bounce?: number;
  style?: TerrainStyle;
  /** Render-only: skip ground decorations like grass on this piece. */
  bare?: boolean;
}

/** Handwritten tutorial note scribbled on the page. */
export interface NoteDef {
  x: number;
  y: number;
  text: string;
  /** Rotation in degrees (small values look hand-written: -6…6). */
  rot?: number;
  /** Font size in world units (default 30). */
  size?: number;
  /** Optional hand-drawn arrow from (x1,y1) to (x2,y2). */
  arrow?: [number, number, number, number];
  /** Only show while in plan mode (default true). */
  planOnly?: boolean;
}

/** A dotted "suggestion" line shown in tutorials. */
export interface GhostDef {
  pts: Vec[];
  ink?: InkType;
}

export type EntityDef =
  /** Collect to add `amount` ink to the well (this run only). */
  | { kind: 'inkpot'; x: number; y: number; amount: number }
  /** A rain cloud spanning x1..x2 at height y. Drops fall straight down (wind may push them). */
  | { kind: 'rain'; x1: number; x2: number; y: number; rate?: number; seed?: number }
  /** Rectangular gust zone. fx, fy are accelerations (u/s²). */
  | { kind: 'wind'; x: number; y: number; w: number; h: number; fx: number; fy: number }
  /** A moth that seeks and eats glowing ink. Idles at (x,y) until Go. */
  | { kind: 'moth'; x: number; y: number; speed?: number; sense?: number }
  /** A little wisp-lantern: Wick lights it by touching it; opens gates with the same `id`. */
  | { kind: 'wisp'; x: number; y: number; id: string }
  /** A paper gate (solid rect) that slides open when all wisps with id `opens` are lit. */
  | { kind: 'gate'; x: number; y: number; w: number; h: number; opens: string; dir?: 'up' | 'down' }
  /**
   * A solid platform that ping-pongs along `path`. `pts` is the platform polygon in world coords at t=0,
   * when its reference point sits at path[0]; it is translated by (pathPos(t) - path[0]).
   * `period` = seconds for a full there-and-back cycle; `phase` ∈ [0,1) offsets the cycle.
   */
  | { kind: 'mover'; pts: Vec[]; path: Vec[]; period: number; phase?: number; style?: TerrainStyle }
  /** A paper ledge (rect) that tears away `delay` s after Wick first touches it. */
  | { kind: 'crumble'; x: number; y: number; w: number; h: number; delay?: number }
  /** Cosmetic light source (important in dark levels). */
  | { kind: 'glowworm'; x: number; y: number; r?: number };

export type EntityKind = EntityDef['kind'];

export interface SolutionStroke {
  ink: InkType;
  pts: Vec[];
  /** Sim time (s after Go) at which the stroke is drawn. Omit → drawn in plan mode before Go. */
  t?: number;
}

export interface LevelDef {
  /** "world-index", e.g. "1-3". Filled in by the registry. */
  id: string;
  name: string;
  /** Ground point where Wick stands at the start (Wick's feet). */
  start: { x: number; y: number; facing?: 1 | -1 };
  /** Ground point where the home-lamp stands. */
  goal: { x: number; y: number };
  ink: { budget: number; par: number; types: InkType[] };
  terrain: TerrainDef[];
  sparks: Vec[];
  noInk?: Vec[][];
  entities?: EntityDef[];
  notes?: NoteDef[];
  ghosts?: GhostDef[];
  /** Darkness: only light sources reveal the world. */
  dark?: boolean;
  /** Hurry level: Wick sets off automatically after this many seconds. */
  autoStart?: number;
  /** Reference solution. Must win, collect every spark, and use ≤ par ink. */
  solution: SolutionStroke[];
  /** Seed for deterministic sim randomness (defaults to a hash of the id). */
  seed?: number;
  /** Verifier knobs. */
  verify?: {
    /** Max random offset (u) applied to solution strokes in robustness trials (default 6). */
    jitter?: number;
    /** Fraction of jittered trials that must still win (default 0.6). */
    minRobust?: number;
    /** Allow the level to be winnable without ink (default false). */
    allowNoInk?: boolean;
  };
}

export interface WorldDef {
  index: number; // 1-based
  key: WorldKey;
  name: string;
  subtitle: string;
  levels: LevelDef[];
}

export type WorldKey = 'dusk' | 'hollow' | 'starwater' | 'storm' | 'mothwood' | 'daybreak';

// ───────────────────────────────── Simulation events ─────────────────────────────────

export type DeathCause = 'fall' | 'hazard' | 'doused' | 'stuck';

export type SimEvent =
  | { type: 'go' }
  | { type: 'reset' }
  | { type: 'spark'; index: number; x: number; y: number; count: number; total: number }
  | { type: 'bounce'; x: number; y: number; nx: number; ny: number; speed: number; ink: boolean }
  | { type: 'rush-start'; x: number; y: number; dx: number; dy: number }
  | { type: 'rush-end'; x: number; y: number }
  | { type: 'land'; x: number; y: number; speed: number }
  | { type: 'turn'; x: number; y: number; facing: 1 | -1 }
  | { type: 'step'; x: number; y: number; foot: 0 | 1 }
  | { type: 'death'; cause: DeathCause; x: number; y: number }
  | { type: 'win'; x: number; y: number }
  | { type: 'stroke-begin'; id: number; ink: InkType; x: number; y: number }
  | { type: 'stroke-end'; id: number; ink: InkType; len: number }
  | { type: 'stroke-cut'; x: number; y: number; reason: 'wick' | 'noink' | 'bounds' }
  | { type: 'ink-dry'; x: number; y: number }
  | { type: 'undo'; id: number }
  | { type: 'clear' }
  | { type: 'inkpot'; x: number; y: number; amount: number }
  | { type: 'rain-hit'; x: number; y: number; flame: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'moth-bite'; x: number; y: number; strokeId: number }
  | { type: 'wisp-lit'; id: string; x: number; y: number }
  | { type: 'gate-open'; id: string; x: number; y: number }
  | { type: 'crumble'; x: number; y: number }
  | { type: 'wind'; x: number; y: number };

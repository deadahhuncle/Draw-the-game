import type { Vec } from '../core/math';
import type { EntityDef } from '../core/types';
import type { Seg } from './segments';
import type { Simulation } from './simulation';

/**
 * A level entity (rain cloud, moth, gate, mover…). Entities live in the sim and must be deterministic:
 * use `sim.rng` (or their own `Rng` seeded from the def) — never Math.random.
 *
 * Lifecycle: constructed once per Simulation → `reset()` (also on every retry) → `step(dt)` every fixed
 * step while the sim is running. In plan mode entities are frozen at their t=0 state (render may add
 * purely cosmetic idle motion).
 */
export interface Entity {
  readonly def: EntityDef;
  readonly index: number;
  /** Solid colliders this entity currently contributes (world space). Read by the sim after each step. */
  segs: Seg[];
  reset(): void;
  step(dt: number): void;
  /** Optional cosmetic animation while in plan mode. State is reset again at Go, so it can't leak. */
  idle?(dt: number): void;
  /** Optional acceleration field (e.g. wind) at a point; add into `out`. */
  accel?(x: number, y: number, out: Vec): void;
}

export abstract class EntityBase<D extends EntityDef> implements Entity {
  segs: Seg[] = [];
  constructor(
    readonly sim: Simulation,
    readonly def: D,
    readonly index: number,
  ) {}
  abstract reset(): void;
  step(_dt: number): void {}
}

/** Build a closed-polygon segment list (entity-owned). */
export function polySegs(pts: readonly Vec[], index: number, ox = 0, oy = 0, vx = 0, vy = 0): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push({ ax: a.x + ox, ay: a.y + oy, bx: b.x + ox, by: b.y + oy, hw: 0, mat: 'solid', vx, vy, owner: { kind: 'entity', index } });
  }
  return out;
}

export function rectPts(x: number, y: number, w: number, h: number): Vec[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

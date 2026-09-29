import { DT, H } from '../../core/constants';
import type { Vec } from '../../core/math';
import { Rng, hashString } from '../../core/rng';
import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'rain' }>;

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const PREWARM = 1.6; // seconds of rain already falling at t=0
const DROP_R = 2;
export const RAIN_DOUSE = 0.34;

/**
 * A rain cloud. Drops fall from the cloud span; any solid (terrain, ink, gates…) stops them.
 * Each drop that hits Wick weakens the flame; three quick hits douse it.
 * In plan mode the rain keeps falling cosmetically (idle) so the player can see where it lands.
 */
export class Rain extends EntityBase<Def> {
  drops: Drop[] = [];
  private rng = new Rng(1);
  private acc = 0;
  private field: Vec = { x: 0, y: 0 };

  reset(): void {
    this.rng = new Rng(this.def.seed ?? hashString(`${this.sim.level.id}#rain${this.index}`));
    this.drops = [];
    this.acc = 0;
    for (let t = 0; t < PREWARM; t += DT) this.advance(DT, false);
  }
  idle(dt: number): void {
    this.advance(dt, false);
  }
  override step(dt: number): void {
    this.advance(dt, true);
  }

  private advance(dt: number, live: boolean): void {
    const d = this.def;
    this.acc += (d.rate ?? 22) * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.drops.push({ x: this.rng.range(d.x1, d.x2), y: d.y + this.rng.range(-4, 8), vx: 0, vy: this.rng.range(560, 640) });
    }
    const sim = this.sim;
    const f = this.field;
    let write = 0;
    for (let i = 0; i < this.drops.length; i++) {
      const p = this.drops[i];
      f.x = 0;
      f.y = 0;
      sim.fieldAt(p.x, p.y, f);
      p.vx += f.x * dt * 0.6;
      p.vx *= 1 - Math.min(1, dt * 0.8);
      const sx = p.vx * dt;
      const sy = p.vy * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(sx, sy) / 3));
      let alive = true;
      for (let k = 0; k < n && alive; k++) {
        p.x += sx / n;
        p.y += sy / n;
        if (live && sim.phase === 'running' && sim.wickTouches(p.x, p.y, DROP_R)) {
          sim.douse(RAIN_DOUSE, p.x, p.y);
          alive = false;
        } else if (sim.solidAt(p.x, p.y, DROP_R)) {
          sim.emit({ type: 'splash', x: p.x, y: p.y });
          alive = false;
        }
      }
      if (alive && p.y < H + 40) this.drops[write++] = p;
    }
    this.drops.length = write;
  }
}

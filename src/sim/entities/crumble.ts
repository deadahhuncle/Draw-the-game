import type { EntityDef } from '../../core/types';
import { EntityBase, polySegs, rectPts } from '../entity';

type Def = Extract<EntityDef, { kind: 'crumble' }>;

/** A paper ledge that tears away `delay` seconds after Wick first touches it. */
export class Crumble extends EntityBase<Def> {
  /** Sim time Wick first touched it (-1 = untouched). */
  touchedAt = -1;
  gone = false;
  reset(): void {
    this.touchedAt = -1;
    this.gone = false;
    const d = this.def;
    this.segs = polySegs(rectPts(d.x, d.y, d.w, d.h), this.index);
  }
  override step(): void {
    if (this.gone) return;
    const d = this.def;
    const w = this.sim.wick;
    if (this.touchedAt < 0) {
      const g = w.groundSeg;
      const onIt = g && g.owner.kind === 'entity' && g.owner.index === this.index;
      const near = w.x > d.x - 18 && w.x < d.x + d.w + 18 && w.y > d.y - 20 && w.y < d.y + d.h + 18;
      if (onIt || (near && w.grounded && Math.abs(w.y + 16 - d.y) < 3)) this.touchedAt = this.sim.time;
    } else if (this.sim.time - this.touchedAt >= (d.delay ?? 0.45)) {
      this.gone = true;
      this.segs = [];
      this.sim.emit({ type: 'crumble', x: d.x + d.w / 2, y: d.y + d.h / 2 });
    }
  }
  loopKey(): string {
    return this.gone ? 'g' : this.touchedAt >= 0 ? 't' : '-';
  }
}

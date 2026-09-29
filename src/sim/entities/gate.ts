import type { EntityDef } from '../../core/types';
import { EntityBase, polySegs, rectPts } from '../entity';
import { Wisp } from './wisp';

type Def = Extract<EntityDef, { kind: 'gate' }>;

const OPEN_TIME = 0.7;

/** A paper gate: solid until every wisp with id `opens` is lit, then it slides away. */
export class Gate extends EntityBase<Def> {
  /** 0 = closed, 1 = fully open. */
  open = 0;
  opening = false;
  reset(): void {
    this.open = 0;
    this.opening = false;
    this.rebuild();
  }
  override step(dt: number): void {
    if (!this.opening) {
      const wisps = this.sim.entities.filter((e): e is Wisp => e instanceof Wisp && e.def.id === this.def.opens);
      if (wisps.length > 0 && wisps.every((w) => w.lit)) {
        this.opening = true;
        const d = this.def;
        this.sim.emit({ type: 'gate-open', id: d.opens, x: d.x + d.w / 2, y: d.y + d.h / 2 });
      }
    }
    if (this.opening && this.open < 1) {
      this.open = Math.min(1, this.open + dt / OPEN_TIME);
      this.rebuild();
    }
  }
  /** Current vertical offset of the gate body. */
  get offset(): number {
    const e = this.open < 0.5 ? 2 * this.open * this.open : 1 - Math.pow(-2 * this.open + 2, 2) / 2;
    return (this.def.dir === 'down' ? 1 : -1) * this.def.h * e;
  }
  private rebuild(): void {
    const d = this.def;
    this.segs = this.open >= 1 ? [] : polySegs(rectPts(d.x, d.y + this.offset, d.w, d.h), this.index);
  }
  loopKey(): string {
    return this.open.toFixed(1);
  }
}

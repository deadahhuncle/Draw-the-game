import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'wisp' }>;

export const WISP_R = 16;

/** A tiny unlit lantern. Wick lights it by touching it; gates with `opens === id` open when all are lit. */
export class Wisp extends EntityBase<Def> {
  lit = false;
  litAt = 0;
  reset(): void {
    this.lit = false;
    this.litAt = 0;
  }
  override step(): void {
    if (this.lit) return;
    const { x, y, id } = this.def;
    if (this.sim.wickTouches(x, y, WISP_R)) {
      this.lit = true;
      this.litAt = this.sim.time;
      this.sim.emit({ type: 'wisp-lit', id, x, y });
    }
  }
}

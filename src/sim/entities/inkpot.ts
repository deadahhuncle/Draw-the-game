import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'inkpot' }>;

export const INKPOT_R = 14;

/** A little pot of luminous ink. Wick walks through it → the inkwell gains `amount` (this run only). */
export class Inkpot extends EntityBase<Def> {
  taken = false;
  takenAt = 0;
  reset(): void {
    this.taken = false;
    this.takenAt = 0;
  }
  override step(): void {
    if (this.taken) return;
    const { x, y, amount } = this.def;
    if (this.sim.wickTouches(x, y, INKPOT_R)) {
      this.taken = true;
      this.takenAt = this.sim.time;
      this.sim.addInk(amount, x, y);
    }
  }
}

import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'glowworm' }>;

/** Purely cosmetic light source (matters for dark levels, where it reveals nearby terrain). */
export class Glowworm extends EntityBase<Def> {
  reset(): void {}
}

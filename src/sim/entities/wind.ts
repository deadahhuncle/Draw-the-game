import type { Vec } from '../../core/math';
import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'wind' }>;

/** A rectangular gust zone. Accelerates Wick (and rain drops / moths that ask the sim for fields). */
export class Wind extends EntityBase<Def> {
  reset(): void {}
  contains(x: number, y: number): boolean {
    const d = this.def;
    return x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h;
  }
  accel(x: number, y: number, out: Vec): void {
    if (!this.contains(x, y)) return;
    // Soft edges: full strength in the middle 80%, fading toward the borders.
    const d = this.def;
    const ex = Math.min(x - d.x, d.x + d.w - x) / Math.max(1, d.w * 0.1);
    const ey = Math.min(y - d.y, d.y + d.h - y) / Math.max(1, d.h * 0.1);
    const k = Math.min(1, ex, ey);
    out.x += d.fx * k;
    out.y += d.fy * k;
  }
}

import type { EntityDef } from '../../core/types';
import { EntityBase } from '../entity';

type Def = Extract<EntityDef, { kind: 'moth' }>;

const BITE_R = 10;
const BITE_EVERY = 0.3;

/**
 * A moth: drawn to light. While Wick runs it flies to the nearest glowing ink within `sense` and eats it,
 * cutting strokes apart. With nothing to eat it drifts home. Harmless to Wick.
 */
export class Moth extends EntityBase<Def> {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  t = 0;
  biteCd = 0;
  /** True while it has ink in its sights (render: excited wing beat). */
  hunting = false;

  reset(): void {
    this.x = this.def.x;
    this.y = this.def.y;
    this.vx = 0;
    this.vy = 0;
    this.t = 0;
    this.biteCd = 0;
    this.hunting = false;
  }
  idle(dt: number): void {
    this.t += dt;
    this.x = this.def.x + Math.sin(this.t * 1.3 + this.index) * 6;
    this.y = this.def.y + Math.sin(this.t * 2.1 + this.index * 2) * 4;
  }
  override step(dt: number): void {
    this.t += dt;
    this.biteCd -= dt;
    const speed = this.def.speed ?? 80;
    const sense = this.def.sense ?? 240;
    const ink = this.sim.nearestInk(this.x, this.y, sense);
    this.hunting = !!ink;
    const tx = ink ? ink.x : this.def.x;
    const ty = ink ? ink.y : this.def.y;
    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const arrive = ink ? 1 : Math.min(1, d / 40);
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    }
    // Deterministic flutter.
    const fl = Math.sin(this.t * 9 + this.index * 1.7) * 0.35;
    const fx = dx - dy * fl;
    const fy = dy + dx * fl + Math.sin(this.t * 13 + this.index) * 0.25;
    const k = Math.min(1, dt * 4);
    this.vx += (fx * speed * arrive - this.vx) * k;
    this.vy += (fy * speed * arrive - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (ink && ink.d < BITE_R && this.biteCd <= 0) {
      this.sim.biteInk(this.x, this.y, BITE_R);
      this.biteCd = BITE_EVERY;
    }
  }
}

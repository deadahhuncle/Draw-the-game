import { DT } from '../../core/constants';
import { easeInOutSine, pointAtLength, polylineLength, type Vec } from '../../core/math';
import type { EntityDef } from '../../core/types';
import { EntityBase, polySegs } from '../entity';

type Def = Extract<EntityDef, { kind: 'mover' }>;

/** A platform that eases back and forth along a path, carrying Wick. */
export class Mover extends EntityBase<Def> {
  /** Current offset from the t=0 placement. */
  ox = 0;
  oy = 0;
  private t = 0;
  private readonly pathLen = polylineLength(this.def.path);

  reset(): void {
    this.t = 0;
    const p = this.posAt(0);
    this.ox = p.x - this.def.path[0].x;
    this.oy = p.y - this.def.path[0].y;
    this.segs = polySegs(this.def.pts, this.index, this.ox, this.oy);
  }
  posAt(t: number): Vec {
    const d = this.def;
    const cyc = (t / Math.max(0.1, d.period) + (d.phase ?? 0)) % 1;
    const u = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
    return pointAtLength(d.path, easeInOutSine(u) * this.pathLen);
  }
  override step(dt: number): void {
    this.t += dt;
    const p = this.posAt(this.t);
    const nox = p.x - this.def.path[0].x;
    const noy = p.y - this.def.path[0].y;
    const vx = (nox - this.ox) / DT;
    const vy = (noy - this.oy) / DT;
    this.ox = nox;
    this.oy = noy;
    this.segs = polySegs(this.def.pts, this.index, this.ox, this.oy, vx, vy);
  }
  loopKey(): string {
    return `${Math.round(this.ox / 4)},${Math.round(this.oy / 4)}`;
  }
}

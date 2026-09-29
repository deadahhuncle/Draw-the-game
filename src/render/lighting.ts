import { WICK_R } from '../core/constants';
import { Glowworm, Wisp } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import { makeCanvas } from './background';
import type { View } from './view';

/**
 * Darkness for `dark` levels: an offscreen mask filled with night, with soft holes punched by every
 * light source — Wick, the home-lamp, lit wisps, glow-worms and (the twist) the player's own ink.
 */
export class Lighting {
  private mask: HTMLCanvasElement | null = null;

  draw(ctx: CanvasRenderingContext2D, view: View, sim: Simulation, wx: number, wy: number, lampLit: number, time: number): void {
    const cw = Math.max(1, Math.round(view.cssW * view.dpr));
    const ch = Math.max(1, Math.round(view.cssH * view.dpr));
    if (!this.mask || this.mask.width !== cw || this.mask.height !== ch) this.mask = makeCanvas(cw, ch);
    const m = this.mask.getContext('2d')!;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, cw, ch);
    m.fillStyle = 'rgba(2,4,3,0.94)';
    m.fillRect(0, 0, cw, ch);
    view.apply(m);
    m.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const g = m.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g;
      m.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(wx, wy - 4, 150 * (0.6 + 0.4 * sim.wick.flame) + Math.sin(time * 5) * 4);
    const g = sim.level.goal;
    hole(g.x + 18, g.y - 54, 70 + lampLit * 260, 0.9);
    for (const s of sim.strokes) {
      for (let i = 0; i < s.pts.length; i += 6) hole(s.pts[i].x, s.pts[i].y, 70, 0.55);
    }
    for (const e of sim.entities) {
      if (e instanceof Glowworm) hole(e.def.x, e.def.y, e.def.r ?? 90, 0.8);
      if (e instanceof Wisp && e.lit) hole(e.def.x, e.def.y, 120, 0.9);
    }
    sim.level.sparks.forEach((sp, i) => {
      if (!sim.sparks[i]) hole(sp.x, sp.y, 36, 0.6);
    });
    void WICK_R;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.mask, 0, 0);
  }
}

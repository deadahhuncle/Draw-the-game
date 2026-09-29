import { chaikin, dist, type Vec } from '../core/math';
import type { InkType } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { livePieces } from '../sim/strokes';
import { makeCanvas } from './background';
import { INK_COLORS } from './palettes';
import type { View } from './view';

/**
 * Player ink: a soft coloured halo + bright core, drawn additively. Finished strokes are cached in an
 * offscreen layer keyed by `sim.inkVersion`; animated accents (comet chevrons, spring pulse,
 * travelling shimmer) are drawn live on top.
 */
export class InkLayer {
  private cache: HTMLCanvasElement | null = null;
  private version = -1;
  private key = '';

  draw(ctx: CanvasRenderingContext2D, view: View, sim: Simulation, time: number): void {
    const key = `${view.cssW}x${view.cssH}@${view.dpr}:${view.scale.toFixed(4)}`;
    if (!this.cache || key !== this.key) {
      this.cache = makeCanvas(Math.max(1, Math.round(view.cssW * view.dpr)), Math.max(1, Math.round(view.cssH * view.dpr)));
      this.key = key;
      this.version = -1;
    }
    if (this.version !== sim.inkVersion) {
      const c = this.cache.getContext('2d')!;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cache.width, this.cache.height);
      view.apply(c);
      for (const s of sim.strokes) for (const piece of livePieces(s)) drawStrokeBody(c, piece, s.ink, 1);
      this.version = sim.inkVersion;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache, 0, 0);

    // Live accents.
    view.apply(ctx);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sim.strokes) {
      for (const piece of livePieces(s)) {
        if (s.ink === 'comet') drawChevrons(ctx, piece, time);
        else drawShimmer(ctx, piece, s.ink, time + s.id * 1.37);
      }
    }
    ctx.restore();
  }
}

export function smoothForRender(pts: readonly Vec[]): Vec[] {
  return pts.length > 3 ? chaikin(pts, 2) : pts.slice();
}

export function drawStrokeBody(ctx: CanvasRenderingContext2D, raw: readonly Vec[], ink: InkType, alpha: number): void {
  if (raw.length < 2) return;
  const pts = smoothForRender(raw);
  const col = INK_COLORS[ink];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = col.halo;
  ctx.globalAlpha = 0.1 * alpha;
  ctx.lineWidth = 22;
  path();
  ctx.stroke();
  ctx.globalAlpha = 0.22 * alpha;
  ctx.lineWidth = 12;
  path();
  ctx.stroke();
  ctx.globalAlpha = 0.75 * alpha;
  ctx.lineWidth = 7;
  path();
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = col.core;
  ctx.lineWidth = 3.2;
  path();
  ctx.stroke();
  ctx.restore();
}

function drawChevrons(ctx: CanvasRenderingContext2D, pts: readonly Vec[], time: number): void {
  const col = INK_COLORS.comet;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  const spacing = 26;
  const offset = (time * 90) % spacing;
  ctx.strokeStyle = col.core;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.85;
  let acc = 0;
  let next = offset;
  for (let i = 1; i < pts.length && next <= total; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    while (next <= acc + l && l > 0) {
      const t = (next - acc) / l;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const ux = (b.x - a.x) / l;
      const uy = (b.y - a.y) / l;
      const edge = Math.min(1, next / 20, (total - next) / 20);
      ctx.globalAlpha = 0.85 * Math.max(0, edge);
      ctx.beginPath();
      ctx.moveTo(x - ux * 5 - uy * 5, y - uy * 5 + ux * 5);
      ctx.lineTo(x, y);
      ctx.lineTo(x - ux * 5 + uy * 5, y - uy * 5 - ux * 5);
      ctx.stroke();
      next += spacing;
    }
    acc += l;
  }
  ctx.globalAlpha = 1;
}

function drawShimmer(ctx: CanvasRenderingContext2D, pts: readonly Vec[], ink: InkType, time: number): void {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  if (total < 10) return;
  const col = INK_COLORS[ink];
  const period = ink === 'spring' ? 1.6 : 4.5;
  const pos = ((time / period) % 1) * (total + 120) - 60;
  let acc = 0;
  ctx.fillStyle = col.halo;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    const mid = acc + l / 2;
    const k = Math.max(0, 1 - Math.abs(mid - pos) / 60);
    if (k > 0.02) {
      ctx.globalAlpha = 0.35 * k * k;
      ctx.beginPath();
      ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 5 + 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    acc += l;
  }
  ctx.globalAlpha = 1;
}

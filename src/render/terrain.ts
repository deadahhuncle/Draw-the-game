import { pointInPolygon, type Vec } from '../core/math';
import { Rng, hash2 } from '../core/rng';
import type { LevelDef, TerrainDef } from '../core/types';
import { makeCanvas, shade } from './background';
import type { Palette } from './palettes';
import type { View } from './view';

/**
 * Static terrain, pre-rendered once per level/resize: ink-black silhouettes with fine cross-hatching,
 * a moonlit rim on upward-facing edges, grass tufts, thorny brambles and glowing mushroom caps.
 */
export class TerrainLayer {
  private cache: HTMLCanvasElement | null = null;
  private key = '';

  constructor(
    private level: LevelDef,
    private palette: Palette,
  ) {}

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const key = `${view.cssW}x${view.cssH}@${view.dpr}:${view.scale.toFixed(4)}`;
    if (key !== this.key || !this.cache) {
      this.cache = this.build(view);
      this.key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache, 0, 0);
  }

  private build(view: View): HTMLCanvasElement {
    const c = makeCanvas(Math.max(1, Math.round(view.cssW * view.dpr)), Math.max(1, Math.round(view.cssH * view.dpr)));
    const ctx = c.getContext('2d')!;
    view.apply(ctx);
    const rng = new Rng(7);
    // Solids first, then hazards and bouncy caps on top.
    const order = [...this.level.terrain].sort((a, b) => rank(a) - rank(b));
    for (const t of order) {
      const mat = t.mat ?? 'solid';
      if (mat === 'hazard') drawBramble(ctx, t, this.palette, rng);
      else if (mat === 'bounce') drawMushroomCap(ctx, t, this.palette);
      else drawSolid(ctx, t, this.palette, rng);
    }
    return c;
  }
}

function rank(t: TerrainDef): number {
  const m = t.mat ?? 'solid';
  return m === 'solid' ? 0 : m === 'bounce' ? 1 : 2;
}

/** Subdivide + jitter an outline so it reads as hand-inked. */
export function wobble(pts: readonly Vec[], amp: number, seed: number, step = 14): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(len / step));
    const nx = -(b.y - a.y) / (len || 1);
    const ny = (b.x - a.x) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const j = k === 0 ? 0 : (hash2(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), seed) - 0.5) * 2 * amp;
      out.push({ x: a.x + (b.x - a.x) * t + nx * j, y: a.y + (b.y - a.y) * t + ny * j });
    }
  }
  return out;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Vec[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Outward unit normal of edge i (robust to winding). */
export function outwardNormal(poly: readonly Vec[], i: number): Vec {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = (b.y - a.y) / len;
  let ny = -(b.x - a.x) / len;
  const mx = (a.x + b.x) / 2 + nx * 1.5;
  const my = (a.y + b.y) / 2 + ny * 1.5;
  if (pointInPolygon({ x: mx, y: my }, poly)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function drawSolid(ctx: CanvasRenderingContext2D, t: TerrainDef, p: Palette, rng: Rng): void {
  const outline = wobble(t.pts, 1.1, t.pts.length * 31 + Math.round(t.pts[0].x));
  const bounds = bbox(t.pts);
  ctx.save();
  tracePath(ctx, outline);
  const fill = ctx.createLinearGradient(0, bounds.minY, 0, bounds.minY + 260);
  fill.addColorStop(0, shade(p.terrain, 0.1));
  fill.addColorStop(1, p.terrain);
  ctx.fillStyle = fill;
  ctx.fill();
  // Cross-hatching.
  ctx.clip();
  ctx.strokeStyle = p.hatch;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const span = bounds.maxX - bounds.minX + (bounds.maxY - bounds.minY);
  for (let d = 0; d < span; d += 9) {
    const x0 = bounds.minX + d;
    ctx.moveTo(x0, bounds.minY);
    ctx.lineTo(x0 - (bounds.maxY - bounds.minY), bounds.maxY);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (let d = 0; d < span; d += 23) {
    const x0 = bounds.minX + d - (bounds.maxY - bounds.minY);
    ctx.moveTo(x0, bounds.minY);
    ctx.lineTo(x0 + (bounds.maxY - bounds.minY), bounds.maxY);
  }
  ctx.stroke();
  ctx.restore();

  // Rim light on upward-facing edges.
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < t.pts.length; i++) {
    const n = outwardNormal(t.pts, i);
    if (n.y > -0.35) continue;
    const a = t.pts[i];
    const b = t.pts[(i + 1) % t.pts.length];
    const k = Math.min(1, (-n.y - 0.35) / 0.5);
    ctx.strokeStyle = p.rim;
    ctx.globalAlpha = 0.18 * k;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 1);
    ctx.lineTo(b.x, b.y + 1);
    ctx.stroke();
    ctx.globalAlpha = 0.95 * k;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 0.5);
    ctx.lineTo(b.x, b.y + 0.5);
    ctx.stroke();
    // Grass tufts & pebbles.
    if (!t.bare && (t.style ?? 'earth') === 'earth' && k > 0.6) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = shade(p.terrain, 0.18);
      ctx.lineWidth = 1.4;
      for (let s = 10; s < len - 6; s += rng.range(14, 34)) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const y = a.y + ((b.y - a.y) * s) / len;
        const h = rng.range(5, 13);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + rng.range(-2, 2), y - h * 0.6, x + rng.range(-5, 5), y - h);
        ctx.moveTo(x + 2, y);
        ctx.quadraticCurveTo(x + 3, y - h * 0.4, x + rng.range(2, 8), y - h * 0.7);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawBramble(ctx: CanvasRenderingContext2D, t: TerrainDef, p: Palette, rng: Rng): void {
  void p;
  const b = bbox(t.pts);
  ctx.save();
  tracePath(ctx, wobble(t.pts, 2, 99));
  ctx.fillStyle = '#2A0710';
  ctx.fill();
  ctx.clip();
  // Tangled vines inside.
  ctx.strokeStyle = 'rgba(190,40,70,0.55)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < (b.maxX - b.minX) / 6; i++) {
    ctx.beginPath();
    const x = rng.range(b.minX, b.maxX);
    const y = rng.range(b.minY, b.maxY);
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + rng.range(-30, 30), y + rng.range(-20, 20), x + rng.range(-30, 30), y + rng.range(-20, 20), x + rng.range(-30, 30), y + rng.range(-15, 15));
    ctx.stroke();
  }
  ctx.restore();
  // Thorns along the outline.
  ctx.save();
  ctx.fillStyle = '#E0506E';
  ctx.strokeStyle = '#FF7A95';
  ctx.lineWidth = 1;
  for (let i = 0; i < t.pts.length; i++) {
    const a = t.pts[i];
    const c = t.pts[(i + 1) % t.pts.length];
    const n = outwardNormal(t.pts, i);
    if (n.y > 0.6) continue;
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    const ux = (c.x - a.x) / (len || 1);
    const uy = (c.y - a.y) / (len || 1);
    for (let s = 4; s < len - 2; s += rng.range(7, 12)) {
      const x = a.x + ux * s;
      const y = a.y + uy * s;
      const h = rng.range(5, 10);
      const lean = rng.range(-0.5, 0.5);
      ctx.beginPath();
      ctx.moveTo(x - ux * 3, y - uy * 3);
      ctx.lineTo(x + (n.x + ux * lean) * h, y + (n.y + uy * lean) * h);
      ctx.lineTo(x + ux * 3, y + uy * 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Glow.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#FF3C6A';
  ctx.lineWidth = 6;
  tracePath(ctx, t.pts);
  ctx.stroke();
  ctx.restore();
}

function drawMushroomCap(ctx: CanvasRenderingContext2D, t: TerrainDef, p: Palette): void {
  const b = bbox(t.pts);
  ctx.save();
  tracePath(ctx, t.pts);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.maxY);
  g.addColorStop(0, '#FF8CC6');
  g.addColorStop(1, '#7A2E78');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,240,250,0.8)';
  const cx = (b.minX + b.maxX) / 2;
  for (const [dx, dy, r] of [
    [-0.28, 0.45, 5],
    [0.05, 0.3, 4],
    [0.3, 0.55, 5.5],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx * (b.maxX - b.minX), b.minY + dy * (b.maxY - b.minY), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = p.accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(t.pts[1].x, t.pts[1].y);
  for (let i = 2; i < t.pts.length - 1; i++) ctx.lineTo(t.pts[i].x, t.pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function bbox(pts: readonly Vec[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  return { minX, minY, maxX, maxY };
}

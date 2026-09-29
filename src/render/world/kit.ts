// Shared painting kit for the world backdrops: noise, ridgelines, sky occupancy, glow sprites and the
// little live creatures (twinkling stars, motes, birds) that several worlds share.
import type { Rng } from '../../core/rng';
import type { Palette } from '../palettes';
import { rgba } from './color';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Everything a world painter needs at cache-build time. */
export interface PaintEnv {
  /** Visible world rect (the whole screen), padded a little. */
  vis: Box;
  rng: Rng;
  p: Palette;
  /** Seed for the level (stable arrangement per level). */
  seed: number;
  /** 0..1 progress through the world (0 = first level). */
  progress: number;
  /** Sky occupancy: far-layer tops, so live stars never twinkle in front of hills. */
  sky: Skyline;
  /** Cache pixels per world unit (for scene-owned offscreen layers). */
  px: number;
  /** This level's win plays the finale (sunrise). */
  finale: boolean;
  /** Open runs [x0, x1] where the void is visible between terrain (sampled low in the page). */
  openings: [number, number][];
  /** Bounding boxes of the level's terrain (world units), so near silhouettes can keep clear of play. */
  solids: Box[];
}

/** True when `b` (padded) overlaps none of the level's terrain boxes. */
export function clearOfPlay(env: PaintEnv, b: Box, pad = 16): boolean {
  for (const s of env.solids) if (b.x0 - pad < s.x1 && b.x1 + pad > s.x0 && b.y0 - pad < s.y1 && b.y1 + pad > s.y0) return false;
  return true;
}

/** Centre of the widest opening at least `min` wide, clamped to [lo, hi]; else null. */
export function widestOpening(env: PaintEnv, min: number, lo: number, hi: number): number | null {
  let best: [number, number] | null = null;
  for (const o of env.openings) if (o[1] - o[0] >= min && (!best || o[1] - o[0] > best[1] - best[0])) best = o;
  if (!best) return null;
  return clamp((best[0] + best[1]) / 2, lo, hi);
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1-D value noise in [-1, 1] with a few octaves; deterministic per rng. */
export class Noise1D {
  private vals: number[] = [];
  constructor(
    rng: Rng,
    private wavelength: number,
    private octaves = 3,
    private x0 = -4000,
  ) {
    for (let i = 0; i < 2048; i++) this.vals.push(rng.range(-1, 1));
  }
  private base(x: number): number {
    const u = x / this.wavelength;
    const i = Math.floor(u);
    const f = u - i;
    const n = this.vals.length;
    const a = this.vals[((i % n) + n) % n];
    const b = this.vals[(((i + 1) % n) + n) % n];
    return a + (b - a) * smooth(f);
  }
  at(x: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x - this.x0;
    for (let o = 0; o < this.octaves; o++) {
      sum += this.base(fx + o * 131.7) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2.03;
    }
    return sum / norm;
  }
}

/** Min-y occupancy of far silhouettes per 8u column (smaller y = taller). */
export class Skyline {
  private cols: Float32Array;
  constructor(
    private x0: number,
    x1: number,
    private step = 8,
  ) {
    this.cols = new Float32Array(Math.ceil((x1 - x0) / step) + 2).fill(1e9);
  }
  mark(xa: number, xb: number, y: number): void {
    const a = Math.max(0, Math.floor((Math.min(xa, xb) - this.x0) / this.step));
    const b = Math.min(this.cols.length - 1, Math.ceil((Math.max(xa, xb) - this.x0) / this.step));
    for (let i = a; i <= b; i++) if (y < this.cols[i]) this.cols[i] = y;
  }
  /** Mark a polyline, interpolating the height column by column. */
  markPts(pts: readonly { x: number; y: number }[]): void {
    for (let i = 0; i < pts.length - 1; i++) this.markSeg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }
  markSeg(ax: number, ay: number, bx: number, by: number): void {
    if (bx < ax) [ax, ay, bx, by] = [bx, by, ax, ay];
    const a = Math.max(0, Math.ceil((ax - this.x0) / this.step));
    const b = Math.min(this.cols.length - 1, Math.floor((bx - this.x0) / this.step));
    for (let i = a; i <= b; i++) {
      const x = this.x0 + i * this.step;
      const t = bx > ax ? (x - ax) / (bx - ax) : 0;
      const y = ay + (by - ay) * t;
      if (y < this.cols[i]) this.cols[i] = y;
    }
    this.mark(ax, ax, ay);
    this.mark(bx, bx, by);
  }
  /** Mark a peaked silhouette (shard, spire): base corners to a tip. */
  markPeak(xl: number, xr: number, tipX: number, tipY: number, baseY: number): void {
    this.markSeg(xl, baseY, tipX, tipY);
    this.markSeg(tipX, tipY, xr, baseY);
  }
  top(x: number): number {
    const i = Math.round((x - this.x0) / this.step);
    return this.cols[Math.max(0, Math.min(this.cols.length - 1, i))];
  }
  /** The open sky above every far silhouette, as a path (lightning lights only this). */
  path(vis: Box): Path2D {
    const p = new Path2D();
    const top = vis.y0 - 60;
    p.moveTo(vis.x0 - 20, top);
    for (let x = vis.x0 - 20; x <= vis.x1 + 20; x += this.step) p.lineTo(x, Math.min(this.top(x), vis.y1 + 20));
    p.lineTo(vis.x1 + 20, top);
    p.closePath();
    return p;
  }
}

/** A ridgeline: y = base - amp * f(x), sampled every `step` u over the visible span. */
export function ridge(vis: Box, step: number, f: (x: number) => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = vis.x0 - step * 2; x <= vis.x1 + step * 2; x += step) out.push({ x, y: f(x) });
  return out;
}

/** Fill the area under a ridgeline down to `bottom`. */
export function fillUnder(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], bottom: number, fill: string | CanvasGradient): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, bottom);
  for (const q of pts) ctx.lineTo(q.x, q.y);
  ctx.lineTo(pts[pts.length - 1].x, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Stroke just the ridge crest (for rim light). */
export function strokeRidge(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[], color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const q of pts) ctx.lineTo(q.x, q.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** A vertical gradient haze band (fog pooling at the foot of a layer). */
export function hazeBand(ctx: CanvasRenderingContext2D, vis: Box, yTop: number, yBottom: number, color: string, a0: number, a1: number): void {
  const g = ctx.createLinearGradient(0, yTop, 0, yBottom);
  g.addColorStop(0, rgba(color, a0));
  g.addColorStop(1, rgba(color, a1));
  ctx.fillStyle = g;
  ctx.fillRect(vis.x0 - 20, yTop, vis.x1 - vis.x0 + 40, yBottom - yTop);
}

// ───────────────────────────── glow sprites ─────────────────────────────

const sprites = new Map<string, HTMLCanvasElement>();

/**
 * A soft radial glow sprite (64×64) in a colour. Drawn scaled with 'lighter' it is the cheapest way
 * to put a halo on anything per frame (no gradients created in the hot loop).
 */
export function glowSprite(color: string, falloff = 1): HTMLCanvasElement {
  const key = `${color}|${falloff}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(color, 1));
  gr.addColorStop(0.18 * falloff, rgba(color, 0.55));
  gr.addColorStop(0.5, rgba(color, 0.14));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  sprites.set(key, c);
  return c;
}

/** Draw a glow sprite centred at (x, y) with radius r. Caller sets composite op / alpha. */
export function glow(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, x: number, y: number, r: number): void {
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

/** Soft glow painted directly (build time only). */
export function paintGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, sy = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.35, rgba(color, a * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

// ───────────────────────────── soft painting ─────────────────────────────

/**
 * Paint something soft: `fn` draws in world units into a canvas at 1/k resolution, which is then
 * upscaled into `ctx` — bilinear upscaling is a free, build-time blur (washes, fog, clouds).
 */
export function softLayer(ctx: CanvasRenderingContext2D, env: PaintEnv, k: number, fn: (c: CanvasRenderingContext2D) => void, alpha = 1): void {
  const { vis, px } = env;
  const r = px / k;
  const w = vis.x1 - vis.x0;
  const h = vis.y1 - vis.y0;
  const c = makeCanvas(Math.max(2, w * r), Math.max(2, h * r));
  const g = c.getContext('2d')!;
  g.setTransform(r, 0, 0, r, -vis.x0 * r, -vis.y0 * r);
  fn(g);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, vis.x0, vis.y0, w, h);
  ctx.restore();
  c.width = c.height = 1;
}

/** A soft wash cloud: overlapping flattened glows, optionally lit along its underside. */
export function washCloud(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, h: number, color: string, a: number, lit?: string, litA = 0.4): void {
  const n = Math.max(3, Math.round(w / 120));
  for (let i = 0; i < n; i++) {
    const cx = x - w / 2 + (w * (i + 0.5)) / n + rng.range(-w * 0.08, w * 0.08);
    const cy = y + rng.range(-h * 0.3, h * 0.3);
    const rx = (w / n) * rng.range(0.8, 1.4);
    paintGlow(ctx, cx, cy, rx, color, a * rng.range(0.7, 1), (h / rx) * rng.range(0.8, 1.3));
  }
  if (lit) {
    for (let i = 0; i < n; i++) {
      const cx = x - w / 2 + (w * (i + 0.5)) / n;
      const rx = (w / n) * rng.range(0.6, 1.1);
      paintGlow(ctx, cx, y + h * 0.55, rx, lit, litA * rng.range(0.6, 1), ((h * 0.35) / rx) * rng.range(0.8, 1.2));
    }
  }
}

/** A sea of soft billows (the void in several worlds): rows of lit-topped puffs, far to near. */
export function billowSea(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, y0: number, rows: number, top: string, body: string, a: number): void {
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * 26 + r * r * 4;
    const rad: [number, number] = [22 + r * 10, 46 + r * 16];
    for (let x = vis.x0 - 60; x < vis.x1 + 60; x += rng.range(rad[0] * 0.8, rad[0] * 1.5)) {
      const rr = rng.range(rad[0], rad[1]);
      const cy = y + rng.range(-8, 8) + rr * 0.3;
      const g = ctx.createRadialGradient(x, cy - rr * 0.35, rr * 0.1, x, cy, rr);
      g.addColorStop(0, rgba(top, a));
      g.addColorStop(0.55, rgba(body, a * 0.85));
      g.addColorStop(1, rgba(body, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, rr, 0, TAU);
      ctx.fill();
    }
  }
}

// ───────────────────────────── washi fibres ─────────────────────────────

/** Faint paper fibres over an area (build time): the "midnight washi" feel. */
export function fibres(ctx: CanvasRenderingContext2D, rng: Rng, box: Box, color: string, density: number, alpha: number): void {
  const n = Math.round(((box.x1 - box.x0) * (box.y1 - box.y0) * density) / 10000);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = rng.range(box.x0, box.x1);
    const y = rng.range(box.y0, box.y1);
    const a = rng.range(0, Math.PI);
    const l = rng.range(4, 16);
    const bend = rng.range(-3, 3);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  ctx.stroke();
  ctx.restore();
}

/** Static pin-prick stars (build time), with an occasional four-point sparkle. */
export function paintStars(ctx: CanvasRenderingContext2D, rng: Rng, box: Box, count: number, color = '#ffffff', maxA = 0.8, yFade?: number): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rng.range(box.x0, box.x1);
    const y = rng.range(box.y0, box.y1);
    const fade = yFade ? clamp(1 - (y - box.y0) / (yFade - box.y0), 0, 1) : 1;
    const r = rng.next() < 0.93 ? rng.range(0.35, 0.9) : rng.range(1, 1.6);
    ctx.globalAlpha = rng.range(0.25, maxA) * (0.35 + 0.65 * fade);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (r > 1.2 && rng.next() < 0.5) sparkle(ctx, x, y, r * 5, color, ctx.globalAlpha * 0.6);
  }
  ctx.restore();
}

/** A thin four-point sparkle cross. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string, a: number): void {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.beginPath();
  const w = len * 0.08;
  ctx.moveTo(x - len, y);
  ctx.lineTo(x, y - w);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x, y + w);
  ctx.closePath();
  ctx.moveTo(x, y - len);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + len);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A long tapered cloud streak (lens shape) with an optional lit lower edge. */
export function streak(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, lit?: string, litA = 0.5, rng?: Rng): void {
  const bump = rng ? rng.range(-0.25, 0.25) : 0;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.bezierCurveTo(x - w * (0.25 + bump * 0.2), y - h * (1.1 + bump), x + w * 0.2, y - h * 0.9, x + w / 2, y + h * 0.05);
  ctx.bezierCurveTo(x + w * 0.2, y + h * 0.55, x - w * 0.2, y + h * 0.6, x - w / 2, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (lit) {
    ctx.save();
    ctx.globalAlpha = litA;
    ctx.strokeStyle = lit;
    ctx.lineWidth = Math.max(0.8, h * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.36, y + h * 0.28);
    ctx.bezierCurveTo(x - w * 0.15, y + h * 0.56, x + w * 0.15, y + h * 0.5, x + w * 0.4, y + h * 0.16);
    ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────────── silhouettes ─────────────────────────────

/** A poplar / cypress: a tall slender flame of foliage on a short trunk. */
export function poplar(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, lean = 0, rng?: Rng): void {
  const j = () => (rng ? rng.range(-0.08, 0.08) : 0);
  const tx = x + lean * h;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, y + 2);
  ctx.lineTo(x - w * 0.08, y - h * 0.08);
  ctx.bezierCurveTo(x - w * (0.62 + j()), y - h * 0.18, x - w * (0.55 + j()) + lean * h * 0.5, y - h * (0.62 + j()), tx, y - h);
  ctx.bezierCurveTo(x + w * (0.55 + j()) + lean * h * 0.5, y - h * (0.6 + j()), x + w * (0.6 + j()), y - h * 0.2, x + w * 0.08, y - h * 0.08);
  ctx.lineTo(x + w * 0.08, y + 2);
  ctx.closePath();
  ctx.fill();
}

/** A round-crowned tree made of overlapping blobs. */
export function roundTree(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, rng: Rng): void {
  const tw = Math.max(1.5, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(x - tw, y + 2);
  ctx.quadraticCurveTo(x - tw * 0.6, y - h * 0.3, x - tw * 0.4 + rng.range(-2, 2), y - h * 0.55);
  ctx.lineTo(x + tw * 0.4, y - h * 0.55);
  ctx.quadraticCurveTo(x + tw * 0.6, y - h * 0.3, x + tw, y + 2);
  ctx.closePath();
  ctx.fill();
  const r = h * 0.3;
  const cx = x + rng.range(-r * 0.2, r * 0.2);
  const cy = y - h * 0.68;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng.range(-0.3, 0.3);
    const d = r * rng.range(0.35, 0.7);
    const rr = r * rng.range(0.45, 0.7);
    ctx.moveTo(cx + Math.cos(a) * d + rr, cy + Math.sin(a) * d * 0.8);
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rr, 0, TAU);
  }
  ctx.moveTo(cx + r * 0.8, cy);
  ctx.arc(cx, cy, r * 0.8, 0, TAU);
  ctx.fill();
}

/** A pine: stacked, slightly ragged tiers. */
export function pine(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, rng: Rng): void {
  const w = h * rng.range(0.28, 0.36);
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 2);
  ctx.lineTo(x - 1, y - h * 0.1);
  const tiers = 4 + Math.floor(h / 30);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const yy = y - h * 0.1 - t * h * 0.9;
    const ww = w * (1 - t) * rng.range(0.85, 1.1);
    ctx.lineTo(x - ww, yy);
    ctx.lineTo(x - ww * 0.35, yy - (h * 0.9) / tiers);
  }
  ctx.lineTo(x, y - h);
  for (let i = tiers - 1; i >= 0; i--) {
    const t = i / tiers;
    const yy = y - h * 0.1 - t * h * 0.9;
    const ww = w * (1 - t) * rng.range(0.85, 1.1);
    ctx.lineTo(x + ww * 0.35, yy - (h * 0.9) / tiers);
    ctx.lineTo(x + ww, yy);
  }
  ctx.lineTo(x + 1, y - h * 0.1);
  ctx.lineTo(x + 1, y + 2);
  ctx.closePath();
  ctx.fill();
}

// ───────────────────────────── live: stars ─────────────────────────────

interface Twinkle {
  x: number;
  y: number;
  r: number;
  s: number;
  ph: number;
}

/** A handful of stars that twinkle live (the rest are baked into the sky). */
export class TwinkleField {
  private stars: Twinkle[] = [];
  constructor(env: PaintEnv, count: number, yMax: number, color = '#FFFFFF') {
    this.color = color;
    const { rng, vis, sky } = env;
    let guard = 0;
    while (this.stars.length < count && guard++ < count * 20) {
      const x = rng.range(vis.x0, vis.x1);
      const y = rng.range(vis.y0, yMax);
      if (y > sky.top(x) - 14) continue;
      this.stars.push({ x, y, r: rng.range(0.7, 1.7), s: rng.range(0.6, 2.4), ph: rng.range(0, TAU) });
    }
  }
  color: string;
  draw(ctx: CanvasRenderingContext2D, time: number, alpha: number, motion: number): void {
    if (alpha <= 0.01) return;
    ctx.fillStyle = this.color;
    const t = time * (motion > 0.5 ? 1 : 0.35);
    for (const s of this.stars) {
      const k = 0.5 + 0.5 * Math.sin(t * s.s + s.ph);
      const a = alpha * (0.25 + 0.75 * k * k);
      ctx.globalAlpha = a;
      const r = s.r * (0.8 + 0.4 * k);
      ctx.fillRect(s.x - r * 0.5, s.y - r * 0.5, r, r);
      if (s.r > 1.35 && k > 0.8) {
        ctx.globalAlpha = a * (k - 0.8) * 3;
        ctx.fillRect(s.x - r * 2.6, s.y - 0.25, r * 5.2, 0.5);
        ctx.fillRect(s.x - 0.25, s.y - r * 2.6, 0.5, r * 5.2);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ───────────────────────────── live: motes ─────────────────────────────

export interface MoteStyle {
  color: string;
  count: number;
  /** Vertical band the motes live in. */
  y0: number;
  y1: number;
  vy: [number, number];
  vx: [number, number];
  r: [number, number];
  /** Glow radius multiplier (0 = no halo). */
  halo: number;
  /** Blink: 0 = steady shimmer, 1 = firefly on/off. */
  blink: number;
  sway: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number;
  f: number;
}

/** Drifting motes: fireflies, spores, dust, glow-bugs. One sprite, additive, no allocation per frame. */
export class MoteField {
  private motes: Mote[] = [];
  private sprite: HTMLCanvasElement;
  constructor(
    private env: PaintEnv,
    private st: MoteStyle,
  ) {
    const { rng, vis } = env;
    this.sprite = glowSprite(st.color);
    for (let i = 0; i < st.count; i++) {
      this.motes.push({
        x: rng.range(vis.x0, vis.x1),
        y: rng.range(st.y0, st.y1),
        vx: rng.range(st.vx[0], st.vx[1]),
        vy: rng.range(st.vy[0], st.vy[1]),
        r: rng.range(st.r[0], st.r[1]),
        ph: rng.range(0, TAU),
        f: rng.range(0.5, 1.6),
      });
    }
  }
  draw(ctx: CanvasRenderingContext2D, time: number, dt: number, motion: number, alpha = 1): void {
    const { vis } = this.env;
    const st = this.st;
    const m = motion;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.motes) {
      q.x += (q.vx + Math.sin(time * 0.6 * q.f + q.ph) * st.sway) * dt * m;
      q.y += (q.vy + Math.cos(time * 0.9 * q.f + q.ph) * st.sway * 0.4) * dt * m;
      if (q.y < st.y0 - 20) q.y = st.y1 + 10;
      if (q.y > st.y1 + 20) q.y = st.y0 - 10;
      if (q.x < vis.x0 - 20) q.x = vis.x1 + 10;
      if (q.x > vis.x1 + 20) q.x = vis.x0 - 10;
      let a: number;
      if (st.blink > 0) {
        const s = Math.sin(time * q.f * 1.3 + q.ph);
        a = s > 0.2 ? Math.min(1, (s - 0.2) * 2.2) : 0.06;
      } else a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.7 * q.f + q.ph));
      a *= alpha;
      if (a < 0.02) continue;
      if (st.halo > 0) {
        ctx.globalAlpha = a * 0.5;
        glow(ctx, this.sprite, q.x, q.y, q.r * st.halo);
      }
      ctx.globalAlpha = a;
      glow(ctx, this.sprite, q.x, q.y, q.r * 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prev;
  }
}

// ───────────────────────────── live: birds ─────────────────────────────

interface Bird {
  dx: number;
  dy: number;
  ph: number;
  s: number;
}

/** A loose flock of small ink birds drifting across the sky every so often. */
export class Flock {
  private birds: Bird[] = [];
  private x = 0;
  private y = 0;
  private dir = 1;
  private speed = 30;
  private wait: number;
  private active = false;
  constructor(
    private env: PaintEnv,
    private color: string,
    private yRange: [number, number],
    firstDelay = 2,
  ) {
    this.wait = firstDelay;
  }
  private spawn(): void {
    const { rng, vis } = this.env;
    this.dir = rng.next() < 0.5 ? 1 : -1;
    this.speed = rng.range(26, 42);
    this.y = rng.range(this.yRange[0], this.yRange[1]);
    this.x = this.dir > 0 ? vis.x0 - 80 : vis.x1 + 80;
    const n = rng.int(3, 8);
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      this.birds.push({ dx: -row * rng.range(14, 22), dy: side * row * rng.range(6, 11) + rng.range(-4, 4), ph: rng.range(0, TAU), s: rng.range(0.75, 1.15) });
    }
    this.active = true;
  }
  draw(ctx: CanvasRenderingContext2D, time: number, dt: number, motion: number, alpha = 1): void {
    const { vis, rng } = this.env;
    if (!this.active) {
      this.wait -= dt;
      if (this.wait <= 0) this.spawn();
      return;
    }
    this.x += this.dir * this.speed * dt * Math.max(0.35, motion);
    if ((this.dir > 0 && this.x > vis.x1 + 200) || (this.dir < 0 && this.x < vis.x0 - 200)) {
      this.active = false;
      this.wait = rng.range(9, 20);
      return;
    }
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const b of this.birds) {
      const bx = this.x + b.dx * this.dir;
      const by = this.y + b.dy + Math.sin(time * 0.8 + b.ph) * 3;
      const flap = Math.sin(time * 7 * b.s + b.ph);
      const w = 7 * b.s;
      const up = flap * 4.5 * b.s;
      ctx.moveTo(bx - w, by - up);
      ctx.quadraticCurveTo(bx - w * 0.45, by - up * 0.4 - 2, bx, by);
      ctx.quadraticCurveTo(bx + w * 0.45, by - up * 0.4 - 2, bx + w, by - up);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

import { H, W } from '../core/constants';
import { Rng } from '../core/rng';
import type { Palette } from './palettes';
import type { View } from './view';

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
  ph: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  r: number;
}

/**
 * Sky, orb, far hills and mist — pre-rendered once per level/resize into an offscreen canvas.
 * Twinkling stars and drifting motes are drawn live on top (cheap).
 */
export class Background {
  private cache: HTMLCanvasElement | OffscreenCanvas | null = null;
  private stars: Star[] = [];
  private motes: Mote[] = [];
  private key = '';

  constructor(private palette: Palette, private seed: number) {}

  setPalette(p: Palette, seed: number): void {
    this.palette = p;
    this.seed = seed;
    this.key = '';
  }

  private build(view: View): void {
    const { cssW, cssH, dpr } = view;
    const cw = Math.max(1, Math.round(cssW * dpr));
    const ch = Math.max(1, Math.round(cssH * dpr));
    const c = makeCanvas(cw, ch);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const p = this.palette;
    const rng = new Rng(this.seed);

    // Sky (screen space).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const horizon = view.toScreen(0, H * 0.78).y;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 1));
    p.sky.forEach((col, i) => g.addColorStop(i / (p.sky.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    // World-space layers.
    view.apply(ctx);
    const vis = view.visible;

    // Orb halo + disc.
    const o = p.orb;
    const halo = ctx.createRadialGradient(o.x, o.y, o.r * 0.6, o.x, o.y, o.r * 5);
    halo.addColorStop(0, o.glow);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    const disc = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.1, o.x, o.y, o.r);
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(0.35, o.color);
    disc.addColorStop(1, o.color);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Hills: layered ridgelines, far → near.
    const n = p.hills.length;
    for (let i = 0; i < n; i++) {
      const base = H * (0.5 + i * 0.1);
      const amp = 40 + i * 22;
      const f1 = rng.range(0.002, 0.004);
      const f2 = rng.range(0.006, 0.011);
      const ph1 = rng.range(0, 10);
      const ph2 = rng.range(0, 10);
      ctx.beginPath();
      ctx.moveTo(vis.x0 - 10, vis.y1 + 10);
      for (let x = vis.x0 - 10; x <= vis.x1 + 20; x += 8) {
        const y = base - amp * (0.6 * Math.sin(x * f1 + ph1) + 0.4 * Math.sin(x * f2 + ph2)) - amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(vis.x1 + 20, vis.y1 + 10);
      ctx.closePath();
      const hg = ctx.createLinearGradient(0, base - amp * 1.4, 0, H);
      hg.addColorStop(0, p.hills[i]);
      hg.addColorStop(1, shade(p.hills[i], -0.25));
      ctx.fillStyle = hg;
      ctx.fill();
      // Atmospheric haze between layers.
      const mg = ctx.createLinearGradient(0, base - amp, 0, base + 120);
      mg.addColorStop(0, 'rgba(0,0,0,0)');
      mg.addColorStop(1, p.mist);
      ctx.fillStyle = mg;
      ctx.fillRect(vis.x0, base - amp, vis.x1 - vis.x0, 200);
    }

    this.cache = c;

    // Live elements.
    this.stars = [];
    const count = Math.round(140 * p.stars);
    for (let i = 0; i < count; i++) {
      this.stars.push({ x: rng.range(vis.x0, vis.x1), y: rng.range(vis.y0, H * 0.55), r: rng.range(0.6, 1.8), tw: rng.range(0.5, 2.2), ph: rng.range(0, 6.28) });
    }
    this.motes = [];
    for (let i = 0; i < 22; i++) {
      this.motes.push({ x: rng.range(vis.x0, vis.x1), y: rng.range(H * 0.2, H * 0.95), vx: rng.range(-6, 6), vy: rng.range(-10, -3), ph: rng.range(0, 6.28), r: rng.range(1, 2.4) });
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View, time: number, dt: number, motion: number): void {
    const key = `${view.cssW}x${view.cssH}@${view.dpr}:${view.scale.toFixed(4)}`;
    if (key !== this.key || !this.cache) {
      this.build(view);
      this.key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache as CanvasImageSource, 0, 0);
    view.apply(ctx);
    // Stars.
    ctx.fillStyle = '#FFFFFF';
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.tw + s.ph)) * (motion > 0 ? 1 : 0.7);
      ctx.globalAlpha = a * 0.9;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    // Motes.
    const vis = view.visible;
    ctx.fillStyle = this.palette.accent;
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(time * 0.7 + m.ph) * 8) * dt * motion;
      m.y += m.vy * dt * motion;
      if (m.y < vis.y0 - 10) m.y = vis.y1 + 10;
      if (m.x < vis.x0 - 10) m.x = vis.x1 + 10;
      if (m.x > vis.x1 + 10) m.x = vis.x0 - 10;
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 1.7 + m.ph));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export const WORLD_W = W;

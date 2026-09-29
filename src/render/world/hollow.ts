// World 2 — Mushroom Hollow. Violet twilight under a thin crescent; a forest of giant mushrooms in
// three hazy depths, their caps freckled with teal and orchid light; spores rising from a glowing fog.
import type { Rng } from '../../core/rng';
import { mix, rgba } from './color';
import { MoteField, Noise1D, TAU, TwinkleField, billowSea, clearOfPlay, fibres, fillUnder, glow, glowSprite, hazeBand, makeCanvas, paintGlow, paintStars, ridge, softLayer, strokeRidge } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const SKY = ['#070820', '#10123C', '#1E1957', '#352672', '#553A8E', '#7D57AB'];
const HORIZON = 545;
const TEAL = '#7CF5D8';
const ORCHID = '#E59BFF';

interface Spot {
  x: number;
  y: number;
  r: number;
  c: 0 | 1;
  ph: number;
}

export class HollowScene extends Scene {
  private spots: Spot[] = [];
  private stars!: TwinkleField;
  private spores!: MoteField;
  private petals!: MoteField;
  private mist!: Mist;
  private tealS = glowSprite(TEAL);
  private orchidS = glowSprite(ORCHID);

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng } = this.env;
    skyGradient(ctx, vis, SKY, HORIZON);
    // Bioluminescent horizon: teal pooling low on one side, orchid on the other.
    paintGlow(ctx, rng.range(100, 500), HORIZON - 20, 820, '#4FD9C0', 0.2, 0.32);
    paintGlow(ctx, rng.range(800, 1200), HORIZON - 40, 760, '#C77DFF', 0.18, 0.3);
    paintStars(ctx, rng, { x0: vis.x0, y0: vis.y0, x1: vis.x1, y1: 430 }, 170, '#EDE6FF', 0.75, 430);
    // A thin crescent moon.
    const mx = rng.range(170, 420);
    const my = rng.range(110, 170);
    const r = 30;
    paintGlow(ctx, mx, my, r * 7, '#C9B4FF', 0.22);
    const k = this.env.px;
    const size = Math.ceil(r * 2.4 * k);
    const c = makeCanvas(size, size);
    const g = c.getContext('2d')!;
    g.scale(k, k);
    const cx = r * 1.2;
    g.fillStyle = '#F1EAFF';
    g.beginPath();
    g.arc(cx, cx, r, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(cx + r * 0.42, cx - r * 0.2, r * 0.93, 0, TAU);
    g.fill();
    ctx.drawImage(c, mx - r * 1.2, my - r * 1.2, r * 2.4, r * 2.4);
    fibres(ctx, rng, vis, '#E8E0FF', 3, 0.03);
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const bottom = vis.y1 + 40;
    const layers = [
      { base: 482, amp: 18, col: mix('#3F3486', '#7D57AB', 0.42), n: 6, h: [150, 280], cap: [90, 180], spotA: 0.3, rim: 0.05 },
      { base: 540, amp: 26, col: '#302870', n: 7, h: [110, 220], cap: [70, 150], spotA: 0.65, rim: 0.1 },
      { base: 598, amp: 38, col: '#221A52', n: 4, h: [90, 180], cap: [100, 180], spotA: 0.85, rim: 0.12 },
    ];
    layers.forEach((L, li) => {
      const nz = new Noise1D(rng, 260 + li * 60);
      const f = (x: number) => L.base - L.amp * (0.6 + nz.at(x));
      // Mushrooms behind the hill line (stems vanish into it).
      // Spread them out: jittered slots across the view, so caps rarely collide.
      const xs: number[] = [];
      const slot = (vis.x1 - vis.x0 + 80) / L.n;
      for (let i = 0; i < L.n; i++) xs.push(vis.x0 - 40 + slot * (i + 0.5) + rng.range(-slot * 0.3, slot * 0.3));
      for (const x of xs) {
        const h = rng.range(L.h[0], L.h[1]);
        const cw = rng.range(L.cap[0], L.cap[1]);
        const lean = rng.range(-0.12, 0.12);
        // Near caps must never sit right behind a platform (they'd read as one).
        const tx = x + lean * h;
        const ty = f(x) + 10 - h;
        if (li > 0 && !clearOfPlay(this.env, { x0: tx - cw / 2, y0: ty - cw * 0.46, x1: tx + cw / 2, y1: ty + cw * 0.2 }, li === 2 ? 24 : 8)) continue;
        this.mushroom(ctx, rng, x, f(x) + 10, h, cw, lean, L.col, L.spotA, L.rim, li);
      }
      const r = ridge(vis, 6, f);
      fillUnder(ctx, r, bottom, L.col);
      strokeRidge(ctx, r, rgba(TEAL, L.rim * 0.6), 1);
      sky.markPts(r);
      // Tiny mushroom tufts along the ridge.
      ctx.fillStyle = L.col;
      for (let i = 0; i < 10 + li * 4; i++) {
        const x = rng.range(vis.x0, vis.x1);
        const y = f(x) + 1;
        const cnt = rng.int(1, 4);
        for (let j = 0; j < cnt; j++) {
          const sx = x + j * rng.range(5, 9);
          const sh = rng.range(5, 12) * (1 + li * 0.4);
          ctx.fillRect(sx - 0.8, y - sh, 1.6, sh);
          ctx.beginPath();
          ctx.ellipse(sx, y - sh, sh * 0.45, sh * 0.24, 0, Math.PI, 0);
          ctx.fill();
          if (rng.chance(0.5)) this.spots.push({ x: sx, y: y - sh - 1, r: 1.2 + li * 0.4, c: rng.chance(0.6) ? 0 : 1, ph: rng.range(0, TAU) });
        }
      }
      if (li < 2) hazeBand(ctx, vis, L.base - 40, L.base + 40, '#6A4BA8', 0, 0.45);
    });
    // The void: a violet fog that glows teal from somewhere far below.
    hazeBand(ctx, vis, 600, 700, '#6E52C0', 0, 0.5);
    softLayer(ctx, this.env, 2, (c) => {
      billowSea(c, rng, vis, 650, 4, '#9C82E8', '#5A44A8', 0.5);
      for (let i = 0; i < 6; i++) paintGlow(c, rng.range(vis.x0, vis.x1), rng.range(700, 760), rng.range(140, 260), rng.chance(0.6) ? '#5FE8CF' : '#C88BFF', 0.25, 0.45);
    });
    const vg = ctx.createLinearGradient(0, 700, 0, Math.max(bottom, 800));
    vg.addColorStop(0, rgba('#5A44A8', 0));
    vg.addColorStop(1, rgba('#241C60', 0.92));
    ctx.fillStyle = vg;
    ctx.fillRect(vis.x0 - 20, 700, vis.x1 - vis.x0 + 40, Math.max(bottom, 800) - 700);
  }

  /** A giant silhouetted mushroom: curved stem, domed cap, faint gills and glowing freckles. */
  private mushroom(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, h: number, cw: number, lean: number, col: string, spotA: number, rimA: number, layer: number): void {
    const { sky } = this.env;
    const sw = cw * rng.range(0.1, 0.15);
    const tx = x + lean * h;
    const ty = y - h;
    const ch = cw * rng.range(0.3, 0.46);
    ctx.fillStyle = col;
    // Stem.
    ctx.beginPath();
    ctx.moveTo(x - sw * 1.4, y);
    ctx.quadraticCurveTo(x - sw * 0.9 + lean * h * 0.6, y - h * 0.5, tx - sw * 0.7, ty + 2);
    ctx.lineTo(tx + sw * 0.7, ty + 2);
    ctx.quadraticCurveTo(x + sw * 0.9 + lean * h * 0.6, y - h * 0.5, x + sw * 1.4, y);
    ctx.closePath();
    ctx.fill();
    // Skirt (annulus).
    const ay = ty + h * 0.14;
    const ax = tx - lean * h * 0.14;
    ctx.beginPath();
    ctx.moveTo(ax - sw * 0.8, ay);
    ctx.quadraticCurveTo(ax - sw * 1.9, ay + 10, ax - sw * 1.4, ay + 14);
    ctx.lineTo(ax + sw * 1.4, ay + 14);
    ctx.quadraticCurveTo(ax + sw * 1.9, ay + 10, ax + sw * 0.8, ay);
    ctx.closePath();
    ctx.fill();
    // Cap: a dome with drooping edges and a softly concave underside.
    const l = tx - cw / 2;
    const r = tx + cw / 2;
    const droop = ch * 0.35;
    ctx.beginPath();
    ctx.moveTo(l, ty + droop);
    ctx.bezierCurveTo(l - cw * 0.04, ty - ch * 0.55, tx - cw * 0.3, ty - ch * 1.05, tx, ty - ch);
    ctx.bezierCurveTo(tx + cw * 0.3, ty - ch * 1.05, r + cw * 0.04, ty - ch * 0.55, r, ty + droop);
    ctx.quadraticCurveTo(tx, ty - ch * 0.12, l, ty + droop);
    ctx.closePath();
    ctx.fill();
    sky.mark(l, r, ty - ch);
    // Gills: fine lines under the cap.
    ctx.save();
    ctx.strokeStyle = rgba(mix(col, '#C9B8FF', 0.5), 0.22 + layer * 0.05);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const ex = l + (r - l) * t;
      const ey = ty + droop - Math.sin(t * Math.PI) * (droop + ch * 0.06) * 0.9;
      ctx.moveTo(tx + (ex - tx) * 0.2, ty + 1);
      ctx.lineTo(ex, ey);
    }
    ctx.stroke();
    // Bioluminescent rim along the top of the cap.
    ctx.strokeStyle = rgba(TEAL, rimA);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(l + cw * 0.04, ty + droop * 0.4);
    ctx.bezierCurveTo(l + cw * 0.02, ty - ch * 0.55, tx - cw * 0.3, ty - ch * 1.03, tx, ty - ch * 0.99);
    ctx.bezierCurveTo(tx + cw * 0.3, ty - ch * 1.03, r - cw * 0.02, ty - ch * 0.55, r - cw * 0.04, ty + droop * 0.4);
    ctx.stroke();
    ctx.restore();
    // Freckles: baked faintly, and remembered for the live pulse.
    const n = Math.round(cw / 16);
    for (let i = 0; i < n; i++) {
      const u = rng.range(-0.42, 0.42);
      const v = rng.range(0.2, 0.8);
      const sx = tx + u * cw;
      const top = ty - ch * Math.sqrt(Math.max(0, 1 - (u / 0.5) * (u / 0.5)));
      const sy = top + (ty + droop * 0.6 - top) * v * 0.8;
      const sr = rng.range(1.2, 3.2) * (0.7 + layer * 0.25);
      const c: 0 | 1 = rng.chance(0.62) ? 0 : 1;
      ctx.fillStyle = rgba(c ? ORCHID : TEAL, spotA * 0.9);
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * 0.75, 0, 0, TAU);
      ctx.fill();
      this.spots.push({ x: sx, y: sy, r: sr, c, ph: rng.range(0, TAU) });
    }
    // Glowing threads hanging from the nearest caps.
    if (layer === 2) {
      ctx.strokeStyle = rgba(TEAL, 0.35);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const hx = l + cw * rng.range(0.15, 0.85);
        const hy = ty + droop * 0.5;
        const len = rng.range(14, 40);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx + rng.range(-4, 4), hy + len * 0.5, hx + rng.range(-2, 2), hy + len);
        ctx.stroke();
        this.spots.push({ x: hx, y: hy + len, r: 1.6, c: 0, ph: rng.range(0, TAU) });
      }
    }
    ctx.fillStyle = col;
  }

  override initLive(): void {
    const { vis } = this.env;
    this.stars = new TwinkleField(this.env, 34, 420, '#EDE6FF');
    this.spores = new MoteField(this.env, { color: TEAL, count: 26, y0: 180, y1: vis.y1, vx: [-5, 5], vy: [-16, -6], r: [0.9, 2], halo: 5, blink: 0, sway: 9 });
    this.petals = new MoteField(this.env, { color: ORCHID, count: 12, y0: 220, y1: vis.y1, vx: [-4, 4], vy: [-12, -4], r: [0.9, 1.7], halo: 5, blink: 0, sway: 12 });
    this.mist = new Mist('#8466D6', this.env.seed, { strength: 0.85, near: '#6ACFC6' });
    // Keep the pulse cheap: at most ~70 freckles breathe live.
    if (this.spots.length > 70) this.spots = this.spots.filter((_, i) => i % Math.ceil(this.spots.length / 70) === 0);
  }

  override live(ctx: CanvasRenderingContext2D, t: number, dt: number, m: number): void {
    this.stars.draw(ctx, t, 0.9, m);
    ctx.globalCompositeOperation = 'lighter';
    const tt = t * (0.3 + 0.7 * m);
    for (const s of this.spots) {
      const k = 0.5 + 0.5 * Math.sin(tt * 1.1 + s.ph);
      ctx.globalAlpha = 0.18 + 0.5 * k * k;
      glow(ctx, s.c ? this.orchidS : this.tealS, s.x, s.y, s.r * 4.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.spores.draw(ctx, t, dt, m);
    this.petals.draw(ctx, t, dt, m);
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    this.mist.draw(ctx, this.env.vis, t, m);
  }
}

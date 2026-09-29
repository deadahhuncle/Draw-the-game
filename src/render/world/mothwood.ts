// World 5 — Moth Wood. Near-black forest: ranks of tall trunks receding into green haze, vines looping
// between them, a faint moon through a gap in the canopy, glow-bugs, and — if you look — eyes.
import { H } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { mix, rgba } from './color';
import { MoteField, Noise1D, TAU, billowSea, fibres, glow, glowSprite, hazeBand, paintGlow, paintStars, softLayer, type Box } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const SKY = ['#010302', '#020805', '#04100A', '#07180F', '#0B2216', '#102C1D'];
const HORIZON = 560;
const GLOW = '#B6FF8A';

interface Eyes {
  x: number;
  y: number;
  s: number;
  ph: number;
  next: number;
  blink: number;
}

export class MothwoodScene extends Scene {
  private moon = { x: 320, y: 140, r: 30 };
  private eyes: Eyes[] = [];
  private bulbs: { x: number; y: number; ph: number }[] = [];
  private bugs!: MoteField;
  private dust!: MoteField;
  private mist!: Mist;
  private green = glowSprite(GLOW);
  private eyeS = glowSprite('#E8F59A');

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng } = this.env;
    skyGradient(ctx, vis, SKY, HORIZON);
    this.moon.x = rng.range(220, 520);
    this.moon.y = rng.range(120, 170);
    const m = this.moon;
    paintStars(ctx, rng, { x0: m.x - 260, y0: vis.y0, x1: m.x + 260, y1: 300 }, 40, '#E0F5D8', 0.5);
    paintGlow(ctx, m.x, m.y, 420, '#9FD8A0', 0.14);
    paintGlow(ctx, m.x, m.y, 110, '#DDF5D0', 0.22);
    ctx.fillStyle = '#E4F5DA';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba('#B8CCB0', 0.35);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(m.x + rng.range(-m.r * 0.6, m.r * 0.6), m.y + rng.range(-m.r * 0.6, m.r * 0.6), rng.range(3, 8), 0, TAU);
      ctx.fill();
    }
    paintGlow(ctx, 640, HORIZON, 900, '#1E4A30', 0.4, 0.3);
    fibres(ctx, rng, vis, '#D8F0D0', 3, 0.025);
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const bottom = Math.max(vis.y1 + 40, H + 100);
    const top = vis.y0 - 30;

    // L1: a far rank of thin trunks in green haze.
    const c1 = mix('#153826', '#1E4A30', 0.35);
    for (let x = vis.x0 - 20; x < vis.x1 + 20; x += rng.range(28, 70)) this.trunk(ctx, rng, x, 560, top, rng.range(6, 14), c1, 0);
    this.ground(ctx, rng, vis, 556, 10, c1, bottom);
    hazeBand(ctx, vis, vis.y0, 600, '#1D4A30', 0.18, 0.4);

    // Moonbeams slanting through the canopy gap.
    this.beams(ctx, rng);

    // L2: middle trunks, vines looping between them, and something watching.
    const c2 = '#0B2016';
    const xs2: number[] = [];
    for (let x = vis.x0 + rng.range(0, 60); x < vis.x1 + 20; x += rng.range(90, 170)) xs2.push(x);
    const w2: number[] = xs2.map(() => rng.range(16, 34));
    xs2.forEach((x, i) => this.trunk(ctx, rng, x, 600, top, w2[i], c2, 1));
    this.vines(ctx, rng, xs2, c2, 0.8, 1);
    this.ground(ctx, rng, vis, 596, 16, c2, bottom);
    this.ferns(ctx, rng, vis, 596, c2, 7, 0.8);
    for (let i = 0; i < 3; i++) {
      const k = rng.int(0, xs2.length - 1);
      const ex = (xs2[k] + xs2[k + 1]) / 2 + rng.range(-20, 20);
      if (!isFinite(ex)) continue;
      this.eyes.push({ x: ex, y: rng.range(470, 570), s: rng.range(0.8, 1.2), ph: rng.range(0, TAU), next: rng.range(1, 6), blink: 0 });
    }
    hazeBand(ctx, vis, 440, 640, '#17402A', 0, 0.5);

    // L3: a few massive near trunks with roots, bark and hanging vines.
    const c3 = '#07130C';
    const xs3: number[] = [];
    for (let x = vis.x0 + rng.range(-40, 80); x < vis.x1 + 60; x += rng.range(260, 420)) xs3.push(x);
    xs3.forEach((x) => this.trunk(ctx, rng, x, 650, top, rng.range(44, 76), c3, 2));
    this.vines(ctx, rng, xs3, c3, 1.4, 2);
    this.ground(ctx, rng, vis, 646, 18, c3, bottom);
    this.ferns(ctx, rng, vis, 646, c3, 5, 1.3);

    // The canopy: a ragged dark ceiling, thinning around the moon.
    this.canopy(ctx, rng, vis);

    // The void: low, green-black ground mist.
    softLayer(ctx, this.env, 2, (c) => billowSea(c, rng, vis, 655, 4, '#3E7A58', '#173A28', 0.45));
    const vg = ctx.createLinearGradient(0, 690, 0, bottom);
    vg.addColorStop(0, rgba('#2A5E40', 0));
    vg.addColorStop(1, rgba('#06120B', 0.95));
    ctx.fillStyle = vg;
    ctx.fillRect(vis.x0 - 20, 690, vis.x1 - vis.x0 + 40, bottom - 690);
    sky.mark(vis.x0 - 50, vis.x1 + 50, vis.y0 - 50);
  }

  private trunk(ctx: CanvasRenderingContext2D, rng: Rng, x: number, base: number, top: number, w: number, col: string, layer: number): void {
    const lean = rng.range(-0.04, 0.04);
    const h = base - top;
    const tx = x + lean * h;
    ctx.fillStyle = col;
    ctx.beginPath();
    const flare = layer === 2 ? w * 0.9 : w * 0.4;
    ctx.moveTo(x - w / 2 - flare, base + 4);
    ctx.quadraticCurveTo(x - w / 2, base - 10, x - w / 2 + lean * 60, base - 60);
    ctx.lineTo(tx - w * 0.38, top);
    ctx.lineTo(tx + w * 0.38, top);
    ctx.lineTo(x + w / 2 + lean * 60, base - 60);
    ctx.quadraticCurveTo(x + w / 2, base - 10, x + w / 2 + flare, base + 4);
    ctx.closePath();
    ctx.fill();
    // Branch stubs.
    const nb = rng.int(1, 4);
    for (let i = 0; i < nb; i++) {
      const by = base - h * rng.range(0.35, 0.8);
      const bx = x + (by - base) * -lean;
      const dir = rng.chance(0.5) ? 1 : -1;
      const len = rng.range(20, 60) * (1 + layer * 0.4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * len * 0.5, by - len * 0.1, bx + dir * len, by - len * 0.45);
      ctx.lineTo(bx + dir * len * 0.98, by - len * 0.4);
      ctx.quadraticCurveTo(bx + dir * len * 0.45, by + w * 0.2, bx, by + w * 0.35);
      ctx.fill();
    }
    if (layer >= 1) {
      // Bark: faint vertical strokes + a cool edge where the moon touches it.
      ctx.save();
      ctx.strokeStyle = rgba('#5A8A68', layer === 2 ? 0.1 : 0.06);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < w / 5; i++) {
        const ox = rng.range(-w * 0.35, w * 0.35);
        const y0 = base - rng.range(10, h * 0.9);
        ctx.moveTo(x + ox, y0);
        ctx.quadraticCurveTo(x + ox + rng.range(-2, 2), y0 - 40, x + ox + rng.range(-1, 1), y0 - rng.range(50, 120));
      }
      ctx.stroke();
      const side = this.moon.x < x ? -1 : 1;
      ctx.strokeStyle = rgba('#9FD8A0', layer === 2 ? 0.2 : 0.12);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx + side * w * 0.38, top);
      ctx.lineTo(x + side * (w / 2) + lean * 60, base - 60);
      ctx.stroke();
      ctx.restore();
      // Glowing fungus shelves on some trunks.
      if (rng.chance(0.5)) {
        const fy = base - rng.range(40, 200);
        for (let i = 0; i < rng.int(2, 4); i++) {
          const sx = x + side * w * 0.45;
          const sy = fy - i * rng.range(8, 14);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(sx + side * 4, sy, 7 + layer * 2, 2.5, 0, 0, TAU);
          ctx.fill();
          this.bulbs.push({ x: sx + side * 5, y: sy + 1, ph: rng.range(0, TAU) });
        }
      }
    }
  }

  private vines(ctx: CanvasRenderingContext2D, rng: Rng, xs: number[], col: string, w: number, layer: number): void {
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = w;
    for (let i = 0; i < xs.length - 1; i++) {
      if (rng.chance(0.35)) continue;
      const a = xs[i];
      const b = xs[i + 1];
      const y1 = rng.range(60, 260);
      const y2 = rng.range(60, 260);
      const sag = rng.range(60, 180);
      ctx.beginPath();
      ctx.moveTo(a, y1);
      ctx.bezierCurveTo(a + (b - a) * 0.3, y1 + sag, a + (b - a) * 0.7, y2 + sag, b, y2);
      ctx.stroke();
      // Leaves along the loop.
      for (let t = 0.08; t < 0.95; t += rng.range(0.06, 0.12)) {
        const u = 1 - t;
        const px = u * u * u * a + 3 * u * u * t * (a + (b - a) * 0.3) + 3 * u * t * t * (a + (b - a) * 0.7) + t * t * t * b;
        const py = u * u * u * y1 + 3 * u * u * t * (y1 + sag) + 3 * u * t * t * (y2 + sag) + t * t * t * y2;
        this.leaf(ctx, px, py, rng.range(3, 6) * (1 + layer * 0.3), rng.range(0.6, 2.5));
      }
    }
    // Hanging strands.
    for (const x of xs) {
      for (let k = 0; k < rng.int(1, 4); k++) {
        const hx = x + rng.range(-60, 60);
        const len = rng.range(80, 320);
        const y0 = rng.range(-30, 60);
        ctx.beginPath();
        ctx.moveTo(hx, y0);
        ctx.quadraticCurveTo(hx + rng.range(-10, 10), y0 + len * 0.5, hx + rng.range(-6, 6), y0 + len);
        ctx.stroke();
        for (let t = 0.15; t < 1; t += rng.range(0.1, 0.2)) this.leaf(ctx, hx + rng.range(-2, 2), y0 + len * t, rng.range(2.5, 5) * (1 + layer * 0.3), rng.chance(0.5) ? 0.9 : 2.3);
        if (rng.chance(0.4)) this.bulbs.push({ x: hx, y: y0 + len + 2, ph: rng.range(0, TAU) });
      }
    }
  }

  private leaf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number): void {
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s, s * 0.42, a, 0, TAU);
    ctx.fill();
  }

  private ground(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, base: number, amp: number, col: string, bottom: number): void {
    const nz = new Noise1D(rng, 200);
    ctx.beginPath();
    ctx.moveTo(vis.x0 - 30, bottom);
    for (let x = vis.x0 - 30; x <= vis.x1 + 30; x += 8) ctx.lineTo(x, base - amp * (0.5 + nz.at(x)));
    ctx.lineTo(vis.x1 + 30, bottom);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  private ferns(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, base: number, col: string, n: number, s: number): void {
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1 * s;
    for (let i = 0; i < n; i++) {
      const x = rng.range(vis.x0, vis.x1);
      const fronds = rng.int(4, 8);
      for (let f = 0; f < fronds; f++) {
        const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * 2.2;
        const len = rng.range(22, 44) * s;
        const ex = x + Math.cos(a) * len;
        const ey = base - 4 + Math.sin(a) * len * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, base - len * 0.7, ex, ey);
        ctx.stroke();
        for (let t = 0.3; t < 1; t += 0.14) {
          const px = x + (ex - x) * t;
          const py = base + (ey - base) * t - Math.sin(t * Math.PI) * len * 0.25;
          this.leaf(ctx, px, py, 3 * s * (1 - t * 0.6), a + 1.2);
          this.leaf(ctx, px, py, 3 * s * (1 - t * 0.6), a - 1.2 + Math.PI);
        }
      }
    }
  }

  private beams(ctx: CanvasRenderingContext2D, rng: Rng): void {
    const m = this.moon;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = 0.35 + i * 0.12 + rng.range(-0.04, 0.04);
      const len = 700;
      const w0 = rng.range(10, 24);
      const w1 = rng.range(50, 110);
      const ex = m.x + Math.sin(a) * len;
      const ey = m.y + Math.cos(a) * len;
      const g = ctx.createLinearGradient(m.x, m.y, ex, ey);
      g.addColorStop(0, rgba('#BFF2B8', 0.1));
      g.addColorStop(1, rgba('#BFF2B8', 0));
      ctx.fillStyle = g;
      const nx = Math.cos(a);
      const ny = -Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(m.x - nx * w0, m.y - ny * w0);
      ctx.lineTo(m.x + nx * w0, m.y + ny * w0);
      ctx.lineTo(ex + nx * w1, ey + ny * w1);
      ctx.lineTo(ex - nx * w1, ey - ny * w1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private canopy(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box): void {
    const m = this.moon;
    const nz = new Noise1D(rng, 140);
    const edge = (x: number) => {
      const gap = Math.exp(-Math.pow((x - m.x) / 170, 2));
      return 70 + nz.at(x) * 40 - gap * 120;
    };
    ctx.fillStyle = '#020604';
    ctx.beginPath();
    ctx.rect(vis.x0 - 40, vis.y0 - 60, vis.x1 - vis.x0 + 80, 60);
    for (let x = vis.x0 - 40; x < vis.x1 + 40; x += rng.range(14, 30)) {
      const y = edge(x);
      const r = rng.range(14, 34);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
      if (y > vis.y0) {
        ctx.moveTo(x + r, (y + vis.y0) / 2);
        ctx.rect(x - r, vis.y0 - 60, r * 2, y - vis.y0 + 60);
      }
    }
    ctx.fill();
    // Leaf fringe hanging from the canopy edge.
    for (let x = vis.x0 - 40; x < vis.x1 + 40; x += rng.range(6, 14)) {
      const y = edge(x) + rng.range(10, 30);
      this.leaf(ctx, x, y, rng.range(3, 7), rng.range(1, 2.2));
    }
  }

  override initLive(): void {
    const { vis } = this.env;
    this.bugs = new MoteField(this.env, { color: GLOW, count: 22, y0: 250, y1: vis.y1, vx: [-7, 7], vy: [-6, 4], r: [0.8, 1.6], halo: 6, blink: 1, sway: 12 });
    this.dust = new MoteField(this.env, { color: '#DDF5D0', count: 10, y0: this.moon.y, y1: 600, vx: [2, 6], vy: [3, 8], r: [0.5, 0.9], halo: 0, blink: 0, sway: 4 });
    this.mist = new Mist('#3F7E5A', this.env.seed, { strength: 0.7, speed: 0.6 });
    if (this.bulbs.length > 40) this.bulbs.length = 40;
  }

  override live(ctx: CanvasRenderingContext2D, t: number, dt: number, m: number): void {
    const tt = t * (0.35 + 0.65 * m);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bulbs) {
      ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(tt * 0.9 + b.ph));
      glow(ctx, this.green, b.x, b.y, 7);
    }
    // Eyes in the dark: they open, look, blink, and sometimes close for a long while.
    for (const e of this.eyes) {
      e.next -= dt;
      if (e.next <= 0) {
        e.blink = 0.18;
        e.next = this.env.rng.range(2, 7);
      }
      e.blink = Math.max(0, e.blink - dt);
      const open = e.blink > 0 ? Math.abs(e.blink - 0.09) / 0.09 : 1;
      const awake = 0.5 + 0.5 * Math.sin(tt * 0.13 + e.ph);
      if (awake < 0.35) continue;
      const a = Math.min(1, (awake - 0.35) * 3) * 0.8;
      ctx.globalAlpha = a * 0.5;
      glow(ctx, this.eyeS, e.x - 4 * e.s, e.y, 5 * e.s);
      glow(ctx, this.eyeS, e.x + 4 * e.s, e.y, 5 * e.s);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#EAF7A8';
      const hgt = 1.6 * e.s * open + 0.2;
      ctx.fillRect(e.x - 5.2 * e.s, e.y - hgt / 2, 2.4 * e.s, hgt);
      ctx.fillRect(e.x + 2.8 * e.s, e.y - hgt / 2, 2.4 * e.s, hgt);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.dust.draw(ctx, t, dt, m, 0.5);
    this.bugs.draw(ctx, t, dt, m);
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    this.mist.draw(ctx, this.env.vis, t, m);
  }
}

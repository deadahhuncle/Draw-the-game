// World 1 — Dusk Meadow. A huge low sun banded by cloud streaks, apricot haze pooling in the valleys,
// rolling meadow hills with poplars and cypresses, a farmhouse window glowing, birds going home.
import { H } from '../../core/constants';
import { mix, rgba } from './color';
import { Flock, MoteField, Noise1D, TAU, TwinkleField, billowSea, fibres, fillUnder, glow, glowSprite, hazeBand, paintGlow, paintStars, poplar, ridge, roundTree, softLayer, streak, strokeRidge, washCloud } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const SKY = ['#171230', '#2A1B46', '#4E2659', '#8D3B63', '#CF5E60', '#F09067', '#FCC487'];
const HORIZON = 540;

export class DuskScene extends Scene {
  private sun = { x: 930, y: 468, r: 118 };
  private windows: { x: number; y: number; ph: number }[] = [];
  private stars!: TwinkleField;
  private birds!: Flock;
  private flies!: MoteField;
  private mist!: Mist;
  private warm = glowSprite('#FFC47A');

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, progress } = this.env;
    // The evening goes on: the sun sinks a little lower with every level of the meadow.
    this.sun.x = rng.range(860, 1010);
    this.sun.y = 432 + progress * 78 + rng.range(-6, 6);
    const s = this.sun;
    skyGradient(ctx, vis, SKY.map((c, i) => mix(c, '#241840', progress * 0.2 * (1 - i / SKY.length))), HORIZON);

    // Early stars high up, fading toward the glow; more of them as night comes on.
    paintStars(ctx, rng, { x0: vis.x0, y0: vis.y0, x1: vis.x1, y1: 260 + progress * 60 }, Math.round(45 + progress * 70), '#FFF1E6', 0.6, 260 + progress * 60);

    // Horizon glow: a wide, flattened bloom behind the sun.
    paintGlow(ctx, s.x, HORIZON - 30, 1100, '#FFB478', 0.42, 0.28);
    paintGlow(ctx, s.x, s.y, s.r * 5.2, '#FF9F6E', 0.38);
    paintGlow(ctx, s.x, s.y, s.r * 2.1, '#FFD39C', 0.35);

    // The sun disc.
    const d = ctx.createRadialGradient(s.x - s.r * 0.18, s.y - s.r * 0.26, s.r * 0.05, s.x, s.y, s.r);
    d.addColorStop(0, '#FFF8E4');
    d.addColorStop(0.45, '#FFE0A6');
    d.addColorStop(0.85, '#FFBE7C');
    d.addColorStop(1, '#FFAE72');
    ctx.fillStyle = d;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();

    // Soft cloud washes: violet high up, rose lower, all lit from beneath by the low sun.
    softLayer(ctx, this.env, 3, (c) => {
      for (let i = 0; i < 8; i++) {
        const y = rng.range(110, 430);
        const k = (y - 110) / 320;
        washCloud(c, rng, rng.range(vis.x0 - 100, vis.x1 + 100), y, rng.range(320, 900), rng.range(10, 24), mix('#3C2250', '#B0566E', k), 0.6 - 0.15 * k, mix('#FF9F7A', '#FFD49C', k), 0.3 + 0.25 * k);
      }
    });
    // A few crisp, hand-inked streaks on top.
    for (let i = 0; i < 4; i++) {
      const y = rng.range(160, 420);
      const k = (y - 160) / 260;
      streak(ctx, rng.range(vis.x0, vis.x1), y, rng.range(200, 520), rng.range(3, 6), rgba(mix('#4A2A5C', '#B85A72', k), 0.55), mix('#FF9F7A', '#FFD9A0', k), 0.4, rng);
    }
    // Bands across the sun (the ukiyo-e sunset).
    const bands = [-0.3, 0.05, 0.3, 0.52];
    for (const b of bands) {
      const y = s.y + b * s.r;
      const w = rng.range(320, 560);
      streak(ctx, s.x + rng.range(-120, 120), y, w, rng.range(5, 10), rgba('#B24E68', 0.72), '#FFE1AA', 0.55, rng);
    }
    fibres(ctx, rng, vis, '#FFE8D6', 3, 0.035);
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const bottom = vis.y1 + 40;

    // L1: the farthest hills, pale rose, with tiny poplar rows.
    const n1 = new Noise1D(rng, 240);
    const r1 = ridge(vis, 6, (x) => 500 - 24 * (0.6 + n1.at(x)));
    const c1 = mix('#9C5474', '#F29668', 0.3);
    fillUnder(ctx, r1, bottom, c1);
    sky.markPts(r1);
    ctx.fillStyle = c1;
    for (let g = 0; g < 7; g++) {
      const gx = rng.range(vis.x0, vis.x1);
      const cnt = rng.int(3, 8);
      for (let i = 0; i < cnt; i++) {
        const x = gx + i * rng.range(5, 9);
        const y = 500 - 24 * (0.6 + n1.at(x)) + 2;
        const h = rng.range(9, 20);
        poplar(ctx, x, y, h, h * 0.24, 0, rng);
        sky.mark(x - 3, x + 3, y - h);
      }
    }
    hazeBand(ctx, vis, 468, 545, '#FBB27E', 0, 0.5);

    // L2: meadow hills with cypress clusters, a farmhouse and its warm window.
    const n2 = new Noise1D(rng, 330);
    const f2 = (x: number) => 548 - 40 * (0.55 + n2.at(x));
    const r2 = ridge(vis, 6, f2);
    const c2 = '#6E3559';
    fillUnder(ctx, r2, bottom, c2);
    strokeRidge(ctx, r2, rgba('#FFB48A', 0.22), 1.4);
    sky.markPts(r2);
    ctx.fillStyle = c2;
    for (let g = 0; g < 6; g++) {
      const gx = rng.range(vis.x0, vis.x1);
      const cnt = rng.int(2, 5);
      for (let i = 0; i < cnt; i++) {
        const x = gx + i * rng.range(9, 16);
        const h = rng.range(26, 58);
        const y = f2(x) + 3;
        poplar(ctx, x, y, h, h * rng.range(0.2, 0.28), rng.range(-0.02, 0.02), rng);
        sky.mark(x - 5, x + 5, y - h);
      }
    }
    // Farmhouse on a crest (seeded position, away from the sun).
    const hx = rng.chance(0.5) ? rng.range(vis.x0 + 120, 420) : rng.range(560, 760);
    this.farmhouse(ctx, hx, f2(hx) + 4, c2);
    // A couple of far lanterns on posts along the lane.
    for (let i = 0; i < 2; i++) {
      const lx = hx + (i ? 1 : -1) * rng.range(70, 160);
      const ly = f2(lx) + 2;
      ctx.fillRect(lx - 0.6, ly - 14, 1.2, 14);
      this.windows.push({ x: lx + 0.5, y: ly - 15, ph: rng.range(0, TAU) });
    }
    hazeBand(ctx, vis, 520, 600, '#F7A07E', 0, 0.42);

    // L3: near hills, deep plum: big poplars, a lone round tree and a leaning fence.
    const n3 = new Noise1D(rng, 420);
    const f3 = (x: number) => 598 - 54 * (0.5 + n3.at(x));
    const r3 = ridge(vis, 5, f3);
    const c3 = '#3E1E40';
    fillUnder(ctx, r3, bottom, c3);
    strokeRidge(ctx, r3, rgba('#FFB48A', 0.2), 1.3);
    sky.markPts(r3);
    ctx.fillStyle = c3;
    for (let g = 0; g < 4; g++) {
      const gx = rng.range(vis.x0 + 40, vis.x1 - 40);
      const cnt = rng.int(1, 4);
      for (let i = 0; i < cnt; i++) {
        const x = gx + i * rng.range(18, 30);
        const h = rng.range(64, 132);
        const y = f3(x) + 4;
        poplar(ctx, x, y, h, h * rng.range(0.2, 0.26), rng.range(-0.03, 0.03), rng);
        sky.mark(x - 10, x + 10, y - h);
      }
    }
    const tx = rng.range(vis.x0 + 200, vis.x1 - 200);
    const th = rng.range(90, 120);
    roundTree(ctx, tx, f3(tx) + 4, th, rng);
    sky.mark(tx - th * 0.4, tx + th * 0.4, f3(tx) - th);
    this.fence(ctx, rng.range(vis.x0, vis.x1 - 300), rng.range(160, 300), f3, c3);

    // The void: warm haze pooling in the valley, then a sea of apricot fog.
    hazeBand(ctx, vis, 560, 690, '#F2A08A', 0, 0.5);
    softLayer(ctx, this.env, 2, (c) => billowSea(c, rng, vis, 648, 4, '#FFC9A6', '#D98890', 0.5));
    // The low sun blooms over the hills in front of it (baked).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    paintGlow(ctx, this.sun.x, this.sun.y, this.sun.r * 2.4, '#FFB07A', 0.2);
    ctx.restore();
    const vg = ctx.createLinearGradient(0, 690, 0, Math.max(bottom, H + 80));
    vg.addColorStop(0, rgba('#D98890', 0));
    vg.addColorStop(1, rgba('#7E3F68', 0.85));
    ctx.fillStyle = vg;
    ctx.fillRect(vis.x0 - 20, 690, vis.x1 - vis.x0 + 40, Math.max(bottom, H + 80) - 690);
  }

  private farmhouse(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
    const { sky } = this.env;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x - 16, y - 13);
    ctx.lineTo(x - 2, y - 24);
    ctx.lineTo(x + 12, y - 13);
    ctx.lineTo(x + 26, y - 13);
    ctx.lineTo(x + 26, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + 4, y - 27, 3, 8); // chimney
    sky.mark(x - 16, x + 26, y - 27);
    // Warm windows.
    ctx.fillStyle = '#FFD48A';
    ctx.fillRect(x - 6, y - 10, 3.2, 3.6);
    ctx.fillRect(x + 16, y - 9, 3, 3.2);
    this.windows.push({ x: x - 4.4, y: y - 8.2, ph: 0 }, { x: x + 17.5, y: y - 7.4, ph: 2 });
    // A thread of chimney smoke.
    ctx.strokeStyle = rgba('#F5C3A8', 0.25);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 5.5, y - 28);
    ctx.bezierCurveTo(x + 2, y - 40, x + 14, y - 48, x + 8, y - 62);
    ctx.bezierCurveTo(x + 4, y - 72, x + 18, y - 78, x + 22, y - 88);
    ctx.stroke();
  }

  private fence(ctx: CanvasRenderingContext2D, x0: number, len: number, f: (x: number) => number, col: string): void {
    const { rng } = this.env;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const posts: { x: number; y: number }[] = [];
    for (let x = x0; x < x0 + len; x += rng.range(20, 28)) {
      const y = f(x) + 3;
      const lean = rng.range(-2, 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - 14);
      ctx.stroke();
      posts.push({ x: x + lean * 0.7, y: y - 10 });
    }
    ctx.lineWidth = 1;
    for (const dy of [0, 5]) {
      ctx.beginPath();
      posts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y + dy) : ctx.moveTo(q.x, q.y + dy)));
      ctx.stroke();
    }
  }

  override initLive(): void {
    this.stars = new TwinkleField(this.env, Math.round(14 + this.env.progress * 20), 250, '#FFF1E6');
    this.birds = new Flock(this.env, '#2B1733', [150, 330], 3);
    this.flies = new MoteField(this.env, { color: '#FFD68C', count: 16, y0: 470, y1: 640, vx: [-8, 8], vy: [-5, 3], r: [1, 1.9], halo: 5, blink: 1, sway: 10 });
    this.mist = new Mist('#EBA08E', this.env.seed, { strength: 0.9 });
  }

  override live(ctx: CanvasRenderingContext2D, t: number, dt: number, m: number): void {
    this.stars.draw(ctx, t, 0.8, m);
    ctx.globalCompositeOperation = 'lighter';
    // Farmhouse windows & far lanterns flicker.
    for (const w of this.windows) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3.1 + w.ph) * Math.sin(t * 1.7 + w.ph * 2);
      glow(ctx, this.warm, w.x, w.y, 9);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.birds.draw(ctx, t, dt, m, 0.85);
    this.flies.draw(ctx, t, dt, m);
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    this.mist.draw(ctx, this.env.vis, t, m);
  }
}

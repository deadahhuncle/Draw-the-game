// World 3 — Starwater. Deep blue night, a giant cratered moon, the milky way, and at the bottom of the
// world a slow river holding the whole sky: rippled reflections, a moon-glitter column, drifting lanterns.
import { H } from '../../core/constants';
import { Rng } from '../../core/rng';
import { mix, rgba } from './color';
import { MoteField, Noise1D, TAU, TwinkleField, fibres, fillUnder, glow, glowSprite, paintGlow, paintStars, pine, ridge, widestOpening, type Box } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const SKY = ['#02040E', '#040A22', '#081640', '#0F2560', '#193A7A', '#27538F'];
const HORIZON = 612;
/** The river's surface (world y). */
export const WATERLINE = 606;

interface Glint {
  x: number;
  y: number;
  w: number;
  s: number;
  ph: number;
}

interface Boat {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
}

export class StarwaterScene extends Scene {
  private moon = { x: 920, y: 180, r: 128 };
  private glints: Glint[] = [];
  private ripples: Glint[] = [];
  private boats: Boat[] = [];
  private stars!: TwinkleField;
  private flies!: MoteField;
  private mist!: Mist;
  private shoot = { t: -1, next: 4, x: 0, y: 0, dx: 0, dy: 0 };
  private warm = glowSprite('#FFD69A');

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng } = this.env;
    skyGradient(ctx, vis, SKY, HORIZON);
    paintGlow(ctx, 640, HORIZON, 1000, '#3A6AB0', 0.25, 0.25);
    this.milkyWay(ctx, rng, vis);
    paintStars(ctx, rng, { x0: vis.x0, y0: vis.y0, x1: vis.x1, y1: HORIZON - 20 }, 420, '#EAF0FF', 0.85, HORIZON);
    // Hang the moon over the widest stretch of open river so its reflection is in view.
    this.moon.x = widestOpening(this.env, 110, 260, 1040) ?? rng.range(840, 1010);
    // The moon climbs as the night goes on.
    this.moon.y = 212 - this.env.progress * 62 + rng.range(-8, 8);
    this.paintMoon(ctx, rng);
    fibres(ctx, rng, vis, '#DDE8FF', 3, 0.03);
  }

  private milkyWay(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box): void {
    const cx = (vis.x0 + vis.x1) / 2 - 100;
    const cy = 250;
    const ang = -0.34;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const span = (vis.x1 - vis.x0) * 0.75;
    // Luminous body.
    for (let i = 0; i < 70; i++) {
      const x = rng.range(-span, span);
      const y = (rng.next() + rng.next() + rng.next() - 1.5) * 50;
      const col = rng.pick(['#8FA8FF', '#C6B8FF', '#FFE2C8', '#A8C8FF']);
      paintGlow(ctx, x, y, rng.range(70, 170), col, rng.range(0.035, 0.08), rng.range(0.3, 0.55));
    }
    // A brighter core along the band.
    for (let i = 0; i < 24; i++) paintGlow(ctx, rng.range(-span * 0.8, span * 0.8), (rng.next() - 0.5) * 20, rng.range(60, 120), '#DCE4FF', rng.range(0.05, 0.09), 0.3);
    // Dust lanes: thin and faint, just enough to give the band structure.
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-span, span);
      const y = (rng.next() - 0.5) * 24;
      paintGlow(ctx, x, y, rng.range(60, 140), '#050B22', rng.range(0.14, 0.26), rng.range(0.06, 0.14));
    }
    // Star dust.
    ctx.fillStyle = '#F2F5FF';
    for (let i = 0; i < 900; i++) {
      const x = rng.range(-span, span);
      const y = (rng.next() + rng.next() + rng.next() + rng.next() - 2) * 55;
      ctx.globalAlpha = rng.range(0.15, 0.7);
      const r = rng.range(0.25, 0.75);
      ctx.fillRect(x, y, r, r);
    }
    ctx.restore();
  }

  private paintMoon(ctx: CanvasRenderingContext2D, rng: Rng): void {
    const { x, y, r } = this.moon;
    paintGlow(ctx, x, y, r * 4.6, '#7FA4E8', 0.32);
    paintGlow(ctx, x, y, r * 1.7, '#DCE7FF', 0.3);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    const base = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.02);
    base.addColorStop(0, '#FBFCFF');
    base.addColorStop(0.55, '#E3E9F7');
    base.addColorStop(1, '#B9C4E0');
    ctx.fillStyle = base;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // Maria: soft grey seas.
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, r * 0.6);
      paintGlow(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, rng.range(r * 0.25, r * 0.5), '#8E9CC2', rng.range(0.3, 0.5), rng.range(0.6, 1));
    }
    // Craters, lit from the upper left.
    for (let i = 0; i < 30; i++) {
      const a = rng.range(0, TAU);
      const d = Math.sqrt(rng.next()) * r * 0.92;
      const cx = x + Math.cos(a) * d;
      const cy = y + Math.sin(a) * d;
      const cr = rng.next() < 0.8 ? rng.range(2, 7) : rng.range(8, 16);
      const squash = Math.sqrt(1 - (d / r) * (d / r) * 0.8);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.scale(squash, 1);
      ctx.fillStyle = rgba('#A3AFCF', 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, cr, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = Math.max(0.6, cr * 0.18);
      ctx.strokeStyle = rgba('#FFFFFF', 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, -0.1 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = rgba('#7D8AB0', 0.5);
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 0.92, 0.95 * Math.PI, 1.75 * Math.PI);
      ctx.stroke();
    }
    // Limb darkening + a hint of terminator on the right.
    const limb = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.5, x, y, r);
    limb.addColorStop(0, 'rgba(40,50,90,0)');
    limb.addColorStop(1, 'rgba(40,50,90,0.35)');
    ctx.fillStyle = limb;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = rgba('#F4F8FF', 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const bottom = Math.max(vis.y1 + 40, H + 100);
    const W0 = WATERLINE;

    // Far mountains and a pine bank, both reflected in the river.
    const n1 = new Noise1D(rng, 380);
    const f1 = (x: number) => W0 - 30 - 90 * (0.55 + n1.at(x));
    const r1 = ridge(vis, 6, f1);
    const c1 = mix('#18305F', '#27538F', 0.3);
    const n2 = new Noise1D(rng, 200);
    const f2 = (x: number) => W0 - 6 - 10 * (0.5 + n2.at(x));
    const r2 = ridge(vis, 6, f2);
    const c2 = '#0A1633';
    const trees: { x: number; y: number; h: number }[] = [];
    for (let x = vis.x0; x < vis.x1; x += rng.range(5, 13)) {
      if (rng.chance(0.18)) x += rng.range(20, 80);
      trees.push({ x, y: f2(x) + 2, h: rng.range(10, 30) * (rng.chance(0.1) ? 1.5 : 1) });
    }
    const treeSeed = rng.int(1, 1e9);
    const paintBank = (c: CanvasRenderingContext2D, alpha: number) => {
      const tr = new Rng(treeSeed);
      c.globalAlpha = alpha;
      fillUnder(c, r1, W0 + 2, c1);
      c.fillStyle = mix(c1, '#6C8CC8', 0.25);
      c.globalAlpha = alpha * 0.35;
      // Snow-lit crests facing the moon.
      c.beginPath();
      for (let i = 1; i < r1.length - 1; i++) {
        const q = r1[i];
        if (r1[i + 1].y > q.y && r1[i - 1].y > q.y) {
          c.moveTo(q.x, q.y);
          c.lineTo(q.x + 14, q.y + 9);
          c.lineTo(q.x + 4, q.y + 12);
          c.closePath();
        }
      }
      c.fill();
      c.globalAlpha = alpha;
      fillUnder(c, r2, W0 + 2, c2);
      c.fillStyle = c2;
      for (const t of trees) pine(c, t.x, t.y, t.h, tr);
      c.globalAlpha = 1;
    };
    paintBank(ctx, 1);
    sky.markPts(r1);
    for (const t of trees) sky.mark(t.x - 4, t.x + 4, t.y - t.h);
    // Mist lying on the far bank.
    const mg = ctx.createLinearGradient(0, W0 - 40, 0, W0);
    mg.addColorStop(0, rgba('#5F86C8', 0));
    mg.addColorStop(1, rgba('#5F86C8', 0.4));
    ctx.fillStyle = mg;
    ctx.fillRect(vis.x0 - 20, W0 - 40, vis.x1 - vis.x0 + 40, 40);

    // The river.
    const wg = ctx.createLinearGradient(0, W0, 0, bottom);
    wg.addColorStop(0, '#24467F');
    wg.addColorStop(0.08, '#142C5A');
    wg.addColorStop(0.45, '#0A1837');
    wg.addColorStop(1, '#040A1C');
    ctx.fillStyle = wg;
    ctx.fillRect(vis.x0 - 20, W0, vis.x1 - vis.x0 + 40, bottom - W0);
    // Reflection of the bank, squashed and broken into ripples.
    ctx.save();
    ctx.beginPath();
    ctx.rect(vis.x0 - 20, W0, vis.x1 - vis.x0 + 40, bottom - W0);
    ctx.clip();
    ctx.translate(0, W0 + 1);
    ctx.scale(1, -0.9);
    ctx.translate(0, -W0);
    paintBank(ctx, 0.55);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba('#142C5A', 0.8);
    for (let y = W0 + 3; y < W0 + 150; y += rng.range(2.5, 5.5)) {
      ctx.lineWidth = rng.range(0.6, 1.6);
      ctx.beginPath();
      let x = vis.x0 - 20;
      while (x < vis.x1 + 20) {
        const len = rng.range(30, 160);
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        x += len + rng.range(10, 60);
      }
      ctx.stroke();
    }
    ctx.restore();
    // Moonlight on the water: a soft vertical column.
    ctx.save();
    ctx.translate(this.moon.x, W0 + 110);
    ctx.scale(0.3, 1);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 260);
    cg.addColorStop(0, rgba('#BFD4FF', 0.26));
    cg.addColorStop(0.5, rgba('#90AEEA', 0.1));
    cg.addColorStop(1, rgba('#90AEEA', 0));
    ctx.fillStyle = cg;
    ctx.fillRect(-260, -260, 520, 520);
    ctx.restore();
    // The waterline: a thread of light.
    ctx.strokeStyle = rgba('#A8C2F0', 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vis.x0 - 20, W0 + 0.5);
    ctx.lineTo(vis.x1 + 20, W0 + 0.5);
    ctx.stroke();
    // Reflected stars.
    ctx.fillStyle = '#DCE6FF';
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = rng.range(0.1, 0.4);
      ctx.fillRect(rng.range(vis.x0, vis.x1), rng.range(W0 + 8, Math.min(bottom, W0 + 200)), rng.range(1, 3), 0.6);
    }
    ctx.globalAlpha = 1;
  }

  override initLive(): void {
    const { rng, vis } = this.env;
    const W0 = WATERLINE;
    const m = this.moon;
    for (let i = 0; i < 44; i++) {
      const depth = Math.pow(rng.next(), 1.4);
      this.glints.push({ x: m.x + (rng.next() + rng.next() - 1) * m.r * (0.5 + depth * 0.7), y: W0 + 4 + depth * 190, w: 5 + depth * 26 + rng.range(0, 10), s: rng.range(1.5, 4), ph: rng.range(0, TAU) });
    }
    for (let i = 0; i < 36; i++) {
      this.ripples.push({ x: rng.range(vis.x0, vis.x1), y: W0 + 6 + Math.pow(rng.next(), 1.2) * 200, w: rng.range(14, 60), s: rng.range(2, 7), ph: rng.range(0, TAU) });
    }
    for (let i = 0; i < 2; i++) this.boats.push({ x: rng.range(vis.x0, vis.x1), y: W0 + rng.range(14, 36), v: rng.range(3, 6) * (rng.chance(0.5) ? 1 : -1), s: rng.range(0.8, 1.1), ph: rng.range(0, TAU) });
    this.stars = new TwinkleField(this.env, 60, W0 - 60, '#EAF0FF');
    this.flies = new MoteField(this.env, { color: '#BFD8FF', count: 10, y0: W0 - 90, y1: W0 - 10, vx: [-6, 6], vy: [-3, 3], r: [0.8, 1.4], halo: 4, blink: 1, sway: 6 });
    this.mist = new Mist('#7B9EDC', this.env.seed, { strength: 0.5, top: H - 40, speed: 0.7 });
  }

  override live(ctx: CanvasRenderingContext2D, t: number, dt: number, m: number): void {
    const tt = t * (0.35 + 0.65 * m);
    this.stars.draw(ctx, t, 1, m);
    this.shootingStar(ctx, dt, m);

    // Moon glitter on the river.
    ctx.fillStyle = '#E8F0FF';
    for (const g of this.glints) {
      const k = Math.sin(tt * g.s + g.ph);
      if (k < 0.1) continue;
      ctx.globalAlpha = k * 0.75;
      const w = g.w * (0.6 + 0.4 * k);
      ctx.fillRect(g.x - w / 2 + Math.sin(tt * 0.7 + g.ph) * 3, g.y, w, 1.1);
    }
    // Slow ripples everywhere.
    ctx.fillStyle = '#7FA0DA';
    for (const r of this.ripples) {
      const k = 0.5 + 0.5 * Math.sin(tt * 0.5 * r.s + r.ph);
      ctx.globalAlpha = 0.22 * k;
      ctx.fillRect(r.x + Math.sin(tt * 0.3 + r.ph) * 12, r.y, r.w * (0.7 + 0.3 * k), 0.8);
    }
    ctx.globalAlpha = 1;
    // Paper-boat lanterns drifting downriver.
    const { vis } = this.env;
    for (const b of this.boats) {
      b.x += b.v * dt * m;
      if (b.x > vis.x1 + 30) b.x = vis.x0 - 30;
      if (b.x < vis.x0 - 30) b.x = vis.x1 + 30;
      const bob = Math.sin(tt * 1.3 + b.ph) * 0.8;
      const s = b.s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(tt * 4 + b.ph);
      glow(ctx, this.warm, b.x, b.y - 6 * s + bob, 16 * s);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.warm, b.x - 3 * s, b.y + 2, 6 * s, 26 * s);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#D9CBB0';
      ctx.beginPath();
      ctx.moveTo(b.x - 8 * s, b.y - 3 * s + bob);
      ctx.lineTo(b.x + 8 * s, b.y - 3 * s + bob);
      ctx.lineTo(b.x + 5 * s, b.y + bob);
      ctx.lineTo(b.x - 5 * s, b.y + bob);
      ctx.closePath();
      ctx.moveTo(b.x - 2 * s, b.y - 3 * s + bob);
      ctx.lineTo(b.x, b.y - 9 * s + bob);
      ctx.lineTo(b.x + 3 * s, b.y - 3 * s + bob);
      ctx.fill();
      ctx.fillStyle = '#FFE2A6';
      ctx.fillRect(b.x - 0.8 * s, b.y - 7 * s + bob, 1.6 * s, 2.4 * s);
    }
    this.flies.draw(ctx, t, dt, m, 0.8);
  }

  private shootingStar(ctx: CanvasRenderingContext2D, dt: number, m: number): void {
    const s = this.shoot;
    const { vis, rng, sky } = this.env;
    if (s.t < 0) {
      s.next -= dt;
      if (s.next <= 0 && m > 0.5) {
        s.t = 0;
        s.x = rng.range(vis.x0 + 100, vis.x1 - 100);
        s.y = rng.range(vis.y0 + 20, 260);
        const a = rng.range(0.25, 0.6) * (rng.chance(0.5) ? 1 : -1);
        s.dx = Math.sin(a) * 620;
        s.dy = Math.cos(a) * 300;
      }
      return;
    }
    s.t += dt;
    const life = 0.9;
    if (s.t > life) {
      s.t = -1;
      s.next = rng.range(6, 14);
      return;
    }
    const k = s.t / life;
    const hx = s.x + s.dx * s.t;
    const hy = s.y + s.dy * s.t;
    if (hy > sky.top(hx) - 6) return;
    const a = Math.sin(k * Math.PI);
    ctx.strokeStyle = '#F4F8FF';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = a * 0.9;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - s.dx * 0.12, hy - s.dy * 0.12);
    ctx.stroke();
    ctx.globalAlpha = a * 0.3;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - s.dx * 0.05, hy - s.dy * 0.05);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    this.mist.draw(ctx, this.env.vis, t, m);
  }
}

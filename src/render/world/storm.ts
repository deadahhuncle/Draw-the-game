// World 4 — Stormglass. A heavy ceiling of layered cloud, jagged peaks of dark crystal, rain slanting
// across everything, and lightning that now and then throws the whole range into silhouette.
import { H } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { mix, rgba } from './color';
import { Noise1D, TAU, billowSea, clearOfPlay, fibres, glow, glowSprite, makeCanvas, paintGlow, paintStars, softLayer, type Box } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const SKY = ['#05070B', '#0A0F16', '#111923', '#1B2632', '#283645', '#384A5D'];
const HORIZON = 560;

type P = { x: number; y: number };

interface Drop {
  x: number;
  y: number;
  l: number;
  v: number;
}

export class StormScene extends Scene {
  private ridges: P[][] = [];
  private rain: Drop[][] = [];
  private bolt: P[][] = [];
  private boltT = -1;
  private next = 2.5;
  private boltTop = { x: 0, y: 0 };
  private mist!: Mist;
  private scud: { x: number; y: number; w: number; v: number }[] = [];
  private scudC: HTMLCanvasElement | null = null;
  private glass: { x: number; y: number; r: number }[] = [];
  private cyan = glowSprite('#6FD8F0');
  private skyPath: Path2D | null = null;
  private cold = glowSprite('#BCD4FF');
  private wind = -0.22;

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng } = this.env;
    skyGradient(ctx, vis, SKY, HORIZON);
    // A pale band of distant light along the horizon: the peaks stand black against it.
    paintGlow(ctx, 640, HORIZON - 30, 1100, '#6A8098', 0.5, 0.22);
    paintStars(ctx, rng, { x0: vis.x0, y0: 380, x1: vis.x1, y1: 480 }, 22, '#DDE6F0', 0.35);
    // A moon smothered somewhere behind the cloud.
    const mx = rng.range(900, 1150);
    paintGlow(ctx, mx, 140, 380, '#8FA4BE', 0.24);

    softLayer(ctx, this.env, 3, (c) => {
      // Separate rolling clouds low on the horizon, far to near.
      const rolls = [
        { y: 450, n: 6, r: [22, 46], body: '#2E3E50', lit: '#5A7088' },
        { y: 395, n: 6, r: [28, 60], body: '#222F3E', lit: '#4A5E74' },
        { y: 330, n: 5, r: [34, 72], body: '#18222D', lit: '#3C4E62' },
      ];
      for (const L of rolls) {
        for (let i = 0; i < L.n; i++) {
          const x = rng.range(vis.x0 - 100, vis.x1 + 100);
          this.roll(c, rng, x, L.y + rng.range(-30, 30), rng.range(200, 460), L.r as [number, number], L.body, L.lit);
        }
      }
      // The overcast ceiling: two scalloped bands hanging from the top of the screen.
      this.ceiling(c, rng, vis, 215, [30, 66], '#121A23', '#1D2835', '#3A4D62');
      this.ceiling(c, rng, vis, 115, [24, 52], '#080C11', '#10171F', '#2C3C4E');
    });
    fibres(ctx, rng, vis, '#D6E2EE', 3, 0.028);
  }

  /** A lumpy cloud roll: one flat silhouette, a tonal gradient, a faint lit crown, dry-brush streaks. */
  private roll(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, w: number, r: [number, number], body: string, lit: string): void {
    const bumps: { x: number; y: number; r: number }[] = [];
    for (let bx = x - w / 2; bx < x + w / 2; bx += rng.range(r[0] * 0.7, r[0] * 1.3)) {
      const t = (bx - (x - w / 2)) / w;
      const rr = rng.range(r[0], r[1]) * (0.5 + 0.5 * Math.sin(t * Math.PI));
      bumps.push({ x: bx, y: y - rr * 0.35, r: rr });
    }
    const path = (dy: number) => {
      ctx.beginPath();
      for (const b of bumps) {
        ctx.moveTo(b.x + b.r, b.y + dy);
        ctx.arc(b.x, b.y + dy, b.r, 0, TAU);
      }
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - w, y - r[1] * 3, w * 2, r[1] * 3 + 4);
    ctx.clip();
    ctx.fillStyle = rgba(lit, 0.5);
    path(-1.5);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - r[1] * 1.3, 0, y + 4);
    g.addColorStop(0, mix(body, lit, 0.3));
    g.addColorStop(0.5, body);
    g.addColorStop(1, mix(body, '#000000', 0.3));
    ctx.fillStyle = g;
    path(1.5);
    ctx.fill();
    this.dryBrush(ctx, rng, x - w / 2, x + w / 2, y - r[1], y, lit);
    ctx.restore();
  }

  /** Faint horizontal dry-brush strokes (clipped by the caller's current path when needed). */
  private dryBrush(ctx: CanvasRenderingContext2D, rng: Rng, x0: number, x1: number, y0: number, y1: number, col: string): void {
    ctx.strokeStyle = rgba(col, 0.07);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < (x1 - x0) / 30; i++) {
      const y = rng.range(y0, y1);
      const xa = rng.range(x0, x1);
      const l = rng.range(30, 120);
      ctx.moveTo(xa, y);
      ctx.quadraticCurveTo(xa + l / 2, y + rng.range(-2, 2), xa + l, y + rng.range(-1, 1));
    }
    ctx.stroke();
  }

  /** Full-width overcast with a scalloped (mammatus) underside, lit faintly from below. */
  private ceiling(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, y: number, r: [number, number], top: string, body: string, lit: string): void {
    const bumps: { x: number; y: number; r: number }[] = [];
    const nz = new Noise1D(rng, 300, 2);
    for (let bx = vis.x0 - 60; bx < vis.x1 + 60; bx += rng.range(r[0] * 0.8, r[0] * 1.3)) {
      const rr = rng.range(r[0], r[1]);
      bumps.push({ x: bx, y: y + nz.at(bx) * 60 - rr * 0.2, r: rr });
    }
    const path = (dy: number) => {
      ctx.beginPath();
      for (const b of bumps) {
        ctx.rect(b.x - b.r, vis.y0 - 80, b.r * 2, b.y - vis.y0 + 80);
        ctx.moveTo(b.x + b.r, b.y + dy);
        ctx.arc(b.x, b.y + dy, b.r, 0, TAU);
      }
    };
    ctx.fillStyle = rgba(lit, 0.55);
    path(2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, vis.y0, 0, y + r[1]);
    g.addColorStop(0, top);
    g.addColorStop(0.7, top);
    g.addColorStop(1, body);
    ctx.fillStyle = g;
    path(0);
    ctx.fill();
    ctx.save();
    path(0);
    ctx.clip();
    this.dryBrush(ctx, rng, vis.x0, vis.x1, y - 80, y + 40, lit);
    ctx.restore();
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const bottom = Math.max(vis.y1 + 40, H + 100);

    // L1: far jagged range with glassy moonward faces.
    const r1 = this.jagged(rng, vis, 548, [70, 230], [34, 80]);
    this.paintRange(ctx, r1, bottom, mix('#1E2935', '#3A4D62', 0.3), '#8FB0C8', 0.09);
    sky.markPts(r1);
    this.hazeBand(ctx, vis, 490, 600, '#3E5268', 0.32);

    // L2: clustered crystal shards on a rocky shelf.
    const n2 = new Noise1D(rng, 240);
    const f2 = (x: number) => 596 - 26 * (0.5 + n2.at(x));
    const c2 = '#1E2A38';
    const shelf: P[] = [];
    for (let x = vis.x0 - 20; x <= vis.x1 + 20; x += 8) shelf.push({ x, y: f2(x) });
    const tips: P[] = [];
    for (let i = 0; i < 9; i++) {
      const cx = rng.range(vis.x0, vis.x1);
      const cnt = rng.int(2, 5);
      for (let j = 0; j < cnt; j++) {
        const x = cx + rng.range(-40, 40);
        const h = rng.range(40, 150) * (j === 0 ? 1.2 : 0.8);
        const sw = rng.range(14, 30);
        const tip = this.shard(ctx, x, f2(x) + 8, h, sw, rng.range(-0.25, 0.25), c2, '#9FD8F0', 0.1);
        tips.push(tip);
        sky.markPeak(x - sw / 2, x + sw / 2, tip.x, tip.y, f2(x) + 8);
      }
    }
    // A few clusters of stormglass hold a faint cold light of their own.
    for (let i = 0; i < 3; i++) {
      const x = rng.range(vis.x0 + 60, vis.x1 - 60);
      const y = f2(x) + 6;
      paintGlow(ctx, x, y - 30, 90, '#6FD8F0', 0.22, 0.8);
      for (let j = 0; j < rng.int(3, 6); j++) {
        const sx = x + rng.range(-26, 26);
        const h = rng.range(24, 70);
        const gw = rng.range(8, 16);
        const tip = this.shard(ctx, sx, y + 4, h, gw, rng.range(-0.3, 0.3), mix('#1E3A4A', '#6FD8F0', 0.25), '#CFF4FF', 0.45);
        sky.markPeak(sx - gw / 2, sx + gw / 2, tip.x, tip.y, y + 4);
        this.glass.push({ x: sx, y: y - h * 0.5, r: h * 0.6 });
      }
    }
    ctx.beginPath();
    ctx.moveTo(shelf[0].x, bottom);
    for (const q of shelf) ctx.lineTo(q.x, q.y);
    ctx.lineTo(shelf[shelf.length - 1].x, bottom);
    ctx.fillStyle = c2;
    ctx.fill();
    sky.markPts(shelf);
    this.ridges.push(r1, shelf);
    this.hazeBand(ctx, vis, 560, 640, '#3A4D62', 0.5);

    // L3: near dark mounds with a few big shards.
    const n3 = new Noise1D(rng, 320);
    const f3 = (x: number) => 640 - 30 * (0.5 + n3.at(x));
    const c3 = '#18222E';
    for (let i = 0; i < 3; i++) {
      const x = rng.range(vis.x0, vis.x1);
      const bw = rng.range(26, 44);
      if (!clearOfPlay(this.env, { x0: x - bw, y0: f3(x) - 170, x1: x + bw, y1: f3(x) - 40 }, 16)) continue;
      const tip = this.shard(ctx, x, f3(x) + 10, rng.range(90, 170), bw, rng.range(-0.2, 0.2), c3, '#BFE6F6', 0.12);
      sky.markPeak(x - bw / 2, x + bw / 2, tip.x, tip.y, f3(x) + 10);
    }
    const r3: P[] = [];
    for (let x = vis.x0 - 20; x <= vis.x1 + 20; x += 8) r3.push({ x, y: f3(x) });
    ctx.beginPath();
    ctx.moveTo(r3[0].x, bottom);
    for (const q of r3) ctx.lineTo(q.x, q.y);
    ctx.lineTo(r3[r3.length - 1].x, bottom);
    ctx.fillStyle = c3;
    ctx.fill();

    // The void: a churning, rain-grey fog.
    softLayer(ctx, this.env, 2, (c) => billowSea(c, rng, vis, 650, 4, '#6E8298', '#3A4A5C', 0.5));
    const vg = ctx.createLinearGradient(0, 690, 0, bottom);
    vg.addColorStop(0, rgba('#4C6076', 0));
    vg.addColorStop(1, rgba('#1A2531', 0.9));
    ctx.fillStyle = vg;
    ctx.fillRect(vis.x0 - 20, 690, vis.x1 - vis.x0 + 40, bottom - 690);
  }

  private jagged(rng: Rng, vis: Box, base: number, peak: [number, number], step: [number, number]): P[] {
    const pts: P[] = [];
    let x = vis.x0 - 60;
    let up = true;
    while (x < vis.x1 + 60) {
      if (up) pts.push({ x, y: base - rng.range(peak[0], peak[1]) });
      else pts.push({ x, y: base - rng.range(10, peak[0] * 0.8) });
      // An occasional shoulder on the way down.
      if (up && rng.chance(0.4)) pts.push({ x: x + rng.range(8, 16), y: pts[pts.length - 1].y + rng.range(14, 30) });
      x += rng.range(step[0], step[1]);
      up = !up;
    }
    return pts;
  }

  private paintRange(ctx: CanvasRenderingContext2D, r: P[], bottom: number, col: string, lit: string, litA: number): void {
    ctx.beginPath();
    ctx.moveTo(r[0].x, bottom);
    for (const q of r) ctx.lineTo(q.x, q.y);
    ctx.lineTo(r[r.length - 1].x, bottom);
    ctx.fillStyle = col;
    ctx.fill();
    // Facets: the moonward (right) face of each peak catches a cold light.
    ctx.fillStyle = rgba(lit, litA);
    ctx.beginPath();
    for (let i = 1; i < r.length - 1; i++) {
      const q = r[i];
      if (q.y < r[i - 1].y && q.y < r[i + 1].y) {
        const nx = r[i + 1];
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(nx.x, nx.y);
        ctx.lineTo(q.x + (nx.x - q.x) * 0.3, q.y + (bottom - q.y) * 0.35);
        ctx.closePath();
      }
    }
    ctx.fill();
    ctx.strokeStyle = rgba(lit, litA * 1.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < r.length - 1; i++) {
      const q = r[i];
      if (q.y < r[i - 1].y && q.y < r[i + 1].y) {
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(r[i + 1].x, r[i + 1].y);
      }
    }
    ctx.stroke();
  }

  /** One crystal shard: two faces and a glinting edge. Returns its tip. */
  private shard(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, tilt: number, col: string, glint: string, a: number): P {
    const tip = { x: x + tilt * h, y: y - h };
    const ls = { x: x - w / 2 + tilt * h * 0.78, y: y - h * 0.78 };
    const rs = { x: x + w / 2 + tilt * h * 0.8, y: y - h * 0.8 };
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(ls.x, ls.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.lineTo(x + w / 2, y);
    ctx.closePath();
    ctx.fill();
    // Lit face.
    const mid = { x: x + w * 0.08 + tilt * h * 0.8, y: y - h * 0.8 };
    ctx.fillStyle = rgba(glint, a * 0.45);
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w * 0.08, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(glint, a * 1.6);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.lineTo(x + w / 2, y);
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(mid.x, mid.y);
    ctx.lineTo(x + w * 0.08, y);
    ctx.stroke();
    return tip;
  }

  private hazeBand(ctx: CanvasRenderingContext2D, vis: Box, y0: number, y1: number, col: string, a: number): void {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(col, a));
    ctx.fillStyle = g;
    ctx.fillRect(vis.x0 - 20, y0, vis.x1 - vis.x0 + 40, y1 - y0);
  }

  override initLive(): void {
    const { rng, vis } = this.env;
    const layers = [
      { n: 70, l: [14, 24], v: [700, 900] },
      { n: 46, l: [22, 36], v: [1000, 1300] },
    ];
    for (const L of layers) {
      const arr: Drop[] = [];
      for (let i = 0; i < L.n; i++) arr.push({ x: rng.range(vis.x0, vis.x1), y: rng.range(vis.y0, vis.y1), l: rng.range(L.l[0], L.l[1]), v: rng.range(L.v[0], L.v[1]) });
      this.rain.push(arr);
    }
    this.mist = new Mist('#71869C', this.env.seed, { strength: 0.8, speed: 1.6 });
    // Low scud: dark rags of cloud racing across under the ceiling.
    const c = makeCanvas(160, 48);
    const g = c.getContext('2d')!;
    for (let i = 0; i < 7; i++) {
      const x = 30 + i * 16 + rng.range(-6, 6);
      const y = 24 + rng.range(-3, 3);
      g.save();
      g.translate(x, y);
      g.scale(1, 0.6);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 26);
      gr.addColorStop(0, 'rgba(14,20,27,0.5)');
      gr.addColorStop(1, 'rgba(14,20,27,0)');
      g.fillStyle = gr;
      g.fillRect(-28, -28, 56, 56);
      g.restore();
    }
    this.scudC = c;
    this.skyPath = this.env.sky.path(vis);
    for (let i = 0; i < 5; i++) this.scud.push({ x: rng.range(vis.x0, vis.x1), y: rng.range(150, 330), w: rng.range(180, 360), v: rng.range(14, 30) });
  }

  /** Flash envelope: a strike, a breath, a second fainter strike. */
  private envelope(t: number, m: number): number {
    const a = t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 13);
    const b = m > 0.5 && t > 0.2 ? (t < 0.24 ? (t - 0.2) / 0.04 : Math.exp(-(t - 0.24) * 8)) * 0.7 : 0;
    return Math.min(1, a + b) * (m > 0.5 ? 1 : 0.3);
  }

  private strike(): void {
    const { rng, vis, sky } = this.env;
    const x = rng.range(vis.x0 + 80, vis.x1 - 80);
    const y0 = rng.range(150, 230);
    const y1 = Math.min(sky.top(x) + 6, 580);
    const main: P[] = [{ x, y: y0 }];
    let cx = x;
    let cy = y0;
    while (cy < y1) {
      cy = Math.min(y1, cy + rng.range(10, 26));
      cx += rng.range(-16, 16);
      main.push({ x: cx, y: cy });
    }
    this.bolt = [main];
    for (let b = 0; b < 3; b++) {
      const from = main[rng.int(1, Math.max(2, main.length - 2))];
      const br: P[] = [{ ...from }];
      const dir = rng.chance(0.5) ? 1 : -1;
      let bx = from.x;
      let by = from.y;
      for (let k = 0; k < rng.int(3, 7); k++) {
        bx += dir * rng.range(6, 20);
        by += rng.range(8, 20);
        br.push({ x: bx, y: by });
      }
      this.bolt.push(br);
    }
    this.boltTop = { x, y: y0 };
    this.boltT = 0;
    this.state.strikes++;
  }

  /** Scud, lightning and its flash — all confined to the open sky above the far silhouettes. */
  private weather(ctx: CanvasRenderingContext2D, dt: number, m: number): void {
    const { vis, rng } = this.env;
    if (this.scudC) {
      for (const s of this.scud) {
        s.x -= s.v * dt * (0.3 + 0.7 * m);
        if (s.x < vis.x0 - s.w) s.x = vis.x1 + 20;
        ctx.drawImage(this.scudC, s.x, s.y, s.w, s.w * 0.3);
      }
    }
    this.next -= dt;
    if (this.next <= 0 && this.boltT < 0) {
      this.strike();
      this.next = rng.range(5.5, 12) * (m > 0.5 ? 1 : 1.6);
    }
    if (this.boltT < 0) {
      this.state.flash = 0;
      return;
    }
    this.boltT += dt;
    const f = this.envelope(this.boltT, m);
    this.state.flash = f;
    if (this.boltT > 1.1) {
      this.boltT = -1;
      this.state.flash = 0;
      return;
    }
    ctx.save();
    if (this.skyPath) ctx.clip(this.skyPath);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba('#8FA8CC', f * 0.3);
    ctx.fillRect(vis.x0 - 20, vis.y0 - 20, vis.x1 - vis.x0 + 40, vis.y1 - vis.y0 + 40);
    ctx.globalAlpha = f * 0.7;
    glow(ctx, this.cold, this.boltTop.x, this.boltTop.y, 460);
    ctx.globalAlpha = 1;
    // The bolt itself (only on the bright beats).
    if (f > 0.15) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [w, col, a] of [
        [8, '#7FA6FF', 0.28],
        [3.2, '#CFE0FF', 0.6],
        [1.3, '#FFFFFF', 1],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.globalAlpha = Math.min(1, f * a * (m > 0.5 ? 1 : 0.6));
        this.bolt.forEach((line, i) => {
          if (i > 0) ctx.lineWidth = w * 0.55;
          ctx.beginPath();
          line.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  override live(ctx: CanvasRenderingContext2D, _t: number, dt: number, m: number): void {
    this.weather(ctx, dt, m);
    const f = this.state.flash;
    const { vis } = this.env;
    // Lightning rims every crest for an instant.
    if (f > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#CFE2F5', f * 0.55);
      ctx.lineWidth = 1.4;
      for (const r of this.ridges) {
        ctx.beginPath();
        r.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Stormglass breathes, and flares when the lightning hits.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.glass.length; i++) {
      const g = this.glass[i];
      ctx.globalAlpha = 0.12 + 0.08 * Math.sin(_t * 0.9 + i * 1.7) + f * 0.5;
      glow(ctx, this.cyan, g.x, g.y, g.r);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Background rain, two depths.
    const sp = 0.3 + 0.7 * m;
    this.rain.forEach((layer, li) => {
      ctx.strokeStyle = li ? '#B8CCE0' : '#93A8BE';
      ctx.globalAlpha = (li ? 0.2 : 0.12) + f * 0.25;
      ctx.lineWidth = li ? 1.1 : 0.8;
      ctx.beginPath();
      for (const d of layer) {
        d.y += d.v * dt * sp;
        d.x += d.v * this.wind * dt * sp;
        if (d.y > vis.y1 + 20) {
          d.y = vis.y0 - 30;
          d.x += (vis.y1 - vis.y0) * -this.wind;
        }
        if (d.x < vis.x0 - 40) d.x += vis.x1 - vis.x0 + 80;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * this.wind, d.y - d.l);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    const { vis } = this.env;
    this.mist.draw(ctx, vis, t, m);
    const f = this.state.flash;
    if (f > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#A8C0E0', f * 0.07);
      ctx.fillRect(vis.x0 - 20, vis.y0 - 20, vis.x1 - vis.x0 + 40, vis.y1 - vis.y0 + 40);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

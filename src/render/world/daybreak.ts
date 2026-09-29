// World 6 — Daybreak Spires. Folded-paper towers rising out of a sea of cloud; the sky blushes from
// indigo to rose to gold, and the sun climbs a little higher with every level. On the journey's last
// lamp the whole sky turns to morning.
import { H } from '../../core/constants';
import type { Rng } from '../../core/rng';
import { mix, ramp, rgba } from './color';
import { Flock, MoteField, TAU, TwinkleField, clamp, clearOfPlay, fibres, glow, glowSprite, lerp, makeCanvas, paintGlow, paintStars, softLayer, streak, washCloud, widestOpening, type Box } from './kit';
import { Mist, Scene, skyGradient } from './scene';

const PREDAWN = ['#131230', '#281F4E', '#523265', '#934A72', '#D06C78', '#EF9C84'];
const DAWN = ['#1F2656', '#40356C', '#834C7A', '#D8767C', '#F7A684', '#FFD29C'];
const MORNING = ['#5875AE', '#8EA5D0', '#C9B7CC', '#F4C6AE', '#FFDDB4', '#FFEDCC'];
const HORIZON = 604;

type P = { x: number; y: number };

export class DaybreakScene extends Scene {
  private sun = { x: 700, y0: 700, y: 700, r: 96 };
  private d = 0;
  private morning: HTMLCanvasElement | null = null;
  private sunDisc: HTMLCanvasElement | null = null;
  private rays: HTMLCanvasElement | null = null;
  private halo = glowSprite('#FFB27A');
  private gold = glowSprite('#FFD9A0');
  private lamps: { x: number; y: number; ph: number }[] = [];
  private stars!: TwinkleField;
  private birds!: Flock;
  private finaleBirds: Flock | null = null;
  private dust!: MoteField;
  private mist!: Mist;

  paintSky(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, progress } = this.env;
    // Only the finale needs the sun live between the layers (it rises); elsewhere it is baked in.
    this.split = this.env.finale;
    const d = (this.d = clamp(progress, 0, 1));
    this.sun.x = widestOpening(this.env, 120, 320, 1000) ?? 700 + rng.range(-40, 40);
    this.sun.y0 = this.sun.y = lerp(716, 598, d);
    const stops = PREDAWN.map((c, i) => mix(c, DAWN[i], d));
    skyGradient(ctx, vis, stops, HORIZON);
    paintStars(ctx, rng, { x0: vis.x0, y0: vis.y0, x1: vis.x1, y1: 360 }, Math.round(120 * (1 - d * 0.8)), '#FFF0F4', 0.7 * (1 - d * 0.6), 360);
    // The coming sun warms the horizon (the disc itself is drawn live, between the layers).
    paintGlow(ctx, this.sun.x, HORIZON, 1100, mix('#F08A7A', '#FFB47E', d), 0.35 + 0.25 * d, 0.3);
    paintGlow(ctx, this.sun.x, HORIZON, 420, '#FFD3A0', 0.25 + 0.3 * d, 0.5);
    if (!this.split) this.paintSun(ctx, 1);
    this.clouds(ctx, rng, vis, d, stops);
    fibres(ctx, rng, vis, '#FFE8E0', 3, 0.03);
    if (this.env.finale) this.paintMorning(rng);
  }

  private clouds(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, d: number, stops: string[]): void {
    softLayer(ctx, this.env, 3, (c) => {
      for (let i = 0; i < 8; i++) {
        const y = rng.range(100, 480);
        const k = (y - 100) / 380;
        washCloud(c, rng, rng.range(vis.x0 - 100, vis.x1 + 100), y, rng.range(300, 820), rng.range(10, 22), mix(ramp(stops, k * 0.6 + 0.1), '#2A1E48', 0.3), 0.5, mix('#FF9A86', '#FFD6A0', d * 0.7 + k * 0.3), 0.3 + 0.35 * k);
      }
    });
    for (let i = 0; i < 3; i++) {
      const y = rng.range(160, 440);
      const k = (y - 160) / 280;
      streak(ctx, rng.range(vis.x0, vis.x1), y, rng.range(200, 480), rng.range(3, 5), rgba(mix('#4A2A5C', '#B85A72', k), 0.5), mix('#FF9A86', '#FFD6A0', d), 0.4, rng);
    }
  }

  /** The sun (halo + disc) painted straight into the sky cache. */
  private paintSun(ctx: CanvasRenderingContext2D, a: number): void {
    const s = this.sun;
    paintGlow(ctx, s.x, s.y, s.r * 4.2, '#FFB27A', (0.35 + 0.25 * this.d) * a);
    const g = ctx.createRadialGradient(s.x - s.r * 0.15, s.y - s.r * 0.2, s.r * 0.05, s.x, s.y, s.r);
    g.addColorStop(0, '#FFFBEA');
    g.addColorStop(0.6, '#FFE6B4');
    g.addColorStop(0.92, '#FFC98A');
    g.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }

  /** The finale's morning sky, painted once into its own world-aligned layer. */
  private paintMorning(rng: Rng): void {
    const { vis, px } = this.env;
    const w = vis.x1 - vis.x0;
    const h = vis.y1 - vis.y0;
    const c = makeCanvas(w * px, h * px);
    const g = c.getContext('2d')!;
    g.setTransform(px, 0, 0, px, -vis.x0 * px, -vis.y0 * px);
    skyGradient(g, vis, MORNING, HORIZON);
    paintGlow(g, this.sun.x, 360, 1200, '#FFE2B0', 0.5, 0.6);
    for (let i = 0; i < 7; i++) {
      const y = rng.range(90, 450);
      streak(g, rng.range(vis.x0, vis.x1), y, rng.range(260, 700), rng.range(8, 18), rgba('#FFFFFF', 0.4), '#FFE3B8', 0.6, rng);
    }
    this.morning = c;
  }

  paintFar(ctx: CanvasRenderingContext2D): void {
    const { vis, rng, sky } = this.env;
    const d = this.d;
    const bottom = Math.max(vis.y1 + 40, H + 120);
    const sunX = this.sun.x;
    const layers = [
      { base: 624, n: 5, h: [130, 290], w: [16, 30], dark: mix('#96597C', '#B77084', d), lit: mix('#BC7488', '#E89A80', d), win: 0.2 },
      { base: 664, n: 4, h: [150, 280], w: [26, 44], dark: mix('#6A3866', '#86466C', d), lit: mix('#A65C7A', '#D8807A', d), win: 0.45 },
      { base: 732, n: 2, h: [230, 360], w: [40, 62], dark: mix('#4A2850', '#5E3056', d), lit: mix('#8A4C6C', '#B2626C', d), win: 0.7 },
    ];
    const rows = [
      { y: 616, r: [18, 40], rim: mix('#FFB39A', '#FFE1B0', d), body: mix('#B8657E', '#E09088', d), shade: mix('#83486E', '#A8617A', d) },
      { y: 654, r: [26, 58], rim: mix('#FFA894', '#FFD8A8', d), body: mix('#9A5474', '#C9787E', d), shade: mix('#673A62', '#8A4C6C', d) },
      { y: 712, r: [34, 78], rim: mix('#F09486', '#FFC89C', d), body: mix('#76406A', '#A5607A', d), shade: mix('#4A2848', '#63365A', d) },
    ];
    layers.forEach((L, li) => {
      // Clusters of spires, tallest in the middle of each — a skyline, not a fence.
      const xs: number[] = [];
      const hs: number[] = [];
      const slot = (vis.x1 - vis.x0 + 60) / L.n;
      for (let c = 0; c < L.n; c++) {
        const cx = vis.x0 - 30 + slot * (c + 0.5) + rng.range(-slot * 0.3, slot * 0.3);
        const cnt = li === 2 ? 1 : rng.int(1, 4);
        const tall = rng.range(L.h[0], L.h[1]);
        for (let k = 0; k < cnt; k++) {
          const off = (k - (cnt - 1) / 2) * rng.range(L.w[1] * 1.1, L.w[1] * 1.8);
          xs.push(cx + off);
          hs.push(tall * (1 - Math.abs(k - (cnt - 1) / 2) * rng.range(0.2, 0.35)));
        }
      }
      const order = xs.map((_, i) => i).sort((a, b) => hs[b] - hs[a]);
      const tops: P[] = [];
      for (const i of order) {
        const tw = rng.range(L.w[0], L.w[1]);
        // The nearest spires keep clear of platforms so they never read as walkable.
        if (li === 2 && !clearOfPlay(this.env, { x0: xs[i] - tw, y0: L.base - hs[i], x1: xs[i] + tw, y1: L.base - 60 }, 20)) {
          tops[i] = { x: xs[i], y: L.base };
          continue;
        }
        tops[i] = this.tower(ctx, rng, xs[i], L.base, hs[i], tw, L.dark, L.lit, xs[i] < sunX, L.win, li);
      }
      const byX = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
      const sx = byX.map((i) => xs[i]);
      const st = byX.map((i) => tops[i]);
      // Paper bridges strung between neighbours.
      for (let i = 0; i < sx.length - 1; i++) {
        if (sx[i + 1] - sx[i] > 240 || sx[i + 1] - sx[i] < 30 || rng.chance(0.45)) continue;
        const y = Math.max(st[i].y, st[i + 1].y) + rng.range(30, 110);
        this.bridge(ctx, rng, sx[i], sx[i + 1], y, L.dark, L.lit, li);
      }
      const R = rows[li];
      this.cloudRow(ctx, rng, vis, R.y, R.r as [number, number], R.rim, R.body, R.shade, bottom);
      sky.mark(vis.x0 - 50, vis.x1 + 50, R.y - R.r[1] * 0.6);
    });
    // The deep void under the cloud sea.
    const vg = ctx.createLinearGradient(0, 700, 0, bottom);
    vg.addColorStop(0, rgba(mix('#5A3058', '#7E4668', d), 0));
    vg.addColorStop(1, rgba(mix('#3A1E3E', '#50284A', d), 0.9));
    ctx.fillStyle = vg;
    ctx.fillRect(vis.x0 - 20, 700, vis.x1 - vis.x0 + 40, bottom - 700);
  }

  /**
   * A folded-paper spire: a three-faced prism (shadow / mid / sunlit) creased like origami, crowned with
   * a needle, a stack of flared pagoda roofs or a paper-lantern bulb, pricked with lantern windows.
   */
  private tower(ctx: CanvasRenderingContext2D, rng: Rng, x: number, base: number, h: number, w: number, dark: string, lit: string, litRight: boolean, winChance: number, layer: number): P {
    const { sky } = this.env;
    const mid = mix(dark, lit, 0.45);
    const kinds = layer === 0 ? ['needle', 'needle', 'pagoda', 'dome'] : ['needle', 'pagoda', 'pagoda', 'dome'];
    const kind = rng.pick(kinds);
    const bodyFrac = kind === 'needle' ? rng.range(0.55, 0.68) : kind === 'pagoda' ? rng.range(0.42, 0.52) : rng.range(0.62, 0.74);
    const top = base - h * bodyFrac;
    const tw = w * 0.8;
    const sideL = litRight ? dark : lit;
    const sideR = litRight ? lit : dark;
    // Prism body: three faces with a slight taper.
    const face = (u0: number, u1: number, col: string) => {
      const bx0 = x - w / 2 + w * u0;
      const bx1 = x - w / 2 + w * u1;
      const tx0 = x - tw / 2 + tw * u0;
      const tx1 = x - tw / 2 + tw * u1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx0, base);
      ctx.lineTo(tx0, top);
      ctx.lineTo(tx1 + 0.3, top);
      ctx.lineTo(bx1 + 0.3, base);
      ctx.closePath();
      ctx.fill();
    };
    face(0, 0.3, sideL);
    face(0.3, 0.7, mid);
    face(0.7, 1, sideR);
    ctx.strokeStyle = rgba(mix(dark, '#000000', 0.35), 0.5);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const u of [0.3, 0.7]) {
      ctx.moveTo(x - w / 2 + w * u, base);
      ctx.lineTo(x - tw / 2 + tw * u, top);
    }
    // Fold bands: the paper steps in at each storey.
    const storeys = Math.max(1, Math.floor((base - top) / rng.range(34, 52)));
    for (let i = 1; i <= storeys; i++) {
      const y = base - ((base - top) * i) / (storeys + 1);
      const k = (base - y) / (base - top);
      const hw = w / 2 + (tw / 2 - w / 2) * k;
      ctx.moveTo(x - hw, y);
      ctx.lineTo(x + hw, y);
    }
    ctx.stroke();
    // Lantern windows on the middle face.
    for (let r = 1; r <= storeys; r++) {
      if (!rng.chance(0.6)) continue;
      const y = base - ((base - top) * (r - 0.5)) / (storeys + 1);
      const lw = Math.max(1.6, w * 0.1);
      const lh = lw * 1.8;
      const on = rng.chance(winChance);
      ctx.fillStyle = on ? '#FFD9A0' : rgba('#1E0F24', 0.5);
      ctx.beginPath();
      ctx.moveTo(x - lw / 2, y + lh / 2);
      ctx.lineTo(x - lw / 2, y - lh / 4);
      ctx.arc(x, y - lh / 4, lw / 2, Math.PI, 0);
      ctx.lineTo(x + lw / 2, y + lh / 2);
      ctx.closePath();
      ctx.fill();
      if (on) this.lamps.push({ x, y, ph: rng.range(0, TAU) });
    }
    // Crown.
    const edge = rgba('#FFD6A6', 0.22 + layer * 0.12);
    let apex = top;
    const roof = (y: number, rw: number, rh: number, flare: number) => {
      // A flared, folded roof: two faces meeting at a crease, eaves curling up at the tips.
      for (const side of [-1, 1]) {
        ctx.fillStyle = (side < 0) === litRight ? dark : lit;
        ctx.beginPath();
        ctx.moveTo(x, y - rh);
        ctx.quadraticCurveTo(x + side * rw * 0.45, y - rh * 0.35, x + side * rw, y + flare * 0.2);
        ctx.lineTo(x + side * rw * 1.08, y - flare);
        ctx.quadraticCurveTo(x + side * rw * 0.7, y + flare * 0.6, x, y + flare * 0.9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.8 + layer * 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y - rh);
      ctx.quadraticCurveTo(x + (litRight ? 1 : -1) * rw * 0.45, y - rh * 0.35, x + (litRight ? 1 : -1) * rw, y + flare * 0.2);
      ctx.stroke();
    };
    if (kind === 'needle') {
      roof(top + 2, tw / 2 + w * 0.18, w * 0.35, w * 0.12);
      const nh = h - (base - top);
      for (const side of [-1, 1]) {
        ctx.fillStyle = (side < 0) === litRight ? dark : lit;
        ctx.beginPath();
        ctx.moveTo(x, top - nh);
        ctx.lineTo(x + side * tw * 0.3, top - w * 0.2);
        ctx.lineTo(x, top - w * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      apex = top - nh;
    } else if (kind === 'pagoda') {
      const tiers = rng.int(2, 4);
      let y = top + 2;
      let rw = tw / 2 + w * 0.3;
      const seg = (h - (base - top)) / tiers;
      for (let i = 0; i < tiers; i++) {
        roof(y, rw, seg * 0.55, w * 0.14);
        // A narrower storey above each roof (drawn under the next roof).
        if (i < tiers - 1) {
          const sw = Math.max(4, rw * 0.62);
          const sy = y - seg * 0.95;
          const sh = seg * 0.62;
          ctx.fillStyle = litRight ? dark : lit;
          ctx.fillRect(x - sw / 2, sy, sw / 2 + 0.3, sh);
          ctx.fillStyle = litRight ? lit : dark;
          ctx.fillRect(x, sy, sw / 2, sh);
          ctx.fillStyle = '#FFD9A0';
          if (rng.chance(winChance)) {
            ctx.fillRect(x - 1, sy + sh * 0.35, 2, sh * 0.35);
            this.lamps.push({ x, y: sy + sh * 0.5, ph: rng.range(0, TAU) });
          }
        }
        y -= seg;
        rw *= 0.72;
      }
      apex = y + seg * 0.45;
    } else {
      // Paper-lantern bulb with a point.
      const bw = w * rng.range(0.6, 0.8);
      const bh = w * rng.range(0.9, 1.3);
      for (const side of [-1, 1]) {
        ctx.fillStyle = (side < 0) === litRight ? dark : lit;
        ctx.beginPath();
        ctx.moveTo(x, top + 1);
        ctx.lineTo(x + side * tw * 0.5, top + 1);
        ctx.bezierCurveTo(x + side * bw * 1.1, top - bh * 0.3, x + side * bw * 0.4, top - bh * 0.75, x, top - bh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = rgba(mix(dark, '#000000', 0.3), 0.5);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const k of [0.35, 0.65]) {
        ctx.moveTo(x - bw * 0.85 * Math.sin(k * Math.PI), top - bh * k * 0.8);
        ctx.lineTo(x + bw * 0.85 * Math.sin(k * Math.PI), top - bh * k * 0.8);
      }
      ctx.stroke();
      apex = top - bh;
    }
    // Finial & pennant.
    const fy = apex - rng.range(8, 16) - layer * 3;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 + layer * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, apex + 2);
    ctx.lineTo(x, fy);
    ctx.stroke();
    if (rng.chance(0.55)) {
      const dir = rng.chance(0.75) ? 1 : -1;
      ctx.fillStyle = rng.chance(0.5) ? rgba('#FFCFA0', 0.75) : lit;
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.quadraticCurveTo(x + dir * 7, fy + 1, x + dir * (12 + layer * 4), fy + 3);
      ctx.lineTo(x, fy + 6 + layer);
      ctx.closePath();
      ctx.fill();
    }
    sky.mark(x - w / 2, x + w / 2, top);
    sky.mark(x - w * 0.3, x + w * 0.3, apex);
    sky.mark(x - 3, x + 3, fy);
    return { x, y: top };
  }

  private bridge(ctx: CanvasRenderingContext2D, rng: Rng, a: number, b: number, y: number, dark: string, lit: string, layer: number): void {
    const sag = (b - a) * rng.range(0.08, 0.16);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2 + layer;
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.quadraticCurveTo((a + b) / 2, y + sag * 2, b, y);
    ctx.stroke();
    ctx.strokeStyle = rgba(lit, 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(a, y - 1);
    ctx.quadraticCurveTo((a + b) / 2, y + sag * 2 - 1, b, y - 1);
    ctx.stroke();
    // Tiny paper lanterns strung under it.
    for (let t = 0.2; t < 0.85; t += rng.range(0.14, 0.24)) {
      const lx = a + (b - a) * t;
      const ly = y + sag * 2 * 2 * t * (1 - t) * 2 + 4;
      ctx.fillStyle = '#FFCB8A';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 1.6 + layer * 0.6, 2.2 + layer * 0.8, 0, 0, TAU);
      ctx.fill();
      this.lamps.push({ x: lx, y: ly, ph: rng.range(0, TAU) });
    }
  }

  /** A row of cloud billows: backlit rims on top, shaded bellies, solid below. */
  private cloudRow(ctx: CanvasRenderingContext2D, rng: Rng, vis: Box, y: number, r: [number, number], rim: string, body: string, shade: string, bottom: number): void {
    const bumps: { x: number; y: number; r: number }[] = [];
    for (let x = vis.x0 - 60; x < vis.x1 + 60; x += rng.range(r[0] * 0.9, r[0] * 1.5)) {
      const rr = rng.range(r[0], r[1]);
      bumps.push({ x, y: y + rng.range(-8, 8) + rr * 0.35, r: rr });
    }
    const path = (dy: number) => {
      ctx.beginPath();
      ctx.rect(vis.x0 - 80, y + r[1] * 0.4 + dy, vis.x1 - vis.x0 + 160, bottom - y);
      for (const b of bumps) {
        ctx.moveTo(b.x + b.r, b.y + dy);
        ctx.arc(b.x, b.y + dy, b.r, 0, TAU);
      }
    };
    ctx.fillStyle = rim;
    path(0);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - r[1] * 0.4, 0, y + r[1] * 1.6);
    g.addColorStop(0, body);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    path(3);
    ctx.fill();
    // Soft inner billows so the rows are not flat.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = rim;
    for (const b of bumps) {
      if (!rng.chance(0.4)) continue;
      ctx.beginPath();
      ctx.arc(b.x + rng.range(-b.r * 0.3, b.r * 0.3), b.y + b.r * 0.7, b.r * 0.55, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rim;
      ctx.stroke();
    }
    ctx.restore();
  }

  override initLive(): void {
    const { vis, px } = this.env;
    const r = this.sun.r;
    // Sun disc sprite.
    const s = Math.ceil(r * 2.2 * px);
    const c = makeCanvas(s, s);
    const g = c.getContext('2d')!;
    g.scale(px, px);
    const cx = r * 1.1;
    const gr = g.createRadialGradient(cx - r * 0.15, cx - r * 0.2, r * 0.05, cx, cx, r);
    gr.addColorStop(0, '#FFFBEA');
    gr.addColorStop(0.6, '#FFE6B4');
    gr.addColorStop(0.92, '#FFC98A');
    gr.addColorStop(1, 'rgba(255,190,130,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cx, r, 0, TAU);
    g.fill();
    this.sunDisc = c;
    if (this.env.finale) this.rays = raysSprite();
    this.stars = new TwinkleField(this.env, 30, 340, '#FFF0F4');
    this.birds = new Flock(this.env, '#3C2244', [140, 360], 4);
    this.dust = new MoteField(this.env, { color: '#FFD9A0', count: 18, y0: 300, y1: vis.y1, vx: [-5, 5], vy: [-8, -2], r: [0.8, 1.6], halo: 4, blink: 0, sway: 8 });
    this.mist = new Mist(mix('#E8A2A0', '#FFCBA8', this.d), this.env.seed, { strength: 0.75, speed: 0.8 });
    if (this.lamps.length > 48) this.lamps = this.lamps.filter((_, i) => i % Math.ceil(this.lamps.length / 48) === 0);
  }

  /** Finale progress 0..1 (eased), or 0 when not playing. */
  private get dawnK(): number {
    const f = this.state.finale;
    if (f < 0) return 0;
    const t = clamp((f - 0.35) / 5.5, 0, 1);
    return t * t * (3 - 2 * t);
  }

  override liveSky(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    const { vis } = this.env;
    const k = this.dawnK;
    if (k > 0 && this.morning) {
      ctx.globalAlpha = k;
      ctx.drawImage(this.morning, vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
      ctx.globalAlpha = 1;
    }
    this.stars.draw(ctx, t, (1 - this.d * 0.7) * (1 - k), m);
    if (!this.split) return;
    const s = this.sun;
    s.y = lerp(s.y0, 390, k);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.5 + 0.3 * this.d) * (1 - 0.45 * k);
    glow(ctx, this.halo, s.x, s.y, s.r * (4.2 + k * 1.5));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.sunDisc) ctx.drawImage(this.sunDisc, s.x - s.r * 1.1, s.y - s.r * 1.1, s.r * 2.2, s.r * 2.2);
  }

  override live(ctx: CanvasRenderingContext2D, t: number, dt: number, m: number): void {
    const k = this.dawnK;
    const s = this.sun;
    ctx.globalCompositeOperation = 'lighter';
    // The towers' lanterns go out as the morning comes.
    const tt = t * (0.35 + 0.65 * m);
    for (const l of this.lamps) {
      ctx.globalAlpha = (0.35 + 0.2 * Math.sin(tt * 2.3 + l.ph)) * (1 - k);
      glow(ctx, this.gold, l.x, l.y, 7);
    }
    if (k > 0) {
      ctx.globalAlpha = k * 0.22;
      glow(ctx, this.halo, s.x, s.y, 800);
      if (this.rays) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(t * 0.03 * (0.3 + 0.7 * m));
        // The rays burst as the sun clears the clouds, then settle into morning.
        ctx.globalAlpha = 0.26 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 0.1 * k;
        ctx.drawImage(this.rays, -900, -900, 1800, 1800);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.birds.draw(ctx, t, dt, m, 0.85 * (1 - k * 0.5));
    if (k > 0.05) {
      if (!this.finaleBirds) this.finaleBirds = new Flock(this.env, '#5A3050', [220, 380], 0.2);
      this.finaleBirds.draw(ctx, t, dt, m, 0.9);
    }
    this.dust.draw(ctx, t, dt, m, 0.7 + k);
  }

  override front(ctx: CanvasRenderingContext2D, t: number, _dt: number, m: number): void {
    const { vis } = this.env;
    this.mist.draw(ctx, vis, t, m);
    const k = this.dawnK;
    if (k > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#FFB478', k * 0.05);
      ctx.fillRect(vis.x0 - 20, vis.y0 - 20, vis.x1 - vis.x0 + 40, vis.y1 - vis.y0 + 40);
      ctx.globalAlpha = k * 0.14;
      glow(ctx, this.gold, this.sun.x, this.sun.y, 600);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  override get hasFinale(): boolean {
    return this.env.finale;
  }
}

/** Soft god-rays radiating from the centre (pre-rendered once). */
function raysSprite(): HTMLCanvasElement {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.sin(i * 12.9898) * 0.08;
    const w = 0.03 + Math.abs(Math.sin(i * 78.233)) * 0.05;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
    gr.addColorStop(0, 'rgba(255,230,180,0.9)');
    gr.addColorStop(0.3, 'rgba(255,220,170,0.35)');
    gr.addColorStop(1, 'rgba(255,210,160,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, S / 2, a - w, a + w);
    g.closePath();
    g.fill();
  }
  return c;
}

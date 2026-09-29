import { INK_HW, PEN_SAMPLE } from '../core/constants';
import type { Vec } from '../core/math';
import type { InkType, SimEvent } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { mergeIntervals, type Stroke } from '../sim/strokes';
import { INK_COLORS } from './palettes';
import { glowSprite, starSprite } from './particles';
import type { View } from './view';

/**
 * Player ink: luminous calligraphy. Each stroke is a tapered ribbon (a brush that lands, swells a
 * little, and lifts to a point) whose width follows how fast it was drawn, wrapped in additive glow
 * layers. Finished strokes are baked into an offscreen layer; only the live stroke, freshly-set ink
 * (which glistens for ~0.6 s), rippling spring ink and the cheap animated accents (shimmer, comet
 * chevrons, spring pulse) are drawn per frame.
 */

const FRESH = 0.65;
const RIPPLE_T = 1.1;
const TAU = Math.PI * 2;

interface Piece {
  n: number;
  x: Float32Array;
  y: Float32Array;
  /** Unit normals (left of travel). */
  nx: Float32Array;
  ny: Float32Array;
  /** Half-width profile (world units, before layer scaling). */
  h: Float32Array;
  /** Arc length from the piece start. */
  s: Float32Array;
  len: number;
  /** Arc position of the piece start within the whole stroke. */
  u0: number;
  startBit: boolean;
  endBit: boolean;
  /** Head of a stroke still being drawn: blunt and bright. */
  liveHead: boolean;
}

interface Geo {
  key: string;
  pieces: Piece[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Ripple {
  id: number;
  s: number;
  t: number;
  dx: number;
  dy: number;
  amp: number;
}

// Layer recipe: [scale of the half-width, alpha, additive?, colour key]
type ColKey = 'halo' | 'deep' | 'core' | 'white';
// The halo is built from many thin additive shells so its falloff is smooth (no visible bands) —
// a blur without a blur filter.
const LAYERS: [number, number, boolean, ColKey][] = [
  [5.6, 0.032, true, 'halo'],
  [4.6, 0.04, true, 'halo'],
  [3.75, 0.048, true, 'halo'],
  [3.05, 0.058, true, 'halo'],
  [2.5, 0.07, true, 'halo'],
  [2.05, 0.085, true, 'halo'],
  [1.65, 0.11, true, 'halo'],
  [1.22, 0.6, false, 'deep'],
  [1.02, 1, false, 'halo'],
  [0.56, 1, false, 'core'],
  [0.26, 0.35, true, 'white'],
];
const L_INNER = 6;
const L_CORE = 9;
const L_WHITE = 10;

export class InkLayer {
  private cache: HTMLCanvasElement | null = null;
  private cctx: CanvasRenderingContext2D | null = null;
  private viewKey = '';
  private sig = -1;
  private bbox = { x: 0, y: 0, w: 0, h: 0 };
  private geos = new Map<number, Geo>();
  /** Per raw point width factor (from drawing speed), per stroke id. */
  private speeds = new Map<number, number[]>();
  private finished = new Map<number, number>();
  private dry = new Set<number>();
  private pendingDry = false;
  private ripples: Ripple[] = [];
  private time = 0;
  private lastLive = -1;
  private scratchX = new Float32Array(256);
  private scratchY = new Float32Array(256);

  /** Called by the renderer for every sim event. */
  onEvent(e: SimEvent, sim: Simulation): void {
    switch (e.type) {
      case 'ink-dry':
        this.pendingDry = true;
        break;
      case 'stroke-end':
        this.finished.set(e.id, this.time);
        if (this.pendingDry) this.dry.add(e.id);
        this.pendingDry = false;
        break;
      case 'bounce': {
        if (!e.ink) break;
        const hit = this.nearestSpring(sim, e.x, e.y);
        if (hit) {
          this.ripples = this.ripples.filter((r) => r.id !== hit.id);
          this.ripples.push({ id: hit.id, s: hit.s, t: 0, dx: -e.nx, dy: -e.ny, amp: Math.min(1.2, 0.45 + e.speed / 1400) });
        }
        break;
      }
      case 'undo':
        this.geos.delete(e.id);
        this.finished.delete(e.id);
        this.speeds.delete(e.id);
        break;
      case 'clear':
        this.geos.clear();
        this.finished.clear();
        this.speeds.clear();
        this.ripples.length = 0;
        break;
      case 'reset':
        this.ripples.length = 0;
        this.finished.clear();
        break;
    }
  }

  /** Where a spring ripple is right now (for the renderer's sparkle), or null. */
  private nearestSpring(sim: Simulation, x: number, y: number): { id: number; s: number } | null {
    let best = 30 * 30;
    let out: { id: number; s: number } | null = null;
    for (const st of sim.strokes) {
      if (st.ink !== 'spring') continue;
      const g = this.geos.get(st.id);
      if (!g) continue;
      for (const p of g.pieces) {
        for (let i = 0; i < p.n; i += 2) {
          const dx = p.x[i] - x;
          const dy = p.y[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            out = { id: st.id, s: p.u0 + p.s[i] };
          }
        }
      }
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, view: View, sim: Simulation, time: number, dt: number): void {
    this.time = time;
    const cur = sim.currentStroke;
    this.trackSpeed(cur, dt);

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > RIPPLE_T) this.ripples.splice(i, 1);
    }

    // ── settled strokes → cache ──
    const key = `${view.cssW}x${view.cssH}@${view.dpr}:${view.scale.toFixed(5)}:${view.ox.toFixed(2)},${view.oy.toFixed(2)}`;
    if (!this.cache || key !== this.viewKey) {
      this.cache = document.createElement('canvas');
      this.cache.width = Math.max(1, Math.round(view.cssW * view.dpr));
      this.cache.height = Math.max(1, Math.round(view.cssH * view.dpr));
      this.cctx = this.cache.getContext('2d');
      this.viewKey = key;
      this.sig = -1;
    }
    let sig = 17;
    let nSettled = 0;
    for (const s of sim.strokes) {
      if (!this.isSettled(s)) continue;
      nSettled++;
      sig = (Math.imul(sig, 31) + s.id * 7 + s.pts.length * 131 + s.bites.length * 977) | 0;
    }
    sig = (sig + nSettled * 7919) | 0;
    if (sig !== this.sig) {
      this.rebuild(view, sim);
      this.sig = sig;
    }
    const b = this.bbox;
    if (b.w > 0 && b.h > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.cache, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    }

    // ── per-frame strokes: fresh, rippling, live ──
    view.apply(ctx);
    for (const s of sim.strokes) {
      if (this.isSettled(s)) continue;
      const geo = this.geo(s);
      const born = this.finished.get(s.id);
      const fresh = !s.done ? 1 : born === undefined ? 0 : Math.max(0, 1 - (time - born) / FRESH);
      const rip = this.ripples.find((r) => r.id === s.id);
      for (const p of geo.pieces) {
        if (rip) this.drawRippled(ctx, p, s.ink, rip, fresh);
        else drawPiece(ctx, p, s.ink, fresh, s.id);
      }
      if (s.done && born !== undefined && time - born < 0.5) this.drawGlint(ctx, geo, (time - born) / 0.5);
      if (!s.done) this.drawHead(ctx, geo, s.ink, time);
    }

    // ── animated accents (cheap) ──
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sim.strokes) {
      const geo = this.geos.get(s.id);
      if (!geo) continue;
      for (const p of geo.pieces) {
        if (p.len < 6) continue;
        if (s.ink === 'comet') drawChevrons(ctx, p, time);
        else if (s.ink === 'spring') drawSpringPulse(ctx, p, time, s.id);
        if (s.done) drawShimmer(ctx, p, s.ink, time + s.id * 1.618);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.lastLive = cur ? cur.id : -1;
  }

  private isSettled(s: Stroke): boolean {
    if (!s.done) return false;
    const born = this.finished.get(s.id);
    if (born !== undefined && this.time - born < FRESH) return false;
    for (const r of this.ripples) if (r.id === s.id) return false;
    return true;
  }

  /** Record a width factor for every new raw point of the live stroke (faster pen → finer line). */
  private trackSpeed(cur: Stroke | null, dt: number): void {
    if (!cur) return;
    let arr = this.speeds.get(cur.id);
    if (!arr) {
      arr = [];
      this.speeds.set(cur.id, arr);
    }
    const added = cur.pts.length - arr.length;
    if (added <= 0) return;
    let f = 1;
    if (arr.length > 0 && added < 40 && dt > 0) {
      const speed = (added * PEN_SAMPLE) / Math.max(1 / 240, dt);
      const target = 1.14 - 0.3 * Math.min(1, Math.max(0, (speed - 120) / 1100));
      const prev = arr[arr.length - 1];
      f = prev + (target - prev) * 0.35;
    } else if (arr.length > 0) f = arr[arr.length - 1];
    for (let i = 0; i < added; i++) arr.push(f);
    void this.lastLive;
  }

  private geo(s: Stroke): Geo {
    const key = `${s.pts.length}:${s.done ? 1 : 0}:${s.bites.length}:${s.bites.length ? s.bites[s.bites.length - 1][0].toFixed(1) : ''}`;
    const old = this.geos.get(s.id);
    if (old && old.key === key) return old;
    const g = buildGeo(s, this.speeds.get(s.id), key, this.dry.has(s.id));
    this.geos.set(s.id, g);
    return g;
  }

  private rebuild(view: View, sim: Simulation): void {
    const c = this.cctx!;
    const cv = this.cache!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    view.apply(c);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of sim.strokes) {
      if (!this.isSettled(s)) continue;
      const g = this.geo(s);
      for (const p of g.pieces) drawPiece(c, p, s.ink, 0, s.id);
      if (this.dry.has(s.id)) drawSputter(c, g, s.ink, s.id);
      minX = Math.min(minX, g.minX);
      minY = Math.min(minY, g.minY);
      maxX = Math.max(maxX, g.maxX);
      maxY = Math.max(maxY, g.maxY);
    }
    // Drop geometry of strokes that no longer exist.
    if (this.geos.size > sim.strokes.length + 4) {
      const alive = new Set(sim.strokes.map((s) => s.id));
      for (const id of [...this.geos.keys()]) if (!alive.has(id)) this.geos.delete(id);
    }
    if (minX > maxX) {
      this.bbox = { x: 0, y: 0, w: 0, h: 0 };
      return;
    }
    const pad = INK_HW * 6.5;
    const k = view.scale * view.dpr;
    const x0 = Math.max(0, Math.floor((view.ox + (minX - pad) * view.scale) * view.dpr));
    const y0 = Math.max(0, Math.floor((view.oy + (minY - pad) * view.scale) * view.dpr));
    const x1 = Math.min(cv.width, Math.ceil(x0 + (maxX - minX + pad * 2) * k + 2));
    const y1 = Math.min(cv.height, Math.ceil(y0 + (maxY - minY + pad * 2) * k + 2));
    this.bbox = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }

  /** Spring ink hit: the line wobbles like a plucked string, waves running out from the impact. */
  private drawRippled(ctx: CanvasRenderingContext2D, p: Piece, ink: InkType, r: Ripple, fresh: number): void {
    if (this.scratchX.length < p.n) {
      this.scratchX = new Float32Array(p.n * 2);
      this.scratchY = new Float32Array(p.n * 2);
    }
    const sx = this.scratchX;
    const sy = this.scratchY;
    const t = r.t;
    const env = Math.exp(-4.2 * t) * r.amp;
    for (let i = 0; i < p.n; i++) {
      const d = Math.abs(p.u0 + p.s[i] - r.s);
      const k = env * 7 * Math.cos(d * 0.1 - t * 24) * Math.exp(-d / 110) * Math.min(1, t * 30 + 0.4);
      sx[i] = p.x[i] + r.dx * k;
      sy[i] = p.y[i] + r.dy * k;
    }
    const x = p.x;
    const y = p.y;
    p.x = sx;
    p.y = sy;
    drawPiece(ctx, p, ink, Math.max(fresh, 0.5 * Math.exp(-3 * t)), 0);
    // Two bright pulses racing outward from the impact.
    ctx.globalCompositeOperation = 'lighter';
    const spr = glowSprite(INK_COLORS[ink].halo);
    const travel = t * 420;
    for (const dir of [-1, 1]) {
      const sLocal = r.s + dir * travel - p.u0;
      if (sLocal < 0 || sLocal > p.len) continue;
      const q = at(p, sLocal);
      ctx.globalAlpha = 0.9 * Math.max(0, 1 - t / 0.7);
      ctx.drawImage(spr, q.x - 16, q.y - 16, 32, 32);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    p.x = x;
    p.y = y;
  }

  /** A bright glint that runs along a stroke once as the ink sets. */
  private drawGlint(ctx: CanvasRenderingContext2D, g: Geo, u: number): void {
    let total = 0;
    for (const p of g.pieces) total += p.len;
    if (total < 10) return;
    const e = 1 - (1 - u) * (1 - u);
    let s = e * total;
    for (const p of g.pieces) {
      if (s <= p.len) {
        const q = at(p, s);
        const a = Math.sin(u * Math.PI);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8 * a;
        ctx.drawImage(glowSprite('#FFFFFF'), q.x - 13, q.y - 13, 26, 26);
        ctx.globalAlpha = 0.9 * a;
        ctx.drawImage(starSprite('#FFFFFF'), q.x - 9, q.y - 9, 18, 18);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      s -= p.len;
    }
  }

  /** The wet bead of ink under the nib. */
  private drawHead(ctx: CanvasRenderingContext2D, g: Geo, ink: InkType, time: number): void {
    const p = g.pieces[g.pieces.length - 1];
    if (!p || p.n === 0) return;
    const x = p.x[p.n - 1];
    const y = p.y[p.n - 1];
    const col = INK_COLORS[ink];
    ctx.globalCompositeOperation = 'lighter';
    const r = 15 + Math.sin(time * 14) * 1.5;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(glowSprite(col.halo), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowSprite('#FFFFFF'), x - 6, y - 6, 12, 12);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ───────────────────────────── geometry ─────────────────────────────

function buildGeo(s: Stroke, speeds: number[] | undefined, key: string, dryEnd: boolean): Geo {
  const raw = s.pts;
  const n = raw.length;
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
  const total = n ? cum[n - 1] : 0;
  // Surviving arc intervals (moth bites removed), with which ends were bitten.
  const alive: [number, number, boolean, boolean][] = [];
  if (!s.bites.length) alive.push([0, total, false, false]);
  else {
    let cursor = 0;
    for (const [a, b] of mergeIntervals(s.bites)) {
      if (a > cursor) alive.push([cursor, Math.min(a, total), cursor > 0, a < total]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < total) alive.push([cursor, total, cursor > 0, false]);
  }
  const seed = s.id * 12.9898;
  const pieces: Piece[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [a, b, sb, eb] of alive) {
    if (b - a <= 1) continue;
    // Sub-polyline with per-point (x, y, width factor, arc u).
    const px: number[] = [];
    const py: number[] = [];
    const pw: number[] = [];
    const pu: number[] = [];
    const push = (u: number) => {
      let i = 1;
      while (i < n - 1 && cum[i] < u) i++;
      const l = cum[i] - cum[i - 1];
      const t = l > 1e-6 ? Math.min(1, Math.max(0, (u - cum[i - 1]) / l)) : 0;
      px.push(raw[i - 1].x + (raw[i].x - raw[i - 1].x) * t);
      py.push(raw[i - 1].y + (raw[i].y - raw[i - 1].y) * t);
      const w0 = speeds?.[i - 1] ?? 1;
      const w1 = speeds?.[i] ?? 1;
      pw.push(w0 + (w1 - w0) * t);
      pu.push(u);
    };
    if (n === 1) {
      px.push(raw[0].x);
      py.push(raw[0].y);
      pw.push(1);
      pu.push(0);
    } else {
      push(a);
      for (let i = 0; i < n; i++) {
        if (cum[i] > a + 0.01 && cum[i] < b - 0.01) {
          px.push(raw[i].x);
          py.push(raw[i].y);
          pw.push(speeds?.[i] ?? 1);
          pu.push(cum[i]);
        }
      }
      push(b);
    }
    // Chaikin ×2 on all attributes (endpoints kept).
    let X = px;
    let Y = py;
    let Wf = pw;
    let U = pu;
    for (let it = 0; it < 2 && X.length >= 3; it++) {
      const nx: number[] = [X[0]];
      const ny: number[] = [Y[0]];
      const nw: number[] = [Wf[0]];
      const nu: number[] = [U[0]];
      for (let i = 0; i < X.length - 1; i++) {
        nx.push(X[i] * 0.75 + X[i + 1] * 0.25, X[i] * 0.25 + X[i + 1] * 0.75);
        ny.push(Y[i] * 0.75 + Y[i + 1] * 0.25, Y[i] * 0.25 + Y[i + 1] * 0.75);
        nw.push(Wf[i] * 0.75 + Wf[i + 1] * 0.25, Wf[i] * 0.25 + Wf[i + 1] * 0.75);
        nu.push(U[i] * 0.75 + U[i + 1] * 0.25, U[i] * 0.25 + U[i + 1] * 0.75);
      }
      nx.push(X[X.length - 1]);
      ny.push(Y[Y.length - 1]);
      nw.push(Wf[Wf.length - 1]);
      nu.push(U[U.length - 1]);
      X = nx;
      Y = ny;
      Wf = nw;
      U = nu;
    }
    const m = X.length;
    const p: Piece = {
      n: m,
      x: new Float32Array(X),
      y: new Float32Array(Y),
      nx: new Float32Array(m),
      ny: new Float32Array(m),
      h: new Float32Array(m),
      s: new Float32Array(m),
      len: 0,
      u0: a,
      startBit: sb,
      endBit: eb,
      liveHead: !s.done && !eb && Math.abs(b - total) < 0.5,
    };
    for (let i = 1; i < m; i++) p.s[i] = p.s[i - 1] + Math.hypot(p.x[i] - p.x[i - 1], p.y[i] - p.y[i - 1]);
    p.len = m ? p.s[m - 1] : 0;
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(m - 1, i + 1);
      let tx = p.x[i1] - p.x[i0];
      let ty = p.y[i1] - p.y[i0];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      p.nx[i] = -ty;
      p.ny[i] = tx;
    }
    // Width profile: brush lands (a small swell), rides with speed & a whisper of noise, lifts to a point.
    const len = p.len;
    const landL = Math.min(16, len * 0.3);
    const liftL = Math.min(30, len * 0.42);
    const whole = total > 0 ? total : 1;
    for (let i = 0; i < m; i++) {
      const sl = p.s[i];
      const u = a + sl;
      let k = Wf[i];
      k *= 1 + 0.08 * Math.sin(u * 0.047 + seed) + 0.045 * Math.sin(u * 0.131 + seed * 1.7);
      if (!sb) {
        const q = landL > 0 ? Math.min(1, sl / landL) : 1;
        // 0.62 → 1.12 (swell) → 1
        k *= q < 0.35 ? 0.62 + (q / 0.35) * 0.5 : 1.12 - ((q - 0.35) / 0.65) * 0.12;
      }
      const toEnd = len - sl;
      if (!eb && !p.liveHead) {
        const q = liftL > 0 ? Math.min(1, toEnd / liftL) : 1;
        const lift = dryEnd ? 0.35 + 0.65 * q : 0.14 + 0.86 * (1 - (1 - q) * (1 - q));
        k *= lift;
      }
      if (eb) k *= 0.82 + 0.18 * Math.min(1, toEnd / 4);
      if (sb) k *= 0.82 + 0.18 * Math.min(1, sl / 4);
      p.h[i] = INK_HW * k;
      void whole;
    }
    for (let i = 0; i < m; i++) {
      if (p.x[i] < minX) minX = p.x[i];
      if (p.y[i] < minY) minY = p.y[i];
      if (p.x[i] > maxX) maxX = p.x[i];
      if (p.y[i] > maxY) maxY = p.y[i];
    }
    pieces.push(p);
  }
  return { key, pieces, minX, minY, maxX, maxY };
}

function at(p: Piece, s: number): Vec & { i: number } {
  // Binary search on arc length.
  let lo = 0;
  let hi = p.n - 1;
  if (s <= 0) return { x: p.x[0], y: p.y[0], i: 0 };
  if (s >= p.len) return { x: p.x[hi], y: p.y[hi], i: hi };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.s[mid] < s) lo = mid;
    else hi = mid;
  }
  const l = p.s[hi] - p.s[lo];
  const t = l > 1e-6 ? (s - p.s[lo]) / l : 0;
  return { x: p.x[lo] + (p.x[hi] - p.x[lo]) * t, y: p.y[lo] + (p.y[hi] - p.y[lo]) * t, i: lo };
}

// ───────────────────────────── drawing ─────────────────────────────

/** Trace a ribbon of half-width h·k around the piece (tapered, round or bitten ends). */
function ribbon(ctx: CanvasRenderingContext2D, p: Piece, k: number, seed: number): void {
  const n = p.n;
  const { x, y, nx, ny, h } = p;
  ctx.beginPath();
  if (n === 1) {
    ctx.arc(x[0], y[0], h[0] * k, 0, TAU);
    return;
  }
  ctx.moveTo(x[0] + nx[0] * h[0] * k, y[0] + ny[0] * h[0] * k);
  for (let i = 1; i < n; i++) ctx.lineTo(x[i] + nx[i] * h[i] * k, y[i] + ny[i] * h[i] * k);
  const e = n - 1;
  if (p.endBit) nibble(ctx, x[e], y[e], nx[e], ny[e], h[e] * k, seed + 3.1);
  else {
    const a = Math.atan2(ny[e], nx[e]);
    ctx.arc(x[e], y[e], Math.max(0.05, h[e] * k), a, a - Math.PI, true);
  }
  for (let i = e; i >= 0; i--) ctx.lineTo(x[i] - nx[i] * h[i] * k, y[i] - ny[i] * h[i] * k);
  if (p.startBit) nibble(ctx, x[0], y[0], -nx[0], -ny[0], h[0] * k, seed + 7.7);
  else {
    const a = Math.atan2(-ny[0], -nx[0]);
    ctx.arc(x[0], y[0], Math.max(0.05, h[0] * k), a, a - Math.PI, true);
  }
  ctx.closePath();
}

/**
 * A moth-bitten end: a ragged scallop instead of a cap. (nx, ny) is the normal of the side we arrive
 * on (the path then crosses to the opposite side).
 */
function nibble(ctx: CanvasRenderingContext2D, x: number, y: number, nx: number, ny: number, hw: number, seed: number): void {
  // With the ribbon walking along +n, (ny, -nx) points out of the piece — into the bite.
  const tx = ny;
  const ty = -nx;
  const j = (k: number) => Math.sin(seed * 3.7 + k * 5.3) * 0.5 + 0.5;
  const pt = (side: number, fwd: number) => [x + nx * hw * side + tx * fwd, y + ny * hw * side + ty * fwd] as const;
  const p1 = pt(0.55, 1.3 + j(1));
  const p2 = pt(0.2, -0.9 - j(2));
  const p3 = pt(-0.2, 1 + j(3) * 1.4);
  const p4 = pt(-0.6, -1.1 - j(4));
  const p5 = pt(-1, 0.3);
  ctx.lineTo(p1[0], p1[1]);
  ctx.quadraticCurveTo(p2[0], p2[1], p3[0], p3[1]);
  ctx.quadraticCurveTo(p4[0], p4[1], p5[0], p5[1]);
}

/** One stroke piece: glow layers, an inked edge, colour body and a hot white core. */
function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, ink: InkType, fresh: number, seed: number): void {
  const col = INK_COLORS[ink];
  for (let li = 0; li < LAYERS.length; li++) {
    const [k0, a0, add, ck] = LAYERS[li];
    let k = k0;
    let a = a0;
    if (fresh > 0) {
      // Wet ink: brighter, a touch fatter, then it settles.
      if (li === L_INNER) a += 0.2 * fresh;
      if (li === L_CORE) k += 0.12 * fresh;
      if (li === L_WHITE) a += 0.35 * fresh;
    }
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = ck === 'white' ? '#FFFFFF' : col[ck];
    ribbon(ctx, p, k, seed);
    ctx.fill();
  }
  if (ink === 'spring' && p.len > 12) {
    // A coil of light running along the core: reads as "springy" at a glance.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i < p.n; i++) {
      const w = Math.sin(p.s[i] * 0.62) * p.h[i] * 0.55;
      const X = p.x[i] + p.nx[i] * w;
      const Y = p.y[i] + p.ny[i] * w;
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    }
    ctx.stroke();
  }
  if (p.startBit || p.endBit) {
    // Crumbs of light where the moth ate.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col.halo;
    for (const end of [0, 1]) {
      if (end === 0 && !p.startBit) continue;
      if (end === 1 && !p.endBit) continue;
      const i = end ? p.n - 1 : 0;
      const dir = end ? 1 : -1;
      const tx = p.ny[i] * dir;
      const ty = -p.nx[i] * dir;
      for (let c = 0; c < 4; c++) {
        const r1 = Math.sin(seed * 1.3 + c * 12.7 + end * 5) * 0.5 + 0.5;
        const r2 = Math.sin(seed * 2.1 + c * 7.3 + end * 3) * 0.5 + 0.5;
        const f = 3 + r1 * 7;
        const sdev = (r2 - 0.5) * 9;
        ctx.globalAlpha = 0.5 - c * 0.08;
        ctx.beginPath();
        ctx.arc(p.x[i] + tx * f + p.nx[i] * sdev, p.y[i] + ty * f + p.ny[i] * sdev, 0.7 + (1 - r1) * 0.9, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** The inkwell ran dry mid-stroke: a few spattered drops trail off the end. */
function drawSputter(ctx: CanvasRenderingContext2D, g: Geo, ink: InkType, seed: number): void {
  const p = g.pieces[g.pieces.length - 1];
  if (!p || p.n < 2 || p.endBit) return;
  const e = p.n - 1;
  const tx = p.ny[e];
  const ty = -p.nx[e];
  const col = INK_COLORS[ink];
  ctx.fillStyle = col.core;
  for (let c = 0; c < 3; c++) {
    const d = 5 + c * 5.5 + Math.sin(seed + c * 3) * 1.5;
    const off = Math.sin(seed * 2 + c * 5) * 2.2;
    ctx.globalAlpha = 0.85 - c * 0.2;
    ctx.beginPath();
    ctx.arc(p.x[e] + tx * d + p.nx[e] * off, p.y[e] + ty * d + p.ny[e] * off, 1.8 - c * 0.45, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Comet ink: bright chevrons flowing in the direction the stroke was drawn. */
function drawChevrons(ctx: CanvasRenderingContext2D, p: Piece, time: number): void {
  const spacing = 22;
  const offset = (time * 120) % spacing;
  ctx.strokeStyle = '#FFF6DE';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pulse = ((time * 0.9) % 1) * (p.len + 120) - 60;
  // Bucket chevrons by brightness to keep state changes low: 3 passes.
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = [0.35, 0.6, 0.95][pass];
    ctx.beginPath();
    let any = false;
    for (let s = offset + 6; s < p.len - 5; s += spacing) {
      const edge = Math.min(1, s / 18, (p.len - s) / 18);
      const near = Math.max(0, 1 - Math.abs(s - pulse) / 50);
      const v = edge * (0.55 + 0.45 * near);
      const b = v > 0.8 ? 2 : v > 0.5 ? 1 : 0;
      if (b !== pass) continue;
      const q = at(p, s);
      const i = q.i;
      const tx = p.ny[i];
      const ty = -p.nx[i];
      const hw = Math.min(3.2, p.h[i] * 0.85);
      ctx.moveTo(q.x - tx * 3 + p.nx[i] * hw, q.y - ty * 3 + p.ny[i] * hw);
      ctx.lineTo(q.x + tx * 1.2, q.y + ty * 1.2);
      ctx.lineTo(q.x - tx * 3 - p.nx[i] * hw, q.y - ty * 3 - p.ny[i] * hw);
      any = true;
    }
    if (any) ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Spring ink breathes. */
function drawSpringPulse(ctx: CanvasRenderingContext2D, p: Piece, time: number, id: number): void {
  const k = 0.5 + 0.5 * Math.sin(time * 2.8 + id * 1.3);
  ctx.globalAlpha = 0.05 + 0.1 * k * k;
  ctx.fillStyle = INK_COLORS.spring.halo;
  ribbon(ctx, p, 2.1 + 0.4 * k, id);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A soft bead of light that slides along finished ink. */
function drawShimmer(ctx: CanvasRenderingContext2D, p: Piece, ink: InkType, time: number): void {
  const speed = ink === 'spring' ? 170 : 120;
  const span = p.len + 260;
  const pos = ((time * speed) % span) - 130 + p.u0 * 0;
  if (pos < -20 || pos > p.len + 20) return;
  const spr = glowSprite(INK_COLORS[ink].core);
  for (let j = -2; j <= 2; j++) {
    const s = pos + j * 9;
    if (s < 0 || s > p.len) continue;
    const q = at(p, s);
    const r = 7 + (2 - Math.abs(j)) * 2.5;
    ctx.globalAlpha = 0.22 * (1 - Math.abs(j) * 0.3);
    ctx.drawImage(spr, q.x - r, q.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

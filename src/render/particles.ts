// Cosmetic particles + shared light sprites. Render-side only, so Math.random is fine here.
//
// Particles live in a fixed pool (no per-emit allocation once warm). Soft kinds (glow, ember, smoke)
// are drawn from pre-rendered radial sprites, so a burst of light never builds a gradient per frame.

export type ParticleKind =
  | 'dot' // small solid disc
  | 'glow' // soft additive light blob (sprite)
  | 'ember' // flickering glow + hot core that cools as it dies
  | 'spark' // 4-point twinkle star
  | 'smoke' // soft grey puff that grows (source-over)
  | 'ring' // expanding hairline circle
  | 'streak' // motion line along velocity
  | 'petal' // tumbling ellipse
  | 'confetti'; // paper scrap that flutters (fake 3D flip) as it falls

const KIND: Record<ParticleKind, number> = { dot: 0, glow: 1, ember: 2, spark: 3, smoke: 4, ring: 5, streak: 6, petal: 7, confetti: 8 };

export interface ParticleOpts {
  kind?: ParticleKind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Lifetime (s). */
  max?: number;
  size?: number;
  /** Size change per second. */
  grow?: number;
  color?: string;
  /** Second colour (confetti back face). */
  color2?: string;
  /** Gravity (u/s², + is down). */
  g?: number;
  /** Linear drag per second. */
  drag?: number;
  additive?: boolean;
  rot?: number;
  vr?: number;
  /** Peak opacity. */
  alpha?: number;
  /** Sideways sway amplitude (u/s) — petals, confetti, smoke curls. */
  sway?: number;
}

export interface BurstOpts extends Omit<ParticleOpts, 'x' | 'y'> {
  speed?: number;
  spread?: number;
  angle?: number;
  jitterLife?: number;
  /** Random start offset radius. */
  radius?: number;
}

class P {
  kind = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  max = 1;
  size = 3;
  grow = 0;
  color = '#fff';
  color2 = '#fff';
  g = 0;
  drag = 0;
  additive = true;
  rot = 0;
  vr = 0;
  alpha = 1;
  sway = 0;
  seed = 0;
}

const MAX = 520;
const TAU = Math.PI * 2;

export class Particles {
  private pool: P[] = [];
  private n = 0;
  /** 0..1 multiplier on burst counts (reduced motion). */
  density = 1;

  get count(): number {
    return this.n;
  }

  emit(o: ParticleOpts): void {
    let p: P;
    if (this.n < this.pool.length) p = this.pool[this.n++];
    else if (this.pool.length < MAX) {
      p = new P();
      this.pool.push(p);
      this.n++;
    } else {
      // Full: recycle the oldest-looking slot (cheap: a random one — nobody can tell).
      p = this.pool[(Math.random() * this.n) | 0];
    }
    p.kind = KIND[o.kind ?? 'dot'];
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.life = 0;
    p.max = o.max ?? 1;
    p.size = o.size ?? 3;
    p.grow = o.grow ?? 0;
    p.color = o.color ?? '#fff';
    p.color2 = o.color2 ?? p.color;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.additive = o.additive ?? (o.kind !== 'smoke' && o.kind !== 'confetti');
    p.rot = o.rot ?? Math.random() * TAU;
    p.vr = o.vr ?? 0;
    p.alpha = o.alpha ?? 1;
    p.sway = o.sway ?? 0;
    p.seed = Math.random() * 100;
  }

  burst(n: number, x: number, y: number, o: BurstOpts): void {
    const count = Math.max(1, Math.round(n * this.density));
    const speed = o.speed ?? 120;
    const spread = o.spread ?? TAU;
    const angle = o.angle ?? 0;
    const rad = o.radius ?? 0;
    const e: ParticleOpts = { ...o, x, y };
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      e.x = x + (rad ? (Math.random() - 0.5) * 2 * rad : 0);
      e.y = y + (rad ? (Math.random() - 0.5) * 2 * rad : 0);
      e.vx = Math.cos(a) * s + (o.vx ?? 0);
      e.vy = Math.sin(a) * s + (o.vy ?? 0);
      e.max = (o.max ?? 0.8) * (1 - (o.jitterLife ?? 0.4) * Math.random());
      e.rot = Math.random() * TAU;
      e.vr = o.vr !== undefined ? o.vr * (Math.random() * 2 - 1) : (Math.random() - 0.5) * 6;
      this.emit(e);
    }
  }

  update(dt: number): void {
    let w = 0;
    const pool = this.pool;
    for (let i = 0; i < this.n; i++) {
      const p = pool[i];
      p.life += dt;
      if (p.life < p.max) {
        p.vy += p.g * dt;
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.sway) p.x += Math.sin(p.life * 3.1 + p.seed) * p.sway * dt;
        p.rot += p.vr * dt;
        if (w !== i) {
          pool[i] = pool[w];
          pool[w] = p;
        }
        w++;
      }
    }
    this.n = w;
  }

  /**
   * Draw with the world transform `k` (device px per world unit) and origin (ox, oy) in device px.
   * Rotated kinds set their own matrix instead of save/restore.
   */
  draw(ctx: CanvasRenderingContext2D, k: number, ox: number, oy: number): void {
    const pool = this.pool;
    let lastAdd = -1;
    for (let i = 0; i < this.n; i++) {
      const p = pool[i];
      const t = p.life / p.max;
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      const a = Math.max(0, fade) * p.alpha;
      if (a <= 0.003) continue;
      const add = p.additive ? 1 : 0;
      if (add !== lastAdd) {
        ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
        lastAdd = add;
      }
      const size = Math.max(0.05, p.size + p.grow * p.life);
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 0: // dot
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          break;
        case 1: {
          // glow
          const s = glowSprite(p.color);
          ctx.drawImage(s, p.x - size, p.y - size, size * 2, size * 2);
          break;
        }
        case 2: {
          // ember: flickers and cools (shrinks) with age
          const fl = 0.75 + 0.25 * Math.sin(p.life * 31 + p.seed * 7);
          const s = glowSprite(p.color);
          const r = size * (1 - t * 0.5) * 3.2;
          ctx.globalAlpha = a * fl;
          ctx.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
          ctx.globalAlpha = a * fl * (1 - t);
          ctx.fillStyle = '#FFF4D8';
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 0.45 * (1 - t * 0.6), 0, TAU);
          ctx.fill();
          break;
        }
        case 3: {
          // spark (4-point star sprite), rotating
          const s = starSprite(p.color);
          const c = Math.cos(p.rot) * k;
          const sn = Math.sin(p.rot) * k;
          ctx.setTransform(c, sn, -sn, c, ox + p.x * k, oy + p.y * k);
          const r = size * 2.2;
          ctx.drawImage(s, -r, -r, r * 2, r * 2);
          break;
        }
        case 4: {
          // smoke: soft puff, source-over
          const s = softSprite(p.color);
          ctx.globalAlpha = a * 0.9;
          ctx.drawImage(s, p.x - size, p.y - size, size * 2, size * 2);
          break;
        }
        case 5: // ring
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.4, 2.2 * (1 - t));
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.stroke();
          break;
        case 6: {
          // streak
          const sp = Math.hypot(p.vx, p.vy);
          const l = sp * 0.045 + 2;
          const ux = sp > 1e-3 ? p.vx / sp : 1;
          const uy = sp > 1e-3 ? p.vy / sp : 0;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - ux * l, p.y - uy * l);
          ctx.stroke();
          break;
        }
        case 7: {
          // petal
          const c = Math.cos(p.rot) * k;
          const sn = Math.sin(p.rot) * k;
          ctx.setTransform(c, sn, -sn, c, ox + p.x * k, oy + p.y * k);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * 0.42, 0, 0, TAU);
          ctx.fill();
          break;
        }
        case 8: {
          // confetti: a paper scrap; its width follows a flip so it glints as it tumbles
          const flip = Math.sin(p.life * 9 + p.seed);
          const c = Math.cos(p.rot) * k;
          const sn = Math.sin(p.rot) * k;
          ctx.setTransform(c, sn, -sn, c, ox + p.x * k, oy + p.y * k);
          ctx.fillStyle = flip > 0 ? p.color : p.color2;
          const wv = size * Math.max(0.12, Math.abs(flip));
          ctx.fillRect(-wv, -size * 0.62, wv * 2, size * 1.24);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.n = 0;
  }
}

// ───────────────────────────── shared sprites ─────────────────────────────

const glowCache = new Map<string, HTMLCanvasElement>();
const softCache = new Map<string, HTMLCanvasElement>();
const starCache = new Map<string, HTMLCanvasElement>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/**
 * A soft radial light (≈ gaussian falloff) in `color`, 64 px. Draw it with 'lighter' as cheap bloom:
 * `drawImage(glowSprite(c), x - r, y - r, 2r, 2r)`.
 */
export function glowSprite(color: string): HTMLCanvasElement {
  let s = glowCache.get(color);
  if (s) return s;
  const [c, g] = canvas(64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const stops: [number, number][] = [
    [0, 1],
    [0.12, 0.78],
    [0.28, 0.42],
    [0.46, 0.18],
    [0.66, 0.06],
    [1, 0],
  ];
  for (const [o, a] of stops) grad.addColorStop(o, withAlpha(color, a));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  s = c;
  glowCache.set(color, s);
  return s;
}

/** A soft round puff (flatter falloff than glowSprite) — smoke, mist, dust. */
export function softSprite(color: string): HTMLCanvasElement {
  let s = softCache.get(color);
  if (s) return s;
  const [c, g] = canvas(48);
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, withAlpha(color, 0.9));
  grad.addColorStop(0.45, withAlpha(color, 0.55));
  grad.addColorStop(0.8, withAlpha(color, 0.12));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  s = c;
  softCache.set(color, s);
  return s;
}

/** A 4-point twinkle star with a small bloom, 64 px (points reach the edge). */
export function starSprite(color: string): HTMLCanvasElement {
  let s = starCache.get(color);
  if (s) return s;
  const [c, g] = canvas(64);
  g.drawImage(glowSprite(color), 16, 16, 32, 32);
  g.translate(32, 32);
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  starPath(g, 30, 3.2);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.globalAlpha = 1;
  starPath(g, 16, 2);
  g.fill();
  s = c;
  starCache.set(color, s);
  return s;
}

/** A concave 4-point star centred on the origin (long points of radius r, waist w). */
export function starPath(ctx: CanvasRenderingContext2D, r: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(w * 0.35, -w * 0.35, r, 0);
  ctx.quadraticCurveTo(w * 0.35, w * 0.35, 0, r);
  ctx.quadraticCurveTo(-w * 0.35, w * 0.35, -r, 0);
  ctx.quadraticCurveTo(-w * 0.35, -w * 0.35, 0, -r);
  ctx.closePath();
}

/** Any '#rgb', '#rrggbb', 'rgb()' or 'rgba()' colour → rgba() with alpha a. */
export function withAlpha(color: string, a: number): string {
  const aa = Math.max(0, Math.min(1, a)).toFixed(3);
  let m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${aa})`;
  }
  m = /^#([0-9a-f]{3})$/i.exec(color);
  if (m) {
    const h = m[1];
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `rgba(${r},${g},${b},${aa})`;
  }
  const r = /^rgba?\(([^,]+),([^,]+),([^,)]+)/i.exec(color);
  if (r) return `rgba(${r[1].trim()},${r[2].trim()},${r[3].trim()},${aa})`;
  return color;
}

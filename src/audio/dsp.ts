// Offline DSP helpers: noise textures, the procedurally generated reverb impulse, wave tables, a soft
// clipper curve and a tiny RNG. All buffers are generated once per AudioContext.
import type { Timbre } from './theory';

/** Small fast seeded RNG (mulberry32). Audio randomness never touches the deterministic sim. */
export class Rand {
  private s: number;
  constructor(seed = (Date.now() ^ 0x5bd1e995) >>> 0) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Sparse crackles: dry ink, paper fibres, fizzles. */
  crackle: AudioBuffer;
  /** Paper grain: pink noise with irregular fibre "catches" — the pen scratch. */
  paper: AudioBuffer;
}

function makeBuffer(ctx: BaseAudioContext, seconds: number, fill: (d: Float32Array, sr: number, rng: Rand) => void, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(seconds * sr)), sr);
  fill(buf.getChannelData(0), sr, new Rand(seed));
  return buf;
}

/** Remove DC and normalise to a target peak so every noise source sits at a predictable level. */
function finish(d: Float32Array, peak = 0.9): void {
  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += d[i];
  mean /= d.length;
  let mx = 1e-9;
  for (let i = 0; i < d.length; i++) {
    d[i] -= mean;
    mx = Math.max(mx, Math.abs(d[i]));
  }
  const k = peak / mx;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  // Short crossfade at the loop point so looping sources never click.
  const fade = Math.min(256, d.length >> 2);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    const j = d.length - fade + i;
    d[j] = d[j] * (1 - a) + d[i] * a;
  }
}

export function makeNoiseBank(ctx: BaseAudioContext): NoiseBank {
  const white = makeBuffer(ctx, 2, (d, _sr, r) => {
    for (let i = 0; i < d.length; i++) d[i] = r.next() * 2 - 1;
    finish(d, 0.9);
  }, 11);
  const pink = makeBuffer(ctx, 3, (d, _sr, r) => {
    // Paul Kellet's economy pink filter.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r.next() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
    finish(d, 0.9);
  }, 23);
  const brown = makeBuffer(ctx, 3, (d, _sr, r) => {
    let v = 0;
    for (let i = 0; i < d.length; i++) {
      v = (v + 0.02 * (r.next() * 2 - 1)) * 0.998;
      d[i] = v;
    }
    finish(d, 0.9);
  }, 37);
  const crackle = makeBuffer(ctx, 2, (d, sr, r) => {
    // Poisson-ish clicks of random size, each a tiny damped burst.
    let i = 0;
    while (i < d.length) {
      i += Math.floor(r.range(0.002, 0.03) * sr);
      const amp = Math.pow(r.next(), 2.2) * (r.chance(0.5) ? 1 : -1);
      const len = Math.floor(r.range(0.0006, 0.004) * sr);
      for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += amp * Math.exp(-k / (len * 0.3)) * (r.next() * 2 - 1);
    }
    finish(d, 0.9);
  }, 41);
  const paper = makeBuffer(ctx, 2, (d, sr, r) => {
    // Fibrous grain: gently softened white noise whose level catches and releases irregularly,
    // like a nib dragging over paper fibres.
    let lp = 0;
    let catchEnv = 0;
    const k = Math.exp(-1 / (0.004 * sr));
    for (let i = 0; i < d.length; i++) {
      const w = r.next() * 2 - 1;
      lp = 0.35 * lp + 0.65 * w;
      if (r.next() < 40 / sr) catchEnv = r.range(0.5, 1.6);
      catchEnv *= k;
      d[i] = lp * (0.3 + 0.12 * Math.sin(i * 0.0017) + catchEnv);
    }
    finish(d, 0.9);
  }, 53);
  return { white, pink, brown, crackle, paper };
}

/**
 * A lush stereo reverb impulse: pre-delay, a sprinkle of early reflections, then a decorrelated
 * noise tail that darkens as it decays (frequency-dependent damping) and has its lows trimmed so it
 * never muddies the pads.
 */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.6, rt60 = 2.5): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(0.016 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = new Rand(101 + ch * 7919);
    // Early reflections.
    for (let k = 0; k < 9; k++) {
      const at = pre + Math.floor(r.range(0.004, 0.075) * sr);
      d[at] += r.range(0.25, 0.6) * (r.chance(0.5) ? 1 : -1) * (1 - k / 12);
    }
    // Tail.
    let lp = 0;
    let hpIn = 0;
    let hpOut = 0;
    const decay = 6.91 / rt60;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const u = t / (seconds - 0.016);
      const env = Math.exp(-decay * t) * Math.min(1, t / 0.045);
      // Damping: one-pole lowpass sweeping from ~9 kHz down to ~1.4 kHz.
      const fc = 9000 * Math.pow(1400 / 9000, Math.min(1, u * 1.25));
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp = (1 - a) * (r.next() * 2 - 1) + a * lp;
      // One-pole highpass at ~140 Hz.
      const hpA = Math.exp((-2 * Math.PI * 140) / sr);
      hpOut = hpA * (hpOut + lp - hpIn);
      hpIn = lp;
      d[i] += hpOut * env * 2.2;
    }
    // Fade the very end so the tail never truncates audibly.
    const fade = Math.floor(0.25 * sr);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}

/** Soft clipper: linear to 0.6, then a smooth knee that can never exceed `ceiling`. */
export function softClipCurve(ceiling = 0.94, n = 4096): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const knee = 0.6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    let y: number;
    if (ax <= knee) y = ax;
    else {
      const room = ceiling - knee;
      y = knee + room * Math.tanh((ax - knee) / room);
    }
    c[i] = Math.sign(x) * y;
  }
  return c;
}

const HARMONICS: Record<Timbre | 'bass' | 'pluck' | 'glow', number[]> = {
  // Soft saw with a gentle roll-off: warm, round, never buzzy.
  warm: [1, 0.46, 0.26, 0.15, 0.09, 0.055, 0.03, 0.018],
  // Mostly odd with a whisper of even partials: glassy.
  glass: [1, 0.08, 0.34, 0.04, 0.16, 0.02, 0.07, 0, 0.03],
  // Hollow square-ish: reed / clarinet.
  reed: [1, 0.04, 0.42, 0.03, 0.24, 0.02, 0.12, 0.01, 0.06],
  // Almost sine: soft flute-like pad.
  soft: [1, 0.16, 0.08, 0.03, 0.015],
  // Dark velvet: fundamental + low partials.
  velvet: [1, 0.3, 0.12, 0.05, 0.02],
  bass: [1, 0.55, 0.22, 0.1, 0.04],
  pluck: [1, 0.35, 0.18, 0.06, 0.04],
  glow: [1, 0.22, 0.05, 0.02],
};

export type WaveName = keyof typeof HARMONICS;

export function makeWaves(ctx: BaseAudioContext): Record<WaveName, PeriodicWave> {
  const out = {} as Record<WaveName, PeriodicWave>;
  for (const k of Object.keys(HARMONICS) as WaveName[]) {
    const h = HARMONICS[k];
    const real = new Float32Array(h.length + 1);
    const imag = new Float32Array(h.length + 1);
    for (let i = 0; i < h.length; i++) imag[i + 1] = h[i];
    out[k] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  return out;
}

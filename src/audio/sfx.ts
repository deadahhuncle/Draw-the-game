// Sound effects for every simulation event and UI action. Everything pitched is drawn from the current
// world's key (and often its current chord), so the game never plays a note out of tune with the music.
import { W } from '../core/constants';
import type { DeathCause, SimEvent } from '../core/types';
import type { AudioMode, UiSound } from './audio';
import type { Rand } from './dsp';
import { Key, mtof } from './theory';
import { Pool, type Voices } from './voices';

export interface SfxBuses {
  dry: AudioNode;
  echo: AudioNode;
  /** Straight into the reverb (sfx volume applied). */
  wet: AudioNode;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const panX = (x: number): number => clamp((x / W - 0.5) * 1.2, -0.7, 0.7);

export class Sfx {
  readonly pool = new Pool(30, true);
  private last = new Map<string, number>();
  private bounceI = 0;
  private bounceT = -9;
  private starI = 0;
  private starT = -9;
  mode: AudioMode = 'menu';

  constructor(
    private readonly v: Voices,
    private readonly key: Key,
    private readonly b: SfxBuses,
    private readonly rand: Rand,
    private readonly duck: (amount: number, dur: number) => void,
    private readonly penMidi: () => number,
  ) {}

  private get now(): number {
    return this.v.ctx.currentTime + 0.004;
  }

  /** Rate limiter: true if `name` may sound now. */
  private gate(name: string, gap: number): boolean {
    const t = this.v.ctx.currentTime;
    const l = this.last.get(name) ?? -9;
    if (t - l < gap) return false;
    this.last.set(name, t);
    return true;
  }

  /** MIDI for scale degree `d` counted from the tonic nearest `tonicNear`. */
  private deg(d: number, tonicNear: number): number {
    const k = this.key;
    const t = k.degNear(0, tonicNear);
    return t + (k.deg(d) - k.deg(0));
  }

  private bellOpts(pan: number, bright = 1, decay = 1.2, echo = 0.35) {
    return { ratio: 3.5, index: 1.2 * bright, decay, tink: 0.08, tinkRatio: 5.4, pan, send: this.b.echo, sendGain: echo };
  }

  // ───────────────────────────── sim events ─────────────────────────────

  event(e: SimEvent): void {
    const quiet = this.mode === 'menu' ? 0.6 : 1;
    switch (e.type) {
      case 'spark':
        return this.spark(e.count, e.total, e.x);
      case 'bounce':
        return this.bounce(e.speed, e.ink, e.x);
      case 'rush-start':
        return this.rush(e.dx, e.x);
      case 'land':
        return this.land(e.speed, e.x, quiet);
      case 'turn':
        if (this.gate('turn', 0.1)) this.turn(e.facing, e.x, quiet);
        return;
      case 'step':
        if (this.mode !== 'menu' && e.foot === 0 && this.gate('step', 0.1)) this.step(e.x);
        return;
      case 'death':
        return this.death(e.cause, e.x);
      case 'win':
        return this.win(e.x);
      case 'go':
        return this.go();
      case 'reset':
        if (this.gate('reset', 0.3)) this.reappear();
        return;
      case 'stroke-begin':
        if (this.gate('sbegin', 0.06)) this.nibTap(e.x);
        return;
      case 'stroke-end':
        if (this.gate('send', 0.08)) this.strokeEnd(e.ink);
        return;
      case 'stroke-cut':
        if (this.gate('cut', 0.1)) this.sputter(e.x, 0.6);
        return;
      case 'ink-dry':
        if (this.gate('dry', 0.2)) this.inkDry(e.x);
        return;
      case 'undo':
        if (this.gate('undo', 0.05)) this.undo();
        return;
      case 'clear':
        if (this.gate('clear', 0.15)) this.clear();
        return;
      case 'inkpot':
        return this.inkpot(e.x);
      case 'rain-hit':
        if (this.gate('rain', 0.05)) this.rainHit(e.x, e.flame);
        return;
      case 'splash':
        if (this.gate('splash', 0.09) && this.rand.chance(0.45)) this.splash(e.x);
        return;
      case 'moth-bite':
        if (this.gate('moth', 0.14)) this.mothBite(e.x);
        return;
      case 'wisp-lit':
        return this.wisp(e.x);
      case 'gate-open':
        return this.gateOpen(e.x);
      case 'crumble':
        return this.crumble(e.x);
      case 'rush-end':
      case 'wind':
        return;
    }
  }

  /** Rising chime: each spark is the next tone of the tonic arpeggio; the last one lands on the octave. */
  private spark(count: number, total: number, x: number): void {
    const t = this.now;
    const top = Key.ARP.indexOf(7);
    const start = Math.max(0, top - total + 1);
    const d = Key.ARP[clamp(start + count - 1, 0, Key.ARP.length - 1)];
    const m = this.deg(d, 79);
    const pan = panX(x);
    this.v.bell(this.pool, this.b.dry, t, mtof(m), 0.2, this.bellOpts(pan, 1.1, 1.3, 0.45));
    // Glint an octave up.
    this.v.bell(this.pool, this.b.dry, t + 0.012, mtof(m + 12), 0.05, { ratio: 2, index: 0.3, decay: 0.7, pan: -pan, send: this.b.echo, sendGain: 0.5 });
    this.v.noiseHit(this.pool, this.b.dry, t, { type: 'highpass', f0: 7000, q: 0.5, gain: 0.02, attack: 0.002, tau: 0.08, pan });
    if (count === total && total > 1) {
      // All gathered: two little grace notes above.
      const m2 = this.deg(d + 2, 79);
      const m3 = this.deg(d + 4, 79);
      this.v.bell(this.pool, this.b.dry, t + 0.11, mtof(m2), 0.09, this.bellOpts(pan * 0.5, 0.8, 1.1, 0.5));
      this.v.bell(this.pool, this.b.dry, t + 0.2, mtof(m3), 0.08, this.bellOpts(-pan * 0.5, 0.8, 1.6, 0.6));
    }
  }

  /** A rounded, pitched boing; consecutive bounces climb the current chord. */
  private bounce(speed: number, ink: boolean, x: number): void {
    const t = this.now;
    if (t - this.bounceT > 2.2) this.bounceI = 0;
    this.bounceT = t;
    const k = this.key;
    const m = k.chordTone(this.bounceI++ % 4, ink ? 67 : 60) + (this.bounceI > 4 ? 12 : 0);
    const f = mtof(m);
    const a = clamp(speed / 820, 0.35, 1.2);
    const pan = panX(x);
    this.v.tone(this.pool, this.b.dry, t, { wave: 'glow', freq: f * 0.72, to: f, glide: 0.07, gain: 0.17 * a, attack: 0.004, tau: ink ? 0.1 : 0.14, vib: [ink ? 13 : 9, 38], pan, send: this.b.echo, sendGain: 0.2 });
    this.v.tone(this.pool, this.b.dry, t, { freq: f * 2 * 0.8, to: f * 2, glide: 0.05, gain: 0.03 * a, attack: 0.003, tau: 0.06, pan });
    if (!ink) this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'lowpass', f0: 500, q: 0.7, gain: 0.08 * a, attack: 0.004, tau: 0.05, pan });
  }

  /** Comet ink catches Wick: an airy whoosh with a faint rising glint. */
  private rush(dx: number, x: number): void {
    if (!this.gate('rush', 0.25)) return;
    const t = this.now;
    const dir = dx >= 0 ? 1 : -1;
    const p = panX(x);
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'bandpass', f0: 450, f1: 2600, sweep: 0.32, q: 1.1, gain: 0.38, attack: 0.07, hold: 0.06, tau: 0.16, pan: p - dir * 0.3, panTo: p + dir * 0.4 });
    const m0 = this.deg(0, 72);
    this.v.tone(this.pool, this.b.dry, t + 0.02, { wave: 'sine', freq: mtof(m0), to: mtof(this.deg(4, 72) + 12), glide: 0.28, gain: 0.05, attack: 0.05, tau: 0.12, pan: p, send: this.b.echo, sendGain: 0.4 });
  }

  /** A soft thud scaled by impact speed. */
  private land(speed: number, x: number, q: number): void {
    const s = clamp(speed / 900, 0, 1.2);
    if (s < 0.12 || !this.gate('land', 0.08)) return;
    const t = this.now;
    const pan = panX(x) * 0.6;
    this.v.tone(this.pool, this.b.dry, t, { freq: 150, to: 52, glide: 0.09, gain: 0.3 * Math.pow(s, 0.8) * q, attack: 0.003, tau: 0.07, pan });
    this.v.tone(this.pool, this.b.dry, t, { wave: 'glow', freq: 260, to: 180, glide: 0.04, gain: 0.13 * s * q, attack: 0.002, tau: 0.04, pan });
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'paper', type: 'lowpass', f0: 1400, q: 0.5, gain: 0.16 * s * q, attack: 0.002, tau: 0.035, pan });
  }

  /** A tiny wooden tick when Wick turns around. */
  private turn(facing: number, x: number, q: number): void {
    const t = this.now;
    const f = facing > 0 ? 1480 : 1320;
    const pan = panX(x);
    this.v.tone(this.pool, this.b.dry, t, { freq: f, gain: 0.05 * q, attack: 0.001, tau: 0.013, pan });
    this.v.tone(this.pool, this.b.dry, t, { freq: f * 2.71, gain: 0.012 * q, attack: 0.001, tau: 0.006, pan });
  }

  /** Paper patter. */
  private step(x: number): void {
    const t = this.now;
    const r = this.rand;
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'paper', type: 'bandpass', f0: r.range(1700, 2800), q: 1.2, gain: r.range(0.08, 0.12), attack: 0.002, tau: 0.018, pan: panX(x) });
  }

  private death(cause: DeathCause, x: number): void {
    const t = this.now;
    const pan = panX(x);
    this.duck(0.5, 1.6);
    switch (cause) {
      case 'fall': {
        // Falling notes, drifting deeper into the reverb.
        const ds = [4, 2, 1, -1, -3];
        ds.forEach((d, i) => {
          const at = t + i * 0.16 + i * i * 0.025;
          const m = this.deg(d, 72);
          this.v.bell(this.pool, this.b.dry, at, mtof(m), 0.13 * (1 - i * 0.14), { ratio: 2, index: 0.5, decay: 1.2, pan: pan * (1 - i * 0.2), send: this.b.wet, sendGain: 0.4 + i * 0.25 });
        });
        this.v.tone(this.pool, this.b.dry, t, { wave: 'soft', freq: 640, to: 190, glide: 0.9, gain: 0.03, attack: 0.05, hold: 0.3, tau: 0.25, lowpass: 1200, pan, send: this.b.wet, sendGain: 0.6 });
        break;
      }
      case 'hazard': {
        this.v.tone(this.pool, this.b.dry, t, { freq: 760, to: 170, glide: 0.07, gain: 0.2, attack: 0.002, tau: 0.045, pan });
        this.v.noiseHit(this.pool, this.b.dry, t, { type: 'highpass', f0: 1500, q: 0.6, gain: 0.1, attack: 0.001, tau: 0.02, pan });
        this.v.noiseHit(this.pool, this.b.dry, t + 0.02, { buf: 'crackle', type: 'bandpass', f0: 2800, q: 0.7, gain: 0.45, attack: 0.01, hold: 0.08, tau: 0.16, pan, send: this.b.wet, sendGain: 0.3 });
        this.sigh(t + 0.32, pan, 0.6);
        break;
      }
      case 'doused': {
        this.v.noiseHit(this.pool, this.b.dry, t, { type: 'bandpass', f0: 3800, f1: 1600, sweep: 0.7, q: 0.55, gain: 0.26, attack: 0.02, hold: 0.06, tau: 0.22, pan, send: this.b.wet, sendGain: 0.25 });
        this.v.noiseHit(this.pool, this.b.dry, t + 0.08, { buf: 'crackle', type: 'bandpass', f0: 1900, f1: 1100, sweep: 0.7, q: 0.8, gain: 0.4, attack: 0.02, hold: 0.15, tau: 0.25, pan });
        this.v.noiseHit(this.pool, this.b.dry, t + 0.3, { buf: 'pink', type: 'lowpass', f0: 700, q: 0.5, gain: 0.06, attack: 0.04, tau: 0.2, pan });
        this.sigh(t + 0.45, pan, 0.55);
        break;
      }
      case 'stuck':
        this.sigh(t + 0.05, pan, 1);
        break;
    }
  }

  /** Sad two-note sigh: a reedy voice stepping down, with a little vibrato. */
  private sigh(t: number, pan: number, a: number): void {
    const m1 = this.deg(4, 67);
    const m2 = this.deg(3, 67);
    this.v.tone(this.pool, this.b.dry, t, { wave: 'reed', freq: mtof(m1), gain: 0.09 * a, attack: 0.06, hold: 0.22, tau: 0.08, lowpass: 1600, vib: [5, 10], pan, send: this.b.wet, sendGain: 0.3 });
    this.v.tone(this.pool, this.b.dry, t + 0.36, { wave: 'reed', freq: mtof(m1), to: mtof(m2), glide: 0.12, gain: 0.08 * a, attack: 0.05, hold: 0.4, tau: 0.2, lowpass: 1300, vib: [4.5, 14], pan, send: this.b.wet, sendGain: 0.4 });
  }

  /** The home-lamp lights: a gas-lamp whoomph, then the tonic chord blooms. */
  private win(x: number): void {
    const t = this.now;
    const pan = panX(x) * 0.5;
    this.duck(0.55, 1.8);
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'lowpass', f0: 160, f1: 1900, sweep: 0.14, q: 0.9, gain: 0.3, attack: 0.03, hold: 0.04, tau: 0.22, pan, send: this.b.wet, sendGain: 0.3 });
    this.v.tone(this.pool, this.b.dry, t, { freq: 62, to: 98, glide: 0.2, gain: 0.16, attack: 0.03, tau: 0.22 });
    this.v.tone(this.pool, this.b.dry, t, { wave: 'glow', freq: 124, to: 196, glide: 0.2, gain: 0.06, attack: 0.03, tau: 0.18 });
    // Chord bloom: the tonic chord, strummed upward across three octaves.
    const k = this.key;
    const c = k.s.prog[0];
    const ms: number[] = [];
    const base = k.tonicFrom(55);
    for (const o of [0, 12, 24]) for (const tn of c.tones) ms.push(base + o + (k.deg(c.deg + tn) - k.deg(c.deg)));
    const uniq = [...new Set(ms)].sort((a, b) => a - b).filter((m) => m <= base + 31);
    uniq.forEach((m, i) => {
      const at = t + 0.06 + i * 0.035;
      const lo = m < base + 12;
      if (lo) this.v.tone(this.pool, this.b.dry, at, { wave: 'warm', freq: mtof(m), gain: 0.045, attack: 0.25, hold: 0.4, tau: 0.8, lowpass: 1800, pan: (i % 2 ? -1 : 1) * 0.3, send: this.b.wet, sendGain: 0.5 });
      else this.v.bell(this.pool, this.b.dry, at, mtof(m), 0.085 * (1 - i * 0.03), { ratio: 3, index: 0.9, decay: 1.6, tink: 0.05, tinkRatio: 6.27, pan: -0.6 + (1.2 * i) / uniq.length, send: this.b.echo, sendGain: 0.3 });
    });
    this.v.noiseHit(this.pool, this.b.dry, t + 0.1, { type: 'highpass', f0: 6500, q: 0.4, gain: 0.03, attack: 0.3, tau: 0.5, send: this.b.wet, sendGain: 0.8 });
  }

  private go(): void {
    const t = this.now;
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'bandpass', f0: 900, f1: 2800, sweep: 0.12, q: 1.2, gain: 0.07, attack: 0.02, tau: 0.07 });
    this.v.bell(this.pool, this.b.dry, t + 0.02, mtof(this.deg(0, 72)), 0.07, this.bellOpts(-0.2, 0.7, 0.8, 0.3));
    this.v.bell(this.pool, this.b.dry, t + 0.13, mtof(this.deg(4, 72)), 0.07, this.bellOpts(0.2, 0.7, 1.0, 0.4));
  }

  /** Wick blinks back into being at the start. */
  private reappear(): void {
    const t = this.now + 0.05;
    this.v.bell(this.pool, this.b.dry, t, mtof(this.deg(4, 84)), 0.04, { ratio: 2, index: 0.4, decay: 0.9, send: this.b.echo, sendGain: 0.5 });
    this.v.noiseHit(this.pool, this.b.dry, t, { type: 'highpass', f0: 5000, q: 0.5, gain: 0.018, attack: 0.08, tau: 0.08 });
  }

  private nibTap(x: number): void {
    const t = this.now;
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'paper', type: 'bandpass', f0: 3400, q: 1, gain: 0.14, attack: 0.001, tau: 0.014, pan: panX(x) });
  }

  /** A stroke sets: a soft glassy chime on the pen's last note, flavoured by ink. */
  private strokeEnd(ink: string): void {
    const t = this.now;
    let m = this.penMidi();
    if (!m) m = this.key.chordTone(this.rand.int(0, 3), 74);
    m = this.key.nearestChordTone(m);
    if (ink === 'spring') {
      this.v.pluck(this.pool, this.b.dry, t, mtof(m + 12), 0.04, { wave: 'pluck', decay: 0.1, bend: 0.8, bendTime: 0.05, send: this.b.echo, sendGain: 0.4 });
    } else if (ink === 'comet') {
      this.v.noiseHit(this.pool, this.b.dry, t, { type: 'bandpass', f0: mtof(m + 12), q: 10, gain: 0.08, attack: 0.03, tau: 0.12, send: this.b.echo, sendGain: 0.3 });
    }
    this.v.bell(this.pool, this.b.dry, t, mtof(m + 12), 0.04, { ratio: 2, index: 0.4, decay: 1.0, send: this.b.echo, sendGain: 0.45 });
  }

  /** Dry nib sputter. */
  private sputter(x: number, a: number): void {
    const t = this.now;
    const pan = panX(x);
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'crackle', type: 'bandpass', f0: 2600, q: 0.8, gain: 0.4 * a, attack: 0.003, tau: 0.06, pan });
    this.v.tone(this.pool, this.b.dry, t, { wave: 'glow', freq: 420, to: 300, glide: 0.03, gain: 0.08 * a, attack: 0.001, tau: 0.018, pan });
  }

  /** The inkwell runs dry: sputters, then a hollow little knock. */
  private inkDry(x: number): void {
    const t = this.now;
    const pan = panX(x);
    for (let i = 0; i < 3; i++) this.v.noiseHit(this.pool, this.b.dry, t + i * this.rand.range(0.05, 0.09), { buf: 'crackle', type: 'bandpass', f0: 2400 - i * 400, q: 0.8, gain: 0.34 * (1 - i * 0.22), attack: 0.003, tau: 0.045, pan });
    const m = this.deg(0, 57);
    this.v.tone(this.pool, this.b.dry, t + 0.22, { wave: 'glow', freq: mtof(m), gain: 0.09, attack: 0.004, tau: 0.09, pan });
    this.v.tone(this.pool, this.b.dry, t + 0.34, { wave: 'glow', freq: mtof(m - 5), gain: 0.07, attack: 0.004, tau: 0.12, pan });
  }

  /** Reverse swish: the stroke is pulled back into the pen. */
  private undo(): void {
    const t = this.now;
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'bandpass', f0: 700, f1: 2600, sweep: 0.2, q: 1, gain: 0.2, attack: 0.19, tau: 0.018, pan: 0.2, panTo: -0.2 });
    const m = this.key.chordTone(2, 76);
    this.v.tone(this.pool, this.b.dry, t, { freq: mtof(m), gain: 0.035, attack: 0.2, tau: 0.02, send: this.b.echo, sendGain: 0.3 });
  }

  /** A wipe across the page and the light falling away. */
  private clear(): void {
    const t = this.now;
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'pink', type: 'bandpass', f0: 2200, f1: 450, sweep: 0.4, q: 0.7, gain: 0.13, attack: 0.08, hold: 0.18, tau: 0.12, pan: -0.4, panTo: 0.4 });
    for (let i = 0; i < 5; i++) {
      const m = this.key.chordTone(4 - i, 79);
      this.v.bell(this.pool, this.b.dry, t + 0.05 + i * 0.05, mtof(m), 0.035, { ratio: 2, index: 0.4, decay: 0.6, pan: 0.4 - i * 0.2 });
    }
  }

  /** Glug-glug, then a shimmer of fresh ink. */
  private inkpot(x: number): void {
    const t = this.now;
    const pan = panX(x);
    const r = this.rand;
    for (let i = 0; i < 3; i++) {
      const f0 = r.range(240, 360);
      this.v.tone(this.pool, this.b.dry, t + i * r.range(0.06, 0.085), { freq: f0, to: f0 * 2.3, glide: 0.05, gain: 0.12, attack: 0.004, tau: 0.035, pan });
    }
    for (let i = 0; i < 4; i++) {
      const m = this.key.chordTone(i, 79) + (i === 3 ? 12 : 0);
      this.v.bell(this.pool, this.b.dry, t + 0.2 + i * 0.06, mtof(m), 0.07 - i * 0.008, { ratio: 3.5, index: 0.8, decay: 0.9, pan: pan + (i - 1.5) * 0.15, send: this.b.echo, sendGain: 0.45 });
    }
    this.v.noiseHit(this.pool, this.b.dry, t + 0.2, { type: 'highpass', f0: 7500, q: 0.4, gain: 0.02, attack: 0.1, tau: 0.2, pan });
  }

  /** Rain on the flame: a sizzle; a worried little tone as the flame weakens. */
  private rainHit(x: number, flame: number): void {
    const t = this.now;
    const pan = panX(x);
    this.v.noiseHit(this.pool, this.b.dry, t, { type: 'highpass', f0: 3000, q: 0.6, gain: 0.15, attack: 0.004, tau: 0.1, pan });
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'crackle', type: 'bandpass', f0: 4000, q: 0.8, gain: 0.2, attack: 0.002, tau: 0.07, pan });
    if (flame < 0.7) this.v.tone(this.pool, this.b.dry, t + 0.03, { wave: 'soft', freq: 880, to: 560, glide: 0.18, gain: 0.03 * (1 - flame), attack: 0.01, tau: 0.08, pan });
  }

  /** A single droplet plink. */
  private splash(x: number): void {
    const t = this.now;
    const r = this.rand;
    const f = r.range(1400, 3000);
    this.v.tone(this.pool, this.b.dry, t, { freq: f, to: f * 1.6, glide: 0.02, gain: r.range(0.015, 0.03), attack: 0.001, tau: 0.02, pan: panX(x) });
  }

  private mothBite(x: number): void {
    const t = this.now;
    const pan = panX(x);
    for (let i = 0; i < 2; i++) this.v.noiseHit(this.pool, this.b.dry, t + i * 0.035, { type: 'bandpass', f0: 4200 + i * 700, q: 2.2, gain: 0.2, attack: 0.001, tau: 0.007, pan });
    this.v.noiseHit(this.pool, this.b.dry, t + 0.02, { buf: 'pink', type: 'lowpass', f0: 1500, q: 0.5, gain: 0.05, attack: 0.005, tau: 0.03, pan });
  }

  /** A wisp-lantern lights: a bright double chime (fifth + octave). */
  private wisp(x: number): void {
    const t = this.now;
    const pan = panX(x);
    const m = this.deg(7, 79);
    this.v.bell(this.pool, this.b.dry, t, mtof(m), 0.14, this.bellOpts(pan, 1.3, 1.4, 0.5));
    this.v.bell(this.pool, this.b.dry, t + 0.07, mtof(this.deg(4, 79) + 12), 0.1, this.bellOpts(pan, 1.3, 1.6, 0.5));
    this.v.tone(this.pool, this.b.dry, t, { wave: 'soft', freq: mtof(m - 12), gain: 0.04, attack: 0.2, hold: 0.2, tau: 0.4, pan, send: this.b.wet, sendGain: 0.4 });
    this.v.noiseHit(this.pool, this.b.dry, t, { type: 'highpass', f0: 6500, q: 0.4, gain: 0.025, attack: 0.004, tau: 0.15, pan });
  }

  /** A paper gate slides open, ending with a soft wooden knock. */
  private gateOpen(x: number): void {
    const t = this.now;
    const pan = panX(x);
    this.v.noiseHit(this.pool, this.b.dry, t, { buf: 'paper', type: 'bandpass', f0: 800, f1: 1800, sweep: 0.75, q: 1.4, gain: 0.3, attack: 0.15, hold: 0.45, tau: 0.08, pan });
    this.v.tone(this.pool, this.b.dry, t + 0.72, { wave: 'glow', freq: 196, to: 170, glide: 0.05, gain: 0.14, attack: 0.002, tau: 0.05, pan });
    this.v.noiseHit(this.pool, this.b.dry, t + 0.72, { buf: 'pink', type: 'lowpass', f0: 900, q: 0.5, gain: 0.05, attack: 0.002, tau: 0.03, pan });
  }

  /** Paper tearing in irregular little rips. */
  private crumble(x: number): void {
    const t = this.now;
    const pan = panX(x);
    const r = this.rand;
    let at = t;
    for (let i = 0; i < 7; i++) {
      this.v.noiseHit(this.pool, this.b.dry, at, { buf: i % 2 ? 'crackle' : 'paper', type: 'bandpass', f0: r.range(1600, 3400), q: 0.8, gain: r.range(0.18, 0.34), attack: 0.004, hold: r.range(0.01, 0.04), tau: 0.03, pan: pan + r.range(-0.1, 0.1) });
      at += r.range(0.03, 0.08);
    }
    this.v.noiseHit(this.pool, this.b.dry, t + 0.32, { buf: 'pink', type: 'lowpass', f0: 700, q: 0.5, gain: 0.08, attack: 0.003, tau: 0.06, pan });
  }

  /** Dawn: the sun is the last lamp. A slow, wide swell of the tonic and light climbing three octaves. */
  dawn(): void {
    const t = this.now + 0.2;
    const k = this.key;
    const c = k.s.prog[0];
    const root = k.tonicFrom(43);
    const tones = c.tones.map((tn) => k.deg(c.deg + tn) - k.deg(c.deg));
    const swell: number[] = [];
    for (const o of [0, 12, 24, 36]) for (const iv of tones) if (root + o + iv <= root + 38) swell.push(root + o + iv);
    swell.forEach((m, i) => {
      const lo = m < root + 12;
      this.v.tone(this.pool, this.b.dry, t + i * 0.12, {
        wave: lo ? 'warm' : 'soft',
        freq: mtof(m),
        gain: lo ? 0.05 : 0.03,
        attack: 2.4,
        hold: 2.6,
        tau: 1.6,
        lowpass: 2600,
        vib: [4 + i * 0.3, 5],
        pan: (i % 2 ? -1 : 1) * Math.min(0.7, 0.1 * i),
        send: this.b.wet,
        sendGain: 0.7,
      });
    });
    const arp: number[] = [];
    for (let i = 0; arp.length < 12; i++) arp.push(k.chordTone(i, root + 19));
    arp.forEach((m, i) => {
      const last = i === arp.length - 1;
      this.v.bell(this.pool, this.b.dry, t + 1.2 + i * 0.19 + i * i * 0.006, mtof(m), last ? 0.12 : 0.05 + i * 0.005, { ratio: 3, index: 0.9, decay: last ? 3 : 1.4, tink: 0.05, tinkRatio: 6.27, pan: -0.6 + (1.2 * i) / arp.length, send: this.b.echo, sendGain: 0.45 });
    });
    this.v.noiseHit(this.pool, this.b.dry, t + 0.5, { type: 'highpass', f0: 6000, q: 0.4, gain: 0.02, attack: 2.5, hold: 1, tau: 1.2, send: this.b.wet, sendGain: 0.8 });
  }

  // ───────────────────────────── UI ─────────────────────────────

  ui(name: UiSound): void {
    const t = this.now;
    const v = this.v;
    const p = this.pool;
    const d = this.b.dry;
    switch (name) {
      case 'tap': {
        if (!this.gate('ui-tap', 0.03)) return;
        const m = this.deg(0, 88);
        v.tone(p, d, t, { freq: mtof(m), gain: 0.045, attack: 0.001, tau: 0.016 });
        v.noiseHit(p, d, t, { type: 'highpass', f0: 5000, q: 0.6, gain: 0.025, attack: 0.001, tau: 0.004 });
        return;
      }
      case 'back':
        v.tone(p, d, t, { wave: 'glow', freq: mtof(this.deg(4, 76)), gain: 0.05, attack: 0.002, tau: 0.045 });
        v.tone(p, d, t + 0.065, { wave: 'glow', freq: mtof(this.deg(0, 76)), gain: 0.045, attack: 0.002, tau: 0.06 });
        return;
      case 'open':
        v.bell(p, d, t, mtof(this.deg(0, 76)), 0.05, { ratio: 2, index: 0.5, decay: 0.5, pan: -0.15, send: this.b.echo, sendGain: 0.2 });
        v.bell(p, d, t + 0.06, mtof(this.deg(4, 76)), 0.05, { ratio: 2, index: 0.5, decay: 0.7, pan: 0.15, send: this.b.echo, sendGain: 0.25 });
        v.noiseHit(p, d, t, { buf: 'pink', type: 'bandpass', f0: 1200, f1: 2400, q: 0.8, gain: 0.025, attack: 0.05, tau: 0.06 });
        return;
      case 'close':
        v.bell(p, d, t, mtof(this.deg(4, 76)), 0.045, { ratio: 2, index: 0.4, decay: 0.45, pan: 0.15 });
        v.bell(p, d, t + 0.06, mtof(this.deg(2, 76)), 0.04, { ratio: 2, index: 0.4, decay: 0.6, pan: -0.15 });
        return;
      case 'select': {
        if (!this.gate('ui-sel', 0.04)) return;
        const m = this.key.chordTone(this.rand.int(0, 3), 84);
        v.bell(p, d, t, mtof(m), 0.05, { ratio: 3.5, index: 0.6, decay: 0.35, send: this.b.echo, sendGain: 0.2 });
        return;
      }
      case 'star': {
        if (t - this.starT > 1.6) this.starI = 0;
        this.starT = t;
        const i = this.starI++;
        const m = this.deg(Key.ARP[Math.min(i + 1, Key.ARP.length - 1)], 84);
        v.bell(p, d, t, mtof(m), 0.16, this.bellOpts((i - 1) * 0.35, 1.2, 1.4, 0.5));
        v.bell(p, d, t + 0.015, mtof(m + 12), 0.04, { ratio: 2, index: 0.3, decay: 0.8, pan: -(i - 1) * 0.35 });
        v.noiseHit(p, d, t, { type: 'highpass', f0: 7500, q: 0.4, gain: 0.02, attack: 0.002, tau: 0.12 });
        return;
      }
      case 'unlock': {
        for (let i = 0; i < 6; i++) {
          const m = this.deg(Key.ARP[i], 72);
          v.bell(p, d, t + i * 0.075, mtof(m), 0.09 - i * 0.006, this.bellOpts(-0.5 + i * 0.2, 0.9, 1.2 + i * 0.15, 0.45));
        }
        v.noiseHit(p, d, t + 0.3, { type: 'highpass', f0: 6000, q: 0.4, gain: 0.03, attack: 0.25, tau: 0.4, send: this.b.wet, sendGain: 0.6 });
        return;
      }
      case 'deny': {
        if (!this.gate('ui-deny', 0.15)) return;
        const m = this.deg(0, 50);
        for (let i = 0; i < 2; i++) {
          v.tone(p, d, t + i * 0.11, { wave: 'glow', freq: mtof(i ? this.deg(-1, 50) : m), gain: 0.1, attack: 0.003, tau: 0.05, lowpass: 900 });
          v.noiseHit(p, d, t + i * 0.11, { buf: 'pink', type: 'lowpass', f0: 800, q: 0.5, gain: 0.04, attack: 0.002, tau: 0.02 });
        }
        return;
      }
    }
  }
}

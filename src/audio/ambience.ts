// The sleeping forest: quiet environmental beds derived from the level (rain clouds, wind gusts, the
// river under Starwater) and sparse night critters per world — crickets at dusk, cave drips in the
// hollow, a far owl in Moth Wood, and birds that wake a little more with every lamp at daybreak.
import type { LevelDef } from '../core/types';
import { W } from '../core/constants';
import type { AudioMode } from './audio';
import type { Rand } from './dsp';
import type { WorldSound } from './theory';
import { Pool, type Voices } from './voices';

export interface AmbBuses {
  /** Ambience sum (sfx volume applied downstream). */
  out: GainNode;
  wet: AudioNode;
}

interface Bed {
  gain: GainNode;
  stop(): void;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class Ambience {
  private beds: Bed[] = [];
  private s: WorldSound | null = null;
  private lift = 0.5;
  private mode: AudioMode = 'menu';
  private next = 0;
  private nextOwl = 0;
  readonly pool = new Pool(10, false);

  constructor(
    private readonly v: Voices,
    private readonly b: AmbBuses,
    private readonly rand: Rand,
  ) {}

  private get ctx(): BaseAudioContext {
    return this.v.ctx;
  }

  setWorld(s: WorldSound): void {
    if (s !== this.s) {
      this.s = s;
      this.next = 0;
      this.nextOwl = 0;
    }
  }

  setMode(mode: AudioMode): void {
    this.mode = mode;
    const now = this.ctx.currentTime;
    this.b.out.gain.setTargetAtTime(mode === 'menu' ? 0.55 : mode === 'win' ? 0.7 : 1, now, 0.8);
  }

  setLift(l: number): void {
    this.lift = l;
    if (this.s?.critters === 'birds') this.next = Math.min(this.next, this.ctx.currentTime + 0.8);
  }

  /** Build the environmental beds for a level (or none, for menus). */
  setLevel(level: LevelDef | null, s: WorldSound, lift: number): void {
    this.setWorld(s);
    this.lift = lift;
    const now = this.ctx.currentTime;
    for (const bed of this.beds) {
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setTargetAtTime(0, now, 0.6);
      bed.stop();
    }
    this.beds = [];
    const ents = level?.entities ?? [];
    let rainSpan = 0;
    let rainX = 0;
    let windPow = 0;
    let windX = 0;
    let moths = 0;
    for (const e of ents) {
      if (e.kind === 'rain') {
        const span = Math.abs(e.x2 - e.x1) * ((e.rate ?? 22) / 22);
        rainSpan += span;
        rainX += ((e.x1 + e.x2) / 2) * span;
      } else if (e.kind === 'moth') {
        moths++;
      } else if (e.kind === 'wind') {
        const p = (Math.hypot(e.fx, e.fy) / 1500) * Math.sqrt((e.w * e.h) / (300 * 300));
        windPow += p;
        windX += (e.x + e.w / 2) * p;
      }
    }
    if (rainSpan > 0) this.beds.push(this.rainBed(clamp(Math.sqrt(rainSpan / 500), 0.5, 1.5), rainX / rainSpan, now));
    if (windPow > 0) this.beds.push(this.windBed(clamp(windPow, 0.4, 1.3), windX / windPow, now));
    if (level && s.critters === 'river') this.beds.push(this.riverBed(now));
    if (moths > 0) this.beds.push(this.mothBed(clamp(Math.sqrt(moths) * 0.6, 0.5, 1.2), now));
    if (level && s.signature === 'thunder' && windPow === 0) this.beds.push(this.windBed(0.3, W / 2, now));
  }

  private loop(buf: AudioBuffer, now: number, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(now, this.rand.range(0, buf.duration * 0.9));
    return src;
  }

  private lfo(freq: number, depth: number, target: AudioParam, now: number): OscillatorNode {
    const o = this.v.osc('sine', freq);
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start(now);
    return o;
  }

  private panner(x: number): AudioNode {
    if (!this.v.hasPan) return this.b.out;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp((x / W - 0.5) * 1.2, -0.7, 0.7);
    p.connect(this.b.out);
    return p;
  }

  private bed(level: number, now: number, build: (gain: GainNode) => AudioNode[]): Bed {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, now, 1.2);
    const parts = build(gain);
    const sources = parts.filter((p): p is AudioScheduledSourceNode => typeof (p as Partial<AudioScheduledSourceNode>).stop === 'function');
    return {
      gain,
      stop: () => {
        const at = this.ctx.currentTime + 3;
        for (const s of sources) {
          try {
            s.stop(at);
          } catch {
            /* ignore */
          }
        }
        if (sources[0])
          sources[0].onended = () => {
            gain.disconnect();
            // Never the shared ambience bus (panner() returns it when StereoPanner is missing).
            for (const p of parts) if (p !== this.b.out) p.disconnect();
          };
      },
    };
  }

  /** Steady rain: bright hiss with a slow swell, and a patter texture on top. */
  private rainBed(k: number, x: number, now: number): Bed {
    const ctx = this.ctx;
    return this.bed(0.042 * k, now, (gain) => {
      const out = this.panner(x);
      gain.connect(out);
      // Soft rain on leaves: pink noise, band-limited, with a slow swell.
      const hiss = this.loop(this.v.noise.pink, now);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      lp.Q.value = 0.5;
      hiss.connect(hp);
      hp.connect(lp);
      const swell = ctx.createGain();
      swell.gain.value = 0.8;
      lp.connect(swell);
      swell.connect(gain);
      const l1 = this.lfo(0.09, 0.22, swell.gain, now);
      // Patter: sparse droplets on paper and glass.
      const pat = this.loop(this.v.noise.crackle, now, 0.7);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.8;
      const pg = ctx.createGain();
      pg.gain.value = 0.7;
      pat.connect(bp);
      bp.connect(pg);
      pg.connect(gain);
      const verb = ctx.createGain();
      verb.gain.value = 0.3;
      gain.connect(verb);
      verb.connect(this.b.wet);
      return [hiss, pat, l1, hp, lp, swell, bp, pg, verb, out];
    });
  }

  /** Wind: a band of noise whose centre wanders, in slow gusts, with a thin whistle above. */
  private windBed(k: number, x: number, now: number): Bed {
    const ctx = this.ctx;
    return this.bed(0.07 * k, now, (gain) => {
      const out = this.panner(x);
      gain.connect(out);
      const src = this.loop(this.v.noise.pink, now);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 1.8;
      const gust = ctx.createGain();
      gust.gain.value = 0.75;
      src.connect(bp);
      bp.connect(gust);
      gust.connect(gain);
      const l1 = this.lfo(0.07, 240, bp.frequency, now);
      const l2 = this.lfo(0.13, 0.35, gust.gain, now);
      const wh = ctx.createBiquadFilter();
      wh.type = 'bandpass';
      wh.frequency.value = 1500;
      wh.Q.value = 9;
      const wg = ctx.createGain();
      wg.gain.value = 0.3;
      src.connect(wh);
      wh.connect(wg);
      wg.connect(gust);
      const l3 = this.lfo(0.05, 300, wh.frequency, now);
      return [src, l1, l2, l3, bp, gust, wh, wg, out];
    });
  }

  /** The river under Starwater: a low, soft flow with a gentle babble. */
  private riverBed(now: number): Bed {
    const ctx = this.ctx;
    return this.bed(0.045, now, (gain) => {
      gain.connect(this.b.out);
      const src = this.loop(this.v.noise.brown, now);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      src.connect(lp);
      lp.connect(gain);
      const bab = this.loop(this.v.noise.pink, now);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 2.5;
      const bg = ctx.createGain();
      bg.gain.value = 0.3;
      bab.connect(bp);
      bp.connect(bg);
      bg.connect(gain);
      const l1 = this.lfo(0.31, 380, bp.frequency, now);
      const l2 = this.lfo(0.53, 0.15, bg.gain, now);
      return [src, bab, l1, l2, lp, bp, bg];
    });
  }

  /** Moth wings: a soft, papery flutter that drifts around the stereo field. */
  private mothBed(k: number, now: number): Bed {
    const ctx = this.ctx;
    return this.bed(0.03 * k, now, (gain) => {
      const out = this.panner(W / 2);
      gain.connect(out);
      const src = this.loop(this.v.noise.paper, now, 0.6);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.1;
      const flutter = ctx.createGain();
      flutter.gain.value = 0.5;
      src.connect(bp);
      bp.connect(flutter);
      flutter.connect(gain);
      const l1 = this.lfo(17, 0.45, flutter.gain, now);
      const l2 = this.lfo(0.21, 0.35, gain.gain, now);
      const l3 = this.lfo(0.11, 350, bp.frequency, now);
      const parts: AudioNode[] = [src, l1, l2, l3, bp, flutter];
      // Drift slowly across the stereo field (only when panner() made a real panner).
      if (out !== this.b.out) {
        parts.push(out, this.lfo(0.07, 0.5, (out as StereoPannerNode).pan, now));
      }
      return parts;
    });
  }

  // ───────────────────────────── critters ─────────────────────────────

  pump(until: number): void {
    const s = this.s;
    if (!s || s.critters === 'none') return;
    const now = this.ctx.currentTime;
    if (this.next < now - 1) this.next = now + this.rand.range(1, 3);
    const calm = this.mode === 'menu' ? 1.8 : 1;
    let guard = 0;
    while (this.next < until && guard++ < 4) {
      const t = this.next;
      this.critter(s, t);
      this.next = t + this.gap(s) * calm;
    }
  }

  private gap(s: WorldSound): number {
    const r = this.rand;
    switch (s.critters) {
      case 'crickets':
        return r.range(0.7, 2.6);
      case 'drips':
        return r.range(1.6, 5);
      case 'river':
        return r.range(7, 15);
      case 'owls':
        return r.range(3, 6);
      case 'birds':
        return r.range(5, 12) / (0.35 + this.lift * 1.6);
      default:
        return 10;
    }
  }

  private critter(s: WorldSound, t: number): void {
    const v = this.v;
    const p = this.pool;
    const r = this.rand;
    const out = this.b.out;
    switch (s.critters) {
      case 'crickets': {
        const f = r.chance(0.5) ? r.range(4150, 4300) : r.range(4450, 4600);
        const pan = f < 4400 ? -0.55 : 0.5;
        const n = r.int(2, 4);
        for (let i = 0; i < n; i++) v.tone(p, out, t + i * 0.042, { freq: f, gain: 0.01, attack: 0.006, hold: 0.008, tau: 0.006, pan });
        break;
      }
      case 'drips': {
        const f = r.range(750, 1500);
        v.tone(p, out, t, { freq: f, to: f * 1.9, glide: 0.03, gain: 0.03, attack: 0.001, tau: 0.035, pan: r.range(-0.7, 0.7), send: this.b.wet, sendGain: 1 });
        if (r.chance(0.3)) v.tone(p, out, t + r.range(0.15, 0.3), { freq: f * 1.2, to: f * 2.2, glide: 0.03, gain: 0.018, attack: 0.001, tau: 0.03, pan: r.range(-0.7, 0.7), send: this.b.wet, sendGain: 1 });
        break;
      }
      case 'river': {
        const f = r.range(300, 520);
        v.tone(p, out, t, { freq: f, to: f * 2.4, glide: 0.05, gain: 0.02, attack: 0.002, tau: 0.05, pan: r.range(-0.6, 0.6), send: this.b.wet, sendGain: 0.8 });
        break;
      }
      case 'owls': {
        // Rare: most checks pass silently; a far owl every ~20–40 s.
        if (t < this.nextOwl) break;
        this.nextOwl = t + r.range(18, 38);
        const pan = r.range(-0.7, 0.7);
        const f = r.range(360, 400);
        const hoot = (at: number, len: number, a: number) =>
          v.tone(p, out, at, { wave: 'soft', freq: f * 1.04, to: f * 0.94, glide: len, gain: 0.03 * a, attack: 0.05, hold: len * 0.6, tau: 0.07, lowpass: 900, pan, send: this.b.wet, sendGain: 1.2 });
        hoot(t, 0.3, 1);
        hoot(t + 0.62, 0.16, 0.7);
        hoot(t + 0.86, 0.34, 0.85);
        break;
      }
      case 'birds': {
        const pan = r.range(-0.8, 0.8);
        const n = r.int(2, 5);
        const base = r.range(2600, 3600);
        const upward = r.chance(0.5);
        let at = t;
        for (let i = 0; i < n; i++) {
          const f0 = base * r.range(0.92, 1.08);
          const f1 = upward ? f0 * r.range(1.25, 1.5) : f0 * r.range(0.7, 0.85);
          const len = r.range(0.04, 0.08);
          v.tone(p, out, at, { freq: f0, to: f1, glide: len, gain: 0.012 * (0.6 + this.lift * 0.6), attack: 0.006, hold: len * 0.6, tau: 0.02, pan, send: this.b.wet, sendGain: 0.4 });
          at += len + r.range(0.05, 0.12);
        }
        break;
      }
    }
  }

  stopAll(): void {
    for (const bed of this.beds) bed.stop();
    this.beds = [];
  }
}

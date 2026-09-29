// The pen instrument (DESIGN.md pillar 2: "drawing is playing music").
// While drawing, a soft tone follows the pen's height, quantised to the world's scale with hysteresis
// and glide; its loudness follows pen speed and settles to a whisper when the pen rests. Each ink has
// its own voice, and a faint paper scratch rides underneath.
import type { InkType } from '../core/types';
import { H, W } from '../core/constants';
import type { Key } from './theory';
import { mtof } from './theory';
import { Pool, type Voices } from './voices';

export interface PenBuses {
  dry: AudioNode;
  echo: AudioNode;
}

interface Live {
  ink: InkType;
  vol: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode | null;
  scratch: GainNode;
  scratchSrc: AudioBufferSourceNode;
  /** Oscillators whose frequency tracks the note (with their multiplier). */
  pitched: [OscillatorNode, number][];
  /** Comet's resonant air filter (tracks the note). */
  air: BiquadFilterNode | null;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Per-ink voice settings. */
const INK = {
  moon: { max: 0.085, floor: 0.014, glide: 0.035, cutoff: 2600, echo: 0.24 },
  spring: { max: 0.03, floor: 0.006, glide: 0.012, cutoff: 1400, echo: 0.3 },
  comet: { max: 0.075, floor: 0.012, glide: 0.022, cutoff: 5200, echo: 0.16 },
} as const;

export class PenInstrument {
  private live: Live | null = null;
  private notes: number[] = [];
  private noteIdx = -1;
  private flowing = true;
  private lastArtic = 0;
  private sp = 0;
  /** Last note the pen sang (for the stroke-end chime). */
  lastMidi = 0;
  readonly pool = new Pool(8, true);

  constructor(
    private readonly v: Voices,
    private readonly key: Key,
    private readonly b: PenBuses,
  ) {}

  private get ctx(): BaseAudioContext {
    return this.v.ctx;
  }

  /** Recompute the pen's note ladder (two octaves around the world's pen centre). */
  retune(): void {
    const c = this.key.s.pen;
    this.notes = this.key.melodyNotes(c - 12, c + 12);
    this.noteIdx = -1;
  }

  move(x: number, y: number, speed: number, ink: InkType): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!this.notes.length) this.retune();
    if (!this.live || this.live.ink !== ink) {
      if (this.live) this.up();
      this.start(ink, now);
      this.flowing = true;
    }
    const L = this.live!;
    const cfg = INK[ink];
    // Pitch: higher on the page = higher note. Hysteresis stops flicker at note boundaries.
    const h = clamp(1 - y / H, 0, 1);
    const cont = h * (this.notes.length - 1);
    const prev = this.noteIdx;
    if (this.noteIdx < 0 || Math.abs(cont - this.noteIdx) > 0.72) {
      // Chord tones are wider targets: a passing note yields to a neighbouring chord tone when the
      // pen is anywhere near it, so free scribbles lean consonant with whatever the pads are holding.
      let i = clamp(Math.round(cont), 0, this.notes.length - 1);
      if (!this.key.isChordTone(this.notes[i])) {
        const j = cont >= i ? i + 1 : i - 1;
        if (j >= 0 && j < this.notes.length && this.key.isChordTone(this.notes[j]) && Math.abs(cont - j) < 0.8) i = j;
      }
      this.noteIdx = i;
    }
    const midi = this.notes[this.noteIdx];
    const f = mtof(midi);
    const changed = this.noteIdx !== prev;
    for (const [o, mul] of L.pitched) {
      if (prev < 0) o.frequency.setValueAtTime(f * mul, now);
      else o.frequency.setTargetAtTime(f * mul, now, cfg.glide);
    }
    if (L.air) L.air.frequency.setTargetAtTime(f * 2, now, cfg.glide);
    this.lastMidi = midi;

    // Loudness follows speed, then relaxes to a whisper if the pen stops moving.
    const sp = clamp(speed / 1000, 0, 1.4);
    this.sp = this.sp * 0.5 + sp * 0.5;
    const s = this.sp;
    const target = this.flowing ? cfg.floor + (cfg.max - cfg.floor) * Math.sqrt(Math.min(1, s)) : 0;
    const g = L.vol.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(target, now, prev < 0 ? 0.012 : 0.04);
    g.setTargetAtTime(this.flowing ? cfg.floor : 0, now + 0.12, 0.28);
    L.filter.frequency.setTargetAtTime(cfg.cutoff * (0.8 + s * 0.9), now, 0.06);
    const sg = L.scratch.gain;
    sg.cancelScheduledValues(now);
    sg.setTargetAtTime(0.004 + 0.05 * Math.min(1, s), now, 0.03);
    sg.setTargetAtTime(0.002, now + 0.08, 0.1);
    L.scratchSrc.playbackRate.setTargetAtTime(0.7 + 0.5 * Math.min(1.2, s), now, 0.05);
    if (L.pan) L.pan.pan.setTargetAtTime(clamp((x / W - 0.5) * 1.1, -0.6, 0.6), now, 0.05);

    // Articulation on note changes.
    if ((changed || prev < 0) && this.flowing) this.articulate(ink, midi, s, now, x);
  }

  private articulate(ink: InkType, midi: number, s: number, now: number, x: number): void {
    const pan = clamp((x / W - 0.5) * 1.1, -0.6, 0.6);
    if (ink === 'spring') {
      if (now - this.lastArtic < 0.055) return;
      this.lastArtic = now;
      // A rounded "boing" pluck: bends up into the note.
      this.v.pluck(this.pool, this.b.dry, now, mtof(midi), 0.075 * (0.45 + 0.55 * Math.min(1, s)), {
        wave: 'pluck',
        decay: 0.13,
        bend: 0.78,
        bendTime: 0.06,
        cutoff: 2000,
        open: 2.2,
        pan,
        send: this.b.echo,
        sendGain: INK.spring.echo,
      });
      this.v.pluck(this.pool, this.b.dry, now, mtof(midi - 12), 0.03 * (0.5 + 0.5 * Math.min(1, s)), { wave: 'sine', decay: 0.1, bend: 0.85, bendTime: 0.05, pan });
    } else if (ink === 'moon') {
      if (now - this.lastArtic < 0.07) return;
      this.lastArtic = now;
      // A barely-there glass "ting" marks each new note.
      this.v.bell(this.pool, this.b.dry, now, mtof(midi + 12), 0.022 * (0.4 + Math.min(1, s)), { ratio: 2, index: 0.35, decay: 0.45, pan, send: this.b.echo, sendGain: 0.35 });
    }
  }

  private start(ink: InkType, now: number): void {
    const ctx = this.ctx;
    const v = this.v;
    const cfg = INK[ink];
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const pitched: [OscillatorNode, number][] = [];

    let pan: StereoPannerNode | null = null;
    let out: AudioNode = this.b.dry;
    if (v.hasPan) {
      pan = ctx.createStereoPanner();
      pan.connect(this.b.dry);
      out = pan;
      nodes.push(pan);
    }
    const echo = ctx.createGain();
    echo.gain.value = cfg.echo;
    echo.connect(this.b.echo);
    nodes.push(echo);

    const vol = ctx.createGain();
    vol.gain.value = 0;
    vol.connect(out);
    vol.connect(echo);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.cutoff;
    filter.Q.value = 0.6;
    filter.connect(vol);
    nodes.push(vol, filter);

    const add = (wave: Parameters<Voices['osc']>[0], mul: number, amp: number, detune = 0): OscillatorNode => {
      const o = v.osc(wave, 440 * mul);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g);
      g.connect(filter);
      o.start(now);
      pitched.push([o, mul]);
      sources.push(o);
      nodes.push(o, g);
      return o;
    };

    let air: BiquadFilterNode | null = null;
    if (ink === 'moon') {
      // Glass harmonica: two slightly detuned sines + a soft octave triangle, with a slow vibrato.
      const a = add('sine', 1, 0.7, -4);
      const b = add('sine', 1, 0.5, 5);
      add('triangle', 2, 0.1);
      const lfo = v.osc('sine', 5.2);
      const lg = ctx.createGain();
      lg.gain.value = 0;
      lg.gain.setValueAtTime(0, now);
      lg.gain.linearRampToValueAtTime(7, now + 0.4);
      lfo.connect(lg);
      lg.connect(a.detune);
      lg.connect(b.detune);
      lfo.start(now);
      sources.push(lfo);
      nodes.push(lfo, lg);
    } else if (ink === 'spring') {
      // A soft round body under the plucks.
      add('glow', 1, 0.8);
      add('sine', 0.5, 0.35);
    } else {
      // Comet: an airy whistle — tuned resonant noise + a thin sine.
      add('sine', 2, 0.22);
      add('triangle', 1, 0.12);
      const src = ctx.createBufferSource();
      src.buffer = v.noise.white;
      src.loop = true;
      air = ctx.createBiquadFilter();
      air.type = 'bandpass';
      air.Q.value = 14;
      air.frequency.value = 880;
      const ag = ctx.createGain();
      ag.gain.value = 1.6;
      src.connect(air);
      air.connect(ag);
      ag.connect(filter);
      src.start(now, v.rand.range(0, 1.5));
      sources.push(src);
      nodes.push(src, air, ag);
    }

    // Paper scratch.
    const sSrc = ctx.createBufferSource();
    sSrc.buffer = v.noise.paper;
    sSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.8;
    const scratch = ctx.createGain();
    scratch.gain.value = 0;
    sSrc.connect(bp);
    bp.connect(scratch);
    scratch.connect(out);
    sSrc.start(now, v.rand.range(0, 1.5));
    sources.push(sSrc);
    nodes.push(sSrc, bp, scratch);

    this.live = { ink, vol, filter, pan, scratch, scratchSrc: sSrc, pitched, air, sources, nodes };
    this.noteIdx = -1;
    this.sp = 0;
  }

  /** Ink stopped flowing (well ran dry, or the pen crossed a no-ink zone): the tone sighs away. */
  setFlowing(on: boolean): void {
    if (this.flowing === on) return;
    this.flowing = on;
    const L = this.live;
    if (!L) return;
    const now = this.ctx.currentTime;
    const g = L.vol.gain;
    g.cancelScheduledValues(now);
    if (!on) {
      g.setTargetAtTime(0, now, 0.06);
      for (const [o, mul] of L.pitched) o.frequency.setTargetAtTime(mtof(this.lastMidi) * mul * 0.82, now, 0.12);
    } else {
      g.setTargetAtTime(INK[L.ink].floor * 2, now, 0.02);
    }
  }

  up(): void {
    const L = this.live;
    if (!L) return;
    this.live = null;
    this.flowing = true;
    const now = this.ctx.currentTime;
    L.vol.gain.cancelScheduledValues(now);
    L.vol.gain.setTargetAtTime(0, now, 0.07);
    L.scratch.gain.cancelScheduledValues(now);
    L.scratch.gain.setTargetAtTime(0, now, 0.03);
    const end = now + 0.6;
    for (const s of L.sources) {
      try {
        s.stop(end);
      } catch {
        /* ignore */
      }
    }
    L.sources[0].onended = () => {
      for (const n of L.nodes) n.disconnect();
    };
  }
}

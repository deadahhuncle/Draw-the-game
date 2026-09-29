// Generative music: a slow chord progression on warm pads, a tonic drone, and a music-box voice that
// improvises short phrases (with motifs that repeat and answer each other) in the world's mode.
// When Wick runs, a gentle pulse joins; when a lamp is lit, the harmony resolves home.
//
// Scheduling uses a lookahead clock: `pump(until)` schedules every eighth-note step up to `until`
// on the audio timeline, so timing is sample-accurate however irregular the JS timer is.
import type { AudioMode } from './audio';
import type { Rand } from './dsp';
import { Key, mtof, type Chord, type WorldSound } from './theory';
import { Pool, type Voices } from './voices';

export interface MusicBuses {
  /** Everything musical ends up here (before the tone filter + volume). */
  sum: AudioNode;
  pad: GainNode;
  padFilter: BiquadFilterNode;
  bell: GainNode;
  drone: GainNode;
  run: GainNode;
  runFilter: BiquadFilterNode;
  /** Send into the tempo-synced echo (already scaled by the music volume). */
  echo: AudioNode;
  /** Extra-wet send straight into the reverb (music volume applied). */
  wet: AudioNode;
  tone: BiquadFilterNode;
  delays: DelayNode[];
  delayFb: GainNode;
  verbSend: GainNode;
}

interface Note {
  n: number;
  midi: number;
  /** Direction of melodic motion into this note (snapping follows it). */
  dir: number;
  vel: number;
  strong: boolean;
  last: boolean;
  voice: 'bell' | 'reed' | 'high';
  beats: number;
}

const MODE: Record<AudioMode, { phrase: number; pad: number; drone: number; tone: number; bell: number }> = {
  menu: { phrase: 0.3, pad: 0.72, drone: 0.55, tone: 0.42, bell: 0.8 },
  plan: { phrase: 0.52, pad: 1, drone: 0.9, tone: 1, bell: 1 },
  run: { phrase: 0.6, pad: 0.86, drone: 0.85, tone: 1.3, bell: 0.95 },
  win: { phrase: 0.42, pad: 1.08, drone: 0.7, tone: 1.45, bell: 1 },
};

/** Rhythm motifs: [onset, length] in eighths. */
const MOTIFS: Record<3 | 4, [number, number][][]> = {
  3: [
    [[0, 2], [2, 2], [4, 2]],
    [[0, 3], [3, 1], [4, 2]],
    [[0, 1], [1, 1], [2, 2], [4, 2]],
    [[0, 4], [4, 2]],
    [[0, 2], [2, 1], [3, 1], [4, 2]],
    [[2, 2], [4, 2]],
    [[0, 2], [4, 1], [5, 1]],
  ],
  4: [
    [[0, 2], [2, 2], [4, 4]],
    [[0, 3], [3, 1], [4, 2], [6, 2]],
    [[0, 1], [1, 1], [2, 2], [4, 4]],
    [[0, 2], [2, 1], [3, 3], [6, 2]],
    [[2, 2], [4, 2], [6, 2]],
    [[0, 6], [6, 2]],
    [[0, 2], [3, 1], [4, 4]],
  ],
};

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class Composer {
  s: WorldSound;
  readonly key: Key;
  mode: AudioMode = 'menu';
  /** Daybreak: 0 at the first level, 1 at the last (brighter each lamp). */
  lift = 0.5;
  private n = 0;
  private pos = 0;
  private nextT = -1;
  private notes: Note[] = [];
  private melLast = 0;
  private mel: number[] = [];
  private lastMotif: [number, number][] | null = null;
  private pads: { release(at: number): void }[] = [];
  private runOn = false;
  private runUntil = 0;
  private arpI = 0;
  private pending: WorldSound | null = null;
  private winPending = false;
  private nextThunder = 0;
  private droneOsc: OscillatorNode[] = [];
  /** Pre-panned pad inputs (left, centre, right) so pad notes need no panner of their own. */
  private padIn: AudioNode[] = [];
  private droneLfo: GainNode | null = null;
  private throb: { osc: OscillatorNode; depth: GainNode } | null = null;
  /** Re-voice the current chord at the next step (after a mute or a clock resync). */
  private needChord = true;
  readonly pool = new Pool(20, false);
  readonly padPool = new Pool(16, true);
  readonly runPool = new Pool(12, true);

  constructor(
    private readonly v: Voices,
    private readonly b: MusicBuses,
    private readonly rand: Rand,
    s: WorldSound,
  ) {
    this.s = s;
    this.key = new Key(s);
    this.mel = this.key.melodyNotes(s.bell.center - 10, s.bell.center + 12);
    this.melLast = s.bell.center;
    this.buildDrone();
    this.padIn = [-0.38, 0, 0.38].map((p) => {
      if (!p || !v.hasPan) return b.padFilter;
      const n = v.ctx.createStereoPanner();
      n.pan.value = p;
      n.connect(b.padFilter);
      return n;
    });
    this.applyBusLevels(v.ctx.currentTime, true);
  }

  private get ctx(): BaseAudioContext {
    return this.v.ctx;
  }

  private get sd(): number {
    const bpm = this.s.bpm + (this.s.signature === 'sunrise' ? this.lift * 10 : 0);
    return 30 / bpm;
  }

  // ───────────────────────────── control ─────────────────────────────

  setWorld(s: WorldSound): void {
    if (s === this.s && !this.pending) return;
    this.pending = s === this.s ? null : s;
  }

  setMode(mode: AudioMode): void {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    const now = this.ctx.currentTime;
    if (mode === 'run') {
      this.runOn = true;
      this.b.run.gain.setTargetAtTime(1, now, 0.35);
      this.b.runFilter.frequency.cancelScheduledValues(now);
      this.b.runFilter.frequency.setValueAtTime(Math.max(300, this.b.runFilter.frequency.value), now);
      this.b.runFilter.frequency.setTargetAtTime(9000, now, 0.5);
    } else if (prev === 'run') {
      this.runOn = false;
      this.runUntil = now + 1.6;
      this.b.run.gain.setTargetAtTime(0, now + 0.05, 0.45);
      this.b.runFilter.frequency.setTargetAtTime(320, now, 0.3);
    }
    if (mode === 'win') this.winPending = true;
    this.applyBusLevels(now, false);
  }

  setLift(l: number): void {
    this.lift = clamp(l, 0, 1);
    if (this.s.signature === 'sunrise') this.applyBusLevels(this.ctx.currentTime, false);
  }

  private applyBusLevels(now: number, instant: boolean): void {
    const m = MODE[this.mode];
    const s = this.s;
    const tau = instant ? 0.01 : 0.9;
    const bright = s.signature === 'sunrise' ? 1 + this.lift * 0.9 : 1;
    this.b.pad.gain.setTargetAtTime(m.pad, now, tau);
    this.b.drone.gain.setTargetAtTime(m.drone, now, tau);
    this.b.bell.gain.setTargetAtTime(m.bell, now, tau);
    this.b.tone.frequency.setTargetAtTime(clamp(s.tone * m.tone * bright, 700, 14000), now, tau);
    this.b.padFilter.frequency.setTargetAtTime(s.pad.cutoff * bright * (this.mode === 'menu' ? 0.8 : 1), now, tau * 1.5);
  }

  // ───────────────────────────── drone ─────────────────────────────

  private buildDrone(): void {
    const ctx = this.ctx;
    const s = this.s;
    const lfo = this.v.osc('sine', 0.05);
    const lg = ctx.createGain();
    lg.gain.value = s.drone.gain * 0.3;
    const g = ctx.createGain();
    g.gain.value = s.drone.gain;
    lfo.connect(lg);
    lg.connect(g.gain);
    g.connect(this.b.drone);
    this.droneLfo = g;
    const r = this.droneRoot();
    const specs: [string, number, number][] = [
      ['sine', r, 1],
      ['glow', r + 12, 0.5],
      ['sine', r + 7, s.drone.fifth],
    ];
    this.droneOsc = specs.map(([w, m, a], i) => {
      const o = this.v.osc(w as 'sine', mtof(m));
      o.detune.value = i === 1 ? 4 : 0;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start();
      return o;
    });
    // Tremolo ("throb") for the storm: a slow pulse riding the drone.
    const th = this.v.osc('sine', s.bpm / 120);
    const depth = ctx.createGain();
    depth.gain.value = s.drone.gain * s.drone.throb * 0.5;
    th.connect(depth);
    depth.connect(g.gain);
    th.start();
    lfo.start();
    this.throb = { osc: th, depth };
  }

  /** The pedal tonic: an octave under the key's root, but never below C2 (~65 Hz). */
  private droneRoot(): number {
    let r = this.s.root - 12;
    while (r < 36) r += 12;
    return r;
  }

  private retuneDrone(t: number): void {
    const s = this.s;
    const r = this.droneRoot();
    const ms = [r, r + 12, r + 7];
    this.droneOsc.forEach((o, i) => o.frequency.setTargetAtTime(mtof(ms[i]), t, 1.2));
    if (this.droneLfo) this.droneLfo.gain.setTargetAtTime(s.drone.gain, t, 1.5);
    if (this.throb) {
      this.throb.osc.frequency.setTargetAtTime(s.bpm / 120, t, 0.5);
      this.throb.depth.gain.setTargetAtTime(s.drone.gain * s.drone.throb * 0.5, t, 1);
    }
  }

  // ───────────────────────────── clock ─────────────────────────────

  /** Keep the clock moving without playing anything (music muted): no voices, no CPU. */
  skip(until: number): void {
    const now = this.ctx.currentTime;
    if (this.nextT < now - 0.15) this.nextT = now + 0.06;
    while (this.nextT < until) {
      this.nextT += this.sd;
      this.n++;
      this.pos++;
    }
    this.notes = [];
    this.winPending = false;
    this.needChord = true;
  }

  pump(until: number): void {
    const now = this.ctx.currentTime;
    if (this.nextT < now - 0.15) {
      // First start, or we fell behind (tab hidden, context interrupted): pick up just ahead.
      this.nextT = now + 0.06;
      this.n = Math.ceil(this.n / 2) * 2;
      this.needChord = true;
    }
    let guard = 0;
    while (this.nextT < until && guard++ < 64) {
      const sd = this.sd;
      const t = this.nextT + (this.n & 1 ? this.s.swing * sd : 0);
      this.tick(t, sd);
      this.n++;
      this.pos++;
      this.nextT += sd;
    }
  }

  private tick(t: number, sd: number): void {
    if (this.pending) this.applyWorld(t);
    if (this.winPending) this.startWin(t, sd);
    const s = this.s;
    const spb = s.meter * 2;
    const spc = spb * s.barsPerChord;
    const cycle = spc * s.prog.length;
    this.pos %= cycle;
    const inChord = this.pos % spc;
    const inBar = this.pos % spb;
    if (inChord === 0 || this.needChord) {
      this.needChord = false;
      this.changeChord(t, s.prog[Math.floor(this.pos / spc)], (spc - inChord) * sd);
    }
    if (inBar === 0) this.maybePhrase(spb);
    this.playNotes(t, sd);
    this.signature(t, sd, inBar, spb);
    if (this.runOn || t < this.runUntil) this.runLayer(t, sd, inBar);
  }

  private applyWorld(t: number): void {
    const s = this.pending!;
    this.pending = null;
    for (const p of this.pads) p.release(t);
    this.pads = [];
    this.s = s;
    this.key.setWorld(s);
    this.mel = this.key.melodyNotes(s.bell.center - 10, s.bell.center + 12);
    this.melLast = s.bell.center;
    this.notes = [];
    this.lastMotif = null;
    this.pos = 0;
    this.n = Math.ceil(this.n / 2) * 2;
    this.retuneDrone(t);
    const beat = 60 / s.bpm;
    for (const d of this.b.delays) d.delayTime.setTargetAtTime(clamp(beat * s.delay.beats, 0.05, 1.9), t, 0.4);
    this.b.delayFb.gain.setTargetAtTime(s.delay.feedback, t, 0.4);
    this.b.verbSend.gain.setTargetAtTime(s.reverb, t, 0.8);
    this.nextThunder = t + this.rand.range(5, 12);
    this.applyBusLevels(t, false);
  }

  // ───────────────────────────── harmony ─────────────────────────────

  private voicing(c: Chord): number[] {
    const k = this.key;
    const s = this.s;
    const ctr = s.pad.center;
    const rootM = k.deg(c.deg);
    const stack = c.tones.map((t) => k.deg(c.deg + t) - rootM);
    const out: number[] = [];
    // Bass: chord root below the pad cluster.
    const bass = rootM + 12 * Math.round((ctr - 12 - rootM) / 12);
    if (s.pad.voicing === 'fifths') {
      const base = rootM + 12 * Math.floor((ctr - 1 - rootM) / 12);
      for (const iv of stack) out.push(base + iv);
      out.push(base + stack[1] + 12);
      out.push(bass - (bass >= base ? 12 : 0));
    } else {
      // Upper voices around the centre (the root lives in the bass), spread so no two are closer
      // than a minor third — warm, never a cluster.
      out.push(bass);
      const up: number[] = [];
      stack.forEach((iv, i) => {
        if (i === 0 && stack.length >= 4) return;
        const m = rootM + iv;
        let p = m + 12 * Math.round((ctr - m) / 12);
        if (s.pad.voicing === 'open' && i % 2 === 0 && i > 0) p += 12;
        up.push(p);
      });
      for (let i = 0; i < up.length; i++) while (up[i] < bass + 5) up[i] += 12;
      up.sort((a, b) => a - b);
      let fixes = 0;
      for (let i = 1; i < up.length && fixes < 8; i++) {
        if (up[i] - up[i - 1] < 3) {
          if (up[i] + 12 <= ctr + 15 || up[i - 1] - 12 < bass + 5) up[i] += 12;
          else up[i - 1] -= 12;
          up.sort((a, b) => a - b);
          i = 0;
          fixes++;
        }
      }
      out.push(...up);
    }
    return out;
  }

  private changeChord(t: number, c: Chord, dur: number): void {
    const s = this.s;
    this.key.setChord(c);
    for (const p of this.pads) p.release(t);
    this.pads = [];
    const ms = this.voicing(c);
    const lo = Math.min(...ms);
    ms.forEach((m, i) => {
      const isBass = m === lo;
      const side = isBass ? 1 : i % 2 ? 0 : 2;
      const h = this.v.pad(this.padPool, this.padIn[side], t + i * 0.04, mtof(m), dur + 0.2, {
        wave: s.pad.timbre,
        detune: s.pad.detune,
        attack: s.pad.attack,
        release: s.pad.release,
        gain: s.pad.gain * (isBass ? 0.55 : 1) * (m > s.pad.center + 9 ? 0.75 : 1),
      });
      if (h) this.pads.push(h);
    });
  }

  // ───────────────────────────── melody ─────────────────────────────

  private maybePhrase(spb: number): void {
    if (this.notes.length) return;
    const s = this.s;
    let p = MODE[this.mode].phrase * s.bell.density;
    if (s.signature === 'sunrise') p *= 0.8 + this.lift * 0.4;
    if (!this.rand.chance(p)) return;
    const r = this.rand;
    const motif = this.lastMotif && r.chance(0.4) ? this.lastMotif : r.pick(MOTIFS[s.meter]);
    this.lastMotif = motif;
    const mel = this.mel;
    const ctrI = this.nearestIdx(s.bell.center);
    let idx = this.nearestIdx(this.melLast + r.int(-2, 3));
    // Begin on a chord tone.
    for (let d = 0; d < 3; d++) {
      if (this.key.isChordTone(mel[clamp(idx + d, 0, mel.length - 1)])) {
        idx = clamp(idx + d, 0, mel.length - 1);
        break;
      }
      if (this.key.isChordTone(mel[clamp(idx - d, 0, mel.length - 1)])) {
        idx = clamp(idx - d, 0, mel.length - 1);
        break;
      }
    }
    const idxs: number[] = [];
    const dirs: number[] = [];
    let dir = idx > ctrI + 3 ? -1 : idx < ctrI - 3 ? 1 : r.chance(0.55) ? 1 : -1;
    motif.forEach((_, i) => {
      let moved = 0;
      if (i > 0) {
        const late = i >= motif.length / 2;
        if (late && r.chance(0.55)) dir = -1;
        else if (!late && r.chance(0.3)) dir = 1;
        const w = r.next();
        const step = w < 0.58 ? 1 : w < 0.84 ? 2 : w < 0.89 ? 0 : w < 0.96 ? 3 : 4;
        idx += dir * step;
        moved = step ? dir : 0;
        if (idx < 0 || idx >= mel.length) {
          dir = -dir;
          idx = clamp(idx, 0, mel.length - 1);
        }
        if (mel[idx] > s.bell.center + 9) dir = -1;
        if (mel[idx] < s.bell.center - 7) dir = 1;
      }
      idxs.push(idx);
      dirs.push(moved);
    });
    const voice: Note['voice'] = s.signature === 'woodwind' && r.chance(0.55) ? 'reed' : 'bell';
    const push = (off: number, shift: number, velK: number, v: Note['voice']) =>
      motif.forEach(([on, len], i) => {
        const j = clamp(idxs[i] + shift, 0, mel.length - 1);
        let m = mel[j];
        if (v === 'reed') m -= 12;
        this.notes.push({
          n: this.n + off + on,
          midi: m,
          dir: dirs[i],
          vel: (i === 0 ? 0.95 : r.range(0.6, 0.82)) * velK,
          strong: on % 2 === 0,
          last: i === motif.length - 1,
          voice: v,
          beats: len / 2,
        });
      });
    push(0, 0, 1, voice);
    // Answer: the same rhythm again, a step or two away — or an octave-up echo, like a music box.
    const span = motif[motif.length - 1][0] + motif[motif.length - 1][1];
    if (span <= spb && r.chance(0.5)) {
      if (voice === 'bell' && r.chance(0.3)) push(spb, 0, 0.45, 'high');
      else push(spb, r.pick([-2, -1, 1, 2]), 0.85, voice);
    }
  }

  private nearestIdx(m: number): number {
    let best = 0;
    for (let i = 1; i < this.mel.length; i++) if (Math.abs(this.mel[i] - m) < Math.abs(this.mel[best] - m)) best = i;
    return best;
  }

  private playNotes(t: number, sd: number): void {
    if (!this.notes.length) return;
    const s = this.s;
    const keep: Note[] = [];
    for (const nt of this.notes) {
      if (nt.n > this.n) {
        keep.push(nt);
        continue;
      }
      if (nt.n < this.n) continue;
      let m = nt.midi;
      if ((nt.strong || nt.last) && !this.key.isChordTone(m)) {
        // Land on a chord tone, continuing the way the line was moving (never back where it came from).
        const d = nt.dir || (this.rand.chance(0.5) ? 1 : -1);
        for (const k of [d, 2 * d, -d, -2 * d]) {
          if (this.key.isChordTone(m + k) && this.key.inMelody(m + k)) {
            m += k;
            break;
          }
        }
      }
      if (nt.voice === 'high' && m + 12 <= 96) m += 12;
      else this.melLast = m;
      if (nt.voice === 'reed') this.reed(t, m, nt.beats * sd * 2, nt.vel);
      else
        this.v.bell(this.pool, this.b.bell, t, mtof(m), s.bell.gain * nt.vel, {
          ratio: s.bell.ratio,
          index: s.bell.index * (nt.voice === 'high' ? 0.6 : 1),
          decay: s.bell.decay * (nt.last ? 1.4 : 1),
          tink: s.bell.tink,
          tinkRatio: s.bell.tinkRatio,
          pan: this.rand.range(-0.35, 0.35),
          send: this.b.echo,
          sendGain: s.delay.send,
        });
    }
    this.notes = keep;
  }

  /** The Moth Wood reed: a low, breathy woodwind with delayed vibrato. */
  private reed(t: number, m: number, dur: number, vel: number): void {
    const f = mtof(m);
    this.v.tone(this.pool, this.b.bell, t, {
      wave: 'reed',
      freq: f,
      gain: 0.09 * vel,
      attack: 0.14,
      hold: Math.max(0.1, dur - 0.25),
      tau: 0.22,
      vib: [4.6, 9],
      lowpass: 1150,
      pan: this.rand.range(-0.2, 0.2),
      send: this.b.echo,
      sendGain: 0.18,
    });
    // Breath.
    this.v.noiseHit(this.pool, this.b.bell, t, { buf: 'pink', type: 'bandpass', f0: f * 2, q: 3, gain: 0.018 * vel, attack: 0.08, hold: dur * 0.5, tau: 0.12 });
  }

  // ───────────────────────────── signatures ─────────────────────────────

  private signature(t: number, sd: number, inBar: number, spb: number): void {
    const s = this.s;
    const r = this.rand;
    const k = this.key;
    const calm = this.mode === 'menu' ? 0.5 : 1;
    switch (s.signature) {
      case 'waltz':
        // The music box's own bass comb: a soft low chime on each downbeat.
        if (inBar === 0 && this.mode !== 'run' && r.chance(0.55 * calm)) {
          const m = k.chordTone(0, s.bell.center - 12);
          this.v.bell(this.pool, this.b.bell, t, mtof(m), s.bell.gain * 0.45, { ratio: 2, index: 0.5, decay: 1.6, pan: -0.1 });
        }
        break;
      case 'plucks':
        if ((inBar === 3 || inBar === 7) && r.chance((this.mode === 'run' ? 0.25 : 0.4) * calm)) {
          const m = k.chordTone(r.int(0, 3), s.bell.center + r.pick([-5, 0, 5]));
          this.v.pluck(this.pool, this.b.bell, t, mtof(m), 0.045, { wave: 'glass', decay: 0.28, cutoff: 2600, open: 2.2, pan: r.range(-0.6, 0.6), send: this.b.echo, sendGain: 0.5 });
        }
        break;
      case 'shimmer':
        if (r.chance(0.045 * calm)) {
          const m = k.chordTone(r.int(0, 5), s.bell.center + 12);
          this.v.bell(this.pool, this.b.bell, t, mtof(m), s.bell.gain * r.range(0.25, 0.45), { ratio: 2, index: 0.3, decay: 2.8, pan: r.range(-0.8, 0.8), send: this.b.echo, sendGain: 0.7 });
        }
        break;
      case 'thunder':
        if (this.nextThunder === 0) this.nextThunder = t + r.range(4, 9);
        if (t >= this.nextThunder) {
          this.thunder(t);
          this.nextThunder = t + r.range(14, 30) * (this.mode === 'menu' ? 1.7 : 1);
        }
        // Low pulse on the downbeat, felt more than heard.
        if (inBar === 0 && this.mode !== 'run' && r.chance(0.7 * calm)) {
          this.v.pluck(this.pool, this.b.bell, t, mtof(k.chordTone(0, s.root - 5)), 0.06, { wave: 'bass', decay: 0.8, cutoff: 360, open: 1.8 });
        }
        break;
      case 'woodwind':
        // A low call from somewhere in the dark: two long reed notes, falling a third or rising a fourth.
        if (inBar === 4 && !this.notes.length && r.chance(0.22 * calm)) {
          const m0 = k.chordTone(r.pick([0, 2]), s.pen - 10);
          const m1 = r.chance(0.6) ? k.nearestChordTone(m0 - 3) : m0 + 5;
          this.reed(t, m0, sd * 3, 0.8);
          if (k.inMelody(m1)) this.reed(t + sd * 4, m1, sd * 5, 0.7);
        }
        break;
      case 'sunrise':
        // Little rising figures, more of them as dawn approaches.
        if (inBar === 0 && r.chance((0.08 + this.lift * 0.35) * calm)) {
          const base = s.bell.center + 7;
          for (let i = 0; i < 3; i++) {
            const m = k.chordTone(i + r.int(0, 1), base);
            this.v.bell(this.pool, this.b.bell, t + sd * (4 + i) * 0.5 + sd * 2, mtof(m), s.bell.gain * 0.3 * (1 - i * 0.15), { ratio: 3, index: 0.6, decay: 1.2, pan: -0.5 + i * 0.5, send: this.b.echo, sendGain: 0.5 });
          }
        }
        break;
    }
    void spb;
  }

  /** A distant roll of thunder: low brown-noise swells, never a crack. */
  private thunder(t: number): void {
    const r = this.rand;
    const pan = r.range(-0.7, 0.7);
    const rolls = r.int(3, 5);
    for (let i = 0; i < rolls; i++) {
      const at = t + i * r.range(0.25, 0.7);
      this.v.noiseHit(this.pool, this.b.sum, at, {
        buf: 'brown',
        type: 'lowpass',
        f0: r.range(260, 380),
        f1: 110,
        sweep: 2.4,
        q: 0.6,
        gain: r.range(0.22, 0.4) * (1 - i * 0.12),
        attack: r.range(0.25, 0.7),
        hold: r.range(0.1, 0.4),
        tau: r.range(0.5, 0.9),
        pan: pan + r.range(-0.2, 0.2),
        send: this.b.wet,
        sendGain: 0.8,
      });
    }
    // Audible on phone speakers: a soft mid-band body.
    this.v.noiseHit(this.pool, this.b.sum, t + 0.2, { buf: 'pink', type: 'lowpass', f0: 520, f1: 260, sweep: 2.5, q: 0.7, gain: 0.05, attack: 0.6, hold: 0.3, tau: 0.7, pan });
  }

  // ───────────────────────────── run layer ─────────────────────────────

  private runLayer(t: number, sd: number, inBar: number): void {
    const s = this.s;
    const run = s.run;
    const k = this.key;
    const g = run.gain;
    const ch = (p: string) => p.charAt(inBar % p.length);
    const kc = ch(run.kick);
    if (kc !== '.' && kc !== '') {
      const acc = kc === 'X' ? 1 : inBar === 0 ? 0.95 : 0.7;
      const low = s.signature === 'thunder';
      this.v.tone(this.runPool, this.b.run, t, { freq: run.kickHz * (low ? 2.6 : 2.2), to: run.kickHz * (low ? 1.3 : 1), glide: low ? 0.12 : 0.07, gain: 0.12 * acc * g, attack: 0.003, tau: low ? 0.13 : 0.085 });
      this.v.tone(this.runPool, this.b.run, t, { freq: run.kickHz * 4, to: run.kickHz * 3, glide: 0.03, gain: 0.03 * acc * g, attack: 0.002, tau: 0.025 });
    }
    const tc = ch(run.tick);
    if (tc !== '.' && tc !== '') this.tick2(t, run.tickKind, (inBar % 2 ? 0.8 : 1) * g);
    const bc = ch(run.bass);
    if (bc !== '.' && bc !== '') {
      const rootM = k.chordTone(0, s.root - 7);
      const m = bc === '5' ? k.deg(k.chord.deg + 4) + 12 * Math.round((rootM + 7 - k.deg(k.chord.deg + 4)) / 12) : bc === 'o' ? rootM + 12 : rootM;
      this.v.pluck(this.runPool, this.b.run, t, mtof(m), 0.095 * g, { wave: 'bass', decay: sd * 1.3, cutoff: 520, open: 2.6, bend: 1.01 });
    }
    const ac = ch(run.arp);
    if (ac === 'a') {
      const seq = [0, 1, 2, 3, 4, 3, 2, 1];
      const i = seq[this.arpI++ % seq.length];
      const m = k.chordTone(i, s.bell.center - 7);
      this.v.pluck(this.runPool, this.b.run, t, mtof(m), 0.05 * g, {
        wave: s.signature === 'plucks' ? 'glass' : 'pluck',
        decay: sd * 0.9,
        cutoff: 2400,
        open: 2,
        pan: (i - 2) * 0.18,
        send: this.b.echo,
        sendGain: 0.25,
      });
    }
  }

  private tick2(t: number, kind: string, a: number): void {
    const v = this.v;
    const p = this.runPool;
    const out = this.b.run;
    const r = this.rand;
    switch (kind) {
      case 'mechanism':
        v.tone(p, out, t, { freq: 2650, gain: 0.03 * a, attack: 0.001, tau: 0.009, pan: 0.25 });
        v.noiseHit(p, out, t, { type: 'highpass', f0: 6500, q: 0.7, gain: 0.025 * a, attack: 0.001, tau: 0.005, pan: 0.25 });
        break;
      case 'drop':
        v.tone(p, out, t, { freq: r.range(1000, 1250), to: 1900, glide: 0.03, gain: 0.035 * a, attack: 0.002, tau: 0.03, pan: r.range(-0.4, 0.4), send: this.b.echo, sendGain: 0.3 });
        break;
      case 'ripple':
        v.tone(p, out, t, { freq: r.range(3000, 3400), to: 2500, glide: 0.04, gain: 0.018 * a, attack: 0.002, tau: 0.025, pan: r.range(-0.5, 0.5), send: this.b.echo, sendGain: 0.4 });
        break;
      case 'brush':
        v.noiseHit(p, out, t, { buf: 'pink', type: 'bandpass', f0: 3200, q: 0.7, gain: 0.05 * a, attack: 0.02, tau: 0.07, pan: -0.15 });
        break;
      case 'wood':
        v.tone(p, out, t, { freq: 880, gain: 0.05 * a, attack: 0.001, tau: 0.02, pan: 0.2 });
        v.tone(p, out, t, { freq: 2350, gain: 0.018 * a, attack: 0.001, tau: 0.009, pan: 0.2 });
        break;
      case 'shaker':
        v.noiseHit(p, out, t, { type: 'highpass', f0: 5500, q: 0.6, gain: 0.03 * a, attack: 0.014, tau: 0.03, pan: 0.3 });
        break;
    }
  }

  // ───────────────────────────── win ─────────────────────────────

  private startWin(t: number, sd: number): void {
    this.winPending = false;
    const s = this.s;
    const spb = s.meter * 2;
    // Jump home: the next chord is the tonic, now.
    this.pos = 0;
    this.notes = [];
    for (const p of this.pads) p.release(t);
    this.pads = [];
    const k = this.key;
    k.setChord(s.prog[0]);
    const base = s.bell.center - 5;
    const seq: number[] = [];
    for (let i = 0; i < 8; i++) seq.push(k.chordTone(i, base));
    // Sort upward, unique.
    const up = [...new Set(seq)].sort((a, b) => a - b).slice(0, 8);
    up.forEach((m, i) => {
      const at = t + 0.55 + i * sd * 0.5 * (1 + i * 0.04);
      const last = i === up.length - 1;
      this.v.bell(this.pool, this.b.bell, at, mtof(m), s.bell.gain * (last ? 1 : 0.55 + i * 0.05), {
        ratio: s.bell.ratio,
        index: s.bell.index * 0.8,
        decay: s.bell.decay * (last ? 2.2 : 1),
        tink: s.bell.tink,
        tinkRatio: s.bell.tinkRatio,
        pan: -0.5 + i / up.length,
        send: this.b.echo,
        sendGain: s.delay.send,
      });
    });
    this.melLast = up[up.length - 1] ?? s.bell.center;
    // Keep the next phrase from starting on top of the flourish.
    this.notes.push({ n: this.n + spb * 2, midi: k.chordTone(0, s.bell.center), dir: 0, vel: 0.5, strong: true, last: true, voice: 'bell', beats: 2 });
  }

  dispose(): void {
    for (const o of this.droneOsc) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    if (this.throb) {
      try {
        this.throb.osc.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

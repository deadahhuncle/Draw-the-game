// Synth voice primitives. Every voice is a handful of native nodes with scheduled envelopes; nodes are
// disconnected as soon as their source ends, and pools cap how many can ring at once.
import type { NoiseBank, Rand, WaveName } from './dsp';

export type Dest = AudioNode;

interface VoiceRec {
  end: number;
  kill(t: number): void;
}

/** Caps simultaneous voices of one family. Music pools reject new notes; sfx pools steal the oldest. */
export class Pool {
  private list: VoiceRec[] = [];
  constructor(
    readonly cap: number,
    readonly steal: boolean,
  ) {}

  /** Returns false when the voice should not be started. */
  room(now: number): boolean {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) if (l[i].end > now) l[w++] = l[i];
    l.length = w;
    if (l.length < this.cap) return true;
    if (!this.steal) return false;
    const old = l.shift()!;
    old.kill(now);
    return true;
  }

  add(end: number, kill: (t: number) => void): void {
    this.list.push({ end, kill });
  }

  get size(): number {
    return this.list.length;
  }

  killAll(t: number): void {
    for (const v of this.list) v.kill(t);
    this.list.length = 0;
  }
}

export interface BellOpts {
  ratio: number;
  index: number;
  decay: number;
  tink?: number;
  tinkRatio?: number;
  pan?: number;
  attack?: number;
  /** Seconds for the FM brightness to settle (default 0.14). */
  idxTau?: number;
  /** Extra send (e.g. to the echo) — receives the same signal as dest. */
  send?: AudioNode | null;
  sendGain?: number;
}

export interface PluckOpts {
  wave?: WaveName | OscillatorType;
  decay: number;
  attack?: number;
  /** Start pitch as a ratio of the target (a quick bend into the note). */
  bend?: number;
  bendTime?: number;
  /** Lowpass: opens to cutoff*open at the attack, settles to cutoff. */
  cutoff?: number;
  open?: number;
  pan?: number;
  send?: AudioNode | null;
  sendGain?: number;
  detune?: number;
}

export interface ToneOpts {
  wave?: WaveName | OscillatorType;
  freq: number;
  /** Glide target frequency. */
  to?: number;
  /** Glide duration (exponential). */
  glide?: number;
  glideDelay?: number;
  gain: number;
  attack?: number;
  hold?: number;
  tau: number;
  pan?: number;
  /** Vibrato: rate Hz, depth cents. */
  vib?: [number, number];
  lowpass?: number;
  send?: AudioNode | null;
  sendGain?: number;
}

export interface NoiseOpts {
  buf?: keyof NoiseBank;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  sweep?: number;
  q?: number;
  gain: number;
  attack?: number;
  hold?: number;
  tau: number;
  pan?: number;
  /** Pan automation target (sweeps over the whole sound). */
  panTo?: number;
  rate?: number;
  send?: AudioNode | null;
  sendGain?: number;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Stop a scheduled source again (earlier). Old engines throw on a second stop(); ignore that. */
function restop(src: AudioScheduledSourceNode, t: number): void {
  try {
    src.stop(t);
  } catch {
    /* already stopped */
  }
}

function hold(p: AudioParam, t: number): void {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === 'function') anyP.cancelAndHoldAtTime(t);
  else p.cancelScheduledValues(t);
}

export class Voices {
  readonly hasPan: boolean;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly noise: NoiseBank,
    readonly waves: Record<WaveName, PeriodicWave>,
    readonly rand: Rand,
  ) {
    this.hasPan = typeof ctx.createStereoPanner === 'function';
  }

  /** Output stage for a voice: a panner (if supported) feeding dest and an optional send. */
  private out(dest: Dest, pan: number | undefined, send: AudioNode | null | undefined, sendGain = 1): { node: AudioNode; extra: AudioNode[] } {
    const extra: AudioNode[] = [];
    let node: AudioNode = dest;
    if (pan && this.hasPan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(dest);
      node = p;
      extra.push(p);
    }
    if (send && sendGain > 0) {
      const g = this.ctx.createGain();
      g.gain.value = sendGain;
      g.connect(send);
      extra.push(g);
      // A splitter-free fan-out: a unity gain that feeds both.
      const fan = this.ctx.createGain();
      fan.connect(node);
      fan.connect(g);
      extra.push(fan);
      node = fan;
    }
    return { node, extra };
  }

  osc(wave: WaveName | OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (wave in this.waves) o.setPeriodicWave(this.waves[wave as WaveName]);
    else o.type = wave as OscillatorType;
    o.frequency.value = freq;
    return o;
  }

  private cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }

  /**
   * Music-box / celesta bell: a sine carrier, FM'd by a modulator whose brightness decays fast
   * (bright strike → pure tone), plus an optional short inharmonic "tine" partial.
   */
  bell(pool: Pool, dest: Dest, t: number, freq: number, gain: number, o: BellOpts): number {
    const ctx = this.ctx;
    if (!(freq > 20 && freq < 16000) || !pool.room(ctx.currentTime)) return 0;
    const dec = Math.min(2.6, o.decay * clamp(Math.pow(523 / freq, 0.35), 0.45, 1.7));
    const atk = o.attack ?? 0.002;
    // 5τ ≈ -43 dB: inaudible under the mix, and it frees the voice for the next note.
    const end = t + atk + dec * 5;
    const { node, extra } = this.out(dest, o.pan, o.send, o.sendGain);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + atk);
    env.gain.setTargetAtTime(0, t + atk, dec);
    env.connect(node);
    const car = this.osc('sine', freq);
    car.connect(env);
    const nodes: AudioNode[] = [env, car, ...extra];
    const srcs: AudioScheduledSourceNode[] = [car];
    if (o.index > 0) {
      const mf = freq * o.ratio;
      const idx = o.index * clamp(700 / freq, 0.25, 1);
      const dev = idx * mf;
      const mod = this.osc('sine', mf);
      const mg = ctx.createGain();
      mg.gain.value = 0;
      // Bright strike that settles into a pure tone; the modulator stops once it has faded out.
      const it = o.idxTau ?? 0.14;
      mg.gain.setValueAtTime(dev, t);
      mg.gain.setTargetAtTime(0, t, it * 1.4);
      mod.connect(mg);
      mg.connect(car.frequency);
      mod.start(t);
      mod.stop(Math.min(end, t + it * 12));
      nodes.push(mod, mg);
      srcs.push(mod);
    }
    const tr = o.tinkRatio ?? 0;
    if (o.tink && tr > 0 && freq * tr < 15000) {
      const tk = this.osc('sine', freq * tr);
      const tg = ctx.createGain();
      tg.gain.value = 0;
      tg.gain.setValueAtTime(0, t);
      tg.gain.linearRampToValueAtTime(gain * o.tink, t + 0.001);
      tg.gain.setTargetAtTime(0, t + 0.001, 0.03);
      tk.connect(tg);
      tg.connect(node);
      tk.start(t);
      tk.stop(t + 0.3);
      nodes.push(tk, tg);
      srcs.push(tk);
    }
    car.start(t);
    car.stop(end);
    this.cleanup(car, nodes);
    pool.add(end, (k) => {
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, 0.015);
      for (const s of srcs) restop(s, k + 0.12);
    });
    return end;
  }

  /** A sustained pad note: two detuned wavetable oscillators under a slow envelope. */
  pad(pool: Pool, dest: Dest, t: number, freq: number, dur: number, o: { wave: WaveName; detune: number; attack: number; release: number; gain: number; pan?: number }): { release(at: number): void } | null {
    const ctx = this.ctx;
    if (!pool.room(ctx.currentTime)) return null;
    const { node, extra } = this.out(dest, o.pan, null);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.setTargetAtTime(o.gain, t, o.attack / 3);
    env.gain.setTargetAtTime(0, t + dur, o.release / 4);
    env.connect(node);
    let end = t + dur + o.release * 1.5;
    // A dominant centre voice with two quieter detuned sides: lush chorus without a hard tremolo.
    const a = this.osc(o.wave, freq);
    const b = this.osc(o.wave, freq);
    const c = this.osc(o.wave, freq);
    b.detune.value = -o.detune;
    c.detune.value = o.detune * 1.13;
    const side = ctx.createGain();
    side.gain.value = 0.42;
    a.connect(env);
    b.connect(side);
    c.connect(side);
    side.connect(env);
    const j = this.rand.range(0, 0.03);
    a.start(t);
    b.start(t + j);
    c.start(t + j * 0.5);
    a.stop(end);
    b.stop(end);
    c.stop(end);
    this.cleanup(a, [a, b, c, side, env, ...extra]);
    const release = (at: number) => {
      const k = Math.max(at, t + 0.01);
      if (k >= end) return;
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, o.release / 4);
      end = Math.min(end, k + o.release * 1.5);
      restop(a, end);
      restop(b, end);
      restop(c, end);
    };
    pool.add(end, (k) => {
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, 0.05);
      restop(a, k + 0.3);
      restop(b, k + 0.3);
      restop(c, k + 0.3);
    });
    return { release };
  }

  /** Plucked / struck tone with an optional pitch bend and filter "pluck". */
  pluck(pool: Pool, dest: Dest, t: number, freq: number, gain: number, o: PluckOpts): number {
    const ctx = this.ctx;
    if (!(freq > 20 && freq < 16000) || !pool.room(ctx.currentTime)) return 0;
    const atk = o.attack ?? 0.003;
    const end = t + atk + o.decay * 6;
    const { node, extra } = this.out(dest, o.pan, o.send, o.sendGain);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + atk);
    env.gain.setTargetAtTime(0, t + atk, o.decay);
    const nodes: AudioNode[] = [env, ...extra];
    let head: AudioNode = env;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.9;
      const top = Math.min(16000, o.cutoff * (o.open ?? 3));
      f.frequency.setValueAtTime(top, t);
      f.frequency.setTargetAtTime(o.cutoff, t + atk, Math.max(0.02, o.decay * 0.35));
      env.connect(f);
      head = f;
      nodes.push(f);
    }
    head.connect(node);
    const osc = this.osc(o.wave ?? 'sine', freq);
    if (o.detune) osc.detune.value = o.detune;
    if (o.bend && o.bend !== 1) {
      osc.frequency.setValueAtTime(freq * o.bend, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + (o.bendTime ?? 0.04));
    }
    osc.connect(env);
    osc.start(t);
    osc.stop(end);
    nodes.push(osc);
    this.cleanup(osc, nodes);
    pool.add(end, (k) => {
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, 0.012);
      restop(osc, k + 0.1);
    });
    return end;
  }

  /** A general oscillator tone with glide, vibrato and an attack/hold/decay envelope. */
  tone(pool: Pool, dest: Dest, t: number, o: ToneOpts): number {
    const ctx = this.ctx;
    if (!(o.freq > 10 && o.freq < 16000) || !pool.room(ctx.currentTime)) return 0;
    const atk = o.attack ?? 0.005;
    const hd = o.hold ?? 0;
    const end = t + atk + hd + o.tau * 6;
    const { node, extra } = this.out(dest, o.pan, o.send, o.sendGain);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(o.gain, t + atk);
    if (hd > 0) env.gain.setValueAtTime(o.gain, t + atk + hd);
    env.gain.setTargetAtTime(0, t + atk + hd, o.tau);
    const nodes: AudioNode[] = [env, ...extra];
    let head: AudioNode = env;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      f.Q.value = 0.5;
      env.connect(f);
      head = f;
      nodes.push(f);
    }
    head.connect(node);
    const osc = this.osc(o.wave ?? 'sine', o.freq);
    const srcs: AudioScheduledSourceNode[] = [osc];
    if (o.to && o.to > 0 && o.to !== o.freq) {
      const gd = o.glideDelay ?? 0;
      osc.frequency.setValueAtTime(o.freq, t + gd);
      osc.frequency.exponentialRampToValueAtTime(o.to, t + gd + (o.glide ?? 0.1));
    }
    if (o.vib) {
      const lfo = this.osc('sine', o.vib[0]);
      const lg = ctx.createGain();
      lg.gain.value = 0;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib[1], t + Math.min(0.35, atk + hd + 0.1));
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
      nodes.push(lfo, lg);
      srcs.push(lfo);
    }
    osc.connect(env);
    osc.start(t);
    osc.stop(end);
    nodes.push(osc);
    this.cleanup(osc, nodes);
    pool.add(end, (k) => {
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, 0.012);
      for (const s of srcs) restop(s, k + 0.1);
    });
    return end;
  }

  /** Filtered noise burst (whoosh, hiss, tick, thud, rumble…). */
  noiseHit(pool: Pool, dest: Dest, t: number, o: NoiseOpts): number {
    const ctx = this.ctx;
    if (!pool.room(ctx.currentTime)) return 0;
    const atk = o.attack ?? 0.003;
    const hd = o.hold ?? 0;
    const end = t + atk + hd + o.tau * 6;
    const { node, extra } = this.out(dest, o.pan, o.send, o.sendGain);
    const nodes: AudioNode[] = [...extra];
    let panner: StereoPannerNode | null = null;
    let outNode = node;
    if (o.panTo !== undefined && this.hasPan) {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(o.pan ?? 0, -1, 1), t);
      panner.pan.linearRampToValueAtTime(clamp(o.panTo, -1, 1), Math.max(t + 0.01, end - o.tau * 4));
      panner.connect(node);
      outNode = panner;
      nodes.push(panner);
    }
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(o.gain, t + atk);
    if (hd > 0) env.gain.setValueAtTime(o.gain, t + atk + hd);
    env.gain.setTargetAtTime(0, t + atk + hd, o.tau);
    env.connect(outNode);
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep ?? atk + hd + o.tau * 2));
    f.connect(env);
    const src = ctx.createBufferSource();
    const buf = this.noise[o.buf ?? 'white'];
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    src.connect(f);
    src.start(t, this.rand.range(0, buf.duration * 0.9));
    src.stop(end);
    nodes.push(env, f, src);
    this.cleanup(src, nodes);
    pool.add(end, (k) => {
      hold(env.gain, k);
      env.gain.setTargetAtTime(0, k, 0.012);
      restop(src, k + 0.1);
    });
    return end;
  }
}

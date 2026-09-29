// INKLIGHT's Web Audio engine: "a music box in a sleeping forest" (DESIGN.md §8).
//
// Graph (everything synthesized at runtime, no files):
//
//   pads ─ padFilter ┐
//   bells ───────────┤
//   drone ───────────┼─ musicSum ─ tone(lowpass) ─ musicVol ─ duck ─┬──────────────── master
//   run ─ runFilter ─┘                                              └─ verbSend ─ reverb ┘
//   sfx / pen ─ sfxSum ─ sfxVol ─┬─────────────── master
//   ambience ─ ambGain ──┘       └─ sfxVerb ─ reverb
//   echo (ping-pong, tempo-synced) ← musicEcho(vol) + sfxEcho(vol) ─ master + reverb
//   master ─ sub-sonic highpass ─ glue compressor ─ limiter ─ soft clip ─ destination
//
// The engine never throws: if Web Audio is missing or fails, it quietly stays silent.
import type { InkType, LevelDef, SimEvent, WorldKey } from '../core/types';
import { Ambience } from './ambience';
import type { AudioEngine, AudioMode, UiSound } from './audio';
import { makeImpulse, makeNoiseBank, makeWaves, Rand, softClipCurve } from './dsp';
import { Composer } from './music';
import { PenInstrument } from './pen';
import { Sfx } from './sfx';
import { WORLD_SOUND } from './theory';
import { Voices } from './voices';

export interface EngineOptions {
  /** Use this context instead of creating a realtime one (tests render with an OfflineAudioContext). */
  context?: BaseAudioContext;
  /** Don't start the lookahead timer; the caller drives `pump()` (offline rendering). */
  manual?: boolean;
  seed?: number;
}

interface Graph {
  master: GainNode;
  musicVol: GainNode;
  musicEcho: GainNode;
  musicWet: GainNode;
  duck: GainNode;
  sfxVol: GainNode;
  sfxEcho: GainNode;
  sfxWet: GainNode;
}

const LOOKAHEAD = 0.3;
const TICK_MS = 50;
/** Headroom trims so default settings sit at a comfortable level with sfx above the music. */
const MUSIC_TRIM = 1.05;
const SFX_TRIM = 1.3;

const taper = (v: number): number => (v <= 0.001 ? 0 : Math.pow(Math.min(1, v), 1.6));

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;

function createRealtime(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) return null;
  try {
    return new C({ latencyHint: 'interactive' });
  } catch {
    try {
      return new C();
    } catch {
      return null;
    }
  }
}

/** Level number within its world (for Daybreak's rising brightness), from ids like "6-3" / "d6-1". */
function liftOf(level: LevelDef | null): number {
  const m = level ? /^d?\d+-(\d+)$/.exec(level.id) : null;
  if (!m) return 0.6;
  return Math.max(0, Math.min(1, (Number(m[1]) - 1) / 7));
}

export class InklightAudio implements AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private rt: AudioContext | null = null;
  private g: Graph | null = null;
  private music: Composer | null = null;
  private penI: PenInstrument | null = null;
  private sfx: Sfx | null = null;
  private amb: Ambience | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failed = false;
  private hidden = false;
  private world: WorldKey = 'dusk';
  private mode: AudioMode = 'menu';
  private level: LevelDef | null = null;
  private vol = { music: 0.7, sfx: 0.85 };
  private penDown = false;
  /** When the pen touched down, and whether ink actually started flowing since. */
  private penDownAt = 0;
  private penBegun = false;
  private lastWinEvent = -99;
  private readonly rand: Rand;

  constructor(private readonly opts: EngineOptions = {}) {
    this.rand = new Rand(opts.seed);
    if (!opts.context && typeof window !== 'undefined') {
      // iOS only unlocks audio inside certain gestures (touchend/click, not touch pointerdown), so
      // listen to all of them; unlock() is cheap once running.
      const unlock = () => this.unlock();
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
        window.addEventListener(ev, unlock, { capture: true, passive: true });
      }
    }
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        // Wait for a real activation (a touch pointerdown isn't one) so browsers don't warn about
        // an AudioContext created before any user gesture.
        const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
        if (!this.opts.context && ua && !ua.hasBeenActive) return;
        const ctx = this.opts.context ?? createRealtime();
        if (!ctx) {
          this.failed = true;
          return;
        }
        if (!this.opts.context) this.rt = ctx as AudioContext;
        this.build(ctx);
      }
      const rt = this.rt;
      if (rt && !this.hidden && rt.state !== 'running') {
        void rt.resume().catch(() => {});
        // Older iOS needs a sound started inside the gesture to truly unlock output.
        const b = rt.createBuffer(1, 1, rt.sampleRate);
        const s = rt.createBufferSource();
        s.buffer = b;
        s.connect(rt.destination);
        s.start(0);
        s.onended = () => s.disconnect();
      }
      if (!this.hidden) this.startTimer();
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    this.failed = true;
    this.stopTimer();
    try {
      this.g?.master.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.05);
    } catch {
      /* ignore */
    }
    if (typeof console !== 'undefined') console.warn('[inklight audio] disabled:', err);
  }

  private build(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const now = ctx.currentTime;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };

    // Master chain.
    const master = gain(0.9);
    // Sub-sonic trim: keeps thunder/brown-noise rumble (and any DC drift) out of small speakers.
    const sub = ctx.createBiquadFilter();
    sub.type = 'highpass';
    sub.frequency.value = 28;
    sub.Q.value = 0.7;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 18;
    glue.ratio.value = 2.2;
    glue.attack.value = 0.02;
    glue.release.value = 0.35;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -6;
    limit.knee.value = 3;
    limit.ratio.value = 16;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(0.93);
    const trim = gain(0.85);
    master.connect(sub);
    sub.connect(glue);
    glue.connect(limit);
    limit.connect(trim);
    trim.connect(clip);
    clip.connect(ctx.destination);

    // Reverb.
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const verbOut = gain(0.9);
    verb.connect(verbOut);
    verbOut.connect(master);

    // Echo: ping-pong delay with a darkening feedback loop.
    const echoIn = gain(1);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    const fb = gain(0.38);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3400;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const echoOut = gain(0.8);
    echoIn.connect(hp);
    hp.connect(dl);
    dl.connect(dr);
    dr.connect(damp);
    damp.connect(fb);
    fb.connect(dl);
    let panL: AudioNode = echoOut;
    let panR: AudioNode = echoOut;
    if (typeof ctx.createStereoPanner === 'function') {
      const l = ctx.createStereoPanner();
      l.pan.value = -0.6;
      const r = ctx.createStereoPanner();
      r.pan.value = 0.6;
      l.connect(echoOut);
      r.connect(echoOut);
      panL = l;
      panR = r;
    }
    dl.connect(panL);
    dr.connect(panR);
    const echoVerb = gain(0.45);
    echoOut.connect(master);
    echoOut.connect(echoVerb);
    echoVerb.connect(verb);

    // Music.
    const musicSum = gain(1);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3000;
    tone.Q.value = 0.5;
    const musicVol = gain(0);
    const duck = gain(1);
    const verbSend = gain(0.5);
    musicSum.connect(tone);
    tone.connect(musicVol);
    musicVol.connect(duck);
    duck.connect(master);
    duck.connect(verbSend);
    verbSend.connect(verb);
    const musicEcho = gain(0);
    musicEcho.connect(echoIn);
    const musicWet = gain(0);
    musicWet.connect(verb);

    const pad = gain(1);
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1500;
    padFilter.Q.value = 0.7;
    padFilter.connect(pad);
    pad.connect(musicSum);
    const bell = gain(1);
    bell.connect(musicSum);
    const drone = gain(1);
    drone.connect(musicSum);
    const run = gain(0);
    const runFilter = ctx.createBiquadFilter();
    runFilter.type = 'lowpass';
    runFilter.frequency.value = 400;
    runFilter.Q.value = 0.6;
    run.connect(runFilter);
    runFilter.connect(musicSum);

    // SFX.
    const sfxSum = gain(1);
    const sfxVol = gain(0);
    const sfxVerb = gain(0.22);
    sfxSum.connect(sfxVol);
    sfxVol.connect(master);
    sfxVol.connect(sfxVerb);
    sfxVerb.connect(verb);
    const sfxEcho = gain(0);
    sfxEcho.connect(echoIn);
    const sfxWet = gain(0);
    sfxWet.connect(verb);
    const ambGain = gain(0.55);
    ambGain.connect(sfxSum);

    this.g = { master, musicVol, musicEcho, musicWet, duck, sfxVol, sfxEcho, sfxWet };

    // Slow breathing on the pad filter.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = gain(260);
    lfo.connect(lfoG);
    lfoG.connect(padFilter.frequency);
    lfo.start(now);

    const noise = makeNoiseBank(ctx);
    const waves = makeWaves(ctx);
    const voices = new Voices(ctx, noise, waves, this.rand);
    const s = WORLD_SOUND[this.world];
    const music = new Composer(
      voices,
      { sum: musicSum, pad, padFilter, bell, drone, run, runFilter, echo: musicEcho, wet: musicWet, tone, delays: [dl, dr], delayFb: fb, verbSend },
      this.rand,
      s,
    );
    const beat = 60 / s.bpm;
    dl.delayTime.value = beat * s.delay.beats;
    dr.delayTime.value = beat * s.delay.beats;
    fb.gain.value = s.delay.feedback;
    verbSend.gain.value = s.reverb;
    this.music = music;
    this.penI = new PenInstrument(voices, music.key, { dry: sfxSum, echo: sfxEcho });
    this.sfx = new Sfx(voices, music.key, { dry: sfxSum, echo: sfxEcho, wet: sfxWet }, this.rand, (a, d) => this.duck(a, d), () => this.penI?.lastMidi ?? 0);
    this.amb = new Ambience(voices, { out: ambGain, wet: sfxWet }, this.rand);

    this.applyVolumes(true);
    // The music drifts in; sound effects are immediate.
    for (const n of [musicVol, musicEcho, musicWet]) {
      const v = n.gain.value;
      n.gain.cancelScheduledValues(now);
      n.gain.setValueAtTime(0, now);
      n.gain.setTargetAtTime(taper(this.vol.music) * MUSIC_TRIM || v, now + 0.1, 0.9);
    }
    music.setMode(this.mode);
    this.sfx.mode = this.mode;
    this.amb.setMode(this.mode);
    this.amb.setLevel(this.level, s, liftOf(this.level));
    music.setLift(liftOf(this.level));
    this.penI.retune();

    if (this.rt) {
      this.rt.addEventListener?.('statechange', () => {
        if (this.rt?.state === 'running' && !this.hidden) this.startTimer();
      });
    }
  }

  private startTimer(): void {
    if (this.opts.manual || this.timer !== null || !this.ctx) return;
    this.pump();
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedule music and ambience up to the lookahead horizon. Public so offline renders can drive it. */
  pump(): void {
    const ctx = this.ctx;
    if (!ctx || this.failed) return;
    if (this.rt && this.rt.state !== 'running') return;
    try {
      const until = ctx.currentTime + LOOKAHEAD;
      if (taper(this.vol.music) > 0) this.music?.pump(until);
      else this.music?.skip(until);
      this.amb?.pump(until);
    } catch (err) {
      this.fail(err);
    }
  }

  // ───────────────────────────── mix ─────────────────────────────

  private applyVolumes(instant = false): void {
    const g = this.g;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    const now = ctx.currentTime;
    const m = taper(this.vol.music) * MUSIC_TRIM;
    const s = taper(this.vol.sfx) * SFX_TRIM;
    const tau = instant ? 0.005 : 0.06;
    for (const [node, v] of [
      [g.musicVol, m],
      [g.musicEcho, m],
      [g.musicWet, m],
      [g.sfxVol, s],
      [g.sfxEcho, s],
      [g.sfxWet, s],
    ] as const) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(v, now, tau);
    }
  }

  /** Dip the music under a big moment (death, lamp). */
  private duck(amount: number, dur: number): void {
    const g = this.g;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    const now = ctx.currentTime;
    const p = g.duck.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(1 - amount, now, 0.06);
    p.setTargetAtTime(1, now + dur, 0.7);
  }

  // ───────────────────────────── AudioEngine ─────────────────────────────

  setWorld(key: WorldKey): void {
    try {
      this.world = key;
      this.level = null;
      const s = WORLD_SOUND[key];
      if (!s || !this.music) return;
      this.music.setWorld(s);
      this.penI?.retune();
      this.amb?.setLevel(null, s, liftOf(null));
    } catch (err) {
      this.fail(err);
    }
  }

  setLevel(level: LevelDef | null): void {
    try {
      this.level = level;
      if (level?.id === 'title') this.setMode('menu');
      const s = WORLD_SOUND[this.world];
      if (!this.music || !s) return;
      const lift = liftOf(level);
      this.music.setLift(lift);
      this.amb?.setLevel(level, s, lift);
    } catch (err) {
      this.fail(err);
    }
  }

  setMode(mode: AudioMode): void {
    try {
      // The title screen is a live level where Wick paces forever: keep it the calm menu music.
      if (this.level?.id === 'title') mode = 'menu';
      // 'win' long after any lamp was lit is the ending: the last lamp is the sunrise.
      const ctx = this.ctx;
      const dawn = mode === 'win' && !!ctx && ctx.currentTime - this.lastWinEvent > 1.5;
      if (mode === this.mode && !dawn) return;
      this.mode = mode;
      this.music?.setMode(mode);
      this.amb?.setMode(mode);
      if (this.sfx) this.sfx.mode = mode;
      if (dawn && this.sfx && (!this.rt || this.rt.state === 'running')) {
        this.sfx.dawn();
        this.amb?.setLift(1);
      }
    } catch (err) {
      this.fail(err);
    }
  }

  onEvent(e: SimEvent): void {
    if (!this.sfx || this.failed || this.hidden) return;
    if (this.rt && this.rt.state !== 'running') return;
    try {
      // Keep the pen's voice honest about whether ink is actually flowing.
      if (this.penDown && this.penI) {
        if (e.type === 'stroke-begin') {
          this.penBegun = true;
          this.penI.setFlowing(true);
        } else if (e.type === 'stroke-cut' || e.type === 'ink-dry') this.penI.setFlowing(false);
      }
      if (e.type === 'win' && this.ctx) this.lastWinEvent = this.ctx.currentTime;
      this.sfx.event(e);
    } catch (err) {
      this.fail(err);
    }
  }

  pen(down: boolean, x = 0, y = 0, speed = 0, ink: InkType = 'moon'): void {
    if (!this.penI || this.failed) return;
    try {
      if (!down) {
        this.penDown = false;
        this.penI.up();
        return;
      }
      if (this.rt && this.rt.state !== 'running') return;
      const now = this.ctx?.currentTime ?? 0;
      if (!this.penDown) {
        this.penDown = true;
        this.penDownAt = now;
        this.penBegun = false;
      }
      this.penI.move(x, y, speed, ink);
      // Touched down on wet paper (a no-ink zone): no stroke began, so the pen only scratches.
      if (!this.penBegun && now - this.penDownAt > 0.12) this.penI.setFlowing(false);
    } catch (err) {
      this.fail(err);
    }
  }

  ui(name: UiSound): void {
    if (!this.sfx || this.failed || this.hidden) return;
    if (this.rt && this.rt.state !== 'running') return;
    try {
      this.sfx.ui(name);
    } catch (err) {
      this.fail(err);
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.vol = { music: Number.isFinite(music) ? music : 0.7, sfx: Number.isFinite(sfx) ? sfx : 0.85 };
    try {
      this.applyVolumes();
    } catch (err) {
      this.fail(err);
    }
  }

  suspend(on: boolean): void {
    this.hidden = on;
    try {
      if (on) {
        this.stopTimer();
        this.penI?.up();
        void this.rt?.suspend().catch(() => {});
      } else if (this.rt) {
        void this.rt
          .resume()
          .then(() => this.startTimer())
          .catch(() => {});
        this.startTimer();
      }
    } catch {
      /* ignore */
    }
  }
}

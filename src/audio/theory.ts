// Music theory + the sound of each world ("a music box in a sleeping forest", DESIGN.md §8).
// Everything pitched in the game — music, pen, chimes, UI — is derived from the current world's key,
// so the whole soundscape is always in tune with itself.
import type { WorldKey } from '../core/types';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** A chord: its root as a scale degree, and its tones as scale-step offsets from that root. */
export interface Chord {
  deg: number;
  tones: readonly number[];
}

/** Harmonic recipes for PeriodicWaves (amplitude of harmonics 1..n). */
export type Timbre = 'warm' | 'glass' | 'reed' | 'soft' | 'velvet';

export type Voicing = 'close' | 'open' | 'fifths';

/** Short tick sounds used by the run-mode pulse. */
export type TickKind = 'mechanism' | 'drop' | 'ripple' | 'brush' | 'wood' | 'shaker';

/** Signature layers that give each world its character. */
export type Signature = 'waltz' | 'plucks' | 'shimmer' | 'thunder' | 'woodwind' | 'sunrise';

/** Nature-at-night ambience, very quiet, under everything. */
export type Critters = 'crickets' | 'drips' | 'river' | 'none' | 'owls' | 'birds';

export interface WorldSound {
  /** MIDI note of the tonic (octave 2–3). */
  root: number;
  /** Scale as semitone offsets. */
  scale: readonly number[];
  /** Scale degrees (0-based) the melody and the pen may use. */
  melody: readonly number[];
  bpm: number;
  /** Beats per bar (the grid is in eighth notes). */
  meter: 3 | 4;
  /** Late-eighth swing (fraction of an eighth). */
  swing: number;
  barsPerChord: number;
  prog: readonly Chord[];
  pad: { timbre: Timbre; cutoff: number; detune: number; attack: number; release: number; gain: number; voicing: Voicing; center: number };
  bell: { ratio: number; index: number; decay: number; center: number; gain: number; tink: number; tinkRatio: number; density: number };
  drone: { gain: number; fifth: number; throb: number };
  /** Music-box echo: delay in beats, feedback, send. */
  delay: { beats: number; feedback: number; send: number };
  reverb: number;
  /** Run-mode pulse patterns over one bar of eighths ('x' hit, 'X' accent, '.' rest; bass: 'r' root, '5' fifth, 'o' octave). */
  run: { kick: string; tick: string; tickKind: TickKind; bass: string; arp: string; kickHz: number; gain: number };
  signature: Signature;
  critters: Critters;
  /** Centre (MIDI) of the pen's two-octave range. */
  pen: number;
  /** Overall music tone (lowpass Hz) in plan mode. */
  tone: number;
}

const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const ALL = [0, 1, 2, 3, 4, 5, 6];

const SEVENTH = [0, 2, 4, 6];
const ADD9 = [0, 2, 4, 8];
const FIFTHS = [0, 4, 8];

export const WORLD_SOUND: Record<WorldKey, WorldSound> = {
  // Dusk Meadow — F lydian waltz. Warm, a little nostalgic: a music box someone left in the grass.
  dusk: {
    root: 53,
    scale: LYDIAN,
    melody: ALL,
    bpm: 74,
    meter: 3,
    swing: 0,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: SEVENTH }, // Fmaj7
      { deg: 1, tones: ADD9 }, // G(add9) — the lydian lift
      { deg: 5, tones: SEVENTH }, // Dm7
      { deg: 4, tones: SEVENTH }, // Cmaj7
    ],
    pad: { timbre: 'warm', cutoff: 1500, detune: 7, attack: 2.4, release: 3.2, gain: 0.039, voicing: 'close', center: 64 },
    bell: { ratio: 3, index: 1.5, decay: 1.35, center: 77, gain: 0.176, tink: 0.1, tinkRatio: 6.27, density: 0.75 },
    drone: { gain: 0.022, fifth: 0.2, throb: 0 },
    delay: { beats: 0.75, feedback: 0.38, send: 0.32 },
    reverb: 0.5,
    run: { kick: 'x.....', tick: '..x.x.', tickKind: 'mechanism', bass: 'r...5.', arp: '..a.a.', kickHz: 62, gain: 1 },
    signature: 'waltz',
    critters: 'crickets',
    pen: 72,
    tone: 5200,
  },
  // Mushroom Hollow — D dorian, dreamy, glassy plucks dripping in a cave of light.
  hollow: {
    root: 50,
    scale: DORIAN,
    melody: ALL,
    bpm: 84,
    meter: 4,
    swing: 0.1,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: SEVENTH }, // Dm7
      { deg: 3, tones: ADD9 }, // G(add9)
      { deg: 2, tones: SEVENTH }, // Fmaj7
      { deg: 6, tones: ADD9 }, // C(add9)
    ],
    pad: { timbre: 'glass', cutoff: 1700, detune: 9, attack: 2.0, release: 3.0, gain: 0.035, voicing: 'open', center: 62 },
    bell: { ratio: 3.5, index: 2.1, decay: 1.1, center: 74, gain: 0.162, tink: 0.06, tinkRatio: 5.4, density: 0.7 },
    drone: { gain: 0.022, fifth: 0.25, throb: 0 },
    delay: { beats: 0.75, feedback: 0.42, send: 0.36 },
    reverb: 0.58,
    run: { kick: 'x...x...', tick: '..x...x.', tickKind: 'drop', bass: 'r..r..5.', arp: '.a.a.a.a', kickHz: 60, gain: 1 },
    signature: 'plucks',
    critters: 'drips',
    pen: 71,
    tone: 5600,
  },
  // Starwater — A, open fifths, slow river; high notes shimmer like stars on water.
  starwater: {
    root: 57,
    scale: IONIAN,
    melody: [0, 1, 2, 4, 5],
    bpm: 60,
    meter: 3,
    swing: 0,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: FIFTHS }, // A E B
      { deg: 3, tones: FIFTHS }, // D A E
      { deg: 5, tones: FIFTHS }, // F# C# G#
      { deg: 4, tones: FIFTHS }, // E B F#
    ],
    pad: { timbre: 'soft', cutoff: 1900, detune: 6, attack: 3.0, release: 4.0, gain: 0.039, voicing: 'fifths', center: 60 },
    bell: { ratio: 2, index: 0.8, decay: 2.4, center: 81, gain: 0.135, tink: 0.04, tinkRatio: 4.0, density: 0.6 },
    drone: { gain: 0.022, fifth: 0.35, throb: 0 },
    delay: { beats: 1.5, feedback: 0.46, send: 0.42 },
    reverb: 0.66,
    run: { kick: 'x.....', tick: 'x.x.x.', tickKind: 'ripple', bass: 'r..5..', arp: 'aaaaaa', kickHz: 58, gain: 0.95 },
    signature: 'shimmer',
    critters: 'river',
    pen: 74,
    tone: 6200,
  },
  // Stormglass — C minor, low pulses, distant thunder rolling somewhere behind the hills.
  storm: {
    root: 48,
    scale: AEOLIAN,
    melody: ALL,
    bpm: 70,
    meter: 4,
    swing: 0,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: ADD9 }, // Cm(add9)
      { deg: 5, tones: SEVENTH }, // Abmaj7
      { deg: 2, tones: ADD9 }, // Eb(add9)
      { deg: 6, tones: ADD9 }, // Bb(add9)
    ],
    pad: { timbre: 'warm', cutoff: 950, detune: 8, attack: 2.2, release: 3.2, gain: 0.041, voicing: 'close', center: 60 },
    bell: { ratio: 1.41, index: 1.1, decay: 1.8, center: 72, gain: 0.135, tink: 0, tinkRatio: 1, density: 0.5 },
    drone: { gain: 0.032, fifth: 0.15, throb: 0.6 },
    delay: { beats: 1, feedback: 0.36, send: 0.28 },
    reverb: 0.6,
    run: { kick: 'x..x..x.', tick: '....x...', tickKind: 'brush', bass: 'r......r', arp: '........', kickHz: 55, gain: 1 },
    signature: 'thunder',
    critters: 'none',
    pen: 70,
    tone: 3800,
  },
  // Moth Wood — B phrygian, sparse and low: a lonely reed in the dark, a heartbeat.
  mothwood: {
    root: 47,
    scale: PHRYGIAN,
    melody: ALL,
    bpm: 56,
    meter: 4,
    swing: 0,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: SEVENTH }, // Bm7
      { deg: 1, tones: SEVENTH }, // Cmaj7
      { deg: 6, tones: SEVENTH }, // Am7
      { deg: 0, tones: [0, 3, 4] }, // Bsus4
    ],
    pad: { timbre: 'velvet', cutoff: 950, detune: 10, attack: 3.0, release: 4.0, gain: 0.043, voicing: 'close', center: 60 },
    bell: { ratio: 2, index: 0.7, decay: 1.9, center: 74, gain: 0.115, tink: 0, tinkRatio: 1, density: 0.62 },
    drone: { gain: 0.032, fifth: 0.1, throb: 0 },
    delay: { beats: 1.5, feedback: 0.4, send: 0.3 },
    reverb: 0.7,
    run: { kick: 'x.x.....', tick: '...x...x', tickKind: 'wood', bass: 'r...r...', arp: '........', kickHz: 52, gain: 0.95 },
    signature: 'woodwind',
    critters: 'owls',
    pen: 68,
    tone: 3000,
  },
  // Daybreak Spires — G major, rising, hopeful; a little brighter with every lamp until the sun.
  daybreak: {
    root: 55,
    scale: IONIAN,
    melody: ALL,
    bpm: 80,
    meter: 4,
    swing: 0,
    barsPerChord: 2,
    prog: [
      { deg: 0, tones: ADD9 }, // G(add9)
      { deg: 1, tones: SEVENTH }, // Am7
      { deg: 3, tones: SEVENTH }, // Cmaj7
      { deg: 4, tones: ADD9 }, // D(add9)
    ],
    pad: { timbre: 'warm', cutoff: 1500, detune: 7, attack: 2.2, release: 3.0, gain: 0.039, voicing: 'open', center: 64 },
    bell: { ratio: 3, index: 1.4, decay: 1.4, center: 79, gain: 0.162, tink: 0.08, tinkRatio: 6.27, density: 0.72 },
    drone: { gain: 0.022, fifth: 0.3, throb: 0 },
    delay: { beats: 0.75, feedback: 0.36, send: 0.3 },
    reverb: 0.5,
    run: { kick: 'x...x...', tick: '.x.x.x.x', tickKind: 'shaker', bass: 'r.r...5.', arp: 'a.a.a.a.', kickHz: 62, gain: 1 },
    signature: 'sunrise',
    critters: 'birds',
    pen: 74,
    tone: 6500,
  },
};

/** Pitch helper bound to a world's key and its current chord. */
export class Key {
  s: WorldSound;
  chord: Chord;
  /** Pitch classes (0..11) of the current chord. */
  chordPcs: number[] = [];

  constructor(s: WorldSound) {
    this.s = s;
    this.chord = s.prog[0];
    this.setChord(this.chord);
  }

  setWorld(s: WorldSound): void {
    this.s = s;
    this.setChord(s.prog[0]);
  }

  setChord(c: Chord): void {
    this.chord = c;
    this.chordPcs = c.tones.map((t) => mod(this.deg(c.deg + t), 12));
  }

  /** MIDI note of scale degree `d` (any integer; 7 = tonic an octave up) counted from the root. */
  deg(d: number): number {
    const sc = this.s.scale;
    const n = sc.length;
    return this.s.root + 12 * Math.floor(d / n) + sc[mod(d, n)];
  }

  /** Degree `d` placed in the octave whose tonic is nearest to `near`. */
  degNear(d: number, near: number): number {
    const m = this.deg(d);
    return m + 12 * Math.round((near - m) / 12);
  }

  /** Tonic in the octave starting at or just above `from`. */
  tonicFrom(from: number): number {
    const r = this.s.root;
    return r + 12 * Math.ceil((from - r) / 12);
  }

  isChordTone(m: number): boolean {
    return this.chordPcs.includes(mod(m, 12));
  }

  inMelody(m: number): boolean {
    const pc = mod(m - this.s.root, 12);
    const i = this.s.scale.indexOf(pc);
    return i >= 0 && this.s.melody.includes(i);
  }

  /** All melody-scale MIDI notes in [lo, hi]. */
  melodyNotes(lo: number, hi: number): number[] {
    const out: number[] = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (this.inMelody(m)) out.push(m);
    return out;
  }

  /** Nearest chord tone to `m` (ties go up). */
  nearestChordTone(m: number): number {
    for (let d = 0; d < 12; d++) {
      if (this.isChordTone(m + d)) return m + d;
      if (this.isChordTone(m - d)) return m - d;
    }
    return m;
  }

  /** The i-th tone (0 = root) of the current chord, in the octave nearest `near`. */
  chordTone(i: number, near: number): number {
    const c = this.chord;
    const n = c.tones.length;
    const oct = Math.floor(i / n);
    const m = this.deg(c.deg + c.tones[mod(i, n)]);
    return m + 12 * Math.round((near - m) / 12) + 12 * oct;
  }

  /** Tonic-chord arpeggio degree list used for rising chimes (sparks, stars). */
  static readonly ARP = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21];
}

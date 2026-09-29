import { describe, expect, it } from 'vitest';
import { InklightAudio } from '../src/audio/engine';
import { Key, WORLD_SOUND, mtof } from '../src/audio/theory';
import type { WorldKey } from '../src/core/types';

const WORLDS = Object.keys(WORLD_SOUND) as WorldKey[];

describe('audio theory', () => {
  it('tunes A4 to 440 Hz', () => {
    expect(mtof(69)).toBeCloseTo(440, 6);
    expect(mtof(81)).toBeCloseTo(880, 6);
  });

  it.each(WORLDS)('%s: scale, melody and progression are consistent', (w) => {
    const s = WORLD_SOUND[w];
    expect(s.scale.length).toBe(7);
    expect(s.scale[0]).toBe(0);
    for (const d of s.melody) expect(d).toBeGreaterThanOrEqual(0);
    for (const d of s.melody) expect(d).toBeLessThan(7);
    for (const p of [s.run.kick, s.run.tick, s.run.bass, s.run.arp]) expect(p.length).toBe(s.meter * 2);
    const k = new Key(s);
    for (const c of s.prog) {
      k.setChord(c);
      // Every chord tone is a scale tone, and chordTone() returns the chord's pitch classes.
      for (let i = 0; i < c.tones.length; i++) {
        const m = k.chordTone(i, 60);
        expect(k.isChordTone(m)).toBe(true);
        expect(s.scale).toContain((((m - s.root) % 12) + 12) % 12);
      }
    }
  });

  it('degrees are monotonic across octaves', () => {
    const k = new Key(WORLD_SOUND.dusk);
    for (let d = -10; d < 20; d++) expect(k.deg(d + 1)).toBeGreaterThan(k.deg(d));
    expect(k.deg(7) - k.deg(0)).toBe(12);
  });

  it('melody ladders only contain melody-scale notes', () => {
    for (const w of WORLDS) {
      const k = new Key(WORLD_SOUND[w]);
      const notes = k.melodyNotes(48, 84);
      expect(notes.length).toBeGreaterThan(10);
      for (const m of notes) expect(k.inMelody(m)).toBe(true);
    }
  });
});

describe('audio engine without Web Audio', () => {
  it('never throws and stays silent', () => {
    const a = new InklightAudio();
    expect(() => {
      a.setVolumes(0.5, 0.5);
      a.setWorld('storm');
      a.setLevel(null);
      a.unlock();
      a.setMode('run');
      a.onEvent({ type: 'spark', index: 0, x: 1, y: 1, count: 1, total: 3 });
      a.pen(true, 100, 100, 500, 'moon');
      a.pen(false);
      a.ui('tap');
      a.suspend(true);
      a.suspend(false);
      a.pump();
    }).not.toThrow();
  });
});

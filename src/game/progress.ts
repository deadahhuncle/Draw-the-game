import type { LevelDef } from '../core/types';
import { ALL_LEVELS, WORLDS } from '../levels';
import { load, save } from './storage';

export interface LevelRecord {
  done: boolean;
  /** [lit, all sparks, frugal] — best ever, each independently. */
  stars: [boolean, boolean, boolean];
  bestInk: number | null;
}

interface SaveData {
  levels: Record<string, LevelRecord>;
  unlockAll: boolean;
  seenIntro: boolean;
  lastLevel: string | null;
}

const KEY = 'inklight.progress.v1';
let data: SaveData = load<SaveData>(KEY, { levels: {}, unlockAll: false, seenIntro: false, lastLevel: null });

export interface RunOutcome {
  sparks: number;
  totalSparks: number;
  ink: number;
  par: number;
}

export function starsFor(o: RunOutcome): [boolean, boolean, boolean] {
  return [true, o.sparks >= o.totalSparks, o.ink <= o.par + 0.5];
}

export const progress = {
  get(id: string): LevelRecord {
    return data.levels[id] ?? { done: false, stars: [false, false, false], bestInk: null };
  },
  /** Record a win; returns which stars are newly earned. */
  record(id: string, o: RunOutcome): { stars: [boolean, boolean, boolean]; fresh: [boolean, boolean, boolean]; firstClear: boolean } {
    const prev = this.get(id);
    const s = starsFor(o);
    const merged: [boolean, boolean, boolean] = [prev.stars[0] || s[0], prev.stars[1] || s[1], prev.stars[2] || s[2]];
    const fresh: [boolean, boolean, boolean] = [s[0] && !prev.stars[0], s[1] && !prev.stars[1], s[2] && !prev.stars[2]];
    data.levels[id] = { done: true, stars: merged, bestInk: prev.bestInk === null ? o.ink : Math.min(prev.bestInk, o.ink) };
    save(KEY, data);
    return { stars: s, fresh, firstClear: !prev.done };
  },
  isUnlocked(level: LevelDef): boolean {
    if (data.unlockAll) return true;
    const i = ALL_LEVELS.indexOf(level);
    if (i <= 0) return true;
    return this.get(ALL_LEVELS[i - 1].id).done;
  },
  worldUnlocked(index: number): boolean {
    const w = WORLDS[index - 1];
    return !!w && this.isUnlocked(w.levels[0]);
  },
  totalStars(): number {
    let n = 0;
    for (const r of Object.values(data.levels)) n += r.stars.filter(Boolean).length;
    return n;
  },
  worldStars(index: number): { got: number; max: number } {
    const w = WORLDS[index - 1];
    let got = 0;
    for (const l of w.levels) got += this.get(l.id).stars.filter(Boolean).length;
    return { got, max: w.levels.length * 3 };
  },
  /** First level that is unlocked but not yet done (or the last level). */
  frontier(): LevelDef {
    return ALL_LEVELS.find((l) => !this.get(l.id).done && this.isUnlocked(l)) ?? ALL_LEVELS[ALL_LEVELS.length - 1];
  },
  setUnlockAll(on: boolean): void {
    data.unlockAll = on;
    save(KEY, data);
  },
  get seenIntro(): boolean {
    return data.seenIntro;
  },
  markIntroSeen(): void {
    data.seenIntro = true;
    save(KEY, data);
  },
  get lastLevel(): string | null {
    return data.lastLevel;
  },
  setLastLevel(id: string): void {
    data.lastLevel = id;
    save(KEY, data);
  },
  reset(): void {
    data = { levels: {}, unlockAll: false, seenIntro: false, lastLevel: null };
    save(KEY, data);
  },
};

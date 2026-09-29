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
  seenIntro: boolean;
  lastLevel: string | null;
  /** Level id whose lamp Wick was last seen standing beside on the journey map. */
  mapWick: string | null;
  /** World keys whose "every lamp lit" interstitial has been shown. */
  celebrated: string[];
  /** Levels where the player has agreed to see hints (asked once per level). */
  hints: string[];
  endingSeen: boolean;
}

const KEY = 'inklight.progress.v1';
const fresh = (): SaveData => ({ levels: {}, seenIntro: false, lastLevel: null, mapWick: null, celebrated: [], hints: [], endingSeen: false });
let data: SaveData = load<SaveData>(KEY, fresh());
/** Debug: ?unlock opens every level for this session only (never persisted). */
let unlockAll = false;

export interface RunOutcome {
  sparks: number;
  totalSparks: number;
  ink: number;
  par: number;
}

export interface RecordResult {
  /** Stars earned by this run. */
  stars: [boolean, boolean, boolean];
  /** Stars earned for the first time by this run. */
  fresh: [boolean, boolean, boolean];
  /** Best-ever stars after this run. */
  best: [boolean, boolean, boolean];
  firstClear: boolean;
  prevBestInk: number | null;
  /** This run used less ink than any previous clear. */
  newBestInk: boolean;
}

export function starsFor(o: RunOutcome): [boolean, boolean, boolean] {
  return [true, o.sparks >= o.totalSparks, o.ink <= o.par + 0.5];
}

const count = (s: boolean[]) => s.filter(Boolean).length;

export const progress = {
  get(id: string): LevelRecord {
    return data.levels[id] ?? { done: false, stars: [false, false, false], bestInk: null };
  },
  /** Record a win. */
  record(id: string, o: RunOutcome): RecordResult {
    const prev = this.get(id);
    const s = starsFor(o);
    const merged: [boolean, boolean, boolean] = [prev.stars[0] || s[0], prev.stars[1] || s[1], prev.stars[2] || s[2]];
    const freshStars: [boolean, boolean, boolean] = [s[0] && !prev.stars[0], s[1] && !prev.stars[1], s[2] && !prev.stars[2]];
    const newBestInk = prev.bestInk !== null && o.ink < prev.bestInk - 0.5;
    data.levels[id] = { done: true, stars: merged, bestInk: prev.bestInk === null ? o.ink : Math.min(prev.bestInk, o.ink) };
    save(KEY, data);
    return { stars: s, fresh: freshStars, best: merged, firstClear: !prev.done, prevBestInk: prev.bestInk, newBestInk };
  },
  isDone(id: string): boolean {
    return !!data.levels[id]?.done;
  },
  isUnlocked(level: LevelDef): boolean {
    if (unlockAll) return true;
    const i = ALL_LEVELS.indexOf(level);
    if (i <= 0) return true;
    return this.get(ALL_LEVELS[i - 1].id).done;
  },
  worldUnlocked(index: number): boolean {
    const w = WORLDS[index - 1];
    return !!w && this.isUnlocked(w.levels[0]);
  },
  worldDone(index: number): boolean {
    const w = WORLDS[index - 1];
    return !!w && w.levels.every((l) => this.get(l.id).done);
  },
  totalStars(): number {
    let n = 0;
    for (const l of ALL_LEVELS) n += count(this.get(l.id).stars);
    return n;
  },
  maxStars(): number {
    return ALL_LEVELS.length * 3;
  },
  worldStars(index: number): { got: number; max: number } {
    const w = WORLDS[index - 1];
    if (!w) return { got: 0, max: 0 };
    let got = 0;
    for (const l of w.levels) got += count(this.get(l.id).stars);
    return { got, max: w.levels.length * 3 };
  },
  /** First level that is unlocked but not yet done (or the last level). */
  frontier(): LevelDef {
    return ALL_LEVELS.find((l) => !this.get(l.id).done && this.isUnlocked(l)) ?? ALL_LEVELS[ALL_LEVELS.length - 1];
  },
  /** Every lamp in the journey is lit. */
  allDone(): boolean {
    return ALL_LEVELS.length > 0 && ALL_LEVELS.every((l) => this.get(l.id).done);
  },
  /** Has the player ever cleared anything? */
  started(): boolean {
    return ALL_LEVELS.some((l) => this.get(l.id).done);
  },
  setUnlockAll(on: boolean): void {
    unlockAll = on;
  },
  get unlockAll(): boolean {
    return unlockAll;
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
  get mapWick(): string | null {
    return data.mapWick;
  },
  setMapWick(id: string): void {
    data.mapWick = id;
    save(KEY, data);
  },
  celebrated(worldKey: string): boolean {
    return data.celebrated.includes(worldKey);
  },
  markCelebrated(worldKey: string): void {
    if (!data.celebrated.includes(worldKey)) data.celebrated.push(worldKey);
    save(KEY, data);
  },
  hintAllowed(id: string): boolean {
    return data.hints.includes(id);
  },
  allowHint(id: string): void {
    if (!data.hints.includes(id)) data.hints.push(id);
    save(KEY, data);
  },
  get endingSeen(): boolean {
    return data.endingSeen;
  },
  markEndingSeen(): void {
    data.endingSeen = true;
    save(KEY, data);
  },
  reset(): void {
    data = fresh();
    save(KEY, data);
  },
  /** Debug (?done=N): pretend the first N levels are lit, with a scatter of stars. */
  debugComplete(n: number): void {
    ALL_LEVELS.slice(0, n).forEach((l, i) => {
      const r = (i * 7919) % 11;
      data.levels[l.id] = { done: true, stars: [true, r % 3 !== 0, r % 4 === 1 || r > 7], bestInk: l.ink.par };
    });
    data.seenIntro = true;
    save(KEY, data);
  },
};

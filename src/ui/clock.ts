// The game is one night: 7 pm at the first lamp of Dusk Meadow, sunrise just before 7 am.
// Each world spans two hours; each level is a moment in it.
import type { LevelDef, WorldDef } from '../core/types';

const START_H = 19;
const WORLD_HOURS = 2;

/** Minutes after midnight (may exceed 24h) for a world index (1-based) and fraction 0..1 through it. */
function minutesAt(worldIndex: number, frac: number): number {
  return Math.round(((START_H + (worldIndex - 1 + frac) * WORLD_HOURS) * 60) / 5) * 5;
}

export function fmtTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** The hour a world begins, e.g. "9 pm". */
export function worldHour(world: WorldDef): string {
  const m = minutesAt(world.index, 0);
  const h24 = Math.floor((m % 1440) / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** Time of night at which a level takes place. */
export function levelTime(level: LevelDef, world: WorldDef): string {
  const i = Math.max(0, world.levels.indexOf(level));
  const n = Math.max(1, world.levels.length);
  return fmtTime(minutesAt(world.index, (i + 0.5) / n));
}

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

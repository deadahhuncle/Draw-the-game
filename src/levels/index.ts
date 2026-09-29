import type { LevelDef, WorldDef, WorldKey } from '../core/types';
import type { LevelSpec } from './builders';
import { DEV_LEVELS } from './dev';
import { WORLD1 } from './world1';
import { WORLD2 } from './world2';
import { WORLD3 } from './world3';
import { WORLD4 } from './world4';
import { WORLD5 } from './world5';
import { WORLD6 } from './world6';

interface WorldMeta {
  key: WorldKey;
  name: string;
  subtitle: string;
  specs: LevelSpec[];
}

const META: WorldMeta[] = [
  { key: 'dusk', name: 'Dusk Meadow', subtitle: 'where the path begins', specs: WORLD1 },
  { key: 'hollow', name: 'Mushroom Hollow', subtitle: 'the ground learns to leap', specs: WORLD2 },
  { key: 'starwater', name: 'Starwater', subtitle: 'a river full of sky', specs: WORLD3 },
  { key: 'storm', name: 'Stormglass', subtitle: 'keep the little flame dry', specs: WORLD4 },
  { key: 'mothwood', name: 'Moth Wood', subtitle: 'they are hungry for light', specs: WORLD5 },
  { key: 'daybreak', name: 'Daybreak Spires', subtitle: 'the last lamp is the sun', specs: WORLD6 },
];

const build = (m: WorldMeta, index: number, prefix: string): WorldDef => ({
  index,
  key: m.key,
  name: m.name,
  subtitle: m.subtitle,
  levels: m.specs.map((spec, li) => ({ ...spec, id: `${prefix}${index}-${li + 1}` }) as LevelDef),
});

/** Worlds with at least one level, in journey order. */
export const WORLDS: WorldDef[] = META.map((m, i) => build(m, i + 1, '')).filter((w) => w.levels.length > 0);

export const ALL_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

/** Sandbox worlds (ids like "d4-1"), not part of the journey. */
export const DEV_WORLDS: WorldDef[] = META.map((m, i) => build({ ...m, specs: DEV_LEVELS[m.key] ?? [] }, i + 1, 'd')).filter((w) => w.levels.length > 0);

export function getLevel(id: string): LevelDef | undefined {
  return ALL_LEVELS.find((l) => l.id === id) ?? DEV_WORLDS.flatMap((w) => w.levels).find((l) => l.id === id);
}

export function worldOf(level: LevelDef): WorldDef {
  return WORLDS.find((w) => w.levels.includes(level)) ?? DEV_WORLDS.find((w) => w.levels.includes(level))!;
}

export function nextLevel(level: LevelDef): LevelDef | undefined {
  const i = ALL_LEVELS.indexOf(level);
  return i >= 0 ? ALL_LEVELS[i + 1] : undefined;
}

/** 0-based position of a level within its world, and the world's length (e.g. for dawn progression). */
export function levelIndexInWorld(level: LevelDef): { index: number; count: number } {
  const w = worldOf(level);
  return { index: w.levels.indexOf(level), count: w.levels.length };
}

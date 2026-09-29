import type { LevelDef, WorldDef, WorldKey } from '../core/types';
import type { LevelSpec } from './builders';
import { WORLD1 } from './world1';

interface WorldMeta {
  key: WorldKey;
  name: string;
  subtitle: string;
  specs: LevelSpec[];
}

const META: WorldMeta[] = [{ key: 'dusk', name: 'Dusk Meadow', subtitle: 'where the path begins', specs: WORLD1 }];

export const WORLDS: WorldDef[] = META.map((m, wi) => ({
  index: wi + 1,
  key: m.key,
  name: m.name,
  subtitle: m.subtitle,
  levels: m.specs.map((spec, li) => ({ ...spec, id: `${wi + 1}-${li + 1}` }) as LevelDef),
}));

export const ALL_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);

export function getLevel(id: string): LevelDef | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

export function worldOf(level: LevelDef): WorldDef {
  return WORLDS.find((w) => w.levels.includes(level))!;
}

export function nextLevel(level: LevelDef): LevelDef | undefined {
  const i = ALL_LEVELS.indexOf(level);
  return i >= 0 ? ALL_LEVELS[i + 1] : undefined;
}

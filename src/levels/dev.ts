// Developer sandbox levels: reachable via ?level=d<world>-<n> (e.g. ?level=d4-1) but never listed in the
// journey or checked by the verifier. Use them to preview entity art, lighting and effects in every world.
import type { WorldKey } from '../core/types';
import { ground, type LevelSpec } from './builders';

export const DEV_LEVELS: Partial<Record<WorldKey, LevelSpec[]>> = {
  dusk: [
    {
      name: 'Sandbox',
      start: { x: 100, y: 600 },
      goal: { x: 1180, y: 600 },
      ink: { budget: 5000, par: 5000, types: ['moon', 'spring', 'comet'] },
      terrain: [ground([[0, 600], [1280, 600]])],
      sparks: [{ x: 640, y: 560 }],
      solution: [],
    },
  ],
};

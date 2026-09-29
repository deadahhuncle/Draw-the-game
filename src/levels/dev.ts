// Developer sandbox levels: reachable via ?level=d<world>-<n> (e.g. ?level=d4-1) but never listed in the
// journey or checked by the verifier. Use them to preview entity art, lighting and effects in every world.
import type { WorldKey } from '../core/types';
import { block, brambles, ground, ink, inkpot, ledge, mushroom, note, pts, type LevelSpec } from './builders';

const ALL_INKS: LevelSpec['ink'] = { budget: 5000, par: 5000, types: ['moon', 'spring', 'comet'] };

export const DEV_LEVELS: Partial<Record<WorldKey, LevelSpec[]>> = {
  dusk: [
    {
      name: 'Sandbox: Meadow',
      start: { x: 100, y: 580 },
      goal: { x: 1180, y: 540 },
      ink: ALL_INKS,
      terrain: [
        ground([[0, 580], [260, 572], [420, 590], [520, 600]]),
        ground([[700, 600], [860, 560], [1000, 540], [1280, 540]]),
        brambles(880, 960, 552, 30),
        ledge(560, 420, 120),
        block(1080, 470, 30, 70, { style: 'wood', bare: true }),
      ],
      sparks: [{ x: 300, y: 520 }, { x: 620, y: 390 }, { x: 1000, y: 470 }],
      notes: [note(610, 330, 'a note in the margin', { arrow: [610, 350, 610, 405], rot: -3 })],
      ghosts: [{ pts: pts([[500, 604], [720, 604]]) }],
      solution: [ink('moon', [[500, 604], [720, 604]]), ink('moon', [[860, 552], [900, 500], [960, 500], [990, 540]])],
    },
  ],
  hollow: [
    {
      name: 'Sandbox: Hollow',
      start: { x: 100, y: 600 },
      goal: { x: 1180, y: 520 },
      ink: ALL_INKS,
      terrain: [ground([[0, 600], [400, 600]]), ground([[900, 520], [1280, 520]]), ...mushroom(560, 780, 540, 110), ...mushroom(760, 780, 480, 90, 900)],
      sparks: [{ x: 560, y: 380 }, { x: 760, y: 300 }, { x: 1000, y: 480 }],
      noInk: [pts([[420, 200], [880, 200], [880, 460], [420, 460]])],
      solution: [ink('spring', [[320, 604], [400, 604]])],
    },
  ],
  starwater: [
    {
      name: 'Sandbox: River',
      start: { x: 100, y: 560 },
      goal: { x: 1180, y: 560 },
      ink: ALL_INKS,
      terrain: [ground([[0, 560], [300, 560], [340, 590]]), ground([[960, 590], [1000, 560], [1280, 560]])],
      entities: [{ kind: 'mover', pts: pts([[380, 600], [500, 600], [490, 624], [390, 624]]), path: pts([[440, 600], [860, 600]]), period: 6 }],
      sparks: [{ x: 640, y: 540 }, { x: 800, y: 440 }, { x: 1100, y: 520 }],
      solution: [ink('comet', [[150, 564], [300, 564]])],
    },
  ],
  storm: [
    {
      name: 'Sandbox: Storm',
      start: { x: 100, y: 580 },
      goal: { x: 1180, y: 580 },
      ink: ALL_INKS,
      terrain: [ground([[0, 580], [1280, 580]], { style: 'crystal' }), block(620, 480, 60, 100, { style: 'crystal' })],
      entities: [
        { kind: 'rain', x1: 260, x2: 520, y: 150 },
        { kind: 'wind', x: 700, y: 200, w: 260, h: 380, fx: 0, fy: -1900 },
        inkpot(1000, 550, 200),
      ],
      sparks: [{ x: 400, y: 540 }, { x: 830, y: 300 }, { x: 1100, y: 540 }],
      solution: [ink('moon', [[240, 470], [540, 470]])],
    },
  ],
  mothwood: [
    {
      name: 'Sandbox: Moths',
      start: { x: 100, y: 580 },
      goal: { x: 1180, y: 580 },
      ink: ALL_INKS,
      dark: true,
      terrain: [ground([[0, 580], [480, 580]]), ground([[760, 580], [1280, 580]]), ledge(900, 440, 140)],
      entities: [
        { kind: 'moth', x: 620, y: 300 },
        { kind: 'moth', x: 1000, y: 250 },
        { kind: 'glowworm', x: 470, y: 520 },
        { kind: 'glowworm', x: 780, y: 500 },
        { kind: 'glowworm', x: 1000, y: 420, r: 120 },
      ],
      sparks: [{ x: 620, y: 540 }, { x: 960, y: 400 }, { x: 1120, y: 540 }],
      solution: [ink('moon', [[460, 584], [780, 584]])],
    },
  ],
  daybreak: [
    {
      name: 'Sandbox: Spires',
      start: { x: 100, y: 580 },
      goal: { x: 1180, y: 500 },
      ink: ALL_INKS,
      terrain: [
        ground([[0, 580], [700, 580]], { style: 'paper' }),
        ground([[900, 500], [1280, 500]], { style: 'paper' }),
        block(560, 300, 60, 200, { style: 'paper' }),
      ],
      entities: [
        { kind: 'wisp', x: 300, y: 560, id: 'a' },
        { kind: 'gate', x: 640, y: 480, w: 24, h: 100, opens: 'a' },
        { kind: 'crumble', x: 720, y: 580, w: 170, h: 18 },
      ],
      sparks: [{ x: 300, y: 500 }, { x: 800, y: 540 }, { x: 1050, y: 460 }],
      solution: [ink('moon', [[880, 504], [920, 504]])],
    },
  ],
};

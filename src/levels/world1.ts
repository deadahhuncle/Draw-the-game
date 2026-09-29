// World 1 — Dusk Meadow. Moon ink, gaps, slopes, walls, brambles.
import { brambles, ground, ink, note, type LevelSpec } from './builders';

export const WORLD1: LevelSpec[] = [
  {
    name: 'First Light',
    start: { x: 110, y: 580 },
    goal: { x: 1150, y: 580 },
    ink: { budget: 420, par: 240, types: ['moon'] },
    terrain: [ground([[0, 580], [520, 580]]), ground([[700, 580], [1280, 580]])],
    sparks: [
      { x: 330, y: 548 },
      { x: 610, y: 548 },
      { x: 880, y: 548 },
    ],
    notes: [note(610, 452, 'draw a bridge', { arrow: [610, 470, 610, 552], rot: -3 })],
    ghosts: [{ pts: [{ x: 505, y: 584 }, { x: 715, y: 584 }] }],
    solution: [ink('moon', [[500, 584], [720, 584]])],
  },
  {
    name: 'Up and Over',
    start: { x: 110, y: 600 },
    goal: { x: 1160, y: 500 },
    ink: { budget: 460, par: 300, types: ['moon'] },
    terrain: [ground([[0, 600], [470, 600]]), ground([[690, 500], [1280, 500]])],
    sparks: [
      { x: 300, y: 568 },
      { x: 580, y: 526 },
      { x: 900, y: 468 },
    ],
    notes: [note(560, 420, 'a gentle ramp', { arrow: [520, 440, 560, 520], rot: 4 })],
    solution: [ink('moon', [[450, 604], [700, 504]])],
  },
  {
    name: 'Turnabout',
    start: { x: 560, y: 560, facing: 1 },
    goal: { x: 140, y: 560 },
    ink: { budget: 220, par: 110, types: ['moon'] },
    terrain: [ground([[0, 560], [900, 560]])],
    sparks: [
      { x: 780, y: 528 },
      { x: 420, y: 528 },
      { x: 260, y: 528 },
    ],
    notes: [note(850, 400, 'Wick turns at walls', { arrow: [850, 420, 820, 490], rot: -4 })],
    solution: [ink('moon', [[830, 560], [830, 470]])],
  },
  {
    name: 'Thornfield',
    start: { x: 110, y: 580 },
    goal: { x: 1170, y: 580 },
    ink: { budget: 760, par: 620, types: ['moon'] },
    terrain: [ground([[0, 580], [1280, 580]]), brambles(430, 560, 580, 34), brambles(780, 900, 580, 34)],
    sparks: [
      { x: 495, y: 500 },
      { x: 670, y: 548 },
      { x: 840, y: 500 },
    ],
    notes: [note(495, 380, 'brambles bite — go over', { rot: -2 })],
    solution: [
      ink('moon', [[380, 582], [428, 530], [562, 530], [612, 582]]),
      ink('moon', [[730, 582], [778, 530], [902, 530], [952, 582]]),
    ],
  },
];

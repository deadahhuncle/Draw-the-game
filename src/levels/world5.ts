// World 5 — Moth Wood. Moths eat light; darkness; lure puzzles.
import { brambles, ground, ink, ledge, note, poly, thorns, type LevelSpec } from './builders';

export const WORLD5: LevelSpec[] = [
  // 5-1 — Moths love light: a decoy keeps the moth busy while Wick crosses.
  {
    name: 'Moth Light',
    start: { x: 90, y: 586 },
    goal: { x: 1150, y: 560 },
    ink: { budget: 520, par: 330, types: ['moon'] },
    terrain: [
      ground([[0, 588], [120, 586], [230, 594], [330, 590], [410, 598]]),
      ground([[640, 600], [720, 590], [860, 574], [1000, 562], [1280, 560]]),
      poly([[1280, 90], [980, 104], [760, 150], [640, 196], [612, 214], [650, 206], [790, 176], [1000, 140], [1280, 130]], { style: 'wood', bare: true }),
    ],
    sparks: [
      { x: 250, y: 560 },
      { x: 525, y: 548 },
      { x: 900, y: 538 },
    ],
    entities: [{ kind: 'moth', x: 560, y: 380 }],
    notes: [note(760, 300, 'moths love light', { rot: -3, arrow: [700, 320, 590, 370] })],
    solution: [ink('moon', [[400, 602], [650, 602]]), ink('moon', [[520, 330], [620, 320]])],
  },
];
void brambles;
void ledge;
void thorns;

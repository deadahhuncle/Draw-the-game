// World 2 — Mushroom Hollow. Violet twilight, giant glowing caps. Spring ink, mushroom caps, wet paper.
//
// The journey: 2-1 springs hop, 2-2 tilted springs fling, 2-3 mushroom caps keep a rhythm, 2-4 wet paper
// forces the launch onto the bank, 2-5 (moon only) a roof banks a mushroom's bounce, 2-6 a hurried sprint,
// 2-7 the "wrong" leaning spring throws Wick home, 2-8 everything at once.
//
// Design notes (measured): a flat spring gives vy = -820 and keeps Wick's horizontal speed, so a hop from
// walking is ~221 u high and ~129 u long. Every degree of tilt adds ~14 u/s sideways, so player springs
// always launch into wide landing zones. Level mushrooms are deterministic machinery: Wick reaches them by
// walking off an edge, never straight from a player spring. Cap shoulders fling sideways — keep landings
// on the flat tops and guard shoulders with thorns where a stray drift could otherwise cheat a level.
import { brambles, ground, ink, mushroom, note, poly, pts, thorns, type LevelSpec, type Pt } from './builders';
import type { TerrainDef } from '../core/types';

/** A thorny vine hanging from `top` (a bough, or above the page), tapering to a tip at (x + sway, tipY). */
function vine(x: number, tipY: number, w = 26, sway = 0, top = 84): TerrainDef {
  const len = tipY - top;
  const at = (f: number, side: number): Pt => {
    const half = (w / 2) * (1 - f) ** 0.8;
    return [Math.round(x + sway * f * f + side * half), Math.round(top + len * f)];
  };
  const fs = [0, 0.3, 0.55, 0.78, 0.92];
  return thorns([...fs.map((f) => at(f, 1)), [x + sway, tipY], ...fs.slice().reverse().map((f) => at(f, -1))]);
}

/** A gnarled thorny bough from (x1, y1) (off the page edge) to (x2, y2), sagging gently. Keep it below the HUD strip. */
function bough(x1: number, y1: number, x2: number, y2: number, thick = 20): TerrainDef {
  const n = 9;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = x1 + (x2 - x1) * f;
    const y = y1 + (y2 - y1) * f + Math.sin(f * Math.PI) * 10 + (i % 2 ? 3 : -2);
    const t = thick * (1 - 0.55 * f);
    top.push([Math.round(x), Math.round(y - t / 2)]);
    bot.push([Math.round(x), Math.round(y + t / 2 + (i % 3 === 1 ? 4 : 0))]);
  }
  return thorns([...top, ...bot.reverse()]);
}

export const WORLD2: LevelSpec[] = [
  // 2-1 — Spring ink. A sleeping boulder blocks the meadow: one spring at its foot and Wick sails over.
  // The far spark floats in open sky: springs aren't just for obstacles.
  {
    name: 'First Bounce',
    start: { x: 110, y: 588 },
    goal: { x: 1150, y: 570 },
    ink: { budget: 260, par: 130, types: ['spring'] },
    terrain: [
      ground([[0, 584], [70, 582], [140, 588], [220, 592], [300, 594], [440, 590], [800, 590], [900, 590], [980, 586], [1060, 574], [1120, 569], [1280, 566]]),
      // The boulder's shoulder facing Wick is squared off: a hop that only just clears the lip still lands
      // walking forward (a rounded shoulder rolls a falling Wick back the way it came).
      poly([[550, 598], [553, 566], [556, 530], [559, 500], [562, 483], [570, 480], [680, 480], [692, 484], [700, 498], [704, 522], [709, 556], [714, 598]], { style: 'rock' }),
      ...mushroom(1210, 568, 404, 130),
    ],
    sparks: [
      { x: 320, y: 562 },
      { x: 566, y: 372 },
      { x: 900, y: 372 },
    ],
    notes: [note(430, 440, 'springs bounce', { arrow: [450, 462, 520, 568], rot: -4 })],
    ghosts: [{ pts: [{ x: 506, y: 584 }, { x: 552, y: 584 }], ink: 'spring' }],
    solution: [ink('spring', [[506, 583], [558, 583]]), ink('spring', [[828, 583], [888, 583]])],
  },

  // 2-2 — Tilted springs. A misty chasm too wide to hop: Wick drops off the cliff onto a slanted spring
  // and is flung across. The deep spark tempts a lower, stronger catapult.
  {
    name: 'Slingshot',
    start: { x: 110, y: 498 },
    goal: { x: 1160, y: 530 },
    ink: { budget: 220, par: 90, types: ['spring'] },
    terrain: [
      ground([[0, 500], [120, 498], [260, 506], [380, 504], [424, 510], [432, 530], [426, 574], [434, 612], [428, 660], [436, 700], [430, 800]]),
      ground([[808, 800], [814, 690], [806, 640], [814, 600], [820, 560], [834, 546], [900, 542], [1040, 536], [1160, 530], [1280, 526]]),
      ...mushroom(1222, 528, 428, 100),
    ],
    sparks: [
      { x: 300, y: 474 },
      { x: 706, y: 468 },
      { x: 468, y: 600 },
    ],
    notes: [note(560, 380, 'tilt to fling', { arrow: [540, 400, 486, 590], rot: -3 })],
    ghosts: [{ pts: [{ x: 436, y: 600 }, { x: 506, y: 633 }], ink: 'spring' }],
    solution: [ink('spring', [[434, 599], [506, 633]])],
  },

  // 2-3 — Mushroom caps. Two caps carry Wick over the thorns in a steady rhythm; the third is a broken
  // stump. Draw the missing mushroom — at cap height, to catch the spark where its bounce would peak.
  {
    name: 'Missing Cap',
    start: { x: 110, y: 468 },
    goal: { x: 1160, y: 532 },
    ink: { budget: 200, par: 90, types: ['spring'] },
    terrain: [
      ground([[0, 470], [140, 466], [250, 470], [290, 474], [298, 480], [302, 492], [296, 530], [304, 580], [298, 640], [306, 700]]),
      ground([[240, 676], [640, 676]]),
      brambles(300, 630, 676, 44),
      ...mushroom(334, 676, 520, 140),
      ...mushroom(448, 676, 500, 140),
      // the broken stump of the third mushroom
      poly([[546, 690], [548, 620], [552, 600], [558, 610], [563, 594], [569, 606], [574, 598], [578, 626], [580, 690]], { style: 'wood', bare: true }),
      // The far bank's lip is squared off, so a pad drawn a little crooked still lands Wick walking forward.
      ground([[610, 720], [613, 640], [611, 600], [614, 566], [616, 560], [640, 559], [800, 554], [920, 548], [1040, 536], [1160, 532], [1280, 536]]),
      ...mushroom(1196, 536, 372, 150),
    ],
    sparks: [
      { x: 210, y: 440 },
      { x: 392, y: 290 },
      { x: 640, y: 276 },
    ],
    notes: [note(720, 440, 'one is missing', { arrow: [690, 462, 588, 592], rot: 3 })],
    solution: [ink('spring', [[520, 502], [600, 502]])],
  },

  // 2-4 — Wet paper. A waterfall soaks the page: ink won't take anywhere near the chasm, so the launch has
  // to be built on the bank. Hop onto a slanted spring (or build a moon ski-jump) and sail over the falls.
  {
    name: 'Falling Water',
    start: { x: 110, y: 541 },
    goal: { x: 1150, y: 520 },
    ink: { budget: 280, par: 160, types: ['spring', 'moon'] },
    terrain: [
      ground([[0, 548], [120, 540], [220, 538], [330, 542], [420, 546], [456, 552], [468, 574], [462, 640], [472, 800]]),
      ground([[800, 800], [808, 640], [814, 566], [826, 540], [880, 530], [1000, 524], [1140, 520], [1280, 512]]),
      ...mushroom(1212, 518, 356, 120),
    ],
    noInk: [pts([[586, 84], [676, 84], [728, 150], [778, 280], [812, 470], [824, 600], [830, 720], [410, 720], [418, 560], [440, 380], [484, 230], [540, 130]])],
    sparks: [
      { x: 172, y: 512 },
      { x: 268, y: 310 },
      { x: 604, y: 376 },
    ],
    notes: [note(330, 200, "ink won't take", { arrow: [400, 222, 470, 300], rot: -3 })],
    solution: [ink('spring', [[218, 531], [270, 531]]), ink('spring', [[296, 498], [378, 535]])],
  },

  // 2-5 — Moon only. A giant cap under hanging thorns would bounce Wick straight into them. No springs
  // here: the mushroom is the spring. Angle a moon roof over it and bank the bounce across the brambles.
  // (A flat roof only drums Wick sideways into the thorns creeping over the cap's edge.)
  {
    name: 'Ricochet',
    start: { x: 110, y: 518 },
    goal: { x: 1160, y: 596 },
    ink: { budget: 180, par: 80, types: ['moon'] },
    terrain: [
      ground([[0, 520], [140, 516], [230, 520], [258, 526], [266, 540], [262, 580], [270, 630], [264, 700]]),
      ground([[240, 694], [650, 694]]),
      brambles(262, 640, 694, 42),
      ...mushroom(330, 694, 584, 150, 1100),
      // A bramble tendril curls up out of the bed and over the cap's far shoulder (a shoulder landing would fling Wick).
      thorns([[440, 694], [436, 650], [430, 612], [421, 582], [409, 561], [393, 549], [379, 548], [368, 556], [381, 563], [396, 568], [407, 582], [413, 612], [415, 650], [412, 694]]),
      bough(-40, 93, 640, 91, 20),
      vine(214, 170, 20, -6, 94),
      vine(270, 214, 24, 8, 96),
      vine(336, 250, 30, -4, 99),
      vine(398, 222, 26, 10, 100),
      vine(462, 180, 22, -6, 99),
      vine(530, 140, 18, 6, 97),
      vine(596, 122, 14, -4, 95),
      ground([[624, 720], [630, 660], [626, 630], [638, 616], [654, 610], [800, 608], [900, 606], [1040, 600], [1160, 596], [1280, 590]]),
      ...mushroom(1210, 592, 436, 130),
    ],
    sparks: [
      { x: 190, y: 490 },
      { x: 300, y: 470 },
      { x: 478, y: 366 },
    ],
    solution: [ink('moon', [[287, 429], [337, 379]])],
  },

  // 2-6 — Hurry. Wick sets off on its own: hop the boulder, and while it's still in the air, set a
  // slingshot in the chasm below the boulder's far edge. Deep springs grab the pit spark.
  {
    name: 'Headlong',
    start: { x: 90, y: 538 },
    goal: { x: 1170, y: 560 },
    autoStart: 1.5,
    ink: { budget: 240, par: 150, types: ['spring'] },
    terrain: [
      ground([[0, 540], [150, 536], [260, 540], [288, 546], [292, 522], [295, 494], [298, 481], [304, 480], [440, 480], [448, 486], [454, 510], [450, 560], [458, 610], [450, 680], [456, 800]]),
      ground([[716, 800], [722, 700], [716, 650], [722, 610], [728, 590], [742, 574], [860, 568], [1000, 566], [1150, 560], [1280, 556]]),
      ...mushroom(1206, 558, 400, 140),
    ],
    sparks: [
      { x: 284, y: 312 },
      { x: 468, y: 568 },
      { x: 742, y: 452 },
    ],
    solution: [ink('spring', [[240, 532], [298, 532]], 0.5), ink('spring', [[440, 579], [508, 613]], 2.2)],
  },

  // 2-7 — Twist. Wick sets off the wrong way, toward the thorns; home is back across the chasm. A spring
  // that leans back (the classic mistake from 2-2) throws Wick over its own head. (A moon wall plus a
  // mirrored slingshot also works, for more ink.) The far spark dares you to plant it by the thorns.
  {
    name: 'Homeward',
    start: { x: 560, y: 498, facing: 1 },
    goal: { x: 110, y: 588 },
    ink: { budget: 200, par: 75, types: ['spring', 'moon'] },
    terrain: [
      ground([[0, 590], [120, 588], [240, 592], [284, 598], [296, 610], [300, 640], [292, 680], [298, 720]]),
      ground([[462, 720], [470, 640], [462, 590], [468, 560], [476, 514], [492, 502], [640, 498], [800, 500], [900, 504], [912, 520], [908, 580], [916, 640], [906, 720]]),
      ground([[880, 640], [1280, 640]]),
      brambles(910, 1280, 640, 50),
      ...mushroom(46, 590, 440, 84),
    ],
    sparks: [
      { x: 690, y: 470 },
      { x: 420, y: 420 },
      { x: 800, y: 470 },
    ],
    solution: [ink('spring', [[806, 503], [842, 450]])],
  },

  // 2-8 — Showpiece. A rising three-note scale of caps, a missing fourth (draw it), a rock rest, then the
  // giant under the thorns: bank it with a moon roof, sail over the falls, and set a backstop behind the lamp.
  // A gentler roof can drop Wick straight onto the lamp — but only the high, steep shot reaches the last spark.
  {
    name: 'Spore Symphony',
    start: { x: 70, y: 468 },
    goal: { x: 928, y: 560 },
    ink: { budget: 460, par: 350, types: ['spring', 'moon'] },
    terrain: [
      ground([[0, 470], [90, 466], [150, 470], [174, 476], [180, 488], [176, 540], [184, 600], [178, 660], [184, 720]]),
      ground([[160, 700], [1280, 700]]),
      brambles(180, 1280, 700, 44),
      ...mushroom(212, 700, 540, 96),
      ...mushroom(310, 700, 510, 96),
      ...mushroom(412, 700, 480, 96),
      poly([[560, 534], [562, 520], [564, 514], [676, 514], [690, 518], [698, 530], [690, 560], [666, 582], [642, 700], [604, 700], [590, 580], [570, 556]], { style: 'rock' }),
      ...mushroom(742, 700, 600, 160, 1000),
      thorns([[784, 600], [790, 572], [798, 546], [806, 522], [812, 504], [820, 512], [828, 534], [836, 562], [840, 600], [828, 628], [806, 630]]),
      bough(1320, 222, 620, 90, 28),
      vine(676, 470, 34, 20, 100), // the curtain's tip curls away from the rock rest, so a brisk landing isn't snagged
      vine(730, 236, 28, 6, 112),
      vine(772, 262, 30, -6, 121),
      vine(822, 206, 26, 8, 132),
      vine(872, 196, 20, -6, 142),
      vine(930, 186, 16, 4, 154),
      poly([[900, 574], [906, 564], [918, 560], [1000, 560], [1012, 566], [1016, 582], [1000, 604], [960, 616], [924, 608], [908, 594]], { style: 'rock' }),
      ...mushroom(1180, 700, 330, 180),
    ],
    noInk: [pts([[858, 104], [884, 104], [894, 200], [896, 540], [900, 720], [842, 720], [846, 200]])],
    sparks: [
      { x: 264, y: 306 },
      { x: 571, y: 240 },
      { x: 858, y: 356 },
    ],
    solution: [
      ink('spring', [[480, 472], [556, 472]]),
      ink('moon', [[698, 435], [778, 345]]),
      ink('moon', [[1004, 558], [1006, 450]]),
    ],
  },
];

// World 3 — Starwater. Deep blue night, a giant moon over a wide river. Comet ink (direction matters),
// long launches, drifting boats.
import { block, ground, ink, note, poly, pts, type LevelSpec, type Pt } from './builders';

const rock = { style: 'rock' as const };
const wood = { style: 'wood' as const, bare: true };

/**
 * A little river boat (for a 'mover'): deck from x+16 to x+w-16 at `deck`, with a stern and a bow post rising
 * `rail` above it so Wick paces inside while it drifts. Returns the hull polygon.
 */
function boat(x: number, deck: number, w: number, rail = 26): Pt[] {
  return [
    [x - 6, deck - rail - 4],
    [x + 8, deck - rail],
    [x + 14, deck - 6],
    [x + 20, deck],
    [x + w - 20, deck],
    [x + w - 14, deck - 6],
    [x + w - 8, deck - rail],
    [x + w + 8, deck - rail - 6],
    [x + w - 4, deck + 10],
    [x + w - 30, deck + 22],
    [x + 30, deck + 22],
    [x + 4, deck + 10],
  ];
}

export const WORLD3: LevelSpec[] = [
  // 3-1 — Comet ink. A sheer bluff rises from the riverbank; the lamp waits on top. Comets carry Wick up
  // slopes far too steep to walk. Hug the cliff for the low spark, overshoot the lip for the high one.
  {
    name: 'Upstream',
    start: { x: 110, y: 598 },
    goal: { x: 1060, y: 372 },
    ink: { budget: 420, par: 300, types: ['comet'] },
    terrain: [
      ground([[0, 584], [60, 590], [150, 598], [250, 606], [330, 610], [400, 608], [456, 606], [480, 612], [490, 650]]),
      ground([[468, 720], [474, 630], [486, 560], [482, 500], [490, 450], [498, 418], [510, 400], [540, 390], [610, 384], [690, 390], [770, 398], [850, 392], [930, 380], [1010, 372], [1070, 372], [1110, 378], [1136, 396], [1148, 440], [1140, 500], [1152, 560], [1146, 640], [1152, 720]], rock),
    ],
    sparks: [
      { x: 270, y: 574 },
      { x: 440, y: 500 },
      { x: 546, y: 322 },
    ],
    notes: [note(300, 420, 'comets carry Wick up', { arrow: [360, 440, 420, 500], rot: -4 })],
    ghosts: [{ pts: pts([[414, 608], [500, 398]]), ink: 'comet' }],
    solution: [ink('comet', [[418, 609], [512, 362]])],
  },
  // 3-2 — Direction. The path runs out over the river; the lamp glows in a cove *behind* and below.
  // A comet drawn right-to-left catches the fall and hurls Wick back under the overhang.
  {
    name: 'Eddy',
    start: { x: 110, y: 316 },
    goal: { x: 150, y: 566 },
    ink: { budget: 360, par: 270, types: ['comet'] },
    terrain: [
      poly([[-600, 300], [0, 314], [90, 312], [190, 318], [300, 324], [420, 330], [520, 336], [566, 344], [574, 356], [560, 374], [500, 392], [400, 404], [300, 414], [200, 424], [100, 436], [0, 446], [-600, 446]], rock),
      ground([[0, 560], [100, 566], [200, 572], [300, 578], [380, 584], [420, 590], [436, 620], [430, 720]]),
    ],
    sparks: [
      { x: 330, y: 296 },
      { x: 620, y: 460 },
      { x: 372, y: 486 },
    ],
    notes: [note(820, 380, 'comets flow as drawn', { arrow: [800, 400, 700, 500], rot: -3 })],
    ghosts: [{ pts: pts([[690, 548], [470, 506]]), ink: 'comet' }],
    solution: [ink('comet', [[670, 545], [520, 524], [480, 500], [460, 470]])],
  },
  // 3-3 — Speed. The river is far too wide to bridge from the high bank, but a comet only needs to reach
  // halfway: Wick leaves its tip at full tilt and flies the rest. Then a lift up the rock to the lamp.
  {
    name: 'Halfway',
    start: { x: 90, y: 258 },
    goal: { x: 1130, y: 384 },
    ink: { budget: 420, par: 370, types: ['moon', 'comet'] },
    terrain: [
      ground([[0, 262], [90, 258], [180, 262], [260, 270], [300, 276], [314, 290], [320, 318], [306, 360], [288, 420], [272, 500], [280, 580], [266, 720]]),
      ground([[540, 720], [546, 580], [560, 552], [640, 546], [700, 544], [800, 546], [880, 540], [904, 520], [914, 460], [920, 410], [940, 392], [1040, 386], [1140, 384], [1280, 380]], rock),
    ],
    sparks: [
      { x: 180, y: 232 },
      { x: 500, y: 372 },
      { x: 956, y: 322 },
    ],
    solution: [ink('comet', [[266, 270], [312, 274], [392, 268]]), ink('comet', [[846, 547], [924, 352]])],
  },
  // 3-4 — Movers. A little boat ferries Wick across (it starts docked at the cliff, then fetches Wick). Ink
  // stays put while the boat drifts, so the lift must wait exactly where the boat docks.
  {
    name: 'Ferry',
    start: { x: 90, y: 536 },
    goal: { x: 1150, y: 404 },
    ink: { budget: 360, par: 260, types: ['moon', 'comet'] },
    terrain: [
      ground([[0, 530], [80, 536], [180, 540], [260, 546], [300, 560], [306, 640]]),
      poly([[280, 540], [470, 540], [476, 546], [470, 552], [280, 552]], wood),
      block(452, 552, 10, 120, wood),
      block(360, 552, 10, 120, wood),
      ground([[1000, 720], [1004, 600], [1012, 520], [1008, 470], [1018, 420], [1040, 406], [1120, 402], [1200, 404], [1280, 398]], rock),
    ],
    entities: [{ kind: 'mover', pts: pts(boat(480, 604, 190)), path: pts([[480, 604], [800, 604]]), period: 8, phase: 0.5 }],
    sparks: [
      { x: 330, y: 510 },
      { x: 700, y: 572 },
      { x: 952, y: 505 },
    ],
    notes: [note(660, 440, 'ride the boat', { arrow: [740, 460, 850, 552], rot: -3 })],
    solution: [ink('comet', [[928, 607], [1012, 400]])],
  },
  // 3-5 — Catch up. The last boat pulls away the moment Wick sets off; walking, it never makes it. A comet
  // along the jetty and Wick leaps aboard mid-river. At the far landing, a little ramp over the bow.
  {
    name: 'Last Ferry',
    start: { x: 80, y: 470 },
    goal: { x: 1170, y: 560 },
    ink: { budget: 420, par: 320, types: ['moon', 'comet'] },
    terrain: [
      ground([[0, 464], [80, 470], [160, 478], [220, 490], [250, 510], [256, 560], [250, 720]]),
      poly([[236, 494], [440, 520], [446, 528], [438, 532], [236, 506]], wood),
      block(300, 510, 10, 200, wood),
      block(400, 524, 10, 200, wood),
      ground([[1000, 720], [1004, 620], [1010, 590], [1030, 578], [1100, 570], [1170, 560], [1230, 548], [1280, 530]], rock),
    ],
    entities: [{ kind: 'mover', pts: pts(boat(456, 604, 170)), path: pts([[456, 604], [826, 604]]), period: 15 }],
    sparks: [
      { x: 340, y: 470 },
      { x: 560, y: 520 },
      { x: 1000, y: 540 },
    ],
    solution: [ink('comet', [[320, 500], [442, 514], [486, 516]]), ink('moon', [[930, 606], [1004, 570], [1040, 574]])],
  },
  // 3-6 — Hurry. Wick sets off by itself, heading *left* down a staircase of river rocks. Draw each comet in
  // time — and in Wick's direction: a leap, a lift, a leap.
  {
    name: 'Quickwater',
    start: { x: 1190, y: 420, facing: -1 },
    goal: { x: 90, y: 414 },
    autoStart: 2.5,
    ink: { budget: 540, par: 440, types: ['moon', 'comet'] },
    terrain: [
      ground([[906, 720], [898, 620], [908, 540], [896, 480], [904, 436], [930, 424], [1000, 420], [1100, 416], [1190, 420], [1280, 412]], rock),
      poly([[560, 492], [576, 482], [650, 478], [730, 482], [764, 496], [750, 532], [700, 554], [620, 548], [570, 522]], rock),
      poly([[270, 344], [284, 334], [380, 330], [470, 334], [496, 346], [484, 390], [430, 416], [330, 408], [276, 378]], rock),
      ground([[0, 404], [60, 410], [130, 416], [176, 424], [198, 440], [204, 500], [192, 580], [204, 720]]),
    ],
    sparks: [
      { x: 830, y: 420 },
      { x: 534, y: 358 },
      { x: 226, y: 362 },
    ],
    solution: [
      ink('comet', [[962, 416], [900, 420], [850, 426]], 0.6),
      ink('comet', [[620, 482], [496, 326]], 3),
      ink('comet', [[360, 326], [272, 334]], 4.1),
    ],
  },
  // 3-7 — Comet + spring. The far bank is a cliff, high and far across the river, and the moonbeam on the
  // water won't take ink. Walking into a spring only hops; rush into it on a comet and Wick streaks across
  // like a shooting star. A gentle tilt lands safely; a flatter one also reaches the high spark.
  {
    name: 'Shooting Star',
    start: { x: 80, y: 598 },
    goal: { x: 1140, y: 452 },
    ink: { budget: 280, par: 210, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 588], [80, 598], [180, 604], [280, 606], [350, 608], [372, 618], [366, 720]]),
      ground([[712, 720], [716, 560], [720, 500], [728, 482], [800, 472], [900, 464], [1000, 458], [1140, 452], [1280, 448]], rock),
    ],
    noInk: [pts([[520, 250], [566, 250], [620, 420], [680, 600], [704, 720], [404, 720], [420, 600], [466, 420]])],
    sparks: [
      { x: 240, y: 580 },
      { x: 450, y: 450 },
      { x: 590, y: 350 },
    ],
    solution: [ink('comet', [[220, 598], [340, 598]]), ink('spring', [[336, 596], [396, 600]])],
  },
  // 3-8 — Showpiece: the whole river in one run. A comet lift up the bluff, a shooting star across the
  // moon and over the sea stack, down into the drifting boat, and the last lamp glowing in a grotto only
  // the boat can reach (the moonlit water before it won't take ink).
  {
    name: 'Moonpath',
    start: { x: 50, y: 596 },
    goal: { x: 1210, y: 590 },
    ink: { budget: 600, par: 540, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 588], [50, 596], [100, 600], [136, 604], [150, 612], [156, 640]]),
      ground([[140, 720], [146, 630], [156, 560], [150, 500], [158, 466], [174, 446], [220, 436], [262, 432], [290, 436], [310, 452], [326, 500], [344, 570], [360, 640], [366, 720]], rock),
      // The sea stack.
      ground([[620, 720], [626, 600], [640, 520], [648, 460], [660, 420], [678, 404], [704, 400], [722, 410], [730, 450], [738, 540], [750, 620], [756, 720]], rock),
      // The grotto: a rock floor at the waterline under a great overhanging roof.
      poly([[1130, 720], [1134, 604], [1150, 594], [1200, 590], [1280, 588], [1880, 588], [1880, 1320], [1130, 1320]], rock),
      poly([[1040, 558], [1026, 520], [1024, 460], [1036, 380], [1066, 300], [1110, 256], [1180, 236], [1280, 230], [1880, 230], [1880, 600], [1270, 600], [1262, 546], [1240, 510], [1180, 496], [1120, 500], [1082, 518], [1060, 546]], rock),
    ],
    noInk: [pts([[900, 290], [990, 290], [1024, 420], [1040, 540], [1044, 720], [776, 720], [798, 540], [850, 420]])],
    entities: [{ kind: 'mover', pts: pts(boat(784, 604, 160)), path: pts([[784, 604], [964, 604]]), period: 14, phase: 0.95 }],
    sparks: [
      { x: 118, y: 500 },
      { x: 480, y: 240 },
      { x: 1100, y: 560 },
    ],
    solution: [
      ink('comet', [[76, 604], [158, 432]]),
      ink('comet', [[196, 432], [298, 432]]),
      ink('spring', [[294, 430], [354, 434]]),
      ink('moon', [[1060, 606], [1122, 562], [1160, 590]]),
    ],
  },
];

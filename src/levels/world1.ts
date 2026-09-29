// World 1 — Dusk Meadow. Moon ink, gaps, slopes, walls, brambles.
import { block, brambles, ground, ink, ledge, note, poly, pts, thorns, type LevelSpec } from './builders';

const wood = { style: 'wood' as const, bare: true };

export const WORLD1: LevelSpec[] = [
  // 1-1 — A broken footbridge over a creek. Draw the missing planks.
  {
    name: 'First Light',
    start: { x: 120, y: 541 },
    goal: { x: 1166, y: 540 },
    ink: { budget: 400, par: 200, types: ['moon'] },
    terrain: [
      ground([[0, 486], [36, 500], [70, 526], [110, 540], [220, 548], [340, 564], [450, 574], [544, 574], [538, 640]]),
      ground([[756, 640], [762, 574], [860, 572], [960, 560], [1060, 546], [1160, 540], [1220, 532], [1280, 512]]),
      poly([[512, 574], [586, 574], [594, 579], [585, 585], [512, 585]], wood),
      block(574, 585, 9, 150, wood),
      poly([[722, 579], [730, 574], [800, 574], [800, 585], [730, 585]], wood),
      block(730, 585, 9, 150, wood),
    ],
    sparks: [
      { x: 300, y: 528 },
      { x: 658, y: 520 },
      { x: 1000, y: 520 },
    ],
    notes: [note(658, 420, 'draw a bridge', { arrow: [658, 440, 658, 500], rot: -3 })],
    ghosts: [{ pts: pts([[574, 578], [616, 565], [658, 559], [700, 565], [742, 578]]) }],
    solution: [ink('moon', [[574, 578], [616, 565], [658, 559], [700, 565], [742, 578]])],
  },
  // 1-2 — A bluff with the lamp on top, against the sun. Ramps climb; the gentle one earns the sparks.
  {
    name: 'Up and Over',
    start: { x: 100, y: 605 },
    goal: { x: 1160, y: 454 },
    ink: { budget: 460, par: 290, types: ['moon'] },
    terrain: [
      ground([[0, 600], [130, 606], [270, 612], [400, 610], [520, 604], [660, 600]]),
      // The bluff's grassy shoulder is bevelled (≤ 55°) so a ramp that only roughly meets the top still
      // carries Wick over; a sharp lip turns Wick back when a ramp passes a few units under it.
      ground([[604, 720], [610, 640], [616, 592], [611, 562], [616, 540], [630, 520], [644, 502], [658, 488], [674, 478], [694, 473], [730, 470], [800, 462], [870, 454], [940, 458], [1020, 464], [1100, 456], [1200, 452], [1280, 448]]),
    ],
    sparks: [
      { x: 290, y: 584 },
      { x: 545, y: 525 },
      { x: 672, y: 404 },
    ],
    notes: [note(430, 440, 'a gentle ramp', { arrow: [450, 462, 510, 528], rot: -4 })],
    solution: [ink('moon', [[470, 610], [662, 438]])],
  },
  // 1-3 — Facing the wrong way on a cliff-top meadow. Walls turn Wick around.
  {
    name: 'Turnabout',
    start: { x: 620, y: 545, facing: 1 },
    goal: { x: 150, y: 530 },
    ink: { budget: 280, par: 210, types: ['moon'] },
    terrain: [ground([[0, 470], [40, 492], [80, 516], [120, 526], [210, 536], [310, 550], [430, 556], [540, 550], [660, 542], [780, 536], [880, 538], [952, 546], [960, 590], [954, 680]])],
    sparks: [
      { x: 900, y: 510 },
      { x: 1036, y: 514 },
      { x: 360, y: 520 },
    ],
    notes: [note(700, 420, 'Wick turns at walls', { arrow: [800, 436, 912, 480], rot: -4 })],
    ghosts: [{ pts: pts([[926, 544], [926, 480]]) }],
    solution: [ink('moon', [[944, 550], [1064, 550], [1066, 486]])],
  },
  // 1-4 — A bramble bed in a hollow and a thorn bush crowning the knoll. Brambles bite: go over them.
  {
    name: 'Thornfield',
    start: { x: 100, y: 536 },
    goal: { x: 1168, y: 559 },
    ink: { budget: 800, par: 640, types: ['moon'] },
    terrain: [
      ground([[0, 542], [70, 534], [150, 538], [240, 550], [330, 572], [390, 606], [420, 616], [510, 616], [540, 604], [580, 584], [660, 564], [730, 548], [800, 541], [870, 546], [960, 560], [1060, 566], [1140, 560], [1210, 548], [1280, 526]]),
      thorns([[380, 612], [396, 598], [430, 592], [470, 590], [510, 593], [536, 600], [552, 610], [530, 628], [400, 628]]),
      // The thorn bush crowns the knoll, silhouetted against the low sun.
      brambles(762, 846, 545, 50),
    ],
    sparks: [
      { x: 460, y: 556 },
      { x: 648, y: 534 },
      { x: 804, y: 432 },
    ],
    notes: [note(470, 430, 'brambles bite — go over', { rot: -2 })],
    solution: [ink('moon', [[320, 574], [590, 586]]), ink('moon', [[694, 558], [764, 470], [842, 470], [916, 556]])],
  },
  // 1-5 — Terraces tumbling down to the lamp. Falling is safe; brambles are not.
  {
    name: 'Tumbledown',
    start: { x: 100, y: 208 },
    goal: { x: 1200, y: 628 },
    ink: { budget: 420, par: 320, types: ['moon'] },
    terrain: [
      ground([[0, 214], [100, 208], [210, 214], [300, 226], [352, 234], [346, 300]]),
      ground([[300, 380], [400, 372], [500, 374], [590, 382], [652, 390], [646, 450]]),
      ground([[600, 528], [700, 522], [800, 524], [900, 532], [952, 540], [946, 600]]),
      brambles(664, 792, 523, 30),
      ground([[1040, 644], [1110, 634], [1200, 628], [1244, 618], [1280, 596]]),
    ],
    sparks: [
      { x: 368, y: 292 },
      { x: 812, y: 438 },
      { x: 1074, y: 584 },
    ],
    notes: [note(560, 236, "falls don't hurt", { arrow: [470, 250, 392, 288], rot: -3 })],
    solution: [ink('moon', [[640, 394], [796, 394]]), ink('moon', [[944, 544], [1056, 544]])],
  },
  // 1-6 — A zig-zag of shelves down a gorge. Walls fold the path back on itself; one arch is crossed twice.
  // The lower shelf stops short of the east pillar, so its turn must be drawn; the spark there (kept clear of
  // the sun) rewards a wall right at the shelf's end.
  {
    name: 'Switchback',
    start: { x: 1180, y: 195, facing: -1 },
    goal: { x: 330, y: 618 },
    ink: { budget: 520, par: 420, types: ['moon'] },
    terrain: [
      ground([[0, 150], [50, 162], [88, 226], [110, 330], [100, 440], [122, 560], [114, 700]], { style: 'rock' }),
      poly([[752, 206], [800, 198], [900, 194], [1000, 198], [1100, 194], [1280, 196], [1880, 196], [1880, 1320], [1208, 1320], [1212, 640], [1220, 560], [1204, 470], [1214, 380], [1196, 298], [1150, 264], [1060, 254], [980, 258], [860, 256], [790, 244]], { style: 'rock' }),
      poly([[190, 344], [300, 338], [450, 336], [600, 340], [750, 338], [900, 342], [894, 370], [840, 388], [600, 392], [400, 390], [240, 382], [196, 366]], { style: 'rock' }),
      brambles(424, 536, 337, 30),
      poly([[480, 494], [600, 488], [760, 486], [920, 490], [1060, 488], [1156, 492], [1150, 520], [1030, 538], [760, 540], [560, 534], [488, 516]], { style: 'rock' }),
      ground([[250, 640], [256, 626], [330, 618], [420, 614], [520, 614], [600, 618], [680, 624], [720, 640]]),
    ],
    sparks: [
      { x: 236, y: 312 },
      { x: 480, y: 258 },
      { x: 1122, y: 460 },
    ],
    solution: [
      ink('moon', [[372, 342], [426, 290], [536, 290], [592, 343]]),
      ink('moon', [[216, 340], [214, 286]]),
      ink('moon', [[1136, 490], [1138, 436]]),
    ],
  },
  // 1-7 — Floating stones cross a thorny ravine. Drops are free; only the one climb and the last gap cost ink.
  // The inkwell can't bridge the ravine, and par rewards keeping both strokes short.
  {
    name: 'Stepping Stones',
    start: { x: 110, y: 366 },
    goal: { x: 1170, y: 428 },
    ink: { budget: 260, par: 200, types: ['moon'] },
    terrain: [
      ground([[0, 372], [110, 366], [220, 372], [300, 384], [344, 392], [338, 450]]),
      ledge(330, 462, 140),
      // Stone 2's lip is bevelled so a climbing ramp that meets it a little low still rolls Wick up.
      poly([[530, 437], [537, 428], [548, 423.5], [562, 422], [652, 422], [646, 447], [618, 468], [574, 463], [536, 452]], { style: 'rock' }),
      ledge(640, 522, 124),
      ground([[836, 720], [840, 580], [846, 548], [900, 520], [980, 470], [1060, 440], [1160, 428], [1226, 422], [1280, 402]]),
      thorns([[330, 720], [340, 672], [420, 656], [520, 666], [620, 652], [720, 662], [820, 668], [836, 720]]),
    ],
    sparks: [
      { x: 372, y: 420 },
      { x: 592, y: 392 },
      { x: 680, y: 470 },
    ],
    solution: [ink('moon', [[464, 467], [540, 425]]), ink('moon', [[758, 526], [846, 552]])],
  },
  // 1-8 — The whole meadow at last light: over thorns, across the broken bridge, back along the shelf, down and up to the lamp.
  {
    name: 'Last Light',
    start: { x: 90, y: 232 },
    goal: { x: 140, y: 526 },
    ink: { budget: 800, par: 700, types: ['moon'] },
    terrain: [
      poly([[-600, 236], [0, 236], [120, 230], [240, 236], [360, 244], [480, 240], [600, 246], [648, 252], [640, 280], [560, 300], [400, 306], [260, 304], [150, 314], [86, 340], [60, 400], [48, 470], [44, 540], [-600, 540]]),
      brambles(300, 420, 240, 32),
      poly([[618, 252], [676, 252], [682, 258], [674, 263], [618, 263]], wood),
      ledge(790, 262, 140, 60),
      poly([[746, 267], [754, 262], [800, 262], [800, 273], [754, 273]], wood),
      poly([[560, 432], [640, 428], [740, 426], [900, 430], [1060, 428], [1170, 434], [1164, 460], [1080, 478], [820, 482], [650, 478], [576, 462]], { style: 'rock' }),
      ground([[0, 530], [80, 524], [150, 526], [214, 534], [236, 548], [244, 600], [250, 622], [330, 624], [480, 626], [640, 622], [760, 630]]),
      brambles(254, 344, 623, 28),
    ],
    sparks: [
      { x: 360, y: 164 },
      { x: 1120, y: 402 },
      { x: 860, y: 228 },
    ],
    solution: [
      ink('moon', [[250, 240], [304, 180], [416, 180], [470, 244]]),
      ink('moon', [[660, 256], [770, 266]]),
      ink('moon', [[1146, 430], [1148, 370]]),
      ink('moon', [[396, 628], [232, 530]]),
    ],
  },
];

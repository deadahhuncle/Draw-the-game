// World 5 — Moth Wood. Moths eat light; darkness; lure puzzles.
import { brambles, ground, ink, ledge, note, poly, thorns, type LevelSpec } from './builders';

export const WORLD5: LevelSpec[] = [
  // 5-1 — Moths love light: a decoy keeps the moth busy while Wick crosses.
  {
    name: 'Moth Light',
    start: { x: 96, y: 590 },
    goal: { x: 1090, y: 560 },
    ink: { budget: 520, par: 400, types: ['moon'] },
    terrain: [
      ground([[0, 592], [96, 590], [180, 584], [250, 576], [320, 584], [400, 596], [428, 604], [436, 640], [446, 720]], { bottom: 900 }),
      ground([[660, 720], [670, 640], [684, 602], [780, 590], [900, 576], [1020, 562], [1140, 558], [1280, 556]]),
      poly([[-40, 598], [-36, 548], [-6, 524], [30, 530], [52, 556], [62, 596]], { style: 'rock' }),
      // the old oak on the right, its bough reaching over the ravine, a vine hanging from its tip
      poly([[1330, 0], [1240, 0], [1232, 90], [1210, 150], [1160, 182], [1080, 196], [990, 200], [900, 210], [820, 226], [760, 240], [706, 262], [688, 274], [714, 272], [770, 258], [840, 248], [930, 240], [1020, 238], [1100, 248], [1160, 272], [1190, 318], [1196, 400], [1188, 480], [1198, 540], [1180, 566], [1330, 566]], { style: 'wood', bare: true }),
      poly([[700, 266], [694, 322], [700, 372], [708, 374], [704, 322], [712, 266]], { style: 'earth', bare: true }),
    ],
    sparks: [
      { x: 250, y: 540 },
      { x: 555, y: 528 },
      { x: 900, y: 540 },
    ],
    entities: [
      { kind: 'moth', x: 704, y: 404 },
      { kind: 'glowworm', x: 1186, y: 430 },
      { kind: 'glowworm', x: 448, y: 668 },
      { kind: 'glowworm', x: 14, y: 520 },
    ],
    notes: [note(890, 372, 'hungry for light', { rot: -4, arrow: [820, 382, 730, 402] })],
    solution: [ink('moon', [[416, 604], [555, 566], [690, 604]]), ink('moon', [[760, 400], [840, 390]])],
  },
  // 5-2 — The moth nests at the gully: any bridge drawn early is eaten. Draw it as Wick arrives.
  {
    name: 'Held Breath',
    start: { x: 1186, y: 548, facing: -1 },
    goal: { x: 150, y: 556 },
    ink: { budget: 310, par: 300, types: ['moon'] },
    terrain: [
      ground([[0, 564], [80, 558], [160, 556], [240, 564], [310, 580], [366, 592], [376, 630], [382, 720]], { bottom: 900 }),
      ground([[602, 720], [606, 640], [614, 598], [700, 590], [820, 572], [940, 562], [1060, 556], [1180, 548], [1280, 544]]),
      // the old broken log bridge, slumped into the gully
      poly([[378, 648], [392, 640], [486, 690], [490, 712], [474, 718], [376, 668]], { style: 'wood', bare: true }),
      // a leaning oak on the left, its bough reaching across the top of the page
      poly([[-600, 0], [30, 0], [44, 90], [66, 150], [130, 180], [240, 192], [360, 200], [480, 208], [590, 216], [680, 228], [714, 240], [660, 244], [560, 240], [440, 236], [320, 232], [200, 230], [124, 238], [92, 282], [82, 360], [70, 450], [76, 520], [62, 566], [-600, 566]], { style: 'wood', bare: true }),
      poly([[644, 240], [640, 300], [648, 360], [638, 420], [644, 452], [652, 452], [648, 420], [658, 360], [650, 300], [656, 240]], { style: 'earth', bare: true }),
      poly([[470, 234], [466, 270], [474, 300], [482, 300], [478, 270], [482, 234]], { style: 'earth', bare: true }),
      poly([[1300, 548], [1236, 548], [1228, 524], [1246, 502], [1276, 494], [1300, 496]], { style: 'rock' }),
    ],
    sparks: [
      { x: 990, y: 526 },
      { x: 496, y: 520 },
      { x: 250, y: 528 },
    ],
    entities: [
      { kind: 'moth', x: 630, y: 510, speed: 100 },
      { kind: 'glowworm', x: 648, y: 452, r: 70 },
      { kind: 'glowworm', x: 476, y: 302, r: 60 },
      { kind: 'glowworm', x: 430, y: 684 },
      { kind: 'glowworm', x: 90, y: 400 },
    ],
    notes: [note(860, 440, 'press Go, then draw', { rot: 3 })],
    solution: [ink('moon', [[630, 602], [496, 558], [362, 598]], 3.6)],
  },
  // 5-3 — Darkness: only light shows the way. Glow-worms mark the stepping stones; ink reveals them.
  {
    name: 'Glowworm Hollow',
    dark: true,
    start: { x: 110, y: 560 },
    goal: { x: 1170, y: 438 },
    ink: { budget: 640, par: 610, types: ['moon'] },
    terrain: [
      ground([[0, 556], [110, 560], [200, 556], [262, 562], [292, 574], [300, 620], [296, 720]]),
      ledge(440, 610, 150, 56),
      ledge(720, 500, 130, 50),
      ground([[992, 720], [986, 520], [998, 446], [1080, 440], [1170, 438], [1280, 432]]),
      // the hollow's ceiling: roots and stalactites
      poly([[-600, 0], [1880, 0], [1880, 150], [1280, 150], [1210, 190], [1150, 160], [1060, 176], [1010, 250], [970, 180], [880, 150], [760, 170], [700, 230], [660, 164], [540, 140], [430, 170], [380, 240], [340, 160], [230, 130], [120, 150], [60, 200], [20, 140], [-600, 140]], { style: 'rock', bare: true }),
    ],
    sparks: [
      { x: 515, y: 572 },
      { x: 650, y: 520 },
      { x: 920, y: 440 },
    ],
    entities: [
      { kind: 'glowworm', x: 292, y: 574, r: 80 },
      { kind: 'glowworm', x: 446, y: 612, r: 80 },
      { kind: 'glowworm', x: 846, y: 502, r: 80 },
      { kind: 'glowworm', x: 996, y: 448, r: 90 },
      { kind: 'glowworm', x: 380, y: 236, r: 60 },
      { kind: 'glowworm', x: 1010, y: 246, r: 60 },
      { kind: 'glowworm', x: 62, y: 196, r: 40 },
      { kind: 'glowworm', x: 700, y: 226, r: 45 },
      { kind: 'glowworm', x: 1210, y: 186, r: 40 },
      { kind: 'glowworm', x: 230, y: 134, r: 25 },
      { kind: 'glowworm', x: 540, y: 144, r: 25 },
      { kind: 'glowworm', x: 880, y: 154, r: 25 },
      { kind: 'glowworm', x: 1150, y: 164, r: 25 },
    ],
    notes: [note(150, 470, 'your ink is light', { rot: -3 })],
    solution: [ink('moon', [[286, 578], [446, 610]]), ink('moon', [[584, 612], [716, 498], [744, 496]]), ink('moon', [[842, 502], [990, 444], [1016, 442]])],
  },
  // 5-4 — Two moths dance over the old stump. One snack placed between them lures both away.
  {
    name: 'Twin Wings',
    start: { x: 80, y: 562 },
    goal: { x: 1150, y: 556 },
    ink: { budget: 580, par: 470, types: ['moon', 'spring'] },
    terrain: [
      ground([[0, 566], [80, 562], [170, 560], [228, 566], [240, 600], [236, 720]]),
      // the great stump in the ravine
      ground([[372, 720], [366, 670], [384, 628], [388, 584], [398, 562], [440, 551], [520, 551], [562, 562], [572, 584], [576, 628], [594, 670], [588, 720]], { style: 'wood' }),
      ground([[722, 720], [718, 600], [728, 566], [800, 556], [900, 546], [1000, 552], [1100, 558], [1280, 552]]),
      // an old tree on the right; its crooked bough arches over the ravine
      poly([[1330, 0], [1244, 0], [1230, 110], [1180, 168], [1080, 196], [960, 204], [860, 222], [780, 252], [736, 284], [770, 276], [850, 250], [960, 236], [1070, 232], [1160, 244], [1204, 300], [1196, 420], [1212, 500], [1196, 560], [1330, 560]], { style: 'wood', bare: true }),
      poly([[-600, 566], [-600, 470], [-10, 470], [24, 488], [40, 530], [44, 566]], { style: 'rock' }),
    ],
    sparks: [
      { x: 310, y: 522 },
      { x: 650, y: 522 },
      { x: 900, y: 514 },
    ],
    entities: [
      { kind: 'moth', x: 420, y: 430, speed: 100 },
      { kind: 'moth', x: 540, y: 430, speed: 100 },
      { kind: 'glowworm', x: 480, y: 548, r: 70 },
      { kind: 'glowworm', x: 386, y: 630, r: 40 },
      { kind: 'glowworm', x: 574, y: 626, r: 40 },
      { kind: 'glowworm', x: 740, y: 282, r: 60 },
      { kind: 'glowworm', x: 1200, y: 440, r: 60 },
    ],
    solution: [
      ink('moon', [[228, 568], [310, 548], [394, 570]]),
      ink('moon', [[566, 570], [650, 548], [734, 570]]),
      ink('moon', [[440, 352], [520, 352]]),
    ],
  },
  // 5-5 — Hurry: Wick sets off on its own. Every gap has a hungry moth, so each bridge is drawn just in time.
  {
    name: 'Moth Run',
    autoStart: 3,
    start: { x: 70, y: 520 },
    goal: { x: 1170, y: 540 },
    ink: { budget: 820, par: 740, types: ['moon'] },
    terrain: [
      ground([[0, 522], [70, 520], [180, 518], [236, 524], [250, 560], [244, 720]], { style: 'rock' }),
      ground([[390, 720], [384, 600], [392, 566], [460, 560], [530, 564], [544, 600], [538, 720]], { style: 'rock' }),
      brambles(398, 468, 562, 26),
      ground([[690, 720], [684, 540], [694, 488], [760, 480], [808, 486], [820, 530], [812, 720]], { style: 'rock' }),
      ground([[990, 720], [984, 580], [994, 546], [1080, 540], [1170, 540], [1280, 536]]),
    ],
    sparks: [
      { x: 318, y: 510 },
      { x: 610, y: 490 },
      { x: 905, y: 482 },
    ],
    entities: [
      { kind: 'moth', x: 320, y: 380, speed: 90 },
      { kind: 'moth', x: 612, y: 372, speed: 100 },
      { kind: 'moth', x: 904, y: 380, speed: 100 },
      { kind: 'glowworm', x: 244, y: 540, r: 60 },
      { kind: 'glowworm', x: 540, y: 590, r: 60 },
      { kind: 'glowworm', x: 816, y: 520, r: 60 },
    ],
    solution: [
      ink('moon', [[236, 526], [318, 520], [446, 520], [500, 562]], 0.9),
      ink('moon', [[528, 566], [612, 522], [700, 488]], 3.3),
      ink('moon', [[806, 488], [904, 510], [1000, 548]], 5.6),
    ],
  },
  // 5-6 — A chasm too wide to walk before the moths rise from the mist. Comet ink outruns them, if drawn at the last moment.
  {
    name: 'Outrun',
    start: { x: 1190, y: 540, facing: -1 },
    goal: { x: 110, y: 522 },
    ink: { budget: 780, par: 730, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 516], [110, 522], [240, 528], [330, 538], [342, 600], [334, 720]]),
      ground([[954, 720], [944, 600], [956, 552], [990, 542], [1080, 536], [1190, 540], [1280, 538]]),
      // long vines drop from the canopy, glow-worms at their tips
      poly([[758, -40], [746, 90], [752, 180], [740, 260], [746, 330], [738, 332], [732, 260], [742, 180], [736, 90], [746, -40]], { style: 'earth', bare: true }),
      poly([[510, -40], [520, 80], [510, 170], [522, 250], [516, 326], [508, 326], [512, 250], [500, 170], [510, 80], [498, -40]], { style: 'earth', bare: true }),
      poly([[630, -40], [624, 60], [632, 130], [626, 170], [618, 170], [622, 130], [614, 60], [618, -40]], { style: 'earth', bare: true }),
      poly([[380, -40], [386, 50], [378, 96], [370, 96], [374, 50], [368, -40]], { style: 'earth', bare: true }),
    ],
    sparks: [
      { x: 810, y: 480 },
      { x: 640, y: 446 },
      { x: 450, y: 480 },
    ],
    entities: [
      // a little swarm lives in the mist: whatever is drawn above the chasm, they rise to meet it
      { kind: 'moth', x: 820, y: 600, speed: 90 },
      { kind: 'moth', x: 650, y: 630, speed: 90 },
      { kind: 'moth', x: 470, y: 600, speed: 90 },
      { kind: 'glowworm', x: 742, y: 332, r: 70 },
      { kind: 'glowworm', x: 512, y: 326, r: 70 },
      { kind: 'glowworm', x: 622, y: 170, r: 50 },
      { kind: 'glowworm', x: 950, y: 600, r: 60 },
      { kind: 'glowworm', x: 336, y: 590, r: 60 },
    ],
    solution: [ink('comet', [[962, 552], [810, 504], [640, 478], [470, 504], [322, 536]], 1.4)],
  },
  // 5-7 — Dark stair. Springs must be drawn just in time; a moth also clears the wall that turns Wick back for a spark.
  {
    name: 'Kind Wings',
    dark: true,
    start: { x: 300, y: 620 },
    goal: { x: 1190, y: 362 },
    ink: { budget: 400, par: 350, types: ['moon', 'spring'] },
    terrain: [
      ground([[0, 622], [120, 618], [220, 622], [300, 620], [420, 624], [540, 620], [560, 620], [560, 504], [680, 500], [820, 502], [822, 386], [930, 380], [1000, 384], [1008, 430], [1000, 720]]),
      ground([[1100, 720], [1096, 420], [1106, 366], [1190, 362], [1280, 358]]),
      // the nook behind the start
      poly([[-600, 622], [-600, 380], [20, 380], [40, 420], [44, 520], [36, 622]], { style: 'rock' }),
      // cave ceiling
      poly([[-600, 0], [1880, 0], [1880, 120], [1260, 130], [1180, 170], [1110, 150], [1030, 210], [960, 150], [860, 160], [760, 230], [700, 170], [600, 160], [500, 250], [440, 180], [330, 170], [240, 230], [180, 170], [60, 180], [-600, 180]], { style: 'rock', bare: true }),
    ],
    sparks: [
      { x: 92, y: 592 },
      { x: 520, y: 420 },
      { x: 1050, y: 340 },
    ],
    entities: [
      { kind: 'moth', x: 420, y: 470, speed: 90 },
      { kind: 'moth', x: 860, y: 320, speed: 100 },
      { kind: 'glowworm', x: 440, y: 430, r: 70 },
      { kind: 'glowworm', x: 884, y: 292, r: 60 },
      { kind: 'glowworm', x: 40, y: 430, r: 70 },
      { kind: 'glowworm', x: 560, y: 510, r: 70 },
      { kind: 'glowworm', x: 822, y: 392, r: 70 },
      { kind: 'glowworm', x: 1004, y: 400, r: 60 },
      { kind: 'glowworm', x: 1104, y: 380, r: 60 },
      { kind: 'glowworm', x: 500, y: 246, r: 40 },
      { kind: 'glowworm', x: 760, y: 226, r: 40 },
      { kind: 'glowworm', x: 240, y: 226, r: 40 },
      { kind: 'glowworm', x: 1030, y: 206, r: 40 },
      { kind: 'glowworm', x: 1180, y: 168, r: 25 },
      { kind: 'glowworm', x: 600, y: 164, r: 25 },
      { kind: 'glowworm', x: 330, y: 174, r: 25 },
      { kind: 'glowworm', x: 120, y: 178, r: 25 },
    ],
    solution: [
      ink('moon', [[356, 626], [356, 560]]),
      ink('spring', [[478, 614], [538, 620]], 4.8),
      ink('spring', [[740, 494], [800, 500]], 7.4),
      ink('moon', [[992, 388], [1050, 372], [1112, 368]], 8.6),
    ],
  },
  // 5-8 — Midnight. The hollow oak: feed the moth at the ravine, outrun the one in the hollow on comet ink,
  // and leap the swarm at the last lamp with a spring that only has to live for a heartbeat.
  {
    name: 'Darkest Hour',
    dark: true,
    start: { x: 150, y: 560 },
    goal: { x: 1200, y: 328 },
    ink: { budget: 900, par: 800, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 572], [70, 566], [150, 560], [210, 562], [236, 578], [244, 620], [238, 720]]),
      // the oak: roots, the hollow's floor, the inner wall and the branch Wick leaves by
      ground([[440, 720], [432, 650], [442, 612], [500, 600], [560, 604], [640, 608], [760, 612], [850, 608], [852, 540], [846, 460], [850, 410], [930, 406], [1000, 404], [1062, 410], [1078, 448], [1062, 520], [1080, 596], [1130, 656], [1200, 696], [1280, 712]], { style: 'wood' }),
      // the trunk's left side — Wick walks in beneath its arch
      poly([[470, 190], [560, 226], [616, 250], [620, 330], [612, 440], [622, 520], [604, 548], [560, 530], [510, 520], [468, 522], [446, 530], [434, 500], [446, 420], [440, 320], [452, 240]], { style: 'wood', bare: true }),
      // the crown
      poly([[470, 120], [540, 88], [640, 82], [740, 92], [840, 86], [930, 102], [990, 130], [1010, 170], [980, 210], [930, 246], [860, 272], [780, 282], [700, 272], [630, 250], [560, 236], [500, 210], [460, 170]], { style: 'wood', bare: true }),
      // a bough reaching over the ravine
      poly([[476, 150], [400, 166], [320, 190], [252, 206], [238, 214], [310, 212], [392, 196], [470, 186]], { style: 'wood', bare: true }),
      // thorn curtains hanging in the hollow, where the second moth nests
      thorns([[664, 262], [676, 300], [668, 340], [680, 372], [690, 340], [684, 300], [694, 262]]),
      thorns([[744, 272], [752, 320], [744, 352], [756, 380], [764, 348], [760, 316], [772, 272]]),
      // the lamp's branch
      poly([[1116, 336], [1200, 328], [1280, 324], [1880, 324], [1880, 372], [1260, 372], [1180, 368], [1124, 362]], { style: 'wood', bare: true }),
      poly([[1236, 328], [1242, 292], [1262, 262], [1256, 298], [1252, 326]], { style: 'wood', bare: true }),
    ],
    sparks: [
      { x: 330, y: 520 },
      { x: 760, y: 482 },
      { x: 1085, y: 190 },
    ],
    entities: [
      { kind: 'moth', x: 400, y: 520, speed: 90 },
      { kind: 'moth', x: 700, y: 360, speed: 100 },
      { kind: 'moth', x: 1096, y: 320, speed: 90 },
      { kind: 'moth', x: 1150, y: 284, speed: 90 },
      { kind: 'moth', x: 1214, y: 266, speed: 90 },
      { kind: 'glowworm', x: 238, y: 582, r: 70 },
      { kind: 'glowworm', x: 444, y: 614, r: 70 },
      { kind: 'glowworm', x: 604, y: 548, r: 60 },
      { kind: 'glowworm', x: 440, y: 330, r: 45 },
      { kind: 'glowworm', x: 560, y: 236, r: 45 },
      { kind: 'glowworm', x: 700, y: 98, r: 40 },
      { kind: 'glowworm', x: 860, y: 272, r: 45 },
      { kind: 'glowworm', x: 950, y: 110, r: 40 },
      { kind: 'glowworm', x: 1004, y: 190, r: 45 },
      { kind: 'glowworm', x: 852, y: 480, r: 50 },
      { kind: 'glowworm', x: 1064, y: 414, r: 70 },
      { kind: 'glowworm', x: 1120, y: 342, r: 60 },
      { kind: 'glowworm', x: 250, y: 212, r: 45 },
      { kind: 'glowworm', x: 380, y: 190, r: 40 },
      { kind: 'glowworm', x: 1150, y: 640, r: 50 },
      { kind: 'glowworm', x: 760, y: 614, r: 50 },
    ],
    solution: [
      ink('moon', [[226, 572], [330, 550], [452, 612]]),
      ink('moon', [[396, 474], [320, 400]]),
      ink('comet', [[660, 614], [760, 500], [842, 410], [890, 404]], 3.8),
      ink('spring', [[1012, 404], [1060, 410]], 5.4),
    ],
  },
];

// World 4 — Stormglass. Slate storm, crystal peaks. Rain clouds (draw shelters), wind gusts, inkpots.
import { ground, ink, note, poly, pts, type LevelSpec, type Pt } from './builders';
import type { TerrainDef } from '../core/types';

type TerrainOpts = Omit<TerrainDef, 'pts'>;

/**
 * A great elliptical arch centred on (cx, cy) with its keystone missing: two halves whose outer edge follows
 * the ellipse `outer` (rx, ry) and inner edge `inner`, split at the crown by a gap `gap` (half-width) wide.
 */
function arch(cx: number, cy: number, outer: Pt, inner: Pt, gap: number, opts: TerrainOpts = {}, n = 18): TerrainDef[] {
  const t1 = Math.PI - Math.acos(gap / outer[0]);
  const half = (side: 1 | -1): TerrainDef => {
    const o: Pt[] = [];
    const i: Pt[] = [];
    for (let k = 0; k <= n; k++) {
      const t = Math.PI - (Math.PI - t1) * (k / n);
      o.push([cx + side * Math.cos(t) * outer[0], cy - Math.sin(t) * outer[1]]);
      i.push([cx + side * Math.cos(t) * inner[0], cy - Math.sin(t) * inner[1]]);
    }
    return poly([...o, ...i.reverse()], opts);
  };
  return [half(1), half(-1)];
}

export const WORLD4: LevelSpec[] = [
  // 4-1 — Rain. A crystal arch with its keystone missing: draw the missing piece of roof.
  {
    name: 'Broken Arch',
    start: { x: 140, y: 598 },
    goal: { x: 1116, y: 598 },
    ink: { budget: 440, par: 300, types: ['moon'] },
    terrain: [
      ...arch(640, 640, [622, 452], [540, 376], 130, { style: 'crystal' }),
      ground(
        [
          [0, 598],
          [160, 600],
          [300, 604],
          [440, 606],
          [540, 590],
          [610, 550],
          [660, 546],
          [730, 588],
          [820, 606],
          [980, 604],
          [1120, 598],
          [1280, 596],
        ],
        { style: 'rock' },
      ),
    ],
    entities: [{ kind: 'rain', x1: 470, x2: 810, y: 140, rate: 40 }],
    sparks: [
      { x: 300, y: 562 },
      { x: 630, y: 506 },
      { x: 960, y: 566 },
    ],
    notes: [note(470, 390, 'keep Wick dry', { rot: -4, arrow: [540, 368, 600, 300] })],
    ghosts: [{ pts: [{ x: 512, y: 264 }, { x: 640, y: 256 }, { x: 768, y: 264 }] }],
    solution: [ink('moon', [[510, 264], [640, 256], [770, 264]])],
  },
  // 4-2 — Wind. A gale high above bends the rain: under the cloud it's dry; downwind it pours.
  {
    name: 'Sidelong',
    start: { x: 110, y: 547 },
    goal: { x: 1160, y: 522 },
    ink: { budget: 420, par: 340, types: ['moon'] },
    terrain: [
      // A leaning crystal sail over the start: a fine shelter from rain that falls straight.
      poly(
        [
          [-60, 560],
          [-40, 470],
          [0, 420],
          [60, 372],
          [130, 338],
          [200, 324],
          [268, 332],
          [224, 346],
          [152, 370],
          [92, 410],
          [58, 470],
          [46, 560],
        ],
        { style: 'crystal' },
      ),
      // Crystal spires framing the lamp.
      poly(
        [
          [1204, 540],
          [1216, 452],
          [1230, 404],
          [1242, 440],
          [1256, 360],
          [1266, 420],
          [1276, 540],
        ],
        { style: 'crystal' },
      ),
      ground(
        [
          [0, 546],
          [140, 548],
          [260, 556],
          [340, 578],
          [420, 600],
          [560, 608],
          [700, 604],
          [800, 590],
          [880, 566],
          [960, 540],
          [1060, 524],
          [1160, 522],
          [1280, 526],
        ],
        { style: 'crystal' },
      ),
    ],
    entities: [
      { kind: 'wind', x: 100, y: 130, w: 900, h: 300, fx: 2000, fy: 0 },
      { kind: 'rain', x1: 200, x2: 440, y: 150, rate: 34 },
    ],
    sparks: [
      { x: 260, y: 520 },
      { x: 560, y: 572 },
      { x: 960, y: 504 },
    ],
    notes: [note(660, 470, 'the wind bends rain', { rot: -3 })],
    solution: [ink('moon', [[396, 540], [704, 538]])],
  },
  // 4-3 — Updraft. Rising air over a chasm lifts Wick — straight into the rain. One tilted roof shelters the
  // column *and* steers the rising Wick along its underside, up onto the mesa.
  {
    name: 'Chimney',
    start: { x: 110, y: 560 },
    goal: { x: 1150, y: 318 },
    ink: { budget: 360, par: 260, types: ['moon'] },
    terrain: [
      ground(
        [
          [0, 556],
          [120, 560],
          [240, 566],
          [330, 574],
          [372, 590],
          [384, 640],
          [392, 800],
        ],
        { style: 'rock' },
      ),
      // The mesa: a floating shelf of stormglass, crowned with spires behind the lamp.
      poly(
        [
          [640, 380],
          [650, 350],
          [668, 336],
          [720, 330],
          [840, 326],
          [960, 334],
          [1060, 322],
          [1160, 318],
          [1280, 320],
          [1880, 320],
          [1880, 470],
          [1240, 484],
          [1150, 520],
          [1060, 500],
          [980, 548],
          [890, 516],
          [800, 530],
          [730, 480],
          [680, 450],
        ],
        { style: 'crystal' },
      ),
      poly(
        [
          [1198, 322],
          [1210, 264],
          [1222, 238],
          [1232, 272],
          [1246, 196],
          [1258, 248],
          [1272, 322],
        ],
        { style: 'crystal' },
      ),
    ],
    entities: [
      { kind: 'wind', x: 350, y: 230, w: 260, h: 600, fx: 0, fy: -2000 },
      { kind: 'rain', x1: 400, x2: 610, y: 130, rate: 30 },
    ],
    sparks: [
      { x: 460, y: 452 },
      { x: 540, y: 262 },
      { x: 900, y: 296 },
    ],
    notes: [note(250, 470, 'rising air', { rot: -4, arrow: [320, 470, 400, 430] })],
    solution: [ink('moon', [[430, 300], [640, 220]])],
  },
  // 4-4 — Inkpots. A crystal wave shelters the lamp, but the squall falls short of it. The well holds just
  // enough for a careful hand; the glowing pot tops it up mid-run for everyone else — with time to draw.
  {
    name: 'Inkwell',
    start: { x: 70, y: 470 },
    goal: { x: 1110, y: 500 },
    ink: { budget: 440, par: 440, types: ['moon'] },
    terrain: [
      ground(
        [
          [0, 470],
          [80, 470],
          [150, 476],
          [196, 486],
          [206, 540],
          [212, 800],
        ],
        { style: 'rock' },
      ),
      ground(
        [
          [306, 800],
          [312, 540],
          [322, 500],
          [380, 494],
          [460, 498],
          [560, 506],
          [680, 512],
          [800, 514],
          [920, 510],
          [1040, 502],
          [1160, 500],
          [1280, 500],
        ],
        { style: 'crystal' },
      ),
      // The crystal wave, curling over the lamp.
      poly(
        [
          [1170, 520],
          [1196, 440],
          [1182, 424],
          [1110, 432],
          [1030, 438],
          [950, 440],
          [888, 444],
          [862, 432],
          [856, 404],
          [882, 378],
          [950, 346],
          [1030, 306],
          [1110, 262],
          [1190, 222],
          [1250, 200],
          [1280, 194],
          [1880, 180],
          [1880, 800],
          [1170, 800],
        ],
        { style: 'crystal' },
      ),
    ],
    entities: [
      { kind: 'inkpot', x: 364, y: 474, amount: 300 },
      { kind: 'rain', x1: 650, x2: 1070, y: 130, rate: 42 },
    ],
    sparks: [
      { x: 258, y: 426 },
      { x: 760, y: 478 },
      { x: 990, y: 476 },
    ],
    notes: [note(400, 400, 'ink for the road', { rot: -4, arrow: [390, 418, 370, 452] })],
    solution: [ink('moon', [[184, 490], [258, 464], [332, 502]]), ink('moon', [[628, 452], [878, 440]])],
  },
  // 4-5 — Hurry. A squall line: Wick sets off on its own; umbrellas and a bridge, drawn on the run.
  {
    name: 'Squall',
    start: { x: 90, y: 540 },
    goal: { x: 1190, y: 468 },
    autoStart: 3,
    ink: { budget: 600, par: 600, types: ['moon'] },
    terrain: [
      ground(
        [
          [0, 540],
          [120, 542],
          [240, 550],
          [360, 548],
          [440, 552],
          [470, 566],
          [478, 800],
        ],
        { style: 'rock' },
      ),
      ground(
        [
          [566, 800],
          [572, 566],
          [600, 552],
          [700, 550],
          [800, 546],
          [900, 530],
          [1000, 500],
          [1100, 476],
          [1180, 470],
          [1280, 468],
        ],
        { style: 'crystal' },
      ),
    ],
    entities: [
      { kind: 'rain', x1: 220, x2: 390, y: 150, rate: 28 },
      { kind: 'inkpot', x: 430, y: 532, amount: 200 },
      { kind: 'wind', x: 600, y: 170, w: 420, h: 260, fx: 1600, fy: 0 },
      { kind: 'rain', x1: 660, x2: 820, y: 140, rate: 28 },
    ],
    sparks: [
      { x: 310, y: 516 },
      { x: 520, y: 520 },
      { x: 960, y: 486 },
    ],
    notes: [],
    solution: [
      ink('moon', [[200, 494], [410, 494]]),
      ink('moon', [[460, 562], [582, 562]], 2.4),
      ink('moon', [[732, 496], [962, 452]], 4.2),
    ],
  },
  // 4-6 — Spring + wind. A storm has pooled in the canyon. High above runs a jet of wind — bounce high enough
  // to catch it and it carries Wick clean over the storm.
  {
    name: 'Kite',
    start: { x: 90, y: 520 },
    goal: { x: 1180, y: 496 },
    ink: { budget: 220, par: 150, types: ['spring', 'moon'] },
    terrain: [
      ground(
        [
          [0, 518],
          [120, 520],
          [170, 522],
          [200, 500],
          [226, 462],
          [250, 452],
          [330, 450],
          [352, 470],
          [364, 520],
          [380, 590],
          [420, 640],
          [560, 656],
          [720, 660],
          [820, 648],
          [880, 630],
          [906, 600],
          [916, 520],
          [950, 502],
          [1080, 498],
          [1180, 496],
          [1280, 494],
        ],
        { style: 'crystal' },
      ),
    ],
    entities: [
      { kind: 'wind', x: 200, y: 180, w: 900, h: 130, fx: 1700, fy: 0 },
      { kind: 'rain', x1: 400, x2: 890, y: 450, rate: 64 },
    ],
    sparks: [
      { x: 326, y: 236 },
      { x: 500, y: 170 },
      { x: 1040, y: 468 },
    ],
    notes: [],
    solution: [ink('moon', [[250, 454], [320, 410]]), ink('spring', [[320, 410], [372, 410]])],
  },
  // 4-7 — Wet paper. The downpours have soaked the page beneath the clouds: ink won't take in the rain.
  // The only dry paper is right under each cloud — cap them. Then ride a comet up the spire.
  {
    name: 'Cloudcap',
    start: { x: 90, y: 540 },
    goal: { x: 1120, y: 398 },
    ink: { budget: 780, par: 700, types: ['moon', 'comet'] },
    terrain: [
      ground(
        [
          [0, 540],
          [120, 544],
          [240, 556],
          [340, 562],
          [440, 556],
          [500, 538],
          [546, 530],
          [596, 540],
          [660, 560],
          [760, 572],
          [860, 566],
          [940, 560],
          [1000, 556],
          [1060, 402],
          [1120, 398],
          [1180, 400],
          [1204, 440],
          [1230, 560],
          [1280, 560],
        ],
        { style: 'crystal' },
      ),
    ],
    noInk: [
      pts([
        [228, 214],
        [340, 218],
        [454, 214],
        [460, 320],
        [454, 440],
        [462, 620],
        [220, 620],
        [226, 440],
        [218, 320],
      ]),
      pts([
        [586, 214],
        [796, 214],
        [808, 280],
        [836, 360],
        [872, 440],
        [906, 520],
        [912, 620],
        [656, 620],
        [660, 520],
        [632, 440],
        [604, 360],
        [590, 280],
      ]),
    ],
    entities: [
      { kind: 'rain', x1: 240, x2: 440, y: 150, rate: 34 },
      { kind: 'wind', x: 560, y: 200, w: 440, h: 230, fx: 1400, fy: 0 },
      { kind: 'rain', x1: 600, x2: 780, y: 150, rate: 34 },
    ],
    sparks: [
      { x: 340, y: 524 },
      { x: 820, y: 530 },
      { x: 1078, y: 328 },
    ],
    notes: [],
    solution: [
      ink('moon', [[226, 180], [454, 180]]),
      ink('moon', [[586, 180], [794, 180]]),
      ink('comet', [[976, 562], [1054, 414], [1074, 372]]),
    ],
  },
  // 4-8 — Showpiece. Up through the storm: a sideways squall in the valley, a soaked chimney whose rising air
  // will carry Wick up to any roof you can give it (and the only dry paper is right under the thundercloud),
  // then one comet leap across the gulf to the lamp in the eye of the storm.
  {
    name: 'Eye of the Storm',
    start: { x: 80, y: 602 },
    goal: { x: 1180, y: 430 },
    ink: { budget: 700, par: 680, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground(
        [
          [0, 600],
          [100, 604],
          [200, 612],
          [300, 616],
          [380, 610],
          [428, 600],
          [444, 620],
          [452, 800],
        ],
        { style: 'rock' },
      ),
      // The stormglass tower.
      ground(
        [
          [636, 800],
          [642, 640],
          [650, 520],
          [660, 400],
          [670, 320],
          [690, 270],
          [740, 256],
          [800, 254],
          [860, 258],
          [904, 262],
          [908, 282],
          [918, 360],
          [930, 480],
          [944, 620],
          [952, 800],
        ],
        { style: 'crystal' },
      ),
      // The lamp's floating island, crowned with crystal.
      poly(
        [
          [1030, 472],
          [1044, 446],
          [1090, 436],
          [1180, 430],
          [1280, 428],
          [1880, 428],
          [1880, 560],
          [1260, 574],
          [1200, 612],
          [1140, 592],
          [1090, 562],
          [1050, 522],
        ],
        { style: 'crystal' },
      ),
      poly(
        [
          [1204, 432],
          [1214, 374],
          [1226, 344],
          [1236, 384],
          [1250, 300],
          [1262, 364],
          [1274, 432],
        ],
        { style: 'crystal' },
      ),
    ],
    noInk: [
      pts([
        [428, 204],
        [560, 208],
        [694, 204],
        [700, 300],
        [694, 420],
        [702, 560],
        [696, 720],
        [424, 720],
        [418, 560],
        [426, 420],
        [420, 300],
      ]),
    ],
    entities: [
      { kind: 'wind', x: 100, y: 290, w: 330, h: 250, fx: 1500, fy: 0 },
      { kind: 'rain', x1: 136, x2: 312, y: 260, rate: 34 },
      { kind: 'wind', x: 440, y: 100, w: 260, h: 700, fx: 0, fy: -2000 },
      { kind: 'rain', x1: 440, x2: 680, y: 130, rate: 40 },
      { kind: 'inkpot', x: 760, y: 236, amount: 250 },
    ],
    sparks: [
      { x: 360, y: 580 },
      { x: 520, y: 380 },
      { x: 962, y: 194 },
    ],
    notes: [],
    solution: [
      ink('moon', [[206, 560], [440, 560]]),
      ink('moon', [[428, 180], [700, 162]]),
      ink('comet', [[816, 260], [896, 258], [936, 226]]),
    ],
  },
];

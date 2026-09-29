// World 6 — Daybreak Spires. Folded-paper towers above a sea of cloud; the sky blushes rose, then gold.
//
// The journey: 6-1 a paper gate and the wisp that opens it (behind you), 6-2 crumbling paper (the bridge falls
// away behind Wick), 6-3 a wisp lit in flight, 6-4 the fall that becomes the way home, 6-5 a paper floor that
// drops Wick into a cellar, 6-6 a hurried run at first light, 6-7 a lantern house of paper floors, 6-8 sunrise.
//
// Design notes (measured):
// - A gate slides up over 0.7 s once its wisps are lit; Wick (32 tall) fits under a 72-tall gate ~0.35 s after the
//   wisp lights, so a gate lit in flight is always open by the landing.
// - Crumbling paper tears 0.45 s after Wick first stands on it (Wick walks ~53 u in that time): a single plank
//   ≤ 50 u (or a row of them) holds for exactly one crossing, anything wider drops Wick. A plank Wick merely hops
//   over is untouched and still there on the way back.
// - A flat spring hop rises 221 u and travels 129 u (101 u when landing 150 u higher). Springs lying on the
//   ground are drawn 2–4 u proud of it so a finger's wobble never buries them.
// - Comet climbs walls up to ~70° and throws Wick across a summit at ~430 u/s.
import { ground, ink, note, poly, type LevelSpec, type Pt } from './builders';
import type { EntityDef, TerrainDef } from '../core/types';

const paper = { style: 'paper' as const };
const rock = { style: 'rock' as const };

/** A folded-paper tower rising from `baseY` to `topY` between x and x + w, with a pointed roof when `roof` > 0. */
function tower(x: number, w: number, topY: number, baseY: number, roof = 0, opts: Omit<TerrainDef, 'pts'> = paper): TerrainDef {
  const pts: Pt[] = [
    [x, baseY],
    [x, topY],
  ];
  if (roof > 0) pts.push([x - 6, topY], [x + w / 2, topY - roof], [x + w + 6, topY]);
  pts.push([x + w, topY], [x + w, baseY]);
  return poly(pts, opts);
}

/**
 * A gatehouse: a floating rock isle hovering over the path at ground level `g`, a folded-paper tower rising from
 * it, and a paper gate hanging from the isle's keel down to the ground (x … x + w is the tower's footprint).
 * `door` is the keel's height above the ground (the rest of the isle is higher, so Wick walks under it once the
 * gate slides up), `top` the foot of the tower's roof (its peak is 64 u higher), `span` how far the isle reaches
 * out on each side of the tower.
 */
function gatehouse(x: number, w: number, g: number, opens: string, o: { door?: number; top?: number; isle?: number; span?: number } = {}): { terrain: TerrainDef[]; gate: EntityDef } {
  const { door = 72, top = 150, isle = 150, span = 52 } = o;
  const cx = x + w / 2;
  const k = g - door; // keel
  const t = g - isle; // isle top
  const L = x - span;
  const R = x + w + span;
  const isleRock = poly(
    [
      [L, t + 4],
      [L + 20, t - 2],
      [R - 24, t - 2],
      [R, t + 6],
      [R - 8, t + 18],
      [R - 26, k - 26],
      [cx + 30, k - 10],
      [cx + 14, k],
      [cx - 14, k],
      [cx - 30, k - 12],
      [L + 22, k - 30],
      [L + 6, t + 20],
    ],
    rock,
  );
  const spire = tower(x, w, top, t + 2, 64);
  return { terrain: [isleRock, spire], gate: { kind: 'gate', x: cx - 12, y: k, w: 24, h: door, opens } };
}

/**
 * A paper spire rising out of the cloud sea with a flat, walkable top from x to x + w at `top`: a folded cornice
 * just under the top, then a body that tapers away into the clouds.
 */
function pillar(x: number, w: number, top: number, taper = 0.18, opts: Omit<TerrainDef, 'pts'> = paper): TerrainDef {
  const t = Math.round(w * taper);
  return poly(
    [
      [x, top],
      [x + w, top],
      [x + w + 4, top + 10],
      [x + w - 4, top + 22],
      [x + w - t, 780],
      [x + t, 780],
      [x + 4, top + 22],
      [x - 4, top + 10],
    ],
    opts,
  );
}

/** A small floating rock isle drifting high in the sky (scenery), optionally crowned by a slim paper spire. */
function skyIsle(cx: number, y: number, w: number, spire = 0): TerrainDef[] {
  const h = w * 0.5;
  const isleRock = poly(
    [
      [cx - w / 2, y + 2],
      [cx - w / 2 + 10, y - 3],
      [cx + w / 2 - 12, y - 3],
      [cx + w / 2, y + 3],
      [cx + w / 2 - 8, y + h * 0.4],
      [cx + 8, y + h],
      [cx - 10, y + h * 0.8],
      [cx - w / 2 + 6, y + h * 0.35],
    ],
    rock,
  );
  if (!spire) return [isleRock];
  const sw = Math.round(Math.max(16, w * 0.26));
  return [isleRock, tower(Math.round(cx - sw / 2), sw, y - spire, y + 1, Math.round(sw * 1.3))];
}

/** A row of crumbling paper planks from x1 to x2 at height y. */
function planks(x1: number, x2: number, y: number, n: number, h = 14): EntityDef[] {
  const w = (x2 - x1) / n;
  return Array.from({ length: n }, (_, i) => ({ kind: 'crumble' as const, x: Math.round(x1 + i * w), y, w: Math.round(w), h }));
}

/** A crumbling paper staircase: n planks over x1 … x2, climbing (or falling) from the ground at y1 to a top step at y2. */
function stairs(x1: number, y1: number, x2: number, y2: number, n: number, h = 14): EntityDef[] {
  const w = (x2 - x1) / n;
  return Array.from({ length: n }, (_, i) => ({ kind: 'crumble' as const, x: Math.round(x1 + i * w), y: Math.round(y1 + ((y2 - y1) * (i + 1)) / n), w: Math.round(w), h }));
}

const g61 = gatehouse(752, 92, 547, 'a');
const g62 = gatehouse(330, 90, 590, 'a', { top: -120 });
const g63 = gatehouse(900, 90, 565, 'a');
const g64 = gatehouse(190, 90, 441, 'a');
const g65 = gatehouse(190, 90, 470, 'a');
const g66 = gatehouse(944, 40, 400, 'a', { isle: 110, top: 150, span: 34 });
const g68a = gatehouse(262, 56, 580, 'a', { span: 40, top: 150 });
const g68b = gatehouse(620, 44, 580, 'b', { span: 34, top: 170 });

export const WORLD6: LevelSpec[] = [
  // 6-1 — A paper gate bars the way; its wisp waits behind Wick, across a ravine. Wick bumps the gate, turns, and
  // the bridge you draw carries it to the wisp and back. Sparks: the islet (natural), the ravine's arch (a braver
  // bridge), and the doorway itself (only a lit wisp lets Wick through).
  {
    name: 'Wisplight',
    start: { x: 520, y: 548 },
    goal: { x: 1130, y: 530 },
    ink: { budget: 360, par: 210, types: ['moon'] },
    terrain: [
      // the wisp's islet and its lantern spire
      ground([[0, 496], [40, 494], [100, 498], [150, 504], [184, 512], [196, 540], [190, 620], [198, 720]], rock),
      tower(24, 40, 270, 497, 56),
      // the plateau, the gatehouse, and a slim spire framing the lamp
      ground([[344, 720], [338, 630], [348, 572], [372, 554], [440, 548], [520, 548], [620, 550], [720, 548], [820, 547], [920, 544], [1010, 540], [1090, 534], [1150, 530], [1196, 532], [1222, 546], [1232, 600], [1226, 680], [1234, 720]], rock),
      ...g61.terrain,
      tower(1236, 28, 340, 780, 40),
      ...skyIsle(560, 214, 84, 64),
    ],
    entities: [{ kind: 'wisp', x: 110, y: 472, id: 'a' }, g61.gate],
    sparks: [
      { x: 84, y: 464 },
      { x: 272, y: 448 },
      { x: 798, y: 520 },
    ],
    notes: [note(160, 376, 'light the wisp', { arrow: [150, 396, 120, 446], rot: -4 })],
    solution: [ink('moon', [[358, 556], [272, 492], [192, 514]])],
  },
  // 6-2 — Crumbling paper. The plank bridge falls away behind Wick; the wisp lights the gate far below, and when
  // Wick turns for home there is nothing left to walk on. Catch the fall and slide it down to the courtyard.
  // Sparks: on the planks (natural), in the gap (catch it high — a longer line), in the doorway (the gate).
  {
    name: 'Tearaway',
    start: { x: 470, y: 300 },
    goal: { x: 130, y: 590 },
    ink: { budget: 520, par: 420, types: ['moon'] },
    terrain: [
      // the lamp's courtyard
      ground([[0, 586], [60, 590], [200, 590], [470, 590], [530, 594], [578, 600], [596, 610], [604, 646], [596, 720]], rock),
      ...g62.terrain,
      // the balcony Wick starts on, bracketed to the gatehouse tower
      poly([[420, 300], [640, 300], [640, 314], [610, 326], [560, 332], [496, 344], [446, 362], [420, 376]], paper),
      // the wisp's tower rising from the cloud, and its spire
      poly([[900, 780], [900, 300], [1130, 300], [1130, 420], [1152, 434], [1138, 600], [1112, 780]], paper),
      tower(1124, 56, 170, 302, 76),
      ...skyIsle(170, 196, 92, 76),
    ],
    entities: [...planks(640, 900, 300, 6), { kind: 'wisp', x: 1096, y: 276, id: 'a' }, g62.gate],
    sparks: [
      { x: 770, y: 264 },
      { x: 744, y: 404 },
      { x: 375, y: 562 },
    ],
    notes: [note(770, 196, 'paper tears', { rot: -3 })],
    solution: [ink('moon', [[904, 424], [820, 432], [744, 440], [590, 604]])],
  },
  // 6-3 — The wisp hangs in the sky over a ravine, like a kite. Only a flight lights it — and the paper landing
  // before the gate won't hold Wick while it waits, so the gate must open mid-air. A spring off the edge (a diving
  // board) does it. The sparks trace the kite's string.
  {
    name: 'Kite',
    start: { x: 110, y: 548 },
    goal: { x: 1170, y: 550 },
    ink: { budget: 220, par: 80, types: ['moon', 'spring'] },
    terrain: [
      ground([[0, 544], [60, 548], [140, 550], [230, 556], [320, 560], [400, 564], [414, 568], [426, 596], [418, 720]], rock),
      ground([[866, 720], [872, 596], [870, 566], [930, 565], [1010, 562], [1100, 556], [1170, 550], [1230, 546], [1280, 542]], rock),
      ...g63.terrain,
      ...skyIsle(1110, 236, 86, 70),
      ...skyIsle(250, 250, 62),
    ],
    entities: [...planks(780, 870, 566, 2), { kind: 'wisp', x: 610, y: 400, id: 'a' }, g63.gate],
    sparks: [
      { x: 486, y: 428 },
      { x: 672, y: 384 },
      { x: 758, y: 466 },
    ],
    solution: [ink('spring', [[410, 566], [465, 590]])],
  },
  // 6-4 — A paper stair climbs to the wisp's tower and falls away behind Wick. The way home is the fall itself:
  // a spring in the gap turns it into a leap back to the gate. Sparks: the stair (natural), deep in the gap (a
  // braver, deeper spring) and at the top of the leap.
  {
    name: 'Rebound',
    start: { x: 380, y: 441 },
    goal: { x: 96, y: 447 },
    ink: { budget: 220, par: 80, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 452], [60, 448], [160, 442], [300, 441], [420, 441], [490, 444], [500, 448], [508, 480], [500, 560], [510, 720]], rock),
      ...g64.terrain,
      // the wisp's tower and spire
      poly([[780, 780], [780, 346], [1060, 346], [1060, 430], [1088, 446], [1072, 600], [1044, 780]], paper),
      tower(1056, 60, 190, 348, 72),
      ...skyIsle(640, 180, 90, 72),
      ...skyIsle(1200, 300, 64),
    ],
    entities: [...stairs(500, 446, 780, 346, 8), { kind: 'wisp', x: 1024, y: 322, id: 'a' }, g64.gate],
    sparks: [
      { x: 650, y: 350 },
      { x: 738, y: 530 },
      { x: 536, y: 346 },
    ],
    solution: [ink('spring', [[701, 575], [769, 561]])],
  },
  // 6-5 — The courtyard floor is paper. It drops Wick into the cellar where a wisp waits; the only way out is up,
  // through the hole it made — a spring throws Wick back out, past a second wisp hanging over the rim, and home
  // through the gate. Sparks: the fall in, the lantern over the rim, the way down.
  {
    name: 'Trapdoor',
    start: { x: 420, y: 470 },
    goal: { x: 96, y: 471 },
    ink: { budget: 200, par: 80, types: ['moon', 'spring', 'comet'] },
    terrain: [
      ground([[0, 476], [60, 472], [180, 470], [360, 470], [480, 470], [540, 470], [540, 720]], rock),
      ...g65.terrain,
      // the cellar floor, and the paper house whose wall closes the cellar
      ground([[540, 570], [740, 570]], paper),
      poly([[740, 780], [740, 300], [728, 300], [850, 196], [972, 300], [960, 300], [960, 780]], paper),
      ...skyIsle(1130, 330, 100, 80),
      ...skyIsle(640, 180, 60),
    ],
    entities: [
      { kind: 'crumble', x: 540, y: 470, w: 40, h: 14 },
      { kind: 'crumble', x: 580, y: 470, w: 160, h: 14 },
      { kind: 'wisp', x: 712, y: 546, id: 'a' },
      { kind: 'wisp', x: 552, y: 336, id: 'a' },
      g65.gate,
    ],
    sparks: [
      { x: 650, y: 522 },
      { x: 574, y: 318 },
      { x: 520, y: 392 },
    ],
    solution: [ink('spring', [[544, 567], [600, 567]])],
  },
  // 6-6 — Hurry: the first rays are coming, and Wick sets off on its own across the spire tops. A bridge, a hop
  // through the wisp on the tallest spire, and a moth waking by the last gap — draw that bridge only as Wick
  // arrives, or the moth eats it first.
  {
    name: 'First Rays',
    autoStart: 2,
    start: { x: 70, y: 380 },
    goal: { x: 1190, y: 420 },
    ink: { budget: 520, par: 380, types: ['moon', 'spring', 'comet'] },
    terrain: [
      pillar(-40, 250, 380),
      pillar(330, 150, 400),
      pillar(700, 300, 400, 0.24),
      pillar(1100, 220, 420),
      ...g66.terrain,
      ...skyIsle(470, 200, 70, 52),
      ...skyIsle(1180, 230, 60),
    ],
    entities: [...planks(480, 700, 400, 5), { kind: 'wisp', x: 800, y: 186, id: 'a' }, g66.gate, { kind: 'moth', x: 1050, y: 210, speed: 70 }],
    sparks: [
      { x: 270, y: 330 },
      { x: 590, y: 370 },
      { x: 764, y: 142 },
    ],
    solution: [
      ink('moon', [[204, 384], [270, 364], [336, 404]]),
      ink('spring', [[712, 396], [782, 400]], 4.0),
      ink('moon', [[994, 404], [1050, 400], [1106, 424]], 7.3),
    ],
  },
  // 6-7 — A lantern house of paper floors. Wick drops through them storey by storey, but the upper wisp waits
  // beyond the paper on the middle floor. Cover it and Wick never comes down; the trick is to cross it once
  // without breaking it (a hop, or a comet too fast to tear) and let it give way on the way back. The top floor's
  // far spark asks for the same trick twice.
  {
    name: 'Lantern House',
    start: { x: 440, y: 250 },
    goal: { x: 1110, y: 560 },
    ink: { budget: 240, par: 150, types: ['moon', 'spring', 'comet'] },
    terrain: [
      // walls and roof
      poly([[360, 720], [360, 180], [340, 180], [640, 80], [940, 180], [920, 180], [920, 472], [880, 472], [880, 180], [400, 180], [400, 720]], paper),
      // floors
      poly([[400, 250], [700, 250], [700, 264], [400, 264]], paper),
      poly([[780, 250], [880, 250], [880, 264], [780, 264]], paper),
      poly([[400, 390], [560, 390], [560, 404], [400, 404]], paper),
      poly([[640, 390], [880, 390], [880, 404], [640, 404]], paper),
      ground([[300, 720], [300, 560], [1280, 560]], rock),
      ...skyIsle(170, 300, 96, 80),
      ...skyIsle(1110, 250, 70, 56),
    ],
    entities: [
      { kind: 'crumble', x: 700, y: 250, w: 80, h: 14 },
      { kind: 'crumble', x: 560, y: 390, w: 80, h: 14 },
      { kind: 'wisp', x: 430, y: 366, id: 'a' },
      { kind: 'wisp', x: 850, y: 536, id: 'a' },
      { kind: 'gate', x: 888, y: 472, w: 24, h: 88, opens: 'a' },
    ],
    sparks: [
      { x: 840, y: 222 },
      { x: 450, y: 352 },
      { x: 700, y: 530 },
    ],
    solution: [ink('comet', [[620, 246], [690, 246]]), ink('comet', [[700, 386], [645, 386]])],
  },
  // 6-8 — Sunrise. The whole night in one page: the first lantern behind Wick, a paper bridge with a lantern in
  // the sky above it, the last spire — and from its summit a leap to the lamp waiting where the sun will rise.
  {
    name: 'Sunrise',
    start: { x: 200, y: 580 },
    goal: { x: 1030, y: 390 },
    ink: { budget: 780, par: 600, types: ['moon', 'spring', 'comet'] },
    terrain: [
      // the first lantern's islet
      ground([[0, 568], [40, 566], [70, 570], [84, 590], [78, 720]], rock),
      tower(12, 34, 330, 568, 50),
      // the gate terrace
      ground([[150, 720], [146, 600], [156, 582], [200, 580], [300, 580], [380, 580], [386, 600], [380, 720]], rock),
      ...g68a.terrain,
      // the ledge under the last spire, and the spire
      ground([[600, 720], [596, 600], [604, 580], [700, 580], [800, 580], [900, 582], [906, 620], [900, 720]], rock),
      ...g68b.terrain,
      poly([[800, 584], [800, 360], [794, 350], [800, 330], [890, 330], [896, 350], [890, 360], [890, 584]], paper),
      // the lamp's floating platform, where the sun will rise
      poly([[930, 390], [1090, 390], [1090, 330], [1084, 330], [1100, 290], [1116, 330], [1110, 330], [1110, 396], [1084, 408], [1050, 420], [980, 422], [940, 410]], paper),
    ],
    entities: [
      ...planks(380, 600, 580, 5),
      { kind: 'wisp', x: 40, y: 544, id: 'a' },
      { kind: 'wisp', x: 452, y: 334, id: 'b' },
      g68a.gate,
      g68b.gate,
    ],
    sparks: [
      { x: 115, y: 520 },
      { x: 486, y: 322 },
      { x: 930, y: 330 },
    ],
    solution: [
      ink('moon', [[150, 586], [115, 562], [76, 574]]),
      ink('spring', [[404, 574], [464, 576]]),
      ink('comet', [[664, 576], [700, 562], [784, 334], [802, 318], [884, 318]]),
    ],
  },
];

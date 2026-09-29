# Inklight — Level Design Guide

Read `docs/DESIGN.md` first (the world, pillars, inks and elements). This guide is the practical
handbook: coordinates, measured physics, conventions, and how to verify.

## 1. The page

- World is **1280 × 720** units, **y points down**. The level is always shown whole (no scrolling).
- On a phone the level is ~0.5 CSS px per unit. A finger is ~80 u wide — design with a coarse grain:
  gaps ≥ 90 u, platforms ≥ 70 u, nothing that needs < ~12 u precision.
- **Ground baseline** ~ y 540–620. Below `H + 60 = 780` is the mist (death).
- **Keep clear:** the top strip y < 70 (level title top-left, ink meter top-centre, spark counter top-right).
  Put no sparks, lamps or required drawing space there.
- Page edges x = 0 and x = 1280 are invisible walls (Wick turns around). Prefer visible reasons: a
  cliff, a rock, a wall. Terrain that touches an edge is automatically extended off-page for the art.
- Start near one side (x 60–160) standing on ground; the goal lamp on ground. Vary directions
  sometimes (start right, go left; go up; go down).

## 2. Wick (measured)

| Quantity | Value |
| --- | --- |
| Body radius | 16 u (lamp flame adds ~20 u above) |
| Walk speed | 118 u/s (crossing the page ≈ 10 s) |
| Gravity | 1500 u/s², terminal 1050 u/s |
| Walkable slope | ≤ 58° (steeper = wall, Wick turns around) |
| Steps it rolls over | on flat ground, any obstacle lower than its centre (≈ < 14 u above its feet). On an upward ramp far less: a lip ~9 u above a 28° ink ramp already turns Wick — make ramps meet or overshoot the ledge |
| Walls that turn it | a drawn wall must rise > ~20 u above Wick's feet (18 u is climbed, 22 u turns it) |
| Hazard grace | Brambles kill when Wick's centre is within 13 u of them |
| Spark pickup | within 32 u of Wick's centre (Wick's centre is 16 u above the ground it walks on) |
| Goal | Wick's centre within 34 u of (goal.x, goal.y − 16) |
| Stuck | < 4 u of movement for 2.5 s while running = fail |
| Endless loop | the same Wick + world state recurring 4× at bounces/turns/landings = fail ('stuck') |

Wick keeps its horizontal momentum in the air and on landing (fast landings slide, decelerating at
700 u/s²). Walking off a ledge it drops almost straight down (a short roll over the edge first).
**Landing sets facing from the velocity along the surface**: a steep drop onto a slope (or onto a vertex or
the end-cap of a stroke) can send Wick down that slope, i.e. back the way it came. Keep landing zones flat.

## 3. Inks (measured with `npx tsx scripts/measure.ts`)

All flights start walking right on flat ground at y = 600.

| Setup | Result |
| --- | --- |
| **Spring** lying flat on the ground | rises **221 u**, lands **~260 u** further on |
| Catapult: moon ramp up to y 544, then a 70 u spring sloping **down-right 15°** | rises 196 u, lands **~310 u** away |
| … sloping down-right **30°** | rises 154 u, lands **~440 u** away |
| … sloping down-right **45°** | rises 105 u, lands **~490 u** away |
| Spring **rising** to the right | throws Wick **backwards** (its face points back) |
| **Comet** flat, drawn left→right | Wick accelerates to **430 u/s** within ~30 u |
| Comet ramp 160 u long at 20° / 35° / 50° up | lands ~50 / ~80 / ~125 u past the ramp's end |
| Comet 200 u then flat spring | rises 221 u, lands ~130 u after the spring |

Rules of thumb:
- A spring pushes Wick **away from its face** at 820 u/s (plus Wick's sliding speed along it).
  Players learn "tilt the spring the way you want to go". Mushroom caps can override bounce speed.
- Comet **direction = the direction the stroke was drawn**. A right-to-left comet stroke drags Wick left.
  Comet carries Wick up slopes to 72° — it's a conveyor/lift more than a cannon.
- Ink costs its length. A 200 u bridge costs ~200–220.

## 4. Elements (see `src/core/types.ts` EntityDef)

- `inkpot {x,y,amount}` — +ink this run. Great for "draw while running" levels. `par` may exceed the
  starting `budget` by up to the pots' total (the verifier allows `par ≤ budget + pots`).
- `rain {x1,x2,y,rate?}` — drops fall at ~600 u/s from the cloud span (rate default 22/s). 3 hits in quick
  succession douse Wick (flame regrows after 2.5 s dry). Any solid (ink, terrain, gates) shelters.
  Rain also keeps falling during planning so players can see where it lands.
- `wind {x,y,w,h,fx,fy}` — acceleration in u/s². Pushes airborne Wick fully, grounded Wick a little along
  the ground. `fy < −825` un-grounds a standing Wick, but it only *rises* when the effective `fy < −1500`
  (gravity); `fy = −1800` ≈ slow rise. Zones fade over the outer 10 % of their width/height, so extend an
  updraft well below the ground and past its sides for a reliable lift. Rain drifts too.
- `moth {x,y,speed?=80,sense?=240}` — while running, flies to the nearest ink within `sense` and eats
  ~20 u bites every 0.3 s. Drifts home when there's nothing. Harmless to Wick. **Decoy strokes** lure moths.
- `wisp {x,y,id}` + `gate {x,y,w,h,opens:id,dir?}` — Wick touches every wisp with that id → the gate slides
  away over 0.7 s.
- `mover {pts,path,period,phase?}` — `pts` is the platform polygon at t = 0 (at path[0]); it eases along
  `path` and back every `period` seconds, carrying Wick.
- `crumble {x,y,w,h,delay?=0.45}` — a paper ledge that tears away shortly after Wick touches it.
- `glowworm {x,y,r?}` — a light source (needed in `dark` levels, pure decoration elsewhere).
- Terrain `mat: 'bounce'` (use `mushroom()`), `mat: 'hazard'` (use `brambles()` / `thorns()`).
- `noInk: Vec[][]` — polygons where ink won't take (the pen lifts inside them).
- `dark: true` — only lights reveal the world. The player's ink glows, so drawing *reveals* terrain.
- `autoStart: s` — a Hurry level; Wick sets off after `s` seconds. Give solution strokes a `t`.
- All timed behaviour starts at Go, so solutions are deterministic.

## 5. Authoring

```ts
import { brambles, block, ground, ink, inkpot, ledge, mushroom, note, poly, thorns, type LevelSpec } from './builders';

export const WORLD2: LevelSpec[] = [
  {
    name: 'Soft Landing',                        // 1–3 evocative words
    start: { x: 110, y: 580 },                   // Wick's feet
    goal: { x: 1170, y: 520 },                   // lamp's foot, on ground
    ink: { budget: 520, par: 300, types: ['moon', 'spring'] },
    terrain: [ground([[0, 580], [380, 580], [420, 600]]), ledge(900, 520, 380), ...mushroom(640, 700, 560)],
    sparks: [{ x: 500, y: 420 }, { x: 700, y: 300 }, { x: 980, y: 488 }],
    notes: [note(560, 380, 'springs throw', { arrow: [560, 400, 560, 470], rot: -3 })],
    solution: [ink('spring', [[380, 604], [460, 604]])],
  },
];
```

- `ground(profile)` — top profile left→right, closed down past the screen. Use several points for organic
  silhouettes (gentle slopes, knolls, notches) — not just flat rectangles.
- `ledge(x, y, w)` — a floating rock with a flat top; `block(x, y, w, h)`; `poly(points)`.
- `style` on terrain picks the art: `earth` (default, grassy), `rock`, `wood`, `paper`, `crystal`,
  `mushroom`, `bramble`. `bare: true` hides grass.
- Solution strokes are lists of points; the pen is resampled, so 2–6 points per stroke is fine.
  Draw them *on* surfaces: a line lying flush on ground should sit at groundY + 4 (ink half-width).

## 6. Quality bar (the verifier enforces the first five)

1. The reference solution **wins, collects every spark, and uses ≤ par ink** (a genuine 3-star run).
2. The level **cannot be won with no ink**.
3. It's **robust**: ≥ 60 % of solutions jittered by ±6 u still win (aim for ≥ 80 %). Levels should be
   solvable by a finger, not a laser.
4. Sparks/goal/start aren't inside terrain; start and goal stand on ground.
5. par ≤ budget (+ inkpots). Typical: `par ≈ solution × 1.1–1.2` (rounded to 10); `budget ≈ par × 1.4–2`.
   Tight budgets make levels puzzles; loose budgets make them playgrounds. Vary it.
6. **One idea per level**, stated by its geometry. The first level of a new mechanic teaches it with
   a short handwritten note (≤ 4 words) and maybe a ghost line; later levels never explain.
7. **Three sparks** per level, placed to *mean* something: one on the natural path, one that asks for a
   braver/longer line, one that rewards understanding the mechanic. Sparks-vs-frugal tension is good, but
   a 3-star solution must exist.
8. **Beautiful composition**: the page should look like an illustration — asymmetric silhouettes, a
   clear focal path, breathing room, the lamp framed. Check it with screenshots.
9. Difficulty per world: 1–2 teach, 3–5 explore, 6–7 twist/combine with earlier ideas, 8 a showpiece
   finale. Across the game the curve rises gently; world 6 is the hardest but always fair.
10. At most one Hurry level per world (not in world 1).

## 7. Tools

```bash
npm run verify                 # verify every level (add ids to filter: npm run verify -- 2 3-4)
npm run verify -- 2 --trials=80
npx tsx scripts/trace.ts 2-3   # step-by-step trace + events of the reference solution
npx tsx scripts/probe.ts 2-3 8 # print jittered (±8) solutions that fail
npx tsx scripts/measure.ts     # signature trajectories
npm test                       # physics unit tests
node scripts/shoot.mjs --out=shots/w2 "l23|/?level=2-3&unlock|1500" "l23run|/?level=2-3&unlock&solve&go|6000"
```

Screenshots are 844×390 CSS px at 3× (an iPhone in landscape) — the real target.
`?solve` draws the reference solution, `?go` starts Wick, `?unlock` unlocks everything.

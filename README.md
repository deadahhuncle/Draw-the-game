# Inklight

*Draw the way home before dawn.*

A mobile puzzle game about a tiny paper-lantern sprite called **Wick** who walks — and never stops —
through one long night. You can't steer Wick. You hold the only pen: draw strokes of luminous ink to
bridge gaps, raise ramps, build walls that turn Wick around, and fling it across the sky. Ink is scarce,
so every stroke matters.

The journey runs from **dusk to dawn** across six worlds, each with a new idea:

| | World | New idea |
| --- | --- | --- |
| 1 | Dusk Meadow | Moon ink — bridges, ramps, walls, brambles |
| 2 | Mushroom Hollow | Spring ink, mushroom caps, wet no-ink paper |
| 3 | Starwater | Comet ink (the direction you draw matters), drifting rafts |
| 4 | Stormglass | Rain that douses the flame, wind, inkpots |
| 5 | Moth Wood | Moths that eat light, darkness your ink reveals |
| 6 | Daybreak Spires | Wisp-switches and paper gates, crumbling ledges — and the sunrise |

Every level has three stars: **Lit** (reach the lamp), **Sparks** (collect all three), and **Frugal**
(finish within par ink). Drawing is also an instrument: the pen hums in the world's key, and the music
is generated live.

## Play

```bash
npm install
npm run dev          # open the printed URL on your phone (same network) and turn it sideways
```

Controls: draw with a finger (or mouse). **Go** starts Wick; **Retry** resets Wick but keeps your ink.
Keyboard: `space` go/retry · `z` undo · `1–3` inks · `esc` pause.

## Build

```bash
npm run build          # static site in dist/ (installable PWA, works offline)
npm run build:single   # one self-contained HTML file in dist-single/
```

## Develop

```bash
npm test               # physics unit tests (vitest)
npm run verify         # headless: every level's reference solution wins, collects all sparks,
                       # meets par, needs ink, and survives ±6u jitter of the strokes
npm run verify -- 3 --trials=80
npx tsx scripts/trace.ts 2-4     # trace a level's reference solution
npx tsx scripts/measure.ts       # signature trajectories (bounces, comet launches)
node scripts/shoot.mjs "l24|/?level=2-4&unlock&solve&go|5000"   # phone-sized screenshot
```

Debug URL params: `?level=2-4` jump to a level · `?solve` draw the reference solution · `?go` start
Wick · `?unlock` unlock everything · `?level=d4-1` developer sandbox levels (one per world).

### Architecture

- `src/sim` — deterministic fixed-step simulation (no DOM, no `Math.random`): Wick's circle-vs-capsule
  controller, inks, level entities. Runs identically in the browser and in the headless verifier.
- `src/render` — Canvas 2D renderer: cached sky/terrain/ink layers, character animation, particles,
  entity art, darkness lighting.
- `src/audio` — everything synthesized at runtime with Web Audio: generative music, the pen
  instrument, sound effects.
- `src/ui` — DOM screens (title, journey map, HUD, pause, level complete, ending).
- `src/levels` — hand-authored levels with reference solutions.
- `docs/DESIGN.md` — the design bible · `docs/LEVELS.md` — the level design handbook.

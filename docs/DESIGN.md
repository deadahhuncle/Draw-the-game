# INKLIGHT — Design Bible

> *One long night. One tiny lantern-sprite. One pen full of light.*

This document is the single source of truth for the game's creative direction,
mechanics, tuning and architecture. Every system, every pixel and every sound
should be traceable back to something here. When in doubt, choose the option
that feels **quiet, warm, hand-made and a little bit magical**.

---

## 1. The pitch

**Wick** is a paper-lantern sprite no bigger than a thimble, with a candle flame
for a head-feather and two dot eyes. Wick cannot stop walking and cannot jump.
The world is a hand-inked landscape at night — and you hold the only pen.

You draw with **luminous ink**: every stroke you make glows, becomes solid, and
carries Wick over gaps, around brambles and up to the next **home-lamp**. Ink is
precious — the inkwell only holds so much — so every level is a small, elegant
puzzle: *what is the least light I need to get Wick home?*

The whole game is a single night. The journey begins at **dusk** and ends at
**dawn**: world by world the sky deepens from apricot to indigo to black, then
slowly blushes rose and gold. The final lamp you light is the sunrise.

**Title:** INKLIGHT  **Hero:** Wick  **Tagline:** *Draw the way home before dawn.*

### Design pillars
1. **Every stroke matters.** Ink is scarce; clever beats brute force. Par-ink
   scores reward elegance.
2. **Drawing is playing music.** The pen is an instrument: strokes hum in the
   world's key, sparks chime in rising scale, the lamp blooms a chord.
3. **Light is life.** Ink glows, Wick glows, lamps glow. Later worlds turn this
   into mechanics (rain douses flame, moths devour light, darkness hides the
   ground until your ink reveals it).
4. **Hand-made at every scale.** Wobbly ink outlines, cross-hatched terrain,
   paper grain, handwritten notes in the margins. Nothing looks procedural even
   though almost everything is.
5. **Respect the player.** Instant retries, lines persist between attempts,
   generous hitboxes, optional ghost hints, no timers unless it's the point.

---

## 2. Core loop

1. **Plan.** The level opens with Wick idling beside the start. The player
   draws strokes (ink drains from the inkwell meter as they draw).
2. **Go.** The player taps the big round **Go** button. Wick starts walking.
   The player *may keep drawing during the run* (ink permitting) — clutch saves
   are part of the fun.
3. **Resolve.**
   - Wick reaches the home-lamp → the lamp ignites, stars are tallied.
   - Wick dies (falls into the mist, touches brambles, is doused, gets stuck)
     → a short, gentle failure beat, then Wick is back at the start in Plan
     mode. **All strokes persist** (moth-eaten ink is restored). The player can
     undo / clear / add strokes and try again.
4. **Stars (3 per level)**
   - ✦ **Lit** — reach the home-lamp.
   - ✦ **Sparks** — collect every spark in the level (usually 3) in one run.
   - ✦ **Frugal** — finish using no more than the level's *par* ink.

Levels unlock sequentially. A world unlocks when the last level of the previous
world is lit. Stars are a mastery layer only — they never gate progress.

### Level flavours
- **Puzzle** (default): Wick waits for Go.
- **Hurry** (`autoStart: seconds`): Wick sets off automatically after a short
  countdown — you must draw in real time. Used sparingly as tempo changes.

---

## 3. Wick — the character

- Body: a round paper lantern, warm ivory `#FFF4DC`, faint vertical ribs, soft
  inner glow. Hitbox is a circle, **radius 16** world units.
- Head: a candle flame that flickers, leans against motion and streams when
  Wick moves fast. Flame size doubles as a health read in rain levels.
- Face: two dot eyes (blink every 2–5 s, look toward the pen while drawing),
  a tiny mouth that appears for emotions (happy "‿" at the lamp, "o" when
  falling).
- Legs: two ink-line legs with a quick scurry cycle; tucked when airborne.
- Squash & stretch on land / bounce, lean into rush, wobble on turn-around.
- Wick casts light: a warm radial glow that tints nearby terrain edges.

### Movement rules (the "controller")
- Walks at constant speed along the ground in its **facing** direction.
- Cannot jump; has no air control. Gravity always applies.
- **Turns around** when it walks into a wall (a contact too steep to stand on,
  facing it). Includes the invisible world edges at x=0 and x=W.
- Walkable slope: up to **58°**. Steeper surfaces behave as walls.
- Small bumps (< ~8 u) are simply rolled over.
- Follows the ground over crests and down slopes ("ground snap"), but flies
  off when moving fast (launches from Comet ink / bounces).
- On landing, facing becomes the direction of horizontal travel if it's
  significant.
- Dies when: centre falls below `H + 60` (the mist), touches a hazard
  (generous: hazard radius is 3 u smaller than the body), is doused (rain), or
  is stuck (moves < 4 u in 2.5 s while running).

---

## 4. Inks

One shared inkwell per level (`ink.budget`, measured in world units of stroke
length). Each level lists which inks are available. Ink is refunded on undo.

| Ink | Colour (core / halo) | Behaviour |
| --- | --- | --- |
| **Moon** | `#F3F7FF` / `#8FB8FF` | Solid ground/wall. The basic ink. |
| **Spring** | `#FFE6F4` / `#FF5FAE` | Bouncy. Any contact launches Wick along the surface normal at `BOUNCE_SPEED` (keeps tangential speed). Angle it to fling Wick. |
| **Comet** | `#FFF3D6` / `#FFB23F` | Directional current. Standing on it, Wick is driven at `RUSH_SPEED` in the **direction the stroke was drawn** (its facing changes to match). Carries Wick up slopes to 70°. Wick launches off the end with its momentum. |

Drawing rules:
- Points are sampled every ≥ 5 u and smoothed. Taps shorter than 8 u are
  discarded (no ink spent).
- Strokes cannot pass within `R + INK_HW + 6` of Wick or through **no-ink
  zones** — the pen lifts there and resumes when it leaves (splitting the
  stroke).
- When the inkwell runs dry mid-stroke, the stroke ends with a sputter.
- Strokes collide as capsules of half-width `INK_HW = 4`.

---

## 5. World elements (catalogue)

| Element | Kind | Notes |
| --- | --- | --- |
| Terrain | polygon, material `solid` | Cross-hatched ink silhouettes with a moonlit rim. |
| Brambles | polygon, material `hazard` | Thorny crimson ink. Deadly on touch. |
| Mushroom caps | polygon, material `bounce` | Level-placed springs; can override bounce speed. |
| Mist / void | implicit | Anything below `H + 60` is lost. |
| Sparks | point | 4-point stars, 3 per level typical. |
| Home-lamp | point | The goal. Wick lights it on arrival. |
| No-ink zones | polygon | Wet paper: ink won't take. Shimmering hatched wash. |
| Inkpot | entity | Collect to add ink to the well mid-run. |
| Rain cloud | entity | Drops fall from a cloud span; ink/terrain blocks them. 3 hits douse Wick (flame recovers slowly). |
| Wind | entity | Rectangular gust zone accelerating Wick (and rain, moths). |
| Moths | entity | Drawn to light. They seek the nearest glowing ink and eat it (cutting strokes). Decoy strokes lure them. Harmless to Wick. |
| Darkness | level flag | Only light reveals the world: Wick's glow, lamps, glow-worms and **your ink**. |
| Wisp-switch & gate | entity | Wick lights a small wisp-lantern by touching it; linked paper gates slide open. |
| Mover | entity | A platform that travels a path (ping-pong, eased). Carries Wick. |
| Crumble | entity | Paper ledge that tears away shortly after Wick touches it. |

All time-based entities run on **sim time since Go**, so plans are
deterministic. In Plan mode entities show their t=0 state (with purely
cosmetic idle animation).

---

## 6. The journey (worlds)

The night is one continuous journey from dusk to dawn. Each world introduces
exactly one big idea, explores it, then combines it with what came before.
Eight levels per world. Level 8 of each world is a "showpiece".

| # | World | Sky | New idea |
| --- | --- | --- | --- |
| 1 | **Dusk Meadow** | apricot → violet | Moon ink, gaps, slopes, walls, brambles. |
| 2 | **Mushroom Hollow** | violet twilight, bioluminescent teal & orchid | Spring ink, mushroom caps, no-ink zones. |
| 3 | **Starwater** | deep blue, giant moon over a river | Comet ink (direction matters), long launches, movers. |
| 4 | **Stormglass** | slate, rain, lightning | Rain clouds (draw shelters), wind gusts, inkpots. |
| 5 | **Moth Wood** | near-black green, darkness | Moths eat light; darkness; lure puzzles. |
| 6 | **Daybreak Spires** | rose → gold | Wisp-switches & gates, crumbling ledges, everything; the last lamp is the sunrise. |

---

## 7. Art direction — "luminous ink on midnight washi"

- Full-bleed canvas. The level is fit into the space between the HUD gutters
  but the sky, hills and terrain extend to the screen edges.
- **Sky**: vertical gradient per world, a soft large moon/sun disc with halo,
  sparse twinkling stars (dusk has few, midnight many), slow drifting motes.
- **Far layers**: 2–3 ink-wash silhouettes of hills/trees/spires with
  atmospheric perspective (each layer lighter/hazier toward the horizon).
- **Terrain**: near-black ink fill, fine diagonal cross-hatching inside, a
  1.5–2.5 u bright **rim light** on upward-facing edges (moonlight catching
  the edge), subtle wobble on outlines, occasional grass tufts/pebbles drawn
  in ink along top edges.
- **Paper**: a fine grain + fibre texture over everything at low opacity;
  a soft vignette.
- **Player ink**: bright core + coloured halo (additive), slight width
  variation from drawing speed, a gentle shimmer travelling along strokes;
  Comet ink shows flowing chevrons in its direction; Spring ink pulses.
- **Palette discipline**: each world defines ~10 colours (sky stops, hill
  layers, terrain fill, hatch, rim, accent, mist). Inks are consistent across
  worlds so they're always readable.
- **Motion**: everything breathes — 0.5–3 s sine motions, never frantic.
- Reduced-motion setting damps camera shake and ambient motion.

### Typography
- **Fraunces** (variable, soft, italic) — logo, world & level names, big numbers.
- **DM Mono** — small-caps UI labels, counters, letter-spaced 0.12–0.2em.
- **Caveat** — handwritten tutorial notes scribbled in the margins of levels.

### UI
- Glassy dark buttons with 1 px hairline strokes, line-art SVG icons.
- The **ink meter** is itself a glowing line across the top of the level
  that burns down from the right as you draw; a small tick marks *par*.
- Left gutter: ink swatches (vertical), undo, hint. Right gutter: Go/Stop,
  retry, pause. A left-handed setting mirrors the gutters.
- Screens: Title (the logo writes itself in light), Journey map (a single
  hand-drawn path from dusk to dawn with a lamp per level), Pause sheet,
  Level-complete card, Settings, Rotate-your-phone prompt, Credits at dawn.

---

## 8. Sound — "a music box in a sleeping forest"

All audio is synthesized at runtime with Web Audio (no files).

- **Music**: generative, per-world key & mode. Warm detuned pads, a sparse
  celesta/music-box voice, soft sub drone, convolution reverb. In Plan mode
  it's ambient; when Wick runs a gentle pulse joins.
- **The pen**: drawing plays a soft glassy tone whose pitch follows the pen's
  height, quantised to the world scale, plus faint paper-scratch noise.
- **SFX**: spark chimes (rising scale per spark), bounce (rounded pluck),
  comet whoosh, land thud, turn "tick", ink-dry sputter, undo (reverse
  swish), death (soft "pff" + falling notes), lamp ignite (whoomph + chord
  bloom), UI clicks.
- Haptics (where supported): light taps on stroke end, spark, bounce; a
  double-tap on death; a long soft buzz on win.

---

## 9. Technical architecture

- Vite + TypeScript, no framework. Canvas 2D for the world; DOM + CSS for UI.
- **Deterministic simulation** (`src/sim`) with fixed step `DT = 1/120`, no DOM
  access, no `Math.random` (seeded RNG only). Runs headless in Node for level
  verification and tests.
- World space: `W = 1280`, `H = 720` (16:9), y points down.
- Rendering (`src/render`) reads sim state and events; never mutates the sim.
- Audio (`src/audio`) and effects consume sim **events**.
- Levels (`src/levels`) are TypeScript data with builder helpers and a
  **reference solution** (timed strokes). `npm run verify` simulates every
  solution headlessly and checks: it wins, uses ≤ budget ink, collects all
  sparks, meets par; the level is *not* winnable with no ink; and the solution
  survives random jitter of the strokes (fairness).
- Persistence: `localStorage` (progress, settings), wrapped in try/catch.
- Debug URL params: `?level=2-4`, `?solve` (draw the reference solution),
  `?go` (auto-start), `?unlock` (unlock all), `?fps`.

// Fuzz the simulation: random strokes of every ink on every level (and dev sandboxes).
// Fails on exceptions, NaN, Wick inside solid terrain for long, or absurd velocities.
import { H, W, WICK_R } from '../src/core/constants';
import { pointInPolygon } from '../src/core/math';
import { Rng } from '../src/core/rng';
import type { InkType, LevelDef } from '../src/core/types';
import { ALL_LEVELS, DEV_WORLDS } from '../src/levels';
import { Simulation } from '../src/sim/simulation';

const N = parseInt(process.argv[2] ?? '40', 10);
const levels: LevelDef[] = [...ALL_LEVELS, ...DEV_WORLDS.flatMap((w) => w.levels)];
let problems = 0;
let runs = 0;
const inks: InkType[] = ['moon', 'spring', 'comet'];

for (const level of levels) {
  const solids = level.terrain.filter((t) => (t.mat ?? 'solid') !== 'hazard');
  for (let trial = 0; trial < N; trial++) {
    const rng = new Rng(trial * 9973 + level.id.length * 31);
    const sim = new Simulation({ ...level, ink: { ...level.ink, budget: 4000, types: inks } });
    const nStrokes = rng.int(1, 6);
    const drawOne = () => {
      const ink = rng.pick(inks);
      const n = rng.int(2, 6);
      let x = rng.range(20, W - 20);
      let y = rng.range(80, H - 20);
      const pts = [{ x, y }];
      for (let i = 1; i < n; i++) {
        x = Math.min(W - 5, Math.max(5, x + rng.range(-220, 220)));
        y = Math.min(H - 5, Math.max(5, y + rng.range(-160, 160)));
        pts.push({ x, y });
      }
      sim.drawStroke(ink, pts);
    };
    for (let i = 0; i < nStrokes; i++) drawOne();
    sim.go();
    let insideFor = 0;
    let maxInside = 0;
    try {
      while (sim.phase === 'running' && sim.time < 40) {
        if (rng.chance(0.004)) drawOne();
        if (rng.chance(0.002)) sim.undo();
        sim.step();
        sim.drainEvents();
        const w = sim.wick;
        if (!Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.vx) || !Number.isFinite(w.vy)) throw new Error(`NaN wick ${JSON.stringify(w)}`);
        if (Math.hypot(w.vx, w.vy) > 3000) throw new Error(`velocity ${w.vx},${w.vy}`);
        const inside = solids.some((t) => pointInPolygon({ x: w.x, y: w.y }, t.pts));
        insideFor = inside ? insideFor + 1 : 0;
        maxInside = Math.max(maxInside, insideFor);
        if (w.x < -WICK_R * 2 || w.x > W + WICK_R * 2) throw new Error(`escaped page x=${w.x}`);
      }
      if (maxInside > 30) throw new Error(`Wick's centre inside terrain for ${maxInside} steps`);
    } catch (e) {
      problems++;
      console.log(`✗ ${level.id} trial ${trial}: ${(e as Error).message}`);
    }
    runs++;
  }
}
console.log(`${runs} fuzz runs, ${problems} problems`);
process.exit(problems ? 1 : 0);

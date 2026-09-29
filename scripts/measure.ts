// Measures signature trajectories so level designers have real numbers.
import type { LevelDef, SolutionStroke } from '../src/core/types';
import { ground, ink } from '../src/levels/builders';
import { Simulation } from '../src/sim/simulation';

function lvl(strokes: SolutionStroke[], groundY = 600, gapFrom = 10000): { sim: Simulation } {
  const terrain = gapFrom < 10000 ? [ground([[0, groundY], [gapFrom, groundY]])] : [ground([[0, groundY], [1280, groundY]])];
  const level = { id: 'm-1', name: 'm', start: { x: 80, y: groundY }, goal: { x: 5000, y: groundY }, ink: { budget: 99999, par: 99999, types: ['moon', 'spring', 'comet'] }, terrain, sparks: [], solution: [] } as unknown as LevelDef;
  const sim = new Simulation(level);
  for (const s of strokes) sim.drawStroke(s.ink, s.pts);
  sim.go();
  return { sim };
}

function flight(label: string, strokes: SolutionStroke[], gapFrom = 10000) {
  const { sim } = lvl(strokes, 600, gapFrom);
  let launched = false, lx = 0, ly = 0, apex = Infinity, landX = NaN;
  for (let i = 0; i < 120 * 8 && sim.phase === 'running'; i++) {
    sim.step();
    for (const e of sim.drainEvents()) {
      if ((e.type === 'bounce' || e.type === 'rush-end') && !launched) { launched = true; lx = sim.wick.x; ly = sim.wick.y; }
      if (e.type === 'land' && launched && isNaN(landX)) landX = sim.wick.x;
    }
    if (launched) apex = Math.min(apex, sim.wick.y);
    if (launched && !isNaN(landX)) break;
  }
  console.log(`${label.padEnd(46)} launch@(${lx.toFixed(0)},${(ly + 16).toFixed(0)} feet)  apex rise ${(ly - apex).toFixed(0)}u  lands x=${isNaN(landX) ? `none (y=${sim.wick.y.toFixed(0)})` : landX.toFixed(0)}  dist ${isNaN(landX) ? '-' : (landX - lx).toFixed(0)}u`);
}

console.log('All flights start from flat ground at y=600 walking right (118 u/s).');
flight('Spring flat (on ground)', [ink('spring', [[300, 604], [420, 604]])]);
for (const deg of [15, 30, 45]) {
  const r = (deg * Math.PI) / 180;
  // A catapult: moon ramp up, then a spring sloping DOWN to the right (its face points forward-up).
  const top = 540;
  const len = 70;
  flight(`Catapult: spring sloping down-right ${deg}°`, [ink('moon', [[220, 604], [300, top + 4]]), ink('spring', [[300, top + 4], [300 + Math.cos(r) * len, top + 4 + Math.sin(r) * len]])]);
}
flight('Spring ramp rising right 30° (face points back!)', [ink('spring', [[300, 604], [300 + 70 * 0.866, 604 - 35]])]);
flight('Comet flat 200u then gap (drop to mist)', [ink('comet', [[200, 604], [400, 604]])], 400);
for (const deg of [20, 35, 50]) {
  const r = (deg * Math.PI) / 180;
  flight(`Comet ramp ${deg}° up (len 160) off the end`, [ink('comet', [[250, 604], [250 + Math.cos(r) * 160, 604 - Math.sin(r) * 160]])]);
}
flight('Comet 200u → flat spring (combo)', [ink('comet', [[150, 604], [350, 604]]), ink('spring', [[352, 604], [440, 604]])]);

import { getLevel } from '../src/levels';
import { Simulation } from '../src/sim/simulation';
const id = process.argv[2] ?? '1-4';
const level = getLevel(id)!;
const sim = new Simulation(level);
for (const s of level.solution) if (s.t === undefined) sim.drawStroke(s.ink, s.pts);
sim.go();
let k = 0;
while (sim.phase === 'running' && sim.time < 40) {
  sim.step();
  const ev = sim.drainEvents().filter(e => e.type !== 'step');
  for (const e of ev) console.log(sim.time.toFixed(2), JSON.stringify(e));
  if (k++ % 60 === 0) { const w = sim.wick; console.log(`t=${sim.time.toFixed(2)} x=${w.x.toFixed(1)} y=${w.y.toFixed(1)} vx=${w.vx.toFixed(0)} vy=${w.vy.toFixed(0)} g=${w.grounded} n=(${w.nx.toFixed(2)},${w.ny.toFixed(2)}) f=${w.facing}`); }
}
console.log(sim.phase, sim.time);

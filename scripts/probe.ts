import { getLevel } from '../src/levels';
import { jitterStrokes, runStrokes } from '../src/sim/runner';
const id = process.argv[2] ?? '1-2';
const J = parseFloat(process.argv[3] ?? '6');
const level = getLevel(id)!;
for (let t = 0; t < 30; t++) {
  const js = jitterStrokes(level.solution, J, 1000 + t * 7919);
  const r = runStrokes(level, js);
  if (!r.won) console.log(t, r.cause, r.x.toFixed(0), r.y.toFixed(0), r.time.toFixed(2), JSON.stringify(js.map(s => s.pts.map(p => [+p.x.toFixed(1), +p.y.toFixed(1)]))));
}

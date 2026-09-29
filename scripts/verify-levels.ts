// Headless level verification: every level must be solvable by its reference solution, meet par,
// require ink, and tolerate a human's imprecision. Run: npm run verify [-- 2-3 ...] [--trials=40]
import { W, H, WICK_R } from '../src/core/constants';
import { pointInPolygon } from '../src/core/math';
import type { LevelDef } from '../src/core/types';
import { ALL_LEVELS } from '../src/levels';
import { jitterStrokes, runStrokes } from '../src/sim/runner';

const args = process.argv.slice(2);
const trialsArg = args.find((a) => a.startsWith('--trials='));
const TRIALS = trialsArg ? parseInt(trialsArg.split('=')[1], 10) : 30;
const only = args.filter((a) => !a.startsWith('--'));
const levels = only.length ? ALL_LEVELS.filter((l) => only.some((o) => l.id === o || l.id.startsWith(o + '-'))) : ALL_LEVELS;

let failures = 0;
const rows: string[] = [];

function check(level: LevelDef): string[] {
  const problems: string[] = [];
  const solids = level.terrain.filter((t) => (t.mat ?? 'solid') !== 'hazard');
  const inside = (x: number, y: number) => solids.some((t) => pointInPolygon({ x, y }, t.pts));

  // Static sanity.
  // Inkpots add ink mid-run, so a level may set par above its starting budget (up to budget + pots).
  const potInk = (level.entities ?? []).reduce((a, e) => a + (e.kind === 'inkpot' ? e.amount : 0), 0);
  if (level.ink.par > level.ink.budget + potInk) problems.push(`par ${level.ink.par} > budget ${level.ink.budget} + inkpots ${potInk}`);
  if (!level.ink.types.length) problems.push('no ink types');
  for (const s of level.solution) if (!level.ink.types.includes(s.ink)) problems.push(`solution uses unavailable ink ${s.ink}`);
  level.sparks.forEach((s, i) => {
    if (inside(s.x, s.y)) problems.push(`spark ${i} inside terrain`);
    if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) problems.push(`spark ${i} off-page`);
  });
  if (inside(level.start.x, level.start.y - WICK_R)) problems.push('start inside terrain');
  if (!inside(level.start.x, level.start.y + 6) && level.autoStart === undefined) problems.push('start not standing on ground');
  if (inside(level.goal.x, level.goal.y - WICK_R)) problems.push('goal inside terrain');
  if (!inside(level.goal.x, level.goal.y + 6)) problems.push('goal lamp not standing on ground');

  // Reference solution.
  const ref = runStrokes(level, level.solution);
  if (!ref.won) problems.push(`solution FAILS (${ref.cause} at ${ref.x.toFixed(0)},${ref.y.toFixed(0)} t=${ref.time.toFixed(1)})`);
  if (ref.won && ref.sparks < ref.totalSparks) problems.push(`solution collects ${ref.sparks}/${ref.totalSparks} sparks`);
  if (ref.inkUsed > level.ink.par + 0.5) problems.push(`solution ink ${ref.inkUsed.toFixed(0)} > par ${level.ink.par}`);

  // Must need ink.
  if (!level.verify?.allowNoInk) {
    const none = runStrokes(level, []);
    if (none.won) problems.push('winnable with NO ink');
  }

  // Robustness to imprecise drawing.
  const J = level.verify?.jitter ?? 6;
  let ok = 0;
  for (let t = 0; t < TRIALS; t++) if (runStrokes(level, jitterStrokes(level.solution, J, 1000 + t * 7919)).won) ok++;
  const robust = ok / TRIALS;
  const need = level.verify?.minRobust ?? 0.6;
  if (robust < need) problems.push(`fragile: ${(robust * 100).toFixed(0)}% of jittered (±${J}) solutions win (< ${need * 100}%)`);

  rows.push(
    `${level.id.padEnd(5)} ${level.name.padEnd(24)} ${ref.won ? 'WIN ' : 'FAIL'} ink ${ref.inkUsed.toFixed(0).padStart(4)}/${String(level.ink.par).padStart(4)}/${String(level.ink.budget).padStart(4)}  sparks ${ref.sparks}/${ref.totalSparks}  t=${ref.time.toFixed(1).padStart(5)}s  robust ${(robust * 100).toFixed(0).padStart(3)}%`,
  );
  return problems;
}

for (const level of levels) {
  const problems = check(level);
  if (problems.length) {
    failures++;
    rows.push(`   ✗ ${problems.join('\n   ✗ ')}`);
  }
}
console.log(rows.join('\n'));
console.log(`\n${levels.length - failures}/${levels.length} levels verified.`);
process.exit(failures ? 1 : 0);

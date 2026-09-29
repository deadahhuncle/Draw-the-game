// Headless helpers: play a level with a given set of strokes and report the outcome.
import { MAX_RUN_TIME } from '../core/constants';
import { Rng } from '../core/rng';
import type { DeathCause, LevelDef, SolutionStroke } from '../core/types';
import { Simulation } from './simulation';

export interface RunResult {
  won: boolean;
  sparks: number;
  totalSparks: number;
  inkUsed: number;
  time: number;
  cause: DeathCause | 'timeout' | null;
  /** Wick's final position (for debugging failures). */
  x: number;
  y: number;
}

export function runStrokes(level: LevelDef, strokes: readonly SolutionStroke[], maxTime = MAX_RUN_TIME): RunResult {
  const sim = new Simulation(level);
  const plan = strokes.filter((s) => s.t === undefined);
  const timed = strokes.filter((s) => s.t !== undefined).sort((a, b) => a.t! - b.t!);
  for (const s of plan) sim.drawStroke(s.ink, s.pts);
  sim.go();
  let i = 0;
  let maxInk = sim.inkUsed;
  while (sim.phase === 'running' && sim.time < maxTime) {
    while (i < timed.length && sim.time >= timed[i].t!) {
      sim.drawStroke(timed[i].ink, timed[i].pts);
      i++;
    }
    maxInk = Math.max(maxInk, sim.inkUsed);
    sim.step();
    sim.drainEvents();
  }
  return {
    won: sim.phase === 'won',
    sparks: sim.sparkCount,
    totalSparks: level.sparks.length,
    inkUsed: Math.max(maxInk, sim.inkUsed),
    time: sim.time,
    cause: sim.phase === 'won' ? null : sim.phase === 'dead' ? sim.deathCause : 'timeout',
    x: sim.wick.x,
    y: sim.wick.y,
  };
}

/** Perturb a solution the way an imprecise human finger would. */
export function jitterStrokes(strokes: readonly SolutionStroke[], amount: number, seed: number): SolutionStroke[] {
  const rng = new Rng(seed);
  return strokes.map((s) => {
    const dx = rng.range(-amount, amount);
    const dy = rng.range(-amount, amount);
    const wob = Math.min(1.5, amount * 0.25);
    return {
      ink: s.ink,
      t: s.t === undefined ? undefined : Math.max(0, s.t + rng.range(-0.12, 0.12)),
      pts: s.pts.map((p) => ({ x: p.x + dx + rng.range(-wob, wob), y: p.y + dy + rng.range(-wob, wob) })),
    };
  });
}

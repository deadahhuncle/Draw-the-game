import { describe, expect, it } from 'vitest';
import { BOUNCE_SPEED, DT, GRAVITY, RUSH_SPEED, WALK_SPEED, WICK_R } from '../src/core/constants';
import type { LevelDef } from '../src/core/types';
import { brambles, ground, ink, type LevelSpec } from '../src/levels/builders';
import { getLevel } from '../src/levels';
import { runStrokes } from '../src/sim/runner';
import { Simulation } from '../src/sim/simulation';

function lvl(spec: Partial<LevelSpec>): LevelDef {
  return {
    id: 't-1',
    name: 'test',
    start: { x: 100, y: 600 },
    goal: { x: 1200, y: 600 },
    ink: { budget: 2000, par: 2000, types: ['moon', 'spring', 'comet'] },
    terrain: [ground([[0, 600], [1280, 600]])],
    sparks: [],
    solution: [],
    ...spec,
  } as LevelDef;
}

function run(sim: Simulation, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && sim.phase === 'running'; i++) sim.step();
}

describe('Wick controller', () => {
  it('walks along flat ground at walk speed', () => {
    const sim = new Simulation(lvl({}));
    sim.go();
    run(sim, 1.5);
    expect(sim.wick.grounded).toBe(true);
    expect(sim.wick.y).toBeCloseTo(600 - WICK_R, 0);
    expect(sim.wick.vx).toBeCloseTo(WALK_SPEED, 0);
  });

  it('falls off a cliff into the mist', () => {
    const sim = new Simulation(lvl({ terrain: [ground([[0, 600], [300, 600]])] }));
    sim.go();
    run(sim, 6);
    expect(sim.phase).toBe('dead');
    expect(sim.deathCause).toBe('fall');
  });

  it('turns around at a drawn wall', () => {
    const sim = new Simulation(lvl({}));
    sim.drawStroke('moon', [
      { x: 300, y: 600 },
      { x: 300, y: 530 },
    ]);
    sim.go();
    run(sim, 3);
    expect(sim.wick.facing).toBe(-1);
    expect(sim.wick.x).toBeLessThan(300);
  });

  it('rolls over small steps instead of turning', () => {
    const sim = new Simulation(lvl({ terrain: [ground([[0, 600], [300, 600], [300, 590], [1280, 590]])] }));
    sim.go();
    run(sim, 4);
    expect(sim.wick.facing).toBe(1);
    expect(sim.wick.x).toBeGreaterThan(400);
  });

  it('bounces off spring ink to the expected height', () => {
    const sim = new Simulation(lvl({}));
    sim.drawStroke('spring', [
      { x: 200, y: 604 },
      { x: 400, y: 604 },
    ]);
    sim.go();
    let minY = Infinity;
    for (let i = 0; i < 400; i++) {
      sim.step();
      minY = Math.min(minY, sim.wick.y);
    }
    const apex = 600 - WICK_R - minY;
    const expected = (BOUNCE_SPEED * BOUNCE_SPEED) / (2 * GRAVITY);
    expect(apex).toBeGreaterThan(expected * 0.85);
    expect(apex).toBeLessThan(expected * 1.1);
  });

  it('comet ink drives Wick in the drawing direction', () => {
    const sim = new Simulation(lvl({ start: { x: 600, y: 600 } }));
    sim.drawStroke('comet', [
      { x: 900, y: 603 },
      { x: 300, y: 603 },
    ]);
    sim.go();
    run(sim, 0.8);
    expect(sim.wick.facing).toBe(-1);
    expect(sim.wick.vx).toBeLessThan(-RUSH_SPEED * 0.9);
  });

  it('dies on brambles', () => {
    const sim = new Simulation(lvl({ terrain: [ground([[0, 600], [1280, 600]]), brambles(400, 500, 600)] }));
    sim.go();
    run(sim, 6);
    expect(sim.phase).toBe('dead');
    expect(sim.deathCause).toBe('hazard');
  });
});

describe('Ink', () => {
  it('stops drawing when the inkwell runs dry, and undo refunds', () => {
    const sim = new Simulation(lvl({ ink: { budget: 100, par: 100, types: ['moon'] } }));
    sim.drawStroke('moon', [
      { x: 300, y: 300 },
      { x: 600, y: 300 },
    ]);
    expect(sim.inkUsed).toBeCloseTo(100, 0);
    expect(sim.inkLeft).toBeCloseTo(0, 0);
    expect(sim.strokes[0].pts.at(-1)!.x).toBeCloseTo(400, 0);
    sim.undo();
    expect(sim.inkUsed).toBe(0);
  });

  it('cannot draw through Wick — the stroke is split', () => {
    const sim = new Simulation(lvl({}));
    sim.drawStroke('moon', [
      { x: 20, y: 584 },
      { x: 200, y: 584 },
    ]);
    expect(sim.strokes.length).toBe(2);
  });

  it('rejects unavailable inks', () => {
    const sim = new Simulation(lvl({ ink: { budget: 500, par: 500, types: ['moon'] } }));
    expect(sim.penDown('spring', { x: 500, y: 300 })).toBe(false);
  });

  it('moth bites split strokes and heal on reset', () => {
    const sim = new Simulation(lvl({}));
    sim.drawStroke('moon', [
      { x: 500, y: 400 },
      { x: 700, y: 400 },
    ]);
    const before = sim.inkUsed;
    sim.biteInk(600, 400, 10);
    expect(sim.strokes[0].bites.length).toBe(1);
    expect(sim.inkUsed).toBe(before);
    sim.reset();
    expect(sim.strokes[0].bites.length).toBe(0);
  });
});

describe('Determinism', () => {
  it('replays a solution identically', () => {
    const level = getLevel('1-4')!;
    const a = runStrokes(level, level.solution);
    const b = runStrokes(level, level.solution);
    expect(a).toEqual(b);
    expect(a.won).toBe(true);
  });

  it('a timed stroke drawn mid-run saves Wick', () => {
    const level = lvl({ terrain: [ground([[0, 600], [400, 600]]), ground([[600, 600], [1280, 600]])] });
    const r = runStrokes(level, [ink('moon', [[380, 604], [620, 604]], 1.0)]);
    expect(r.won).toBe(true);
  });
});

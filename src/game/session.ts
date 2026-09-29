import { DT } from '../core/constants';
import type { InkType, LevelDef, SimEvent, WorldDef } from '../core/types';
import { audio } from '../audio/audio';
import { Renderer } from '../render/renderer';
import type { Insets } from '../render/view';
import { Simulation, type Phase } from '../sim/simulation';
import { haptic } from './haptics';
import { PenInput } from './input';
import { settings } from './settings';

export interface WinInfo {
  sparks: number;
  totalSparks: number;
  ink: number;
  par: number;
  budget: number;
}

export interface SessionHooks {
  onPhase?(phase: Phase): void;
  onEvent?(e: SimEvent): void;
  onWin?(info: WinInfo): void;
  /** Called every frame; cheap. */
  onFrame?(sim: Simulation): void;
}

const DEATH_PAUSE = 1.05;
const WIN_PAUSE = 1.7;

/**
 * Runs one level: fixed-step simulation, rendering with interpolation, pen input, and the
 * plan → run → (win | fail → plan) flow.
 */
export class Session {
  readonly sim: Simulation;
  readonly renderer: Renderer;
  readonly input: PenInput;
  paused = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private phaseT = 0;
  private lastPhase: Phase = 'plan';
  private prevX: number;
  private prevY: number;
  private winSent = false;
  private autoT: number;
  private timed: { ink: InkType; pts: { x: number; y: number }[]; t: number }[] = [];
  private destroyed = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly level: LevelDef,
    readonly world: WorldDef,
    private readonly hooks: SessionHooks = {},
  ) {
    this.sim = new Simulation(level);
    this.renderer = new Renderer(canvas);
    this.renderer.setLevel(this.sim, world.key);
    this.renderer.opts.reducedMotion = settings.get().reducedMotion;
    this.input = new PenInput(canvas, () => this.sim, this.renderer);
    this.prevX = this.sim.wick.x;
    this.prevY = this.sim.wick.y;
    this.autoT = level.autoStart ?? -1;
    audio.setWorld(world.key);
    audio.setMode('plan');
  }

  resize(cssW: number, cssH: number, dpr: number, insets: Insets): void {
    this.renderer.resize(cssW, cssH, dpr, insets);
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.tick(this.paused ? 0 : dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.cancel();
    this.input.destroy();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.input.enabled = !p;
    if (p) this.input.cancel();
  }

  setInk(ink: InkType): void {
    this.input.ink = ink;
  }

  go(): boolean {
    if (this.sim.phase !== 'plan') return false;
    this.input.cancel();
    const ok = this.sim.go();
    if (ok) this.acc = 0;
    return ok;
  }

  /** Stop the run and return to planning (strokes persist). */
  retry(): void {
    if (this.sim.phase === 'plan') return;
    this.input.cancel();
    this.sim.reset();
    this.autoT = this.level.autoStart ?? -1;
  }

  undo(): boolean {
    return this.sim.undo();
  }

  clear(): void {
    this.sim.clearInk();
  }

  /** Show the reference solution as ghost lines. */
  showHint(on: boolean): void {
    this.renderer.hint = on ? this.level.solution.map((s) => ({ ink: s.ink, pts: s.pts })) : null;
  }

  /** Debug: draw the reference solution (timed strokes are drawn during the run). */
  autoSolve(): void {
    this.sim.clearInk();
    this.timed = [];
    for (const s of this.level.solution) {
      if (s.t === undefined) this.sim.drawStroke(s.ink, s.pts);
      else this.timed.push({ ink: s.ink, pts: s.pts, t: s.t });
    }
  }

  private tick(dt: number): void {
    const sim = this.sim;
    if (dt > 0) {
      if (sim.phase === 'plan') {
        sim.idle(dt);
        if (this.autoT >= 0) {
          this.autoT -= dt;
          if (this.autoT <= 0) {
            this.autoT = -1;
            this.go();
          }
        }
      }
      if (sim.phase === 'running') {
        this.acc += dt;
        while (this.acc >= DT && sim.phase === 'running') {
          this.prevX = sim.wick.x;
          this.prevY = sim.wick.y;
          for (let i = this.timed.length - 1; i >= 0; i--) {
            if (sim.time >= this.timed[i].t) {
              sim.drawStroke(this.timed[i].ink, this.timed[i].pts);
              this.timed.splice(i, 1);
            }
          }
          sim.step();
          this.acc -= DT;
        }
      } else {
        this.acc = 0;
        this.prevX = sim.wick.x;
        this.prevY = sim.wick.y;
      }
    }

    // Events → renderer, audio, haptics, UI.
    for (const e of sim.drainEvents()) {
      this.renderer.onEvent(e);
      audio.onEvent(e);
      this.hooks.onEvent?.(e);
      switch (e.type) {
        case 'spark':
        case 'bounce':
          haptic('light');
          break;
        case 'stroke-end':
          haptic('tick');
          break;
        case 'death':
          haptic('double');
          break;
        case 'win':
          haptic('win');
          break;
      }
    }

    // Phase flow.
    if (sim.phase !== this.lastPhase) {
      this.lastPhase = sim.phase;
      this.phaseT = 0;
      this.winSent = false;
      audio.setMode(sim.phase === 'running' ? 'run' : sim.phase === 'won' ? 'win' : 'plan');
      if (sim.phase === 'won') this.input.cancel();
      this.hooks.onPhase?.(sim.phase);
    } else this.phaseT += dt;
    if (sim.phase === 'dead' && this.phaseT >= DEATH_PAUSE) {
      this.retry();
    }
    if (sim.phase === 'won' && !this.winSent && this.phaseT >= WIN_PAUSE) {
      this.winSent = true;
      this.hooks.onWin?.({ sparks: sim.sparkCount, totalSparks: this.level.sparks.length, ink: sim.inkUsed, par: this.level.ink.par, budget: this.level.ink.budget });
    }

    const a = sim.phase === 'running' ? this.acc / DT : 1;
    const wx = this.prevX + (sim.wick.x - this.prevX) * a;
    const wy = this.prevY + (sim.wick.y - this.prevY) * a;
    this.renderer.frame(dt, wx, wy);
    this.hooks.onFrame?.(sim);
  }
}

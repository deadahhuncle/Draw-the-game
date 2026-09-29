// Base class for a world's backdrop + the drifting fog bands used for the mist/void.
import { H } from '../../core/constants';
import { Rng } from '../../core/rng';
import { rgba } from './color';
import { makeCanvas, type Box, type PaintEnv } from './kit';

/** Shared mutable state the Background hands to its scene (survives cache rebuilds). */
export interface SceneState {
  /** Seconds since the finale sunrise began, or -1. */
  finale: number;
  /** Lightning / flash intensity other layers may read (0..1). */
  flash: number;
  /** Count of lightning strikes so far (for thunder hooks). */
  strikes: number;
}

/**
 * A world's backdrop. `paintSky` and `paintFar` run once per level/resize into offscreen caches;
 * the live hooks run every frame and must stay cheap (no gradients in loops, few state changes).
 */
export abstract class Scene {
  /** Keep sky and far layers in separate caches so something can live between them (sun, lightning). */
  split = false;
  constructor(
    protected env: PaintEnv,
    protected state: SceneState,
  ) {}
  /** Sky: gradient, orb, clouds, baked stars. World transform is set. */
  abstract paintSky(ctx: CanvasRenderingContext2D): void;
  /** Far silhouettes + the void base, on a transparent canvas. Must mark `env.sky`. */
  abstract paintFar(ctx: CanvasRenderingContext2D): void;
  /** Called once after painting: create live elements (the skyline is now known). */
  initLive(): void {}
  /** Between the sky and far caches (only meaningful when `split`). */
  liveSky(_ctx: CanvasRenderingContext2D, _t: number, _dt: number, _m: number): void {}
  /** On top of the backdrop, behind the terrain. */
  live(_ctx: CanvasRenderingContext2D, _t: number, _dt: number, _m: number): void {}
  /** In front of everything in the level (mist, weather washes). */
  front(_ctx: CanvasRenderingContext2D, _t: number, _dt: number, _m: number): void {}
  /** The finale can play a sunrise. */
  get hasFinale(): boolean {
    return false;
  }
}

/** Sky gradient from the top of the screen to `horizon`, then flat below. */
export function skyGradient(ctx: CanvasRenderingContext2D, vis: Box, stops: readonly string[], horizon: number, top = vis.y0): void {
  const g = ctx.createLinearGradient(0, top, 0, horizon);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(vis.x0 - 40, vis.y0 - 40, vis.x1 - vis.x0 + 80, vis.y1 - vis.y0 + 80);
}

// ───────────────────────────── fog ─────────────────────────────

/**
 * A horizontally tileable, low-resolution fog texture. Drawn stretched it is naturally soft, and
 * scrolling two of them at different speeds gives slow, cheap, living mist.
 */
export class FogTexture {
  readonly canvas: HTMLCanvasElement;
  constructor(color: string, seed: number, opts: { puffs?: number; alpha?: number } = {}) {
    const W = 256;
    const Hh = 64;
    const c = makeCanvas(W, Hh);
    const g = c.getContext('2d')!;
    const rng = new Rng(seed);
    const puffs = opts.puffs ?? 26;
    const a = opts.alpha ?? 0.5;
    // A soft band: puffs gather in the middle and thin out toward both edges (no hard seams).
    for (let i = 0; i < puffs; i++) {
      const x = rng.range(0, W);
      const y = Hh * (0.5 + (rng.next() + rng.next() - 1) * 0.22);
      const rx = rng.range(24, 60);
      const ry = Math.min(Hh * 0.42, rx * rng.range(0.3, 0.5));
      for (const ox of [-W, 0, W]) {
        g.save();
        g.translate(x + ox, y);
        g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, rgba(color, a * rng.range(0.6, 1)));
        gr.addColorStop(0.5, rgba(color, a * 0.35));
        gr.addColorStop(1, rgba(color, 0));
        g.fillStyle = gr;
        g.fillRect(-rx, -rx, rx * 2, rx * 2);
        g.restore();
      }
    }
    this.canvas = c;
  }

  private pattern: CanvasPattern | null = null;
  private patternCtx: CanvasRenderingContext2D | null = null;

  /**
   * Tile across the visible span via a repeating pattern (seamless, one fill per band).
   * `x` scrolls it, `y` is the band top, `h` its height, `w` the world width of one tile.
   */
  draw(ctx: CanvasRenderingContext2D, vis: Box, x: number, y: number, w: number, h: number, alpha: number): void {
    if (alpha <= 0.01) return;
    if (!this.pattern || this.patternCtx !== ctx) {
      this.pattern = ctx.createPattern(this.canvas, 'repeat-x');
      this.patternCtx = ctx;
    }
    if (!this.pattern) return;
    const sx = w / this.canvas.width;
    const sy = h / this.canvas.height;
    const off = ((x % w) + w) % w;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(vis.x0 - w + off, y);
    ctx.scale(sx, sy);
    ctx.fillStyle = this.pattern;
    ctx.fillRect(0, 0, (vis.x1 - vis.x0 + w * 2) / sx, this.canvas.height);
    ctx.restore();
  }
}

/** A vertical alpha ramp in one colour (1×N canvas, drawn stretched: a gradient without per-frame cost). */
export function rampCanvas(color: string, stops: [number, number][]): HTMLCanvasElement {
  const c = makeCanvas(1, 256);
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [t, a] of stops) gr.addColorStop(t, rgba(color, a));
  g.fillStyle = gr;
  g.fillRect(0, 0, 1, 256);
  return c;
}

/** The standard mist at the bottom of the world: a ramp + two drifting fog bands. */
export class Mist {
  private ramp: HTMLCanvasElement;
  private far: FogTexture;
  private near: FogTexture;
  private solid: string;
  constructor(
    color: string,
    seed: number,
    private opts: { strength?: number; top?: number; speed?: number; near?: string } = {},
  ) {
    const s = opts.strength ?? 1;
    // 320 world units: the ramp over the first ~150, then solid fog baked in (no seams on any screen).
    this.ramp = rampCanvas(color, [
      [0, 0],
      [0.11, 0.2 * s],
      [0.26, 0.62 * s],
      [0.47, 0.92 * s],
      [1, 0.92 * s],
    ]);
    this.solid = rgba(color, 0.92 * s);
    this.far = new FogTexture(color, seed + 1, { alpha: 0.6 * s });
    this.near = new FogTexture(opts.near ?? color, seed + 2, { alpha: 0.75 * s, puffs: 30 });
  }
  draw(ctx: CanvasRenderingContext2D, vis: Box, t: number, m: number, alpha = 1): void {
    const top = this.opts.top ?? H - 58;
    const sp = (this.opts.speed ?? 1) * (0.25 + 0.75 * m);
    const bottom = Math.max(vis.y1 + 4, H + 40);
    // The ramp is anchored in world units (not stretched to the screen), then the abyss is solid fog.
    const rampH = 320;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.ramp, vis.x0 - 4, top, vis.x1 - vis.x0 + 8, rampH);
    if (bottom > top + rampH) {
      ctx.fillStyle = this.solid;
      ctx.fillRect(vis.x0 - 4, top + rampH, vis.x1 - vis.x0 + 8, bottom - top - rampH);
    }
    ctx.globalAlpha = 1;
    this.far.draw(ctx, vis, t * 7 * sp, top - 30, 760, 110, 0.85 * alpha);
    this.near.draw(ctx, vis, -t * 11 * sp + 300, top + 16, 560, 100, 0.95 * alpha);
    if (bottom > H + 90) this.far.draw(ctx, vis, t * 5 * sp + 120, H + 50, 700, 120, 0.5 * alpha);
  }
}

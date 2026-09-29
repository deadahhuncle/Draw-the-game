import { W } from '../core/constants';
import { pointInPolygon } from '../core/math';
import { Rng } from '../core/rng';
import type { LevelDef, WorldKey } from '../core/types';
import { levelIndexInWorld } from '../levels/index';
import { PALETTES, type Palette } from './palettes';
import type { View } from './view';
import { makeCanvas } from './world/kit';
import { Skyline, type PaintEnv } from './world/kit';
import type { Scene, SceneState } from './world/scene';
import { createScene } from './world/worlds';

export { makeCanvas };

export interface BackgroundOptions {
  world?: WorldKey;
  level?: LevelDef;
}

/** Background caches never need more than 2× — they are soft and hazy by design. */
const MAX_BG_RES = 2;

/**
 * The world behind the level: sky, far ink-wash layers and the void, pre-rendered per level/resize
 * into offscreen caches; the world's scene adds cheap live touches (stars, motes, birds, rain,
 * lightning, river shimmer) on top, and mist in front of everything via `drawFront`.
 */
export class Background {
  private sky: HTMLCanvasElement | null = null;
  private far: HTMLCanvasElement | null = null;
  private scene: Scene | null = null;
  private built = { w: 0, h: 0, dpr: 0, scale: 0, ox: 0, oy: 0 };
  private dirty = true;
  private world: WorldKey;
  private progress = 0;
  private finale = false;
  private state: SceneState = { finale: -1, flash: 0, strikes: 0 };
  private strikesSeen = 0;
  /** Optional hook: a lightning strike just happened (strength 0..1) — e.g. for thunder. */
  onLightning: ((strength: number) => void) | null = null;
  private winClock = -1;
  private openings: [number, number][] = [];
  private solids: { x0: number; y0: number; x1: number; y1: number }[] = [];

  constructor(
    private palette: Palette,
    private seed: number,
    opts: BackgroundOptions = {},
  ) {
    this.world = opts.world ?? worldForPalette(palette);
    if (opts.level) this.setLevel(opts.level);
  }

  setPalette(p: Palette, seed: number): void {
    this.palette = p;
    this.seed = seed;
    this.world = worldForPalette(p);
    this.dirty = true;
  }

  /** Where this level sits in its world (drives the dawn in Daybreak, finale sunrise on the last lamp). */
  setLevel(level: LevelDef): void {
    this.openings = findOpenings(level);
    this.solids = level.terrain.map((t) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const q of t.pts) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x);
        y1 = Math.max(y1, q.y);
      }
      return { x0, y0, x1, y1 };
    });
    try {
      const { index, count } = levelIndexInWorld(level);
      this.progress = count > 1 ? Math.max(0, index) / (count - 1) : 0.35;
      this.finale = this.world === 'daybreak' && index >= 0 && index === count - 1;
    } catch {
      this.progress = 0;
      this.finale = false;
    }
    this.dirty = true;
  }

  /** Lightning intensity right now (0..1) — for anything that wants to react (audio, UI). */
  get flash(): number {
    return this.state.flash;
  }

  /** True when this level's win plays the dawn. */
  get isFinale(): boolean {
    return this.finale;
  }

  /** Called by the renderer when the lamp is lit. Plays the sunrise on the journey's last lamp. */
  onWin(): void {
    if (this.finale && this.winClock < 0) this.winClock = 0;
  }

  /** Called on retry/reset. */
  onReset(): void {
    this.winClock = -1;
    this.state.finale = -1;
  }

  private build(view: View): void {
    const r = Math.min(view.dpr, MAX_BG_RES);
    const cw = Math.max(1, Math.round(view.cssW * r));
    const ch = Math.max(1, Math.round(view.cssH * r));
    const v = view.visible;
    const vis = { x0: v.x0 - 24, y0: v.y0 - 24, x1: v.x1 + 24, y1: v.y1 + 24 };
    const env: PaintEnv = {
      vis,
      rng: new Rng(this.seed ^ 0x5eed),
      p: this.palette,
      seed: this.seed,
      progress: this.progress,
      sky: new Skyline(vis.x0 - 50, vis.x1 + 50),
      px: r * view.scale,
      finale: this.finale,
      openings: this.openings,
      solids: this.solids,
    };
    const scene = createScene(this.world, env, this.state);
    const k = r * view.scale;
    const apply = (c: CanvasRenderingContext2D) => c.setTransform(k, 0, 0, k, view.ox * r, view.oy * r);

    const sky = makeCanvas(cw, ch);
    const sctx = sky.getContext('2d')!;
    apply(sctx);
    scene.paintSky(sctx);

    const far = makeCanvas(cw, ch);
    const fctx = far.getContext('2d')!;
    apply(fctx);
    scene.paintFar(fctx);

    if (scene.split) {
      this.far = far;
    } else {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.drawImage(far, 0, 0);
      this.far = null;
      far.width = far.height = 1;
    }
    this.sky = sky;
    scene.initLive();
    this.scene = scene;
  }

  draw(ctx: CanvasRenderingContext2D, view: View, time: number, dt: number, motion: number): void {
    const b = this.built;
    // Rebuild on real layout changes only (the renderer nudges ox/oy by a few px for camera shake).
    if (this.dirty || !this.sky || !this.scene || b.w !== view.cssW || b.h !== view.cssH || b.dpr !== view.dpr || Math.abs(b.scale - view.scale) > 1e-5 || Math.abs(b.ox - view.ox) > 12 || Math.abs(b.oy - view.oy) > 12) {
      this.build(view);
      this.built = { w: view.cssW, h: view.cssH, dpr: view.dpr, scale: view.scale, ox: view.ox, oy: view.oy };
      this.dirty = false;
    }
    if (this.winClock >= 0) {
      this.winClock += dt;
      this.state.finale = this.winClock;
    }
    const scene = this.scene!;
    const pw = Math.round(view.cssW * view.dpr);
    const ph = Math.round(view.cssH * view.dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.sky!, 0, 0, pw, ph);
    view.apply(ctx);
    scene.liveSky(ctx, time, dt, motion);
    if (this.far) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.far, 0, 0, pw, ph);
      view.apply(ctx);
    }
    scene.live(ctx, time, dt, motion);
    if (this.state.strikes !== this.strikesSeen) {
      this.strikesSeen = this.state.strikes;
      this.onLightning?.(motion > 0.5 ? 1 : 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Mist, weather and light washes in front of the level. Call after entities, before particles/UI. */
  drawFront(ctx: CanvasRenderingContext2D, view: View, time: number, dt: number, motion: number): void {
    if (!this.scene) return;
    view.apply(ctx);
    this.scene.front(ctx, time, dt, motion);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Columns of the page where nothing solid covers the lower world: where the void shows. */
function findOpenings(level: LevelDef): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  const step = 16;
  for (let x = 0; x <= W; x += step) {
    const open = !level.terrain.some((t) => t.mat !== 'hazard' && (pointInPolygon({ x, y: 660 }, t.pts) || pointInPolygon({ x, y: 700 }, t.pts)));
    if (open && start < 0) start = x;
    if ((!open || x + step > W) && start >= 0) {
      out.push([start, open ? x : x - step]);
      start = -1;
    }
  }
  return out;
}

function worldForPalette(p: Palette): WorldKey {
  for (const k of Object.keys(PALETTES) as WorldKey[]) if (PALETTES[k] === p) return k;
  return 'dusk';
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export const WORLD_W = W;

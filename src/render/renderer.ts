import { H, W, WICK_R } from '../core/constants';
import { hashString } from '../core/rng';
import type { SimEvent, WorldKey } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { Background, makeCanvas } from './background';
import { drawEntity } from './entities';
import { InkLayer } from './ink';
import { Lighting } from './lighting';
import { INK_COLORS, PALETTES, type Palette } from './palettes';
import { Particles } from './particles';
import { drawGhost, drawLamp, drawNib, drawNoInk, drawNote, drawSpark, hexA } from './props';
import { TerrainLayer } from './terrain';
import { View, type Insets } from './view';
import { WickArt } from './wick';
import type { InkType } from '../core/types';
import type { Vec } from '../core/math';

export interface RenderOptions {
  reducedMotion: boolean;
}

/** Pen feedback from the input layer, for the nib cursor. */
export interface PenCursor {
  x: number;
  y: number;
  ink: InkType;
  down: boolean;
  blocked: boolean;
}

/**
 * Draws one level. Owns the per-level caches (background, terrain, ink), cosmetic animation state
 * (Wick's face, particles, lamp ignition, camera shake) and reacts to sim events.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly view = new View();
  readonly fx = new Particles();
  readonly wickArt = new WickArt();
  palette: Palette = PALETTES.dusk;
  worldKey: WorldKey = 'dusk';
  opts: RenderOptions = { reducedMotion: false };
  /** Menu backdrops hide tutorial notes, ghosts and the pen. */
  backdrop = false;
  /** Hint ghost strokes to show (reference solution), or null. */
  hint: { ink: InkType; pts: Vec[] }[] | null = null;
  pen: PenCursor | null = null;

  private sim: Simulation | null = null;
  private bg: Background | null = null;
  private terrain: TerrainLayer | null = null;
  private ink = new InkLayer();
  private lighting = new Lighting();
  private vignette: HTMLCanvasElement | null = null;
  private grain: CanvasPattern | null = null;
  private time = 0;
  private shake = 0;
  private lampLit = 0;
  private flash = 0;
  private sparkPop: number[] = [];
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  setLevel(sim: Simulation, worldKey: WorldKey): void {
    this.sim = sim;
    this.worldKey = worldKey;
    this.palette = PALETTES[worldKey];
    this.bg = new Background(this.palette, hashString(sim.level.id));
    this.terrain = new TerrainLayer(sim.level, this.palette);
    this.ink = new InkLayer();
    this.fx.clear();
    this.lampLit = 0;
    this.flash = 0;
    this.hint = null;
    this.sparkPop = sim.level.sparks.map(() => 0);
  }

  resize(cssW: number, cssH: number, dpr: number, insets: Insets): void {
    this.insets = insets;
    const cw = Math.max(1, Math.round(cssW * dpr));
    const ch = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.view.update(cssW, cssH, dpr, insets);
    this.vignette = null;
  }

  get currentInsets(): Insets {
    return this.insets;
  }

  onEvent(e: SimEvent): void {
    const fx = this.fx;
    const p = this.palette;
    this.wickArt.onEvent(e);
    const motion = this.opts.reducedMotion ? 0.3 : 1;
    switch (e.type) {
      case 'spark':
        fx.burst(22, e.x, e.y, { kind: 'spark', color: p.accent, speed: 220, max: 0.9, size: 4, drag: 3, g: 60 });
        fx.emit({ kind: 'ring', x: e.x, y: e.y, size: 6, grow: 120, max: 0.5, color: '#FFF3D0' });
        this.sparkPop[e.index] = 1;
        break;
      case 'bounce':
        fx.emit({ kind: 'ring', x: e.x, y: e.y, size: 8, grow: 140, max: 0.45, color: INK_COLORS.spring.halo });
        fx.burst(10, e.x, e.y, { kind: 'dot', color: INK_COLORS.spring.core, speed: 160, max: 0.5, size: 2, angle: Math.atan2(e.ny, e.nx), spread: 2 });
        break;
      case 'land':
        if (e.speed > 250) {
          fx.burst(Math.min(14, Math.round(e.speed / 60)), e.x, e.y, { kind: 'smoke', color: 'rgba(230,220,210,0.5)', additive: false, speed: 70, angle: -Math.PI / 2, spread: 2.6, max: 0.6, size: 3, grow: 6, drag: 4 });
          this.shake = Math.max(this.shake, Math.min(4, e.speed / 250) * motion);
        }
        break;
      case 'rush-start':
        fx.burst(12, e.x, e.y + WICK_R, { kind: 'streak', color: INK_COLORS.comet.halo, speed: 200, max: 0.4, size: 1.5, angle: Math.atan2(-e.dy, -e.dx), spread: 0.8 });
        break;
      case 'death':
        if (e.cause === 'fall') {
          fx.burst(20, e.x, Math.min(e.y, H + 10), { kind: 'dot', color: p.accent, speed: 120, angle: -Math.PI / 2, spread: 1.4, max: 1, size: 2, g: 120 });
        } else {
          fx.burst(26, e.x, e.y, { kind: 'smoke', color: 'rgba(200,190,200,0.55)', additive: false, speed: 60, max: 1.2, size: 4, grow: 10, drag: 2, g: -30 });
          fx.burst(16, e.x, e.y - 12, { kind: 'dot', color: '#FF9A3C', speed: 140, max: 0.7, size: 2, g: 200 });
        }
        this.shake = Math.max(this.shake, 6 * motion);
        break;
      case 'win':
        this.flash = 1;
        fx.burst(40, e.x + 18, e.y - 54, { kind: 'spark', color: p.accent, speed: 260, max: 1.6, size: 4, drag: 1.5, g: -20 });
        fx.emit({ kind: 'ring', x: e.x + 18, y: e.y - 54, size: 10, grow: 400, max: 0.9, color: '#FFF3D0' });
        for (let i = 0; i < 18; i++) fx.emit({ kind: 'petal', x: e.x + 18 + (Math.random() - 0.5) * 80, y: e.y - 40, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 60, max: 2.5 + Math.random() * 1.5, size: 3, color: hexA(p.accent, 0.9), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, drag: 0.5 });
        break;
      case 'stroke-cut':
        fx.burst(6, e.x, e.y, { kind: 'dot', color: 'rgba(255,140,140,0.9)', speed: 60, max: 0.35, size: 1.6 });
        break;
      case 'ink-dry':
        fx.burst(10, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.halo, speed: 90, max: 0.5, size: 1.6, g: 200 });
        break;
      case 'inkpot':
        fx.burst(24, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.halo, speed: 180, max: 0.8, size: 2.2, drag: 2 });
        break;
      case 'rain-hit':
        fx.burst(8, e.x, e.y, { kind: 'dot', color: 'rgba(200,225,255,0.9)', speed: 80, max: 0.4, size: 1.4, g: 300 });
        break;
      case 'splash':
        if (Math.random() < 0.5) fx.burst(2, e.x, e.y, { kind: 'dot', color: 'rgba(200,225,255,0.7)', speed: 50, angle: -Math.PI / 2, spread: 2.2, max: 0.25, size: 1.1, g: 400 });
        break;
      case 'moth-bite':
        fx.burst(5, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.halo, speed: 50, max: 0.5, size: 1.5, g: 90 });
        break;
      case 'wisp-lit':
        fx.burst(18, e.x, e.y, { kind: 'spark', color: p.accent, speed: 150, max: 0.8, size: 3, drag: 2 });
        break;
      case 'crumble':
        fx.burst(18, e.x, e.y, { kind: 'petal', color: 'rgba(217,201,168,0.95)', additive: false, speed: 80, max: 1.4, size: 4, g: 500 });
        break;
      case 'reset':
        this.sparkPop = this.sparkPop.map(() => 0);
        this.lampLit = 0;
        break;
    }
  }

  /** Draw one frame. `wx, wy` = interpolated Wick position. */
  frame(dt: number, wx: number, wy: number): void {
    const sim = this.sim;
    if (!sim || !this.bg || !this.terrain) return;
    const ctx = this.ctx;
    const view = this.view;
    const p = this.palette;
    const motion = this.opts.reducedMotion ? 0 : 1;
    this.time += dt;
    const time = this.time;
    this.fx.update(dt);
    this.wickArt.update(dt, sim);
    if (sim.phase === 'won') this.lampLit = Math.min(1, this.lampLit + dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (let i = 0; i < this.sparkPop.length; i++) this.sparkPop[i] = Math.max(0, this.sparkPop[i] - dt * 3);

    // Camera shake (applied by nudging the view offsets for this frame).
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 18);
    view.ox += shx;
    view.oy += shy;

    this.bg.draw(ctx, view, time, dt, motion || 0.25);
    this.terrain.draw(ctx, view);
    view.apply(ctx);

    drawNoInk(ctx, sim.level, time);
    for (const e of sim.entities) drawEntity(ctx, e, sim, time, p, 'back');

    // Tutorial notes & ghosts (plan mode).
    const planA = sim.phase === 'plan' && !this.backdrop ? 1 : 0.0;
    for (const n of sim.level.notes ?? []) {
      const show = n.planOnly === false ? 1 : planA;
      if (show > 0) drawNote(ctx, n, p, 0.9 * show);
    }
    if (planA > 0 && sim.strokes.length === 0) for (const g of sim.level.ghosts ?? []) drawGhost(ctx, g.pts, g.ink ?? 'moon', time, 0.7);
    if (this.hint) for (const g of this.hint) drawGhost(ctx, g.pts, g.ink, time, 0.85);

    // Lamp.
    drawLamp(ctx, sim.level.goal.x, sim.level.goal.y, this.lampLit, time, p);

    // Sparks.
    sim.level.sparks.forEach((sp, i) => {
      if (!sim.sparks[i]) drawSpark(ctx, sp.x, sp.y, time, p, 1, i);
    });

    this.ink.draw(ctx, view, sim, time);
    view.apply(ctx);

    this.wickArt.lookAt = this.pen?.down ? { x: this.pen.x, y: this.pen.y } : null;
    if (sim.phase !== 'dead' || sim.deathCause !== 'fall') this.wickArt.draw(ctx, sim, wx, wy, time);

    for (const e of sim.entities) drawEntity(ctx, e, sim, time, p, 'front');

    // Mist at the bottom of the world.
    const vis = view.visible;
    const mg = ctx.createLinearGradient(0, H - 40, 0, H + 90);
    mg.addColorStop(0, 'rgba(0,0,0,0)');
    mg.addColorStop(1, p.mist);
    ctx.fillStyle = mg;
    ctx.fillRect(vis.x0, H - 40, vis.x1 - vis.x0, vis.y1 - H + 40);

    this.fx.draw(ctx);

    if (sim.level.dark) this.lighting.draw(ctx, view, sim, wx, wy, this.lampLit, time);

    view.apply(ctx);
    if (this.pen) drawNib(ctx, this.pen.x, this.pen.y, this.pen.ink, this.pen.blocked, time);

    this.post(ctx);
    view.ox -= shx;
    view.oy -= shy;
    void W;
  }

  private post(ctx: CanvasRenderingContext2D): void {
    const { cssW, cssH, dpr } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) {
      const c = makeCanvas(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)));
      const v = c.getContext('2d')!;
      const r = Math.hypot(c.width, c.height) / 2;
      const g = v.createRadialGradient(c.width / 2, c.height / 2, r * 0.45, c.width / 2, c.height / 2, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      v.fillStyle = g;
      v.fillRect(0, 0, c.width, c.height);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0);
    if (!this.grain) {
      const n = makeCanvas(128, 128);
      const g = n.getContext('2d')!;
      const img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 16;
      }
      g.putImageData(img, 0, 0);
      this.grain = ctx.createPattern(n, 'repeat');
    }
    if (this.grain) {
      const ox = Math.floor(Math.random() * 128);
      const oy = Math.floor(Math.random() * 128);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this.grain;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillRect(0, 0, this.canvas.width + 128, this.canvas.height + 128);
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,240,210,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

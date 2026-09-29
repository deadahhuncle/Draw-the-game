import { H, W, WICK_R } from '../core/constants';
import { hashString } from '../core/rng';
import type { InkType, SimEvent, WorldKey } from '../core/types';
import type { Vec } from '../core/math';
import type { Simulation } from '../sim/simulation';
import { Background, makeCanvas } from './background';
import { drawEntity } from './entities';
import { InkLayer } from './ink';
import { Lighting } from './lighting';
import { INK_COLORS, PALETTES, type Palette } from './palettes';
import { Particles, glowSprite, starSprite } from './particles';
import { LAMP_DX, LAMP_DY, drawGhost, drawLamp, drawNib, drawNoInk, drawNote, drawSpark, hexA, noteDuration } from './props';
import { TerrainLayer } from './terrain';
import { View, type Insets } from './view';
import { WickArt } from './wick';

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

/** Something flying from the level to a HUD counter (a collected spark, an inkpot's ink). */
interface Homing {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  color: string;
  star: boolean;
  lx: number;
  ly: number;
  index: number;
}

const IGNITE_DELAY = 0.12;
const LEAP_DUR = 0.42;
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * Draws one level. Owns the per-level caches (background, terrain, ink), cosmetic animation state
 * (Wick, particles, lamp ignition, camera) and reacts to sim events. The world is always drawn in
 * layout space; the camera (lamp push-in, shake) is a CSS transform on the canvas, so static caches
 * never rebuild and `view.toWorld` keeps input mapping exact.
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
  /**
   * Optional hook: a collected spark (`'spark'`, its index) or an inkpot's ink (`'ink'`) has just
   * streaked into its HUD counter — lets the HUD light up on arrival rather than on pickup.
   */
  onArrive: ((kind: 'spark' | 'ink', index: number) => void) | null = null;

  private sim: Simulation | null = null;
  private bg: Background | null = null;
  private terrain: TerrainLayer | null = null;
  private ink = new InkLayer();
  private lighting = new Lighting();
  private post: HTMLCanvasElement | null = null;
  private camCss = '';
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private time = 0;
  // camera
  private shakeAmp = 0;
  private zoom = 1;
  // lamp & win
  private lampLit = 0;
  private flare = 0;
  private winT = -1;
  private leap: { x0: number; y0: number; t: number } | null = null;
  private ignitedT = -1;
  private bloom = 0;
  // failure
  private deathT = -1;
  private deathCause = '';
  // notes & ghosts
  private noteClock = 0;
  private notesWritten = false;
  private planA = 1;
  private ghostA = 1;
  // pen trail
  private penX = NaN;
  private penY = NaN;
  private homing: Homing[] = [];
  private lastPhase = '';

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    // The canvas is shared by every session: start from an identity camera.
    canvas.style.transform = '';
    if (import.meta.env?.DEV) (window as unknown as { __inklight?: Renderer }).__inklight = this;
  }

  setLevel(sim: Simulation, worldKey: WorldKey): void {
    this.sim = sim;
    this.worldKey = worldKey;
    this.palette = PALETTES[worldKey];
    this.bg = new Background(this.palette, hashString(sim.level.id), { world: worldKey, level: sim.level });
    this.terrain = new TerrainLayer(sim.level, this.palette);
    this.ink = new InkLayer();
    this.fx.clear();
    this.hint = null;
    this.homing.length = 0;
    this.noteClock = 0;
    this.notesWritten = false;
    this.planA = 1;
    this.ghostA = 1;
    this.resetWin();
    this.deathT = -1;
    this.shakeAmp = 0;
    this.view.resetCamera();
    this.zoom = 1;
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
    this.post = null;
  }

  get currentInsets(): Insets {
    return this.insets;
  }

  /** Lantern centre of the home-lamp (world). */
  private get lantern(): Vec {
    const g = this.sim!.level.goal;
    return { x: g.x + LAMP_DX, y: g.y + LAMP_DY };
  }

  private resetWin(): void {
    this.lampLit = 0;
    this.flare = 0;
    this.winT = -1;
    this.leap = null;
    this.ignitedT = -1;
    this.bloom = 0;
  }

  private addShake(css: number): void {
    if (this.opts.reducedMotion) return;
    this.shakeAmp = Math.min(6, Math.max(this.shakeAmp, css));
  }

  onEvent(e: SimEvent): void {
    const fx = this.fx;
    const p = this.palette;
    const sim = this.sim;
    this.wickArt.onEvent(e);
    if (sim) {
      if (e.type === 'undo') this.dissolve(e.id);
      else if (e.type === 'clear') for (const s of sim.strokes) this.dissolve(s.id);
      this.ink.onEvent(e, sim);
    }
    switch (e.type) {
      case 'go': {
        const w = sim?.wick;
        if (w) {
          fx.emit({ kind: 'ring', x: w.x, y: w.y + WICK_R, size: 6, grow: 90, max: 0.45, color: hexA(p.accent, 0.8), alpha: 0.7 });
          fx.burst(8, w.x, w.y - WICK_R - 8, { kind: 'spark', color: '#FFD9A0', speed: 90, angle: -Math.PI / 2, spread: 2.2, max: 0.6, size: 1.6, drag: 3, g: 40 });
        }
        break;
      }
      case 'spark': {
        fx.emit({ kind: 'glow', x: e.x, y: e.y, size: 46, grow: 40, max: 0.35, color: '#FFF1CC' });
        fx.burst(16, e.x, e.y, { kind: 'spark', color: p.accent, speed: 230, max: 0.8, size: 2.4, drag: 3.5, g: 50 });
        fx.burst(10, e.x, e.y, { kind: 'dot', color: '#FFF6DC', speed: 150, max: 0.5, size: 1.3, drag: 3 });
        fx.emit({ kind: 'ring', x: e.x, y: e.y, size: 8, grow: 130, max: 0.45, color: '#FFF3D0' });
        const tgt = this.hudTarget('.hud-spark', e.index) ?? { x: W - 60 - (e.total - 1 - e.index) * 26, y: -26 };
        this.homing.push({ x0: e.x, y0: e.y, x1: tgt.x, y1: tgt.y, t: 0, dur: 0.62, color: p.accent, star: true, lx: e.x, ly: e.y, index: e.index });
        break;
      }
      case 'bounce': {
        const c = INK_COLORS.spring;
        const a = Math.atan2(e.ny, e.nx);
        fx.emit({ kind: 'glow', x: e.x, y: e.y, size: 26, grow: 30, max: 0.25, color: c.halo });
        fx.emit({ kind: 'ring', x: e.x, y: e.y, size: 6, grow: 150, max: 0.4, color: c.halo });
        fx.burst(12, e.x, e.y, { kind: 'spark', color: c.halo, speed: 170, max: 0.55, size: 1.5, angle: a, spread: 2.2, drag: 2.5 });
        this.addShake(Math.min(1.6, e.speed / 700));
        break;
      }
      case 'land':
        if (e.speed > 220) {
          const n = Math.min(12, Math.round(e.speed / 70));
          const dust = hexA(p.rim, 0.35);
          for (const dir of [-1, 1]) {
            fx.burst(Math.ceil(n / 2), e.x + dir * 8, e.y - 2, { kind: 'smoke', color: dust, speed: 40 + e.speed * 0.06, angle: dir > 0 ? -0.25 : Math.PI + 0.25, spread: 0.6, max: 0.55, size: 3, grow: 12, drag: 5, g: -10 });
          }
          fx.burst(Math.ceil(n / 2), e.x, e.y - 1, { kind: 'dot', color: hexA(p.rim, 0.7), speed: 70, angle: -Math.PI / 2, spread: 2.4, max: 0.45, size: 0.9, g: 300 });
          this.addShake(Math.min(2.2, (e.speed - 220) / 380));
        }
        break;
      case 'step':
        if (Math.random() < 0.35) fx.burst(1, e.x, e.y - 1, { kind: 'dot', color: hexA(p.rim, 0.5), speed: 30, angle: -Math.PI / 2, spread: 2, max: 0.35, size: 0.8, g: 200 });
        break;
      case 'rush-start':
        fx.burst(12, e.x, e.y + WICK_R * 0.5, { kind: 'streak', color: INK_COLORS.comet.halo, speed: 220, max: 0.4, size: 1.4, angle: Math.atan2(-e.dy, -e.dx), spread: 0.9 });
        fx.emit({ kind: 'glow', x: e.x, y: e.y, size: 30, grow: 20, max: 0.3, color: INK_COLORS.comet.halo });
        break;
      case 'death':
        this.deathT = 0;
        this.deathCause = e.cause;
        this.onDeath(e.cause, e.x, e.y);
        break;
      case 'win':
        this.bg?.onWin();
        this.winT = 0;
        fx.burst(10, e.x, e.y - 30, { kind: 'spark', color: '#FFE6B0', speed: 120, max: 0.7, size: 1.8, drag: 2, g: -30, radius: 12 });
        break;
      case 'stroke-begin':
        fx.emit({ kind: 'ring', x: e.x, y: e.y, size: 3, grow: 60, max: 0.3, color: INK_COLORS[e.ink].halo, alpha: 0.8 });
        break;
      case 'stroke-end': {
        const s = sim?.strokes.find((q) => q.id === e.id);
        if (s && s.pts.length && sim) {
          const q = s.pts[s.pts.length - 1];
          const planning = sim.phase === 'plan';
          if (planning || sim.wick.grounded) this.wickArt.glanceAt(q.x, q.y, 0.9, planning && Math.random() < 0.4);
        }
        break;
      }
      case 'stroke-cut':
        fx.burst(7, e.x, e.y, { kind: 'dot', color: 'rgba(255,130,140,0.95)', speed: 70, max: 0.4, size: 1.3, g: 60 });
        fx.emit({ kind: 'smoke', x: e.x, y: e.y, size: 4, grow: 16, max: 0.4, color: 'rgba(255,150,160,0.35)' });
        break;
      case 'ink-dry':
        fx.burst(10, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.core, speed: 90, max: 0.6, size: 1.4, g: 260 });
        fx.emit({ kind: 'smoke', x: e.x, y: e.y, size: 3, grow: 18, max: 0.5, color: 'rgba(200,210,230,0.35)', vy: -20 });
        break;
      case 'inkpot': {
        fx.emit({ kind: 'glow', x: e.x, y: e.y, size: 36, grow: 30, max: 0.35, color: INK_COLORS.moon.halo });
        fx.burst(18, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.halo, speed: 170, max: 0.7, size: 1.8, drag: 2 });
        const tgt = this.hudTarget('.meter-ember', 0) ?? { x: W * 0.6, y: -26 };
        this.homing.push({ x0: e.x, y0: e.y, x1: tgt.x, y1: tgt.y, t: 0, dur: 0.7, color: INK_COLORS.moon.halo, star: false, lx: e.x, ly: e.y, index: 0 });
        break;
      }
      case 'rain-hit': {
        fx.burst(8, e.x, e.y, { kind: 'dot', color: 'rgba(200,225,255,0.9)', speed: 80, max: 0.4, size: 1.2, g: 300 });
        const hx = this.wickArt.head.x;
        const hy = this.wickArt.head.y;
        fx.burst(4, hx, hy - 4, { kind: 'smoke', color: 'rgba(210,220,235,0.4)', speed: 25, angle: -Math.PI / 2, spread: 1.2, max: 0.7, size: 2.5, grow: 10, g: -40, sway: 20 });
        break;
      }
      case 'splash':
        if (Math.random() < 0.5) fx.burst(2, e.x, e.y, { kind: 'dot', color: 'rgba(200,225,255,0.7)', speed: 50, angle: -Math.PI / 2, spread: 2.2, max: 0.25, size: 1.1, g: 400 });
        break;
      case 'moth-bite':
        fx.burst(5, e.x, e.y, { kind: 'dot', color: INK_COLORS.moon.halo, speed: 50, max: 0.5, size: 1.4, g: 90 });
        break;
      case 'wisp-lit':
        fx.emit({ kind: 'glow', x: e.x, y: e.y, size: 40, grow: 30, max: 0.4, color: p.accent });
        fx.burst(18, e.x, e.y, { kind: 'spark', color: p.accent, speed: 150, max: 0.8, size: 2, drag: 2 });
        break;
      case 'crumble':
        fx.burst(18, e.x, e.y, { kind: 'confetti', color: '#E4D4B2', color2: '#B89C74', speed: 80, max: 1.4, size: 3.2, g: 500, vr: 6 });
        break;
      case 'reset':
        this.bg?.onReset();
        this.resetWin();
        this.deathT = -1;
        if (sim) {
          const s = sim.level.start;
          fx.emit({ kind: 'glow', x: s.x, y: s.y - WICK_R, size: 30, grow: 50, max: 0.45, color: '#FFD9A0' });
          fx.emit({ kind: 'ring', x: s.x, y: s.y - WICK_R, size: 20, grow: -30, max: 0.35, color: '#FFE6BE', alpha: 0.6 });
        }
        break;
    }
  }

  /** Per-cause failure beats. */
  private onDeath(cause: string, x: number, y: number): void {
    const fx = this.fx;
    if (cause === 'hazard') {
      // Pop! Paper confetti, embers and a lost little flame.
      fx.emit({ kind: 'glow', x, y, size: 60, grow: 50, max: 0.28, color: '#FFD0A0' });
      fx.emit({ kind: 'ring', x, y, size: 8, grow: 150, max: 0.35, color: '#FFE2C0', alpha: 0.8 });
      // Paper scraps burst up, then flutter down.
      fx.burst(30, x, y, { kind: 'confetti', color: '#FFF1D6', color2: '#E9A864', speed: 300, angle: -Math.PI / 2, spread: 3.4, max: 1.7, size: 3.4, g: 460, drag: 2.4, vr: 10, radius: 7, sway: 34 });
      fx.burst(6, x, y, { kind: 'confetti', color: '#2A1A10', color2: '#4A3020', speed: 220, angle: -Math.PI / 2, spread: 2.6, max: 1.4, size: 2.2, g: 520, drag: 2, vr: 12 });
      fx.burst(16, x, y - 8, { kind: 'ember', color: '#FF9A3C', speed: 220, angle: -Math.PI / 2, spread: 2.6, max: 1, size: 1.4, g: 120, drag: 2 });
      // The little flame, lost, drifting up and out.
      fx.emit({ kind: 'ember', x, y: y - WICK_R - 6, vy: -50, vx: 0, max: 1.3, size: 3.6, color: '#FFB050', drag: 1, sway: 25 });
      fx.burst(4, x, y, { kind: 'smoke', color: 'rgba(255,225,200,0.28)', speed: 40, max: 0.8, size: 6, grow: 16, drag: 2, g: -30 });
      this.addShake(4.5);
    } else if (cause === 'fall') {
      // Swallowed by the mist: a soft glow where Wick went under, and one ember floating back up.
      const vy = Math.min(H - 6, this.view.visible.y1 - 30);
      fx.emit({ kind: 'glow', x, y: vy + 10, size: 60, grow: 30, max: 0.9, color: '#FF9A50', alpha: 0.5 });
      fx.emit({ kind: 'smoke', x, y: vy, size: 12, grow: 30, max: 1, color: 'rgba(250,235,225,0.3)', vy: -12 });
      fx.emit({ kind: 'ember', x, y: vy, vy: -42, max: 1.6, size: 4, color: '#FFB050', drag: 0.7, sway: 18 });
      fx.burst(7, x, vy, { kind: 'ember', color: '#FF9A3C', speed: 70, angle: -Math.PI / 2, spread: 1.3, max: 1, size: 1.3, g: -20 });
      this.addShake(1.6);
    } else if (cause === 'doused') {
      fx.burst(6, this.wickArt.head.x, this.wickArt.head.y - 4, { kind: 'smoke', color: 'rgba(220,225,235,0.5)', speed: 30, angle: -Math.PI / 2, spread: 1.4, max: 0.9, size: 3, grow: 12, g: -30, sway: 25 });
    } else if (cause === 'stuck') {
      this.addShake(0.6);
    }
  }

  /** A stroke that is undone dissolves into motes of its own light. */
  private dissolve(id: number): void {
    const s = this.sim?.strokes.find((q) => q.id === id);
    if (!s) return;
    const col = INK_COLORS[s.ink];
    const step = Math.max(2, Math.floor(s.pts.length / 60));
    for (let i = 0; i < s.pts.length; i += step) {
      const q = s.pts[i];
      this.fx.emit({ kind: Math.random() < 0.3 ? 'spark' : 'dot', x: q.x + (Math.random() - 0.5) * 4, y: q.y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 50, max: 0.5 + Math.random() * 0.5, size: 1 + Math.random() * 1.2, color: Math.random() < 0.5 ? col.halo : col.core, drag: 1.5, sway: 12 });
    }
  }

  /** Centre of a HUD element (by selector & index) in world units, or null. */
  private hudTarget(selector: string, index: number): Vec | null {
    try {
      const els = document.querySelectorAll(selector);
      const el = els[index] ?? els[els.length - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      const cr = this.canvas.getBoundingClientRect();
      return this.view.toWorld(r.left + r.width / 2 - cr.left, r.top + r.height / 2 - cr.top);
    } catch {
      return null;
    }
  }

  /** Draw one frame. `wx, wy` = interpolated Wick position. */
  frame(dt: number, wx: number, wy: number): void {
    const sim = this.sim;
    if (!sim || !this.bg || !this.terrain) return;
    const view = this.view;
    const p = this.palette;
    const rm = this.opts.reducedMotion;
    const motion = rm ? 0.25 : 1;
    this.time += dt;
    const time = this.time;
    this.fx.density = rm ? 0.5 : 1;
    this.wickArt.calm = rm;
    if (sim.phase !== this.lastPhase) {
      if (sim.phase === 'running') this.notesWritten = true;
      this.lastPhase = sim.phase;
    }

    // ── cosmetic state ──
    const lantern = this.lantern;
    this.wickArt.lookAt = this.pen?.down ? { x: this.pen.x, y: this.pen.y } : null;
    this.wickArt.lampAt = lantern;
    this.wickArt.update(dt, sim);
    this.updateWin(dt, wx, wy, lantern);
    this.updateEmitters(dt, sim, wx, wy);
    this.fx.update(dt);
    this.updateHoming(dt);
    const planning = sim.phase === 'plan' && !this.backdrop;
    this.planA += ((planning ? 1 : 0) - this.planA) * Math.min(1, dt * (planning ? 3 : 6));
    this.ghostA += ((planning && sim.strokes.length === 0 ? 1 : 0) - this.ghostA) * Math.min(1, dt * 5);
    if (planning) this.noteClock += dt;
    this.updateCamera(dt, wx, wy, lantern);

    this.applyCamera();

    // ── draw the world (layout space) ──
    const ctx = this.ctx;

    this.bg.draw(ctx, view, time, dt, motion);
    this.terrain.draw(ctx, view, time);
    view.apply(ctx);

    drawNoInk(ctx, sim.level, time);
    for (const e of sim.entities) drawEntity(ctx, e, sim, time, p, 'back');

    // In darkness, everything that *gives* light (notes are chalk-bright too) is drawn above the
    // night; the world and its creatures stay beneath it and only show where light reaches.
    const dark = !!sim.level.dark;
    if (dark) {
      for (const e of sim.entities) drawEntity(ctx, e, sim, time, p, 'front');
      this.bg.drawFront(ctx, view, time, dt, motion);
      this.lighting.draw(ctx, view, sim, wx, wy, this.lampLit, time);
      view.apply(ctx);
    }

    // Tutorial notes & ghosts.
    this.drawNotes(ctx, sim, time);
    if (this.ghostA > 0.01 && !this.backdrop) for (const g of sim.level.ghosts ?? []) drawGhost(ctx, g.pts, g.ink ?? 'moon', time, 0.75 * this.ghostA);
    if (this.hint) for (const g of this.hint) drawGhost(ctx, g.pts, g.ink, time + 0.4, 0.9);

    // Lamp & sparks.
    drawLamp(ctx, sim.level.goal.x, sim.level.goal.y, this.lampLit, time, p, this.flare);
    const sp = sim.level.sparks;
    for (let i = 0; i < sp.length; i++) if (!sim.sparks[i]) drawSpark(ctx, sp[i].x, sp[i].y, time, p, 1, i);

    this.ink.draw(ctx, view, sim, time, dt);
    view.apply(ctx);

    this.wickArt.draw(ctx, sim, wx, wy, time);
    this.drawLeap(ctx, lantern);

    if (!dark) {
      for (const e of sim.entities) drawEntity(ctx, e, sim, time, p, 'front');
      // Mist / void / weather in front of the level (world art).
      this.bg.drawFront(ctx, view, time, dt, motion);
    }

    const k = view.scale * view.dpr;
    this.fx.draw(ctx, k, view.ox * view.dpr, view.oy * view.dpr);

    view.apply(ctx);
    this.drawHoming(ctx, time);
    this.drawBloom(ctx, lantern);
    if (this.pen) this.drawPen(ctx, sim, time);

    this.drawPost(ctx);
  }

  // ───────────────────────────── win: flame leap → lamp ignition ─────────────────────────────

  private updateWin(dt: number, wx: number, wy: number, lantern: Vec): void {
    this.flare = Math.max(0, this.flare - dt * 2.2);
    if (this.winT < 0) return;
    this.winT += dt;
    const fx = this.fx;
    if (!this.leap && this.ignitedT < 0 && this.winT >= IGNITE_DELAY) {
      this.wickArt.giveFlame();
      const hx = this.wickArt.head.x || wx;
      const hy = (this.wickArt.head.y || wy - WICK_R) - 8;
      this.leap = { x0: hx, y0: hy, t: 0 };
      fx.burst(8, hx, hy, { kind: 'spark', color: '#FFD08A', speed: 90, max: 0.5, size: 1.6, drag: 3 });
    }
    if (this.leap) {
      const L = this.leap;
      L.t += dt / LEAP_DUR;
      const q = leapPos(L, lantern, Math.min(1, L.t));
      fx.emit({ kind: 'ember', x: q.x, y: q.y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, max: 0.45 + Math.random() * 0.2, size: 1.3, color: '#FF9A3C' });
      if (L.t >= 1) {
        this.leap = null;
        this.ignite(lantern);
      }
    }
    // Joy: little twinkles pop around Wick's face while it celebrates.
    if (this.winT > 0.15 && this.winT < 2 && Math.random() < dt * 7 * fx.density) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 10;
      fx.emit({ kind: 'spark', x: wx + Math.cos(a) * r, y: wy - 4 + Math.sin(a) * r * 0.8, vx: Math.cos(a) * 12, vy: -18, max: 0.45 + Math.random() * 0.25, size: 1.3 + Math.random(), color: '#FFE9B8', vr: 4 });
    }
    if (this.ignitedT >= 0) {
      this.ignitedT += dt;
      this.lampLit = Math.min(1, this.lampLit + dt * 2.6);
      const t = this.ignitedT;
      // Warm bloom: floods the page, then settles to a glow.
      const target = t < 0.3 ? t / 0.3 : 0.45 + 0.55 * Math.exp(-(t - 0.3) * 1.6);
      this.bloom += (target - this.bloom) * Math.min(1, dt * 12);
      // Rising embers & petals.
      if (t < 3.2) {
        const rate = (t < 1 ? 26 : 10) * this.fx.density;
        let n = rate * dt;
        while (n > 0) {
          if (Math.random() < n) {
            const petal = Math.random() < 0.35;
            fx.emit({
              kind: petal ? 'petal' : 'ember',
              x: lantern.x + (Math.random() - 0.5) * 90,
              y: lantern.y + 10 + Math.random() * 40,
              vx: (Math.random() - 0.5) * 30,
              vy: -30 - Math.random() * 50,
              max: 1.6 + Math.random() * 1.4,
              size: petal ? 2.6 : 1 + Math.random() * 0.8,
              color: petal ? hexA(this.palette.accent, 0.85) : '#FFB45A',
              drag: 0.3,
              sway: 22,
              vr: petal ? (Math.random() - 0.5) * 4 : 0,
            });
          }
          n -= 1;
        }
      }
    }
  }

  private ignite(lantern: Vec): void {
    const fx = this.fx;
    const p = this.palette;
    this.ignitedT = 0;
    this.flare = 1;
    fx.emit({ kind: 'ring', x: lantern.x, y: lantern.y, size: 10, grow: 300, max: 0.55, color: '#FFF1D2', alpha: 0.8 });
    fx.emit({ kind: 'ring', x: lantern.x, y: lantern.y, size: 6, grow: 170, max: 0.8, color: hexA(p.accent, 0.8), alpha: 0.7 });
    fx.burst(30, lantern.x, lantern.y, { kind: 'spark', color: p.accent, speed: 280, max: 1.3, size: 2.6, drag: 2, g: -10 });
    fx.burst(16, lantern.x, lantern.y, { kind: 'ember', color: '#FFC070', speed: 160, max: 1.1, size: 1.4, drag: 1.5, g: -40 });
    this.addShake(1.4);
  }

  private drawLeap(ctx: CanvasRenderingContext2D, lantern: Vec): void {
    const L = this.leap;
    if (!L) return;
    const q = leapPos(L, lantern, Math.min(1, L.t));
    const q2 = leapPos(L, lantern, Math.max(0, Math.min(1, L.t) - 0.08));
    const ang = Math.atan2(q.y - q2.y, q.x - q2.x);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glowSprite('#FFB054'), q.x - 24, q.y - 24, 48, 48);
    ctx.globalAlpha = 1;
    // A little comet of flame, tail streaming behind.
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#FF8A33';
    ctx.beginPath();
    ctx.moveTo(4.5, 0);
    ctx.quadraticCurveTo(3, -4.5, -14, 0);
    ctx.quadraticCurveTo(3, 4.5, 4.5, 0);
    ctx.fill();
    ctx.fillStyle = '#FFF4D2';
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBloom(ctx: CanvasRenderingContext2D, lantern: Vec): void {
    if (this.bloom <= 0.005) return;
    ctx.globalCompositeOperation = 'lighter';
    const t = Math.max(0, this.ignitedT);
    const r = 160 + Math.min(1, t / 0.6) * 760;
    ctx.globalAlpha = 0.3 * this.bloom;
    ctx.drawImage(bigGlow(), lantern.x - r, lantern.y - r, r * 2, r * 2);
    ctx.globalAlpha = 0.4 * this.bloom;
    ctx.drawImage(glowSprite('#FFE2B0'), lantern.x - 120, lantern.y - 120, 240, 240);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ───────────────────────────── continuous effects ─────────────────────────────

  private updateEmitters(dt: number, sim: Simulation, wx: number, wy: number): void {
    const fx = this.fx;
    const w = sim.wick;
    const dens = fx.density;
    const chance = (rate: number) => Math.random() < rate * dt * dens;
    if (sim.phase === 'running') {
      // Comet trail: warm sparks streaming from Wick's feet while carried.
      if (w.onRush && chance(70)) {
        const sp = Math.hypot(w.vx, w.vy) || 1;
        fx.emit({ kind: Math.random() < 0.5 ? 'streak' : 'spark', x: wx - (w.vx / sp) * 10 + (Math.random() - 0.5) * 6, y: wy + WICK_R * 0.6 + (Math.random() - 0.5) * 6, vx: -w.vx * 0.25 + (Math.random() - 0.5) * 40, vy: -w.vy * 0.25 + (Math.random() - 0.5) * 40, max: 0.35 + Math.random() * 0.3, size: 1.2, color: INK_COLORS.comet.halo, drag: 3 });
      }
      // Embers peel off the flame when Wick flies fast.
      const speed = Math.hypot(w.vx, w.vy);
      if (!w.grounded && speed > 420 && this.wickArt.flameSize > 0.2 && chance(40)) {
        fx.emit({ kind: 'ember', x: this.wickArt.tip.x, y: this.wickArt.tip.y, vx: -w.vx * 0.15 + (Math.random() - 0.5) * 30, vy: -w.vy * 0.15 - 20, max: 0.5 + Math.random() * 0.3, size: 1.1, color: '#FF9A3C', drag: 2 });
      }
      // Low flame in the rain: a thin thread of steam.
      if (w.flame < 0.6 && chance(6)) {
        fx.emit({ kind: 'smoke', x: this.wickArt.tip.x, y: this.wickArt.tip.y, vy: -25, vx: (Math.random() - 0.5) * 10, max: 0.9, size: 2, grow: 8, color: 'rgba(210,220,235,0.3)', sway: 16 });
      }
    }
    // Failure beats that play out over time.
    if (this.deathT >= 0) {
      const t0 = this.deathT;
      this.deathT += dt;
      if (this.deathCause === 'doused' && this.deathT < 1.1 && chance(34)) {
        // A curl of smoke where the flame was.
        const u = this.deathT;
        fx.emit({ kind: 'smoke', x: this.wickArt.head.x + Math.sin(u * 9) * 2, y: this.wickArt.head.y - 4, vx: Math.sin(u * 7) * 14, vy: -30, max: 1.2, size: 1.4, grow: 7, color: 'rgba(205,212,225,0.3)', sway: 34, drag: 0.4 });
      }
      if (this.deathCause === 'stuck' && t0 < 0.3 && this.deathT >= 0.3) {
        // A sigh.
        const f = w.facing;
        fx.emit({ kind: 'smoke', x: wx + f * 8, y: wy + 3, vx: f * 38, vy: -8, max: 1, size: 3, grow: 12, color: 'rgba(235,235,245,0.55)', drag: 1.4 });
        fx.emit({ kind: 'smoke', x: wx + f * 12, y: wy + 1, vx: f * 26, vy: -14, max: 0.8, size: 2, grow: 8, color: 'rgba(235,235,245,0.4)', drag: 1.4 });
      }
    }
    // Pen: a sparkle trail from the nib; red fizz when it can't draw.
    const pen = this.pen;
    if (pen && pen.down) {
      const col = INK_COLORS[pen.ink];
      const blocked = pen.blocked || sim.inkAllowedAt(pen) !== 'ok' || sim.inkLeft <= 0.5;
      if (!Number.isNaN(this.penX)) {
        const d = Math.hypot(pen.x - this.penX, pen.y - this.penY);
        if (!blocked && d > 0.5) {
          let n = Math.min(5, d / 7) * dens;
          while (n > 0) {
            if (Math.random() < n) {
              const u = Math.random();
              const x = this.penX + (pen.x - this.penX) * u;
              const y = this.penY + (pen.y - this.penY) * u;
              const star = Math.random() < 0.45;
              fx.emit({ kind: star ? 'spark' : 'dot', x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 26, vy: -12 - Math.random() * 26, max: 0.35 + Math.random() * 0.5, size: star ? 1 + Math.random() * 1.1 : 0.7 + Math.random() * 0.7, color: Math.random() < 0.6 ? col.halo : col.core, drag: 2, g: 24, vr: star ? 3 : 0 });
            }
            n -= 1;
          }
        } else if (blocked && chance(24)) {
          fx.emit({ kind: 'dot', x: pen.x + (Math.random() - 0.5) * 10, y: pen.y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, max: 0.35, size: 1, color: 'rgba(255,120,130,0.9)', g: 80 });
        }
      }
      this.penX = pen.x;
      this.penY = pen.y;
    } else this.penX = this.penY = NaN;
  }

  private updateHoming(dt: number): void {
    const fx = this.fx;
    for (let i = this.homing.length - 1; i >= 0; i--) {
      const h = this.homing[i];
      h.t += dt / h.dur;
      const q = homingPos(h, Math.min(1, h.t));
      // A few sparkles shed along the way (the streak itself is drawn analytically).
      if (Math.random() < 0.7 * fx.density) {
        const u = Math.random();
        fx.emit({ kind: h.star ? 'spark' : 'dot', x: h.lx + (q.x - h.lx) * u, y: h.ly + (q.y - h.ly) * u, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 + 10, max: 0.35 + Math.random() * 0.3, size: h.star ? 1.2 : 1, color: h.color, drag: 2 });
      }
      h.lx = q.x;
      h.ly = q.y;
      if (h.t >= 1) {
        fx.emit({ kind: 'glow', x: h.x1, y: h.y1, size: 28, grow: 60, max: 0.35, color: h.color });
        fx.emit({ kind: 'ring', x: h.x1, y: h.y1, size: 6, grow: 90, max: 0.35, color: '#FFF3D0' });
        fx.burst(8, h.x1, h.y1, { kind: 'spark', color: h.color, speed: 120, max: 0.45, size: 1.4, drag: 3 });
        this.homing.splice(i, 1);
        this.onArrive?.(h.star ? 'spark' : 'ink', h.index);
      }
    }
  }

  private drawHoming(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.homing.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';
    for (const h of this.homing) {
      const t = Math.min(1, h.t);
      const q = homingPos(h, t);
      // Streak: the path just travelled, tapering and fading behind the head.
      let px = q.x;
      let py = q.y;
      for (let k = 1; k <= 9; k++) {
        const tk = Math.max(0, t - k * 0.028);
        const pk = homingPos(h, tk);
        const f = 1 - k / 10;
        ctx.globalAlpha = 0.75 * f;
        ctx.strokeStyle = k < 3 ? '#FFF6E0' : h.color;
        ctx.lineWidth = 4.2 * f + 0.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(pk.x, pk.y);
        ctx.stroke();
        px = pk.x;
        py = pk.y;
        if (tk <= 0) break;
      }
      ctx.globalAlpha = 0.85;
      ctx.drawImage(glowSprite(h.color), q.x - 20, q.y - 20, 40, 40);
      ctx.globalAlpha = 1;
      if (h.star) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(time * 6);
        ctx.drawImage(starSprite('#FFF4D8'), -11, -11, 22, 22);
        ctx.restore();
      } else ctx.drawImage(glowSprite('#FFFFFF'), q.x - 6, q.y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ───────────────────────────── notes ─────────────────────────────

  private drawNotes(ctx: CanvasRenderingContext2D, sim: Simulation, time: number): void {
    const notes = sim.level.notes;
    if (!notes?.length || this.backdrop) return;
    const px = this.view.scale * this.view.dpr;
    let start = 0.55;
    for (const n of notes) {
      const always = n.planOnly === false;
      const a = always ? 1 : this.planA;
      const dur = noteDuration(n);
      let reveal = 1;
      let arrow = 1;
      if (!this.notesWritten && !this.opts.reducedMotion) {
        const t = this.noteClock - start;
        const textDur = dur - (n.arrow ? 0.45 : 0);
        reveal = Math.max(0, Math.min(1, t / textDur));
        reveal = 1 - (1 - reveal) * (1 - reveal * 0.4);
        arrow = n.arrow ? Math.max(0, Math.min(1, (t - textDur) / 0.45)) : 1;
      }
      start += dur + 0.25;
      if (reveal <= 0) continue;
      drawNote(ctx, n, this.palette, 0.92 * a, reveal, arrow, time, px);
    }
  }

  // ───────────────────────────── pen ─────────────────────────────

  private drawPen(ctx: CanvasRenderingContext2D, sim: Simulation, time: number): void {
    const pen = this.pen!;
    const blocked = pen.blocked || (pen.down && (sim.inkAllowedAt(pen) !== 'ok' || sim.inkLeft <= 0.5));
    // Menu backdrops (the title's self-writing underline) get a bare glowing nib, no gauge ring.
    const r = this.backdrop ? 0 : (COARSE ? 30 : 15) / (this.view.scale * this.view.zoom);
    const frac = sim.inkLeft / Math.max(1, sim.inkBudget);
    drawNib(ctx, pen.x, pen.y, pen.ink, blocked, time, frac, r, pen.down);
  }

  // ───────────────────────────── camera ─────────────────────────────

  private updateCamera(dt: number, wx: number, wy: number, lantern: Vec): void {
    const view = this.view;
    const rm = this.opts.reducedMotion;
    // Lamp push-in.
    const wantZoom = this.winT >= 0.35 && !rm && !this.backdrop ? 1.1 : 1;
    this.zoom += (wantZoom - this.zoom) * (1 - Math.exp(-dt * (wantZoom > this.zoom ? 1.9 : 4)));
    if (Math.abs(this.zoom - wantZoom) < 1e-4) this.zoom = wantZoom;
    let z = this.zoom;
    let tx = 0;
    let ty = 0;
    if (z !== 1) {
      const k = (z - 1) / 0.1;
      const fwx = wx + (lantern.x - wx) * 0.6;
      const fwy = wy + (lantern.y - wy) * 0.6;
      const f = view.toLayout(fwx, fwy);
      const cx = view.cssW / 2;
      const cy = view.cssH / 2;
      const sx = f.x + (cx - f.x) * 0.3 * k;
      const sy = f.y + (cy - f.y) * 0.3 * k;
      tx = sx - f.x * z;
      ty = sy - f.y * z;
      // Never reveal the canvas edge.
      tx = Math.min(0, Math.max(view.cssW * (1 - z), tx));
      ty = Math.min(0, Math.max(view.cssH * (1 - z), ty));
    }
    // Shake: smooth noise, scaled by a decaying amplitude, with just enough zoom to hide the edges.
    this.shakeAmp *= Math.exp(-dt * 7.5);
    if (this.shakeAmp < 0.05) this.shakeAmp = 0;
    let shx = 0;
    let shy = 0;
    if (this.shakeAmp > 0) {
      const t = this.time;
      shx = this.shakeAmp * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 83.1 + 1.3) * 0.4);
      shy = this.shakeAmp * (Math.sin(t * 53.7 + 0.7) * 0.6 + Math.sin(t * 91.9 + 2.1) * 0.4);
      const zs = 1 + (2 * this.shakeAmp + 1) / Math.max(1, Math.min(view.cssW, view.cssH));
      const cx = view.cssW / 2;
      const cy = view.cssH / 2;
      tx = tx * zs + cx * (1 - zs);
      ty = ty * zs + cy * (1 - zs);
      z *= zs;
    }
    view.zoom = z;
    view.tx = tx;
    view.ty = ty;
    view.shx = shx;
    view.shy = shy;
  }

  /**
   * The camera is a compositor-only CSS transform on the canvas: no extra raster pass, no cache
   * rebuilds. (A full offscreen composite measured 20-50 ms of main-thread stalls on throttled CPUs.)
   */
  private applyCamera(): void {
    const v = this.view;
    let css = '';
    if (v.cameraActive) {
      css = `translate3d(${(v.tx + v.shx).toFixed(2)}px,${(v.ty + v.shy).toFixed(2)}px,0) scale(${v.zoom.toFixed(5)})`;
    }
    if (css !== this.camCss) {
      this.camCss = css;
      const st = this.canvas.style;
      st.transformOrigin = '0 0';
      st.transform = css;
    }
  }

  // ───────────────────────────── post ─────────────────────────────

  private drawPost(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.post || this.post.width !== this.canvas.width || this.post.height !== this.canvas.height) this.post = buildPost(this.canvas.width, this.canvas.height, this.view.dpr);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.post, 0, 0);
  }
}

function leapPos(L: { x0: number; y0: number }, to: Vec, t: number): Vec {
  // An eager little arc up and over.
  const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  const mx = (L.x0 + to.x) / 2;
  const my = Math.min(L.y0, to.y) - 46;
  const u = 1 - e;
  return { x: u * u * L.x0 + 2 * u * e * mx + e * e * to.x, y: u * u * L.y0 + 2 * u * e * my + e * e * to.y };
}

function homingPos(h: Homing, t: number): Vec {
  // Kick up, then swoop into the counter (cubic Bézier, accelerating).
  const e = t * t * (3 - 2 * t) * 0.35 + t * t * 0.65;
  const p1x = h.x0 + (h.x0 < h.x1 ? -30 : 30);
  const p1y = h.y0 - 150;
  const p2x = h.x1 - (h.x1 - h.x0) * 0.1;
  const p2y = h.y1 + 120;
  const u = 1 - e;
  return {
    x: u * u * u * h.x0 + 3 * u * u * e * p1x + 3 * u * e * e * p2x + e * e * e * h.x1,
    y: u * u * u * h.y0 + 3 * u * u * e * p1y + 3 * u * e * e * p2y + e * e * e * h.y1,
  };
}

let big: HTMLCanvasElement | null = null;
/** A large, smooth warm glow (256 px) for the lamp's page-wide bloom. */
function bigGlow(): HTMLCanvasElement {
  if (big) return big;
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,196,120,1)');
  grad.addColorStop(0.2, 'rgba(255,180,105,0.55)');
  grad.addColorStop(0.5, 'rgba(255,160,95,0.18)');
  grad.addColorStop(0.8, 'rgba(255,150,90,0.04)');
  grad.addColorStop(1, 'rgba(255,150,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  big = c;
  return c;
}

/**
 * Vignette + paper grain, baked once per size. Tuned for OLED: corners fall toward true black, and the
 * grain only ever darkens (it never lifts the blacks into grey).
 */
function buildPost(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  // Elliptical vignette.
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, h / w);
  const r = w * 0.72;
  const grad = g.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.06)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0.58)');
  g.fillStyle = grad;
  g.fillRect(-w, -w, w * 2, w * 2);
  g.restore();
  // Paper grain + a few fibres (darken only).
  const T = 192;
  const tile = makeCanvas(T, T);
  const tg = tile.getContext('2d')!;
  const img = tg.createImageData(T, T);
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd();
    const a = v < 0.5 ? (0.5 - v) * 2 : 0;
    img.data[i] = 20;
    img.data[i + 1] = 14;
    img.data[i + 2] = 10;
    img.data[i + 3] = Math.round(a * a * 22);
  }
  tg.putImageData(img, 0, 0);
  tg.strokeStyle = 'rgba(20,14,10,0.06)';
  tg.lineWidth = 0.6;
  for (let i = 0; i < 14; i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const a = rnd() * Math.PI;
    const l = 6 + rnd() * 16;
    tg.beginPath();
    tg.moveTo(x, y);
    tg.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 4, y + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 4, x + Math.cos(a) * l, y + Math.sin(a) * l);
    tg.stroke();
  }
  const pat = g.createPattern(tile, 'repeat');
  if (pat) {
    // Grain at roughly one speck per CSS pixel, whatever the dpr.
    g.save();
    g.scale(Math.max(1, dpr * 0.75), Math.max(1, dpr * 0.75));
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  return c;
}

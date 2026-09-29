// A small stand-alone Wick for DOM screens (journey map, ending, rotate prompt). It reuses the
// game's own WickArt so the character is identical everywhere — fed by a tiny fake sim state.
import { WALK_SPEED, WICK_R } from '../core/constants';
import { WickArt } from '../render/wick';
import type { Phase, Simulation, WickState } from '../sim/simulation';
import { h } from './dom';
import { onTick } from './ticker';

/** World units drawn around Wick (its glow needs room). */
const BOX = 176;
const CX = BOX / 2;
const CY = BOX / 2 + 8;

interface FakeSim {
  phase: Phase;
  time: number;
  wick: WickState;
}

function freshWick(): WickState {
  return {
    x: CX,
    y: CY,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    nx: 0,
    ny: -1,
    groundSeg: null,
    onRush: false,
    noSnap: 0,
    turnCd: 0,
    airTime: 0,
    walkDist: 0,
    flame: 1,
    sinceHit: 99,
    stuckX: CX,
    stuckY: CY,
    stuckT: 0,
  } as WickState;
}

export class WickSprite {
  readonly el: HTMLCanvasElement;
  /** CSS px per world unit. */
  readonly scale: number;
  private ctx: CanvasRenderingContext2D | null;
  private art = new WickArt();
  private fake: FakeSim = { phase: 'plan', time: 0, wick: freshWick() };
  private time = Math.random() * 10;
  private off: (() => void) | null = null;
  private walk: { pts: { x: number; y: number }[]; i: number; speed: number; done: () => void; onStep?: (x: number, y: number) => void } | null = null;
  /** Feet position in the parent's CSS px. */
  x = 0;
  y = 0;
  /** Where Wick's eyes should go (parent CSS px), or null. */
  look: { x: number; y: number } | null = null;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private broken = false;

  constructor(scale = 0.55, cls = '') {
    this.scale = scale;
    const px = Math.round(BOX * scale);
    this.el = h('canvas.wick-sprite', { class: cls, 'aria-hidden': 'true', width: String(Math.round(px * this.dpr)), height: String(Math.round(px * this.dpr)) });
    this.el.style.width = `${px}px`;
    this.el.style.height = `${px}px`;
    this.ctx = this.el.getContext('2d');
  }

  /** Start animating (idempotent). */
  start(): this {
    if (!this.off) this.off = onTick((dt) => this.tick(dt));
    return this;
  }

  stop(): void {
    this.off?.();
    this.off = null;
  }

  setFacing(f: 1 | -1): void {
    this.fake.wick.facing = f;
  }

  /** Make Wick smile (permanently, until reset()). */
  happy(): void {
    this.art.onEvent({ type: 'win', x: CX, y: CY });
  }

  reset(): void {
    this.art.onEvent({ type: 'reset' });
  }

  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.position();
  }

  /** Walk along a polyline (parent CSS px). Resolves on arrival. */
  walkAlong(pts: { x: number; y: number }[], speedPx?: number, onStep?: (x: number, y: number) => void): Promise<void> {
    if (pts.length < 2) return Promise.resolve();
    this.walk?.done();
    return new Promise((res) => {
      this.walk = { pts, i: 1, speed: speedPx ?? WALK_SPEED * this.scale * 1.15, done: res, onStep };
      this.placeAt(pts[0].x, pts[0].y);
    });
  }

  private position(): void {
    const s = this.scale;
    this.el.style.transform = `translate(${(this.x - CX * s).toFixed(2)}px, ${(this.y - (CY + WICK_R + 2) * s).toFixed(2)}px)`;
  }

  private tick(dt: number): void {
    if (!this.el.isConnected) return;
    this.time += dt;
    const w = this.fake.wick;
    let moving = false;
    if (this.walk) {
      const wk = this.walk;
      let budget = wk.speed * dt;
      while (budget > 0 && wk.i < wk.pts.length) {
        const t = wk.pts[wk.i];
        const dx = t.x - this.x;
        const dy = t.y - this.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.01) w.facing = dx > 0 ? 1 : -1;
        if (d <= budget) {
          this.x = t.x;
          this.y = t.y;
          budget -= d;
          wk.i++;
        } else {
          this.x += (dx / d) * budget;
          this.y += (dy / d) * budget;
          budget = 0;
        }
      }
      moving = true;
      w.walkDist += (wk.speed * dt) / this.scale;
      w.vx = w.facing * WALK_SPEED;
      wk.onStep?.(this.x, this.y);
      this.position();
      if (wk.i >= wk.pts.length) {
        this.walk = null;
        wk.done();
      }
    }
    if (!moving) w.vx *= Math.max(0, 1 - dt * 10);
    this.fake.phase = moving ? 'running' : 'plan';
    this.fake.time = this.time;
    this.art.lookAt = this.look ? { x: CX + (this.look.x - this.x) / this.scale, y: CY + (this.look.y - this.y) / this.scale } : null;
    this.draw(dt);
  }

  private draw(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.broken) return;
    const sim = this.fake as unknown as Simulation;
    const k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    try {
      this.art.update(dt, sim);
      this.art.draw(ctx, sim, CX, CY, this.time);
    } catch (e) {
      // The art is shared with the game renderer; never let a mismatch break a menu.
      this.broken = true;
      console.warn('WickSprite: art failed', e);
    }
  }
}

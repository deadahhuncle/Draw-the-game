import { H, W } from '../core/constants';
import type { Vec } from '../core/math';

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Maps the 1280×720 world onto the screen. The level is fit (letterboxed) into the area left
 * between the HUD gutters; everything outside that rect still shows the (full-bleed) world art.
 */
export class View {
  cssW = 1;
  cssH = 1;
  dpr = 1;
  /** CSS px per world unit. */
  scale = 1;
  /** CSS px position of world (0,0). */
  ox = 0;
  oy = 0;

  update(cssW: number, cssH: number, dpr: number, insets: Insets): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const aw = Math.max(1, cssW - insets.left - insets.right);
    const ah = Math.max(1, cssH - insets.top - insets.bottom);
    this.scale = Math.min(aw / W, ah / H);
    this.ox = insets.left + (aw - W * this.scale) / 2;
    this.oy = insets.top + (ah - H * this.scale) / 2;
  }

  /** CSS-pixel client coords → world. */
  toWorld(cx: number, cy: number): Vec {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }
  toScreen(x: number, y: number): Vec {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }
  /** Visible world-space rectangle (the whole canvas, beyond the page). */
  get visible(): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: -this.ox / this.scale,
      y0: -this.oy / this.scale,
      x1: (this.cssW - this.ox) / this.scale,
      y1: (this.cssH - this.oy) / this.scale,
    };
  }
  /** The level rect in CSS px. */
  get levelRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.ox, y: this.oy, w: W * this.scale, h: H * this.scale };
  }
  /** Set ctx so that drawing uses world units. */
  apply(ctx: CanvasRenderingContext2D): void {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
  }
}

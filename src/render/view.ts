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
 *
 * Two layers of transform:
 * - the **layout** (`scale`, `ox`, `oy`): fixed per resize. Static caches (sky, terrain, ink) are
 *   built against it and `apply()` uses it — the renderer always draws the world in layout space.
 * - the **camera** (`page = layout · zoom + (tx, ty) + (shx, shy)`): purely presentational. The
 *   renderer applies it as a compositor-only CSS transform on the canvas (origin 0 0), so it costs no
 *   raster work. `toScreen` includes zoom and pan (DOM anchors stay glued to the picture);
 *   `toWorld` takes coordinates relative to the canvas's *transformed* bounding rect (what
 *   `getBoundingClientRect` reports) and undoes the camera — except the shake, on purpose: the pen
 *   must not jitter when the picture does.
 */
export class View {
  cssW = 1;
  cssH = 1;
  dpr = 1;
  /** CSS px per world unit (layout). */
  scale = 1;
  /** CSS px position of world (0,0) (layout). */
  ox = 0;
  oy = 0;

  /** Camera zoom (1 = none) and pan (CSS px). */
  zoom = 1;
  tx = 0;
  ty = 0;
  /** Camera shake offset (CSS px). */
  shx = 0;
  shy = 0;

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

  /** True when the camera is anything but identity. */
  get cameraActive(): boolean {
    return this.zoom !== 1 || this.tx !== 0 || this.ty !== 0 || this.shx !== 0 || this.shy !== 0;
  }

  /** Reset the camera to identity. */
  resetCamera(): void {
    this.zoom = 1;
    this.tx = this.ty = this.shx = this.shy = 0;
  }

  /** Canvas-rect-relative CSS px (as `clientX - canvas.getBoundingClientRect().left`) → world. */
  toWorld(cx: number, cy: number): Vec {
    const bx = (cx + this.shx) / this.zoom;
    const by = (cy + this.shy) / this.zoom;
    return { x: (bx - this.ox) / this.scale, y: (by - this.oy) / this.scale };
  }
  /** World → CSS px on screen (including the camera zoom). */
  toScreen(x: number, y: number): Vec {
    const bx = this.ox + x * this.scale;
    const by = this.oy + y * this.scale;
    return { x: bx * this.zoom + this.tx, y: by * this.zoom + this.ty };
  }
  /** World → CSS px in layout space (no camera). */
  toLayout(x: number, y: number): Vec {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }
  /** Layout-space CSS px → world. */
  fromLayout(cx: number, cy: number): Vec {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }
  /** Visible world-space rectangle (the whole canvas, beyond the page) in layout space. */
  get visible(): { x0: number; y0: number; x1: number; y1: number } {
    return {
      x0: -this.ox / this.scale,
      y0: -this.oy / this.scale,
      x1: (this.cssW - this.ox) / this.scale,
      y1: (this.cssH - this.oy) / this.scale,
    };
  }
  /** The level rect in CSS px (layout — the HUD is placed against this). */
  get levelRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.ox, y: this.oy, w: W * this.scale, h: H * this.scale };
  }
  /** Set ctx so that drawing uses world units (layout space). */
  apply(ctx: CanvasRenderingContext2D): void {
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
  }
}

import { H, W } from '../core/constants';
import type { Vec } from '../core/math';
import { Rng } from '../core/rng';
import type { LevelDef, TerrainDef } from '../core/types';
import type { Palette } from './palettes';
import type { View } from './view';
import { glowSprite, makeCanvas, sparkle } from './world/kit';
import {
  bbox,
  makePiece,
  paintBramble,
  paintCap,
  paintCrystal,
  paintEarth,
  paintPaper,
  paintRock,
  paintStem,
  paintWood,
  type Accent,
  type PaintCtx,
  type Piece,
} from './world/terrain-paint';

export { outwardNormal, wobble } from './world/terrain-paint';

/**
 * Static terrain, pre-rendered once per level/resize: ink-black masses with fine cross-hatching, a lit
 * soil band and moonlit rim, per-world flora, and the special materials (rock, wood, paper, crystal,
 * mushroom caps & stems, brambles). A handful of live accents (cap glow, bramble pulse, crystal
 * glints) are drawn on top each frame from cheap sprites.
 */
export class TerrainLayer {
  private cache: HTMLCanvasElement | null = null;
  private built = { w: 0, h: 0, dpr: 0, scale: 0, ox: 0, oy: 0 };
  private accents: Accent[] = [];
  private pink = glowSprite('#FF5FAE');
  private red = glowSprite('#FF2A55');

  constructor(
    private level: LevelDef,
    private palette: Palette,
  ) {}

  draw(ctx: CanvasRenderingContext2D, view: View, time = 0): void {
    const b = this.built;
    // Rebuild on real layout changes only — camera shake nudges ox/oy by a few px every frame.
    if (!this.cache || b.w !== view.cssW || b.h !== view.cssH || b.dpr !== view.dpr || Math.abs(b.scale - view.scale) > 1e-5 || Math.abs(b.ox - view.ox) > 12 || Math.abs(b.oy - view.oy) > 12) {
      this.cache = this.build(view);
      this.built = { w: view.cssW, h: view.cssH, dpr: view.dpr, scale: view.scale, ox: view.ox, oy: view.oy };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.cache, 0, 0);
    if (!this.accents.length) return;
    view.apply(ctx);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.accents) {
      if (a.kind === 'cap') {
        ctx.globalAlpha = 0.16 + 0.1 * Math.sin(time * 1.6 + a.ph);
        ctx.drawImage(this.pink, a.x - a.r, a.y - a.r * 0.8, a.r * 2, a.r * 1.6);
      } else if (a.kind === 'thorn') {
        // A slow, uneasy pulse: danger breathes.
        const k = 0.5 + 0.5 * Math.sin(time * 2.2 + a.ph);
        ctx.globalAlpha = 0.1 + 0.16 * k * k;
        ctx.drawImage(this.red, a.x - a.r, a.y - a.r * 0.7, a.r * 2, a.r * 1.4);
      } else {
        const k = Math.sin(time * 1.3 + a.ph);
        if (k > 0.6) sparkle(ctx, a.x, a.y, a.r * (k - 0.6) * 2.5, '#EAF8FF', (k - 0.6) * 2.2);
      }
    }
    ctx.restore();
  }

  private build(view: View): HTMLCanvasElement {
    const c = makeCanvas(Math.max(1, Math.round(view.cssW * view.dpr)), Math.max(1, Math.round(view.cssH * view.dpr)));
    const ctx = c.getContext('2d')!;
    view.apply(ctx);
    const vis = view.visible;
    const pieces = preparePieces(this.level.terrain, vis);
    this.accents = [];
    const pc: PaintCtx = {
      ctx,
      p: this.palette,
      rng: new Rng(7),
      vx: [vis.x0 - 10, vis.x1 + 10],
      vy1: vis.y1 + 10,
      accents: this.accents,
    };
    const scalePx = view.scale * view.dpr;
    for (const piece of pieces) paintPiece(pc, piece, scalePx);
    return c;
  }
}

function rank(p: Piece): number {
  if (p.mat === 'hazard') return 3;
  if (p.style === 'mushroom') return 2;
  if (p.stem) return 1;
  return 0;
}

/**
 * Render-side geometry: pieces touching the page edges are stretched to the screen edges (so the
 * world reads as continuous beyond the page), stems under mushroom caps are recognised, and the
 * draw order is solids → stems → caps → brambles.
 */
function preparePieces(terrain: readonly TerrainDef[], vis: { x0: number; y0: number; x1: number; y1: number }): Piece[] {
  const pieces = terrain.map((def) => {
    const pts = def.pts.map((q) => ({
      x: q.x <= 0.5 ? Math.min(q.x, vis.x0 - 40) : q.x >= W - 0.5 ? Math.max(q.x, vis.x1 + 40) : q.x,
      y: q.y >= H - 0.5 ? Math.max(q.y, vis.y1 + 40) : q.y,
    }));
    return makePiece(def, pts);
  });
  const caps = pieces.filter((p) => p.style === 'mushroom');
  for (const p of pieces) {
    if (p.mat !== 'solid' || p.style === 'mushroom') continue;
    const b = p.box;
    const w = b.maxX - b.minX;
    if (w > 60 || b.maxY - b.minY < w) continue;
    if ((p.def.style ?? 'earth') !== 'wood' || !p.def.bare) continue;
    p.stem = caps.some((c) => c.box.minX <= b.minX + 2 && c.box.maxX >= b.maxX - 2 && Math.abs(c.box.maxY - b.minY) < 14);
  }
  return pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((e) => e.p);
}

function paintPiece(pc: PaintCtx, piece: Piece, scalePx: number): void {
  if (piece.mat === 'hazard') return paintBramble(pc, piece, scalePx);
  if (piece.style === 'mushroom') return paintCap(pc, piece, scalePx);
  if (piece.stem) return paintStem(pc, piece);
  switch (piece.style) {
    case 'rock':
      return paintRock(pc, piece);
    case 'wood':
      return paintWood(pc, piece);
    case 'paper':
      return paintPaper(pc, piece);
    case 'crystal':
      return paintCrystal(pc, piece);
    default:
      return paintEarth(pc, piece);
  }
}

/**
 * Paint one terrain polygon into its own sprite (for moving platforms and other entities that want to
 * look like the world's ground). `pxPerUnit` = device pixels per world unit. The sprite's world-space
 * top-left is (x, y); draw it with drawImage(canvas, x, y, w, h) in world units.
 */
export function terrainSprite(def: TerrainDef, palette: Palette, pxPerUnit: number): { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } {
  const pad = 24;
  const b = bbox(def.pts);
  const x = b.minX - pad;
  const y = b.minY - pad;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const canvas = makeCanvas(Math.ceil(w * pxPerUnit), Math.ceil(h * pxPerUnit));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, -x * pxPerUnit, -y * pxPerUnit);
  const piece = makePiece(def, def.pts.map((q: Vec) => ({ ...q })));
  piece.floating = true;
  const pc: PaintCtx = { ctx, p: palette, rng: new Rng(11), vx: [x, x + w], vy1: y + h, accents: [] };
  paintPiece(pc, piece, pxPerUnit);
  return { canvas, x, y, w, h };
}

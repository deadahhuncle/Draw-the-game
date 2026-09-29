// Terrain painters: every style of ground in the game, in the "luminous ink on midnight washi" language —
// ink-black masses with fine cross-hatching, a lit soil band, a moonlit rim on everything that faces up,
// hand-wobbled outlines, and per-world flora along the tops. All of this runs once per level/resize.
import { H } from '../../core/constants';
import { pointInPolygon, type Vec } from '../../core/math';
import { Rng, hash2 } from '../../core/rng';
import type { TerrainDef, TerrainStyle } from '../../core/types';
import type { Palette } from '../palettes';
import { mix, rgba } from './color';
import { TAU, sparkle } from './kit';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A terrain polygon prepared for painting. */
export interface Piece {
  def: TerrainDef;
  pts: Vec[];
  normals: Vec[];
  box: BBox;
  seed: number;
  style: TerrainStyle;
  mat: 'solid' | 'bounce' | 'hazard';
  /** Bottom is above the page bottom (a floating piece). */
  floating: boolean;
  /** Paint as a mushroom stem (a bare wood post under a bouncy cap). */
  stem?: boolean;
}

/** Animated accents the terrain layer draws live on top of its cache. */
export interface Accent {
  kind: 'cap' | 'thorn' | 'glint';
  x: number;
  y: number;
  r: number;
  ph: number;
}

export function bbox(pts: readonly Vec[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Outward unit normal of edge i (robust to winding). */
export function outwardNormal(poly: readonly Vec[], i: number): Vec {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = (b.y - a.y) / len;
  let ny = -(b.x - a.x) / len;
  const mx = (a.x + b.x) / 2 + nx * 1.5;
  const my = (a.y + b.y) / 2 + ny * 1.5;
  if (pointInPolygon({ x: mx, y: my }, poly)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export function makePiece(def: TerrainDef, pts: Vec[]): Piece {
  const box = bbox(pts);
  const mat = def.mat ?? 'solid';
  let style: TerrainStyle = def.style ?? 'earth';
  if (mat === 'hazard') style = 'bramble';
  else if (mat === 'bounce') style = 'mushroom';
  return {
    def,
    pts,
    normals: pts.map((_, i) => outwardNormal(pts, i)),
    box,
    seed: Math.round(def.pts[0].x * 7 + def.pts[0].y * 13 + def.pts.length * 31) | 0,
    style,
    mat,
    floating: box.maxY < H - 4,
  };
}

// ───────────────────────────── outline helpers ─────────────────────────────

/** Points along edge a→b (a inclusive, b exclusive), jittered along the normal by a stable hash. */
function wobbleEdge(a: Vec, b: Vec, amp: number, seed: number, step: number, out: Vec[]): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.floor(len / step));
  const nx = -(b.y - a.y) / (len || 1);
  const ny = (b.x - a.x) / (len || 1);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const j = k === 0 ? 0 : (hash2(Math.round(x), Math.round(y), seed) - 0.5) * 2 * amp;
    out.push({ x: x + nx * j, y: y + ny * j });
  }
}

/** Subdivide + jitter an outline so it reads as hand-inked. */
export function wobble(pts: readonly Vec[], amp: number, seed: number, step = 14): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < pts.length; i++) wobbleEdge(pts[i], pts[(i + 1) % pts.length], amp, seed, step, out);
  return out;
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Vec[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** Runs of consecutive edges passing `pred`, as lists of edge indices (wrap-around merged). */
function runs(piece: Piece, pred: (n: Vec, i: number) => boolean): number[][] {
  const n = piece.pts.length;
  const out: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < n; i++) {
    if (pred(piece.normals[i], i)) cur.push(i);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    if (out.length && out[0][0] === 0 && cur[cur.length - 1] === n - 1) out[0] = [...cur, ...out[0]];
    else out.push(cur);
  }
  return out;
}

/** The wobbled polyline for a run of edges. */
function runLine(piece: Piece, run: number[], amp: number, step: number): Vec[] {
  const out: Vec[] = [];
  const n = piece.pts.length;
  for (const i of run) wobbleEdge(piece.pts[i], piece.pts[(i + 1) % n], amp, piece.seed, step, out);
  out.push(piece.pts[(run[run.length - 1] + 1) % n]);
  return out;
}

const isTop = (n: Vec) => n.y < -0.35;
const topK = (n: Vec) => Math.min(1, (-n.y - 0.35) / 0.45);

/** Walk along the top edges, calling fn at spaced positions with the local tangent/normal. */
function alongTops(piece: Piece, rng: Rng, spacing: [number, number], minFlat: number, fn: (x: number, y: number, tx: number, ty: number, n: Vec) => void, clipX?: [number, number]): void {
  const n = piece.pts.length;
  for (let i = 0; i < n; i++) {
    const nn = piece.normals[i];
    if (-nn.y < minFlat) continue;
    const a = piece.pts[i];
    const b = piece.pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / (len || 1);
    const ty = (b.y - a.y) / (len || 1);
    for (let s = rng.range(2, spacing[1]); s < len - 3; s += rng.range(spacing[0], spacing[1])) {
      const x = a.x + tx * s;
      const y = a.y + ty * s;
      if (clipX && (x < clipX[0] || x > clipX[1])) continue;
      fn(x, y, tx, ty, nn);
    }
  }
}

// ───────────────────────────── shared passes ─────────────────────────────

export interface PaintCtx {
  ctx: CanvasRenderingContext2D;
  p: Palette;
  rng: Rng;
  /** Visible world x range (to skip work off-screen). */
  vx: [number, number];
  /** Visible bottom (world y). */
  vy1: number;
  accents: Accent[];
}

/** Diagonal cross-hatching over a bbox (caller has clipped). */
function hatch(ctx: CanvasRenderingContext2D, box: BBox, vx: [number, number], vy1: number, color: string, step: number, dir: 1 | -1, alpha = 1): void {
  const x0 = Math.max(box.minX, vx[0] - 20);
  const x1 = Math.min(box.maxX, vx[1] + 20);
  const y0 = box.minY - 2;
  const y1 = Math.min(box.maxY, vy1 + 20);
  const hgt = y1 - y0;
  if (x1 <= x0 || hgt <= 0) return;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const start = Math.floor((x0 - (dir > 0 ? 0 : hgt)) / step) * step;
  for (let x = start; x < x1 + hgt; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x - dir * hgt, y1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The shared "ink mass" treatment: body gradient, hatching, lit soil band under the rim, engraved
 * lip strokes and depth fade. Leaves the outline path clipped? No — restores before returning.
 */
function inkMass(pc: PaintCtx, piece: Piece, outline: Vec[], body: string, soil: string, opts: { hatchStep?: number; lip?: boolean; band?: number } = {}): void {
  const { ctx, p, vx, vy1 } = pc;
  const box = piece.box;
  ctx.save();
  trace(ctx, outline);
  const top = box.minY;
  const g = ctx.createLinearGradient(0, top, 0, top + 420);
  g.addColorStop(0, mix(body, soil, 0.3));
  g.addColorStop(0.22, body);
  g.addColorStop(1, mix(body, '#000000', 0.4));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // Fine cross-hatching.
  const step = opts.hatchStep ?? 7;
  hatch(ctx, box, vx, vy1, p.hatch, step, 1);
  hatch(ctx, box, vx, vy1, p.hatch, step * 2.7, -1, 0.55);
  // Lit soil band just under every upward-facing edge.
  const band = opts.band ?? 1;
  const bandCol = mix(soil, p.rim, 0.28);
  const topRuns = runs(piece, isTop);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const run of topRuns) {
    const line = runLine(piece, run, 1.1, 14);
    for (const [w, a] of [
      [64, 0.1],
      [34, 0.15],
      [14, 0.22],
    ] as const) {
      ctx.strokeStyle = rgba(bandCol, a * band);
      ctx.lineWidth = w;
      ctx.beginPath();
      line.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
  }
  // Engraved lip: short strokes shading down from the surface.
  if (opts.lip !== false) {
    ctx.strokeStyle = rgba(mix(soil, p.rim, 0.4), 0.3);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    alongTops(
      piece,
      pc.rng,
      [2.6, 4.2],
      0.35,
      (x, y, tx, ty) => {
        const l = pc.rng.range(4, 11);
        const ox = -ty * 2 + tx * 0.5;
        ctx.moveTo(x + tx * 0.5, y + 2.5);
        ctx.lineTo(x + ox - l * 0.45, y + 2.5 + l);
      },
      vx,
    );
    ctx.stroke();
  }
  // Depth: deep ground sinks back into ink.
  const d = ctx.createLinearGradient(0, top + 120, 0, top + 460);
  d.addColorStop(0, rgba(body, 0));
  d.addColorStop(1, rgba(mix(body, '#000000', 0.3), 0.75));
  ctx.fillStyle = d;
  ctx.fillRect(Math.max(box.minX, vx[0] - 20), top + 120, Math.min(box.maxX, vx[1] + 20) - Math.max(box.minX, vx[0] - 20), Math.max(0, Math.min(box.maxY, vy1 + 20) - top - 120));
  ctx.restore();
}

/** The moonlit rim: soft glow + bright core + hot hairline along upward edges; faint side light. */
function rim(pc: PaintCtx, piece: Piece, color: string, strength = 1, opts: { side?: boolean; under?: string } = {}): void {
  const { ctx, p } = pc;
  const n = piece.pts.length;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Side light on steep faces that look toward the key light.
  if (opts.side !== false) {
    for (let i = 0; i < n; i++) {
      const nn = piece.normals[i];
      if (nn.y < -0.35 || nn.y > 0.7 || Math.abs(nn.x) < 0.5) continue;
      const a = piece.pts[i];
      const b = piece.pts[(i + 1) % n];
      const facing = nn.x > 0 === p.lightX > (a.x + b.x) / 2;
      // Side light fades with depth below the lip, so tall cliffs dissolve into the dark.
      const yTop = Math.min(a.y, b.y);
      const sg = ctx.createLinearGradient(0, yTop, 0, yTop + 90);
      sg.addColorStop(0, rgba(color, (facing ? 0.4 : 0.1) * strength));
      sg.addColorStop(1, rgba(color, 0));
      ctx.strokeStyle = sg;
      ctx.lineWidth = facing ? 1.4 : 1;
      const line: Vec[] = [];
      wobbleEdge(a, b, 1.1, piece.seed, 14, line);
      line.push(b);
      ctx.beginPath();
      line.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
  }
  // Undersides of floating pieces catch a little reflected light.
  if (piece.floating && opts.under) {
    ctx.strokeStyle = opts.under;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const nn = piece.normals[i];
      if (nn.y < 0.5) continue;
      const a = piece.pts[i];
      const b = piece.pts[(i + 1) % n];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // The rim proper.
  for (const run of runs(piece, isTop)) {
    const line = runLine(piece, run, 1.1, 14);
    ctx.strokeStyle = rgba(color, 0.16 * strength);
    ctx.lineWidth = 8;
    ctx.beginPath();
    line.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y + 1) : ctx.moveTo(q.x, q.y + 1)));
    ctx.stroke();
    // Core: per sub-segment so steep bits dim and the width breathes like a brush.
    let k = 0;
    for (const i of run) {
      const a = piece.pts[i];
      const b = piece.pts[(i + 1) % n];
      const kk = topK(piece.normals[i]);
      const seg: Vec[] = [];
      wobbleEdge(a, b, 1.1, piece.seed, 14, seg);
      seg.push(b);
      for (let s = 0; s < seg.length - 1; s++, k++) {
        const w = 1.9 + 0.9 * hash2(k, piece.seed, 3);
        ctx.strokeStyle = rgba(color, (0.55 + 0.4 * kk) * strength);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(seg[s].x, seg[s].y + 0.4);
        ctx.lineTo(seg[s + 1].x, seg[s + 1].y + 0.4);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = rgba(mix(color, '#FFFFFF', 0.6), 0.45 * strength);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    line.forEach((q, k2) => (k2 ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────── flora ─────────────────────────────

function bloomDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
  g.addColorStop(0, rgba(color, 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function flora(pc: PaintCtx, piece: Piece, dark: string): void {
  const { ctx, p, rng, vx } = pc;
  const tip = rgba(p.rim, 0.55);
  ctx.save();
  ctx.lineCap = 'round';
  const blade = (x: number, y: number, h: number, lean: number, w = 1.2) => {
    ctx.strokeStyle = dark;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
    ctx.strokeStyle = tip;
    ctx.lineWidth = w * 0.7;
    ctx.beginPath();
    ctx.moveTo(x + lean * 0.55, y - h * 0.7);
    ctx.quadraticCurveTo(x + lean * 0.8, y - h * 0.88, x + lean, y - h);
    ctx.stroke();
  };
  switch (p.flora) {
    case 'grass':
      alongTops(
        piece,
        rng,
        [10, 30],
        0.6,
        (x, y) => {
          const n = rng.int(2, 5);
          for (let i = 0; i < n; i++) blade(x + i * 2 - n, y, rng.range(5, 13), rng.range(-5, 5));
          if (rng.chance(0.16)) {
            const h = rng.range(10, 18);
            const fx = x + rng.range(-3, 3);
            ctx.strokeStyle = dark;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(fx, y);
            ctx.quadraticCurveTo(fx + 2, y - h * 0.5, fx + 1, y - h);
            ctx.stroke();
            bloomDot(ctx, fx + 1, y - h, rng.range(1.4, 2.2), rng.pick(p.bloom));
          }
        },
        vx,
      );
      break;
    case 'moss':
      alongTops(
        piece,
        rng,
        [8, 22],
        0.55,
        (x, y) => {
          ctx.fillStyle = dark;
          ctx.beginPath();
          ctx.ellipse(x, y + 1, rng.range(3, 7), rng.range(2, 4), 0, Math.PI, 0);
          ctx.fill();
          if (rng.chance(0.28)) {
            // A tiny glowing mushroom.
            const h = rng.range(4, 10);
            const c = rng.pick(p.bloom);
            ctx.strokeStyle = rgba(mix(c, '#FFFFFF', 0.5), 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + rng.range(-1, 1), y - h);
            ctx.stroke();
            const g = ctx.createRadialGradient(x, y - h, 0, x, y - h, 9);
            g.addColorStop(0, rgba(c, 0.4));
            g.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = g;
            ctx.fillRect(x - 9, y - h - 9, 18, 18);
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.ellipse(x, y - h, rng.range(2.5, 4), 2, 0, Math.PI, 0);
            ctx.fill();
          } else if (rng.chance(0.3)) blade(x + 3, y, rng.range(4, 8), rng.range(-3, 3), 1);
        },
        vx,
      );
      break;
    case 'reeds':
      alongTops(
        piece,
        rng,
        [12, 34],
        0.6,
        (x, y) => {
          if (rng.chance(0.3)) {
            const n = rng.int(3, 6);
            for (let i = 0; i < n; i++) {
              const h = rng.range(14, 32);
              const lean = rng.range(-6, 6);
              blade(x + i * 2.5, y, h, lean, 1.1);
              if (rng.chance(0.4)) {
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.ellipse(x + i * 2.5 + lean * 0.92, y - h * 0.9, 1.6, 4, Math.atan2(lean, h) * 0.8, 0, TAU);
                ctx.fill();
              }
            }
          } else {
            const n = rng.int(2, 4);
            for (let i = 0; i < n; i++) blade(x + i * 2, y, rng.range(4, 9), rng.range(-3, 3));
          }
          if (rng.chance(0.06)) bloomDot(ctx, x + 4, y - rng.range(10, 20), 1.1, p.bloom[0]);
        },
        vx,
      );
      break;
    case 'frost':
      alongTops(
        piece,
        rng,
        [9, 26],
        0.55,
        (x, y) => {
          if (rng.chance(0.4)) {
            const n = rng.int(1, 4);
            for (let i = 0; i < n; i++) {
              const h = rng.range(4, 13);
              const w = rng.range(2, 4);
              const lean = rng.range(-0.5, 0.5);
              const sx = x + i * 4;
              ctx.fillStyle = rgba(mix(p.crystal, '#9FD8F0', 0.4), 0.9);
              ctx.beginPath();
              ctx.moveTo(sx - w, y + 1);
              ctx.lineTo(sx + lean * h, y - h);
              ctx.lineTo(sx + w, y + 1);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = rgba('#DDF4FF', 0.6);
              ctx.lineWidth = 0.7;
              ctx.beginPath();
              ctx.moveTo(sx + lean * h, y - h);
              ctx.lineTo(sx + w, y + 1);
              ctx.stroke();
            }
          } else {
            const n = rng.int(2, 4);
            for (let i = 0; i < n; i++) blade(x + i * 2, y, rng.range(4, 9), rng.range(-2, 2), 1);
          }
        },
        vx,
      );
      break;
    case 'fern':
      alongTops(
        piece,
        rng,
        [12, 30],
        0.55,
        (x, y) => {
          if (rng.chance(0.45)) {
            // A curled fiddlehead or a small fern.
            const h = rng.range(8, 16);
            const dir = rng.chance(0.5) ? 1 : -1;
            ctx.strokeStyle = dark;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x, y - h, x + dir * h * 0.35, y - h);
            ctx.arc(x + dir * h * 0.35, y - h + 2.5, 2.5, -Math.PI / 2, dir > 0 ? Math.PI * 0.9 : -Math.PI * 1.9, dir < 0);
            ctx.stroke();
            ctx.strokeStyle = tip;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.arc(x + dir * h * 0.35, y - h + 2.5, 2.5, -Math.PI * 0.9, -Math.PI * 0.1);
            ctx.stroke();
          } else {
            const n = rng.int(2, 4);
            for (let i = 0; i < n; i++) blade(x + i * 2, y, rng.range(4, 10), rng.range(-4, 4), 1);
          }
          if (rng.chance(0.12)) bloomDot(ctx, x + rng.range(-4, 4), y - rng.range(3, 12), 1, rng.pick(p.bloom));
        },
        vx,
      );
      break;
    case 'paper':
      alongTops(
        piece,
        rng,
        [9, 26],
        0.55,
        (x, y) => {
          const lit = mix(p.paper, p.rim, 0.35);
          if (rng.chance(0.18)) {
            // A paper pinwheel flower on a stalk.
            const h = rng.range(9, 16);
            ctx.strokeStyle = dark;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 1, y - h);
            ctx.stroke();
            const c = rng.pick(p.bloom);
            const r = rng.range(2.5, 3.8);
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * TAU + rng.range(0, 0.3);
              ctx.fillStyle = k % 2 ? c : mix(c, '#000000', 0.25);
              ctx.beginPath();
              ctx.moveTo(x + 1, y - h);
              ctx.lineTo(x + 1 + Math.cos(a) * r, y - h + Math.sin(a) * r);
              ctx.lineTo(x + 1 + Math.cos(a + 1.1) * r * 0.9, y - h + Math.sin(a + 1.1) * r * 0.9);
              ctx.closePath();
              ctx.fill();
            }
          } else if (rng.chance(0.7)) {
            // Folded paper leaves: little lozenges creased down the middle, leaning like a sprig.
            const n = rng.int(1, 4);
            for (let i = 0; i < n; i++) {
              const h = rng.range(5, 10);
              const lw = h * 0.36;
              const lean = rng.range(-0.5, 0.5) + (i - (n - 1) / 2) * 0.35;
              const sx = x + i * 2.5;
              const tx = sx + Math.sin(lean) * h;
              const ty = y - Math.cos(lean) * h;
              const mx = (sx + tx) / 2;
              const my = (y + ty) / 2;
              const px = Math.cos(lean) * lw;
              const py = Math.sin(lean) * lw;
              ctx.fillStyle = mix(dark, lit, 0.35);
              ctx.beginPath();
              ctx.moveTo(sx, y + 1);
              ctx.lineTo(mx - px, my - py);
              ctx.lineTo(tx, ty);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = rgba(lit, 0.9);
              ctx.beginPath();
              ctx.moveTo(sx, y + 1);
              ctx.lineTo(mx + px, my + py);
              ctx.lineTo(tx, ty);
              ctx.closePath();
              ctx.fill();
            }
          }
        },
        vx,
      );
      break;
  }
  ctx.restore();
}

/** Pebbles and roots in the soil band. */
function soilDetail(pc: PaintCtx, piece: Piece, body: string): void {
  const { ctx, p, rng, vx } = pc;
  ctx.save();
  ctx.lineWidth = 0.8;
  alongTops(
    piece,
    rng,
    [18, 46],
    0.5,
    (x, y, tx, ty) => {
      const d = rng.range(7, 22);
      const px = x - ty * 0 + tx * 0;
      if (rng.chance(0.55)) {
        const r = rng.range(1.5, 4.2);
        ctx.fillStyle = mix(body, p.soil, 0.55);
        ctx.strokeStyle = rgba(mix(p.soil, p.rim, 0.3), 0.35);
        ctx.beginPath();
        ctx.ellipse(px, y + d, r * 1.3, r, rng.range(-0.4, 0.4), 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.strokeStyle = rgba(mix(p.soil, p.rim, 0.2), 0.25);
        ctx.beginPath();
        ctx.moveTo(px, y + 3);
        ctx.bezierCurveTo(px + rng.range(-6, 6), y + d * 0.5, px + rng.range(-8, 8), y + d, px + rng.range(-10, 10), y + d * 1.6);
        ctx.stroke();
      }
    },
    vx,
  );
  ctx.restore();
}

/** Roots and tendrils dangling from the underside of floating ground. */
function hangingRoots(pc: PaintCtx, piece: Piece, dark: string): void {
  if (!piece.floating) return;
  const { ctx, p, rng } = pc;
  const n = piece.pts.length;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const nn = piece.normals[i];
    if (nn.y < 0.4) continue;
    const a = piece.pts[i];
    const b = piece.pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = rng.range(6, 30); s < len - 4; s += rng.range(20, 64)) {
      const t = s / len;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t - 1;
      const l = rng.chance(0.25) ? rng.range(30, 52) : rng.range(6, 22);
      const sway = rng.range(-9, 9);
      ctx.strokeStyle = dark;
      ctx.lineWidth = rng.range(0.9, 1.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + sway, y + l * 0.35, x - sway, y + l * 0.7, x + sway * 0.5, y + l);
      ctx.stroke();
      if (rng.chance(0.35)) {
        ctx.strokeStyle = rgba(p.rim, 0.25);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ───────────────────────────── styles ─────────────────────────────

export function paintEarth(pc: PaintCtx, piece: Piece): void {
  const { p } = pc;
  const body = p.terrain;
  const outline = wobble(piece.pts, 1.1, piece.seed);
  inkMass(pc, piece, outline, body, p.soil);
  if (!piece.def.bare) soilDetail(pc, piece, body);
  hangingRoots(pc, piece, mix(body, p.soil, 0.25));
  rim(pc, piece, p.rim, 1, { under: rgba(p.soil, 0.5) });
  if (!piece.def.bare) flora(pc, piece, mix(body, p.soil, 0.45));
}

export function paintRock(pc: PaintCtx, piece: Piece): void {
  const { ctx, p, rng } = pc;
  const body = mix(p.terrain, mix(p.crystal, '#3A3E4A', 0.5), 0.22);
  const outline = wobble(piece.pts, 1.5, piece.seed, 10);
  inkMass(pc, piece, outline, body, mix(p.soil, '#4A4E60', 0.25), { hatchStep: 6 });
  ctx.save();
  trace(ctx, outline);
  ctx.clip();
  // Strata: the top profile echoed a few times deeper, slightly broken.
  ctx.lineCap = 'round';
  for (const run of runs(piece, isTop)) {
    const line = runLine(piece, run, 1.1, 10);
    for (const [dy, a] of [
      [12, 0.22],
      [27, 0.14],
      [45, 0.08],
    ] as const) {
      ctx.strokeStyle = rgba(mix(p.soil, p.rim, 0.25), a);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < line.length; i++) {
        const q = line[i];
        if (hash2(Math.round(q.x), dy, piece.seed) < 0.18) {
          pen = false;
          continue;
        }
        const yy = q.y + dy + (hash2(Math.round(q.x), Math.round(q.y), piece.seed + dy) - 0.5) * 3;
        if (!pen) ctx.moveTo(q.x, yy);
        else ctx.lineTo(q.x, yy);
        pen = true;
      }
      ctx.stroke();
    }
  }
  // A few cracks.
  const b = piece.box;
  const cracks = Math.min(6, Math.max(1, Math.round((Math.min(b.maxX, pc.vx[1]) - Math.max(b.minX, pc.vx[0])) / 90)));
  ctx.strokeStyle = rgba('#000000', 0.55);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < cracks; i++) {
    let x = rng.range(Math.max(b.minX, pc.vx[0]) + 10, Math.min(b.maxX, pc.vx[1]) - 10);
    let y = b.minY + rng.range(4, 20);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < rng.int(3, 6); k++) {
      x += rng.range(-8, 8);
      y += rng.range(5, 12);
      ctx.lineTo(x, y);
      if (rng.chance(0.3)) {
        ctx.lineTo(x + rng.range(-9, 9), y + rng.range(3, 8));
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  hangingRoots(pc, piece, body);
  rim(pc, piece, p.rim, 1, { under: rgba(mix(p.soil, p.rim, 0.2), 0.35) });
  // A little moss on the tops of rocks.
  if (!piece.def.bare) {
    ctx.save();
    ctx.fillStyle = mix(mix(body, p.soil, 0.7), p.rim, 0.12);
    alongTops(
      piece,
      rng,
      [16, 40],
      0.7,
      (x, y) => {
        if (!rng.chance(0.5)) return;
        ctx.beginPath();
        ctx.ellipse(x, y + 0.5, rng.range(3, 8), rng.range(1.5, 3), 0, Math.PI, 0);
        ctx.fill();
      },
      pc.vx,
    );
    ctx.restore();
  }
}

/** Organic wood (trunks, boughs, roots): bark grain that follows the contour, and a few knots. */
function paintBark(pc: PaintCtx, piece: Piece, body: string): void {
  const { ctx, p, rng } = pc;
  const outline = wobble(piece.pts, 1.2, piece.seed, 10);
  inkMass(pc, piece, outline, body, mix(p.soil, p.wood, 0.5), { hatchStep: 8, lip: false, band: 0.6 });
  ctx.save();
  trace(ctx, outline);
  ctx.clip();
  ctx.lineCap = 'round';
  const n = piece.pts.length;
  for (let i = 0; i < n; i++) {
    const a = piece.pts[i];
    const b = piece.pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 24) continue;
    if (Math.max(a.x, b.x) < pc.vx[0] - 40 || Math.min(a.x, b.x) > pc.vx[1] + 40) continue;
    const nn = piece.normals[i];
    for (let k = 0; k < 4; k++) {
      const off = 4 + k * rng.range(4, 7);
      const ax = a.x - nn.x * off;
      const ay = a.y - nn.y * off;
      const bx = b.x - nn.x * off;
      const by = b.y - nn.y * off;
      ctx.strokeStyle = rgba(mix(p.wood, p.rim, 0.35), 0.16 - k * 0.03);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const steps = Math.max(2, Math.round(len / 18));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const w = Math.sin(t * 9 + k * 2 + piece.seed) * 1.6;
        const x = ax + (bx - ax) * t - nn.x * w;
        const y = ay + (by - ay) * t - nn.y * w;
        if (j && hash2(j, k, piece.seed + i) < 0.12) ctx.moveTo(x, y);
        else if (j) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  // Knots.
  const b = piece.box;
  const knots = Math.min(5, Math.round(((Math.min(b.maxX, pc.vx[1]) - Math.max(b.minX, pc.vx[0])) * (b.maxY - b.minY)) / 30000));
  for (let i = 0; i < knots; i++) {
    const x = rng.range(Math.max(b.minX, pc.vx[0]), Math.min(b.maxX, pc.vx[1]));
    const y = rng.range(b.minY, Math.min(b.maxY, pc.vy1));
    if (!pointInPolygon({ x, y }, piece.pts)) continue;
    ctx.strokeStyle = rgba(mix(p.wood, p.rim, 0.3), 0.2);
    ctx.lineWidth = 0.9;
    for (const r of [3, 6]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.5, r, rng.range(-0.5, 0.5), 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  rim(pc, piece, p.rim, 0.9, { under: rgba(p.soil, 0.35) });
}

export function paintWood(pc: PaintCtx, piece: Piece): void {
  const { ctx, p, rng } = pc;
  const body = mix(p.terrain, p.wood, 0.75);
  // Anything that isn't a plank or post (4 corners) is organic: a trunk, a bough, a root.
  if (piece.def.pts.length > 4) return paintBark(pc, piece, body);
  const outline = wobble(piece.pts, 0.6, piece.seed, 18);
  const b = piece.box;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  ctx.save();
  trace(ctx, outline);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.minY + Math.min(h, 200));
  g.addColorStop(0, mix(body, p.soil, 0.25));
  g.addColorStop(1, mix(body, '#000000', 0.25));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  hatch(ctx, b, pc.vx, pc.vy1, p.hatch, 9, 1, 0.6);
  const line = rgba('#000000', 0.55);
  const hi = rgba(mix(p.wood, p.rim, 0.4), 0.16);
  if (w >= h * 0.9) {
    // Planks along the dominant top edge.
    let ang = 0;
    let best = 0;
    piece.pts.forEach((a, i) => {
      const bb = piece.pts[(i + 1) % piece.pts.length];
      const l = Math.hypot(bb.x - a.x, bb.y - a.y);
      if (piece.normals[i].y < -0.5 && l > best) {
        best = l;
        ang = Math.atan2(bb.y - a.y, bb.x - a.x);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
      }
    });
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const R = Math.hypot(w, h) / 2 + 4;
    const pw = rng.range(10, 13);
    for (let y = -R; y < R; y += pw) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-R, y);
      ctx.lineTo(R, y);
      ctx.stroke();
      ctx.strokeStyle = hi;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-R, y + 1.4);
      ctx.lineTo(R, y + 1.4);
      ctx.stroke();
      // Staggered joints with nails.
      for (let x = -R + rng.range(10, 60); x < R; x += rng.range(50, 110)) {
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + pw);
        ctx.stroke();
        ctx.fillStyle = rgba(mix(p.wood, p.rim, 0.5), 0.45);
        ctx.fillRect(x - 3.2, y + pw * 0.45, 1.4, 1.4);
        ctx.fillRect(x + 1.8, y + pw * 0.45, 1.4, 1.4);
      }
      // Grain.
      if (rng.chance(0.6)) {
        const gx = rng.range(-R * 0.8, R * 0.8);
        ctx.strokeStyle = rgba(mix(p.wood, p.rim, 0.3), 0.12);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(gx, y + pw / 2, rng.range(5, 12), pw * 0.18, 0, 0, TAU);
        ctx.stroke();
      }
    }
  } else {
    // A post: vertical grain and rope bindings.
    ctx.strokeStyle = rgba(mix(p.wood, p.rim, 0.3), 0.13);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = b.minX + 3; x < b.maxX - 2; x += rng.range(3, 6)) {
      ctx.moveTo(x, b.minY);
      let yy = b.minY;
      while (yy < Math.min(b.maxY, pc.vy1)) {
        yy += rng.range(20, 50);
        ctx.quadraticCurveTo(x + rng.range(-1.5, 1.5), yy - 12, x + rng.range(-0.6, 0.6), yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((b.minX + b.maxX) / 2, b.minY);
    ctx.lineTo((b.minX + b.maxX) / 2, Math.min(b.maxY, pc.vy1));
    ctx.stroke();
    for (const t of [0.12, 0.78]) {
      const y = b.minY + Math.min(h, 400) * t;
      if (y > b.maxY - 10) continue;
      ctx.fillStyle = rgba('#000000', 0.4);
      ctx.fillRect(b.minX, y - 1, w, 9);
      ctx.strokeStyle = rgba('#D9B98A', 0.55);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(b.minX - 1, y + k * 3);
        ctx.lineTo(b.maxX + 1, y + k * 3 + 2);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  rim(pc, piece, p.rim, 0.9, { under: rgba(p.soil, 0.4) });
}

export function paintPaper(pc: PaintCtx, piece: Piece): void {
  const { ctx, p, rng } = pc;
  const body = mix(p.terrain, p.paper, 0.85);
  const lit = mix(p.paper, p.rim, 0.3);
  const outline = wobble(piece.pts, 1.3, piece.seed, 7);
  const b = piece.box;
  const x0 = Math.max(b.minX, pc.vx[0] - 20);
  const x1 = Math.min(b.maxX, pc.vx[1] + 20);
  const y1 = Math.min(b.maxY, pc.vy1 + 20);
  const w = x1 - x0;
  const h = y1 - b.minY;
  ctx.save();
  trace(ctx, outline);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.minY + 360);
  g.addColorStop(0, mix(body, p.soil, 0.25));
  g.addColorStop(1, mix(body, '#000000', 0.35));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const facets: number[] = [];
  if (w >= h * 0.8) {
    // Accordion folds across the width.
    for (let x = x0; x < x1; x += rng.range(60, 120)) facets.push(x);
    facets.push(x1);
    for (let i = 0; i < facets.length - 1; i++) {
      const a = facets[i];
      const c = facets[i + 1];
      const litSide = i % 2 === 0;
      const fg = ctx.createLinearGradient(a, 0, c, 0);
      if (litSide) {
        fg.addColorStop(0, rgba(lit, 0.03));
        fg.addColorStop(1, rgba(lit, 0.14));
      } else {
        fg.addColorStop(0, rgba('#000000', 0.16));
        fg.addColorStop(1, rgba('#000000', 0.03));
      }
      ctx.fillStyle = fg;
      ctx.fillRect(a, b.minY - 4, c - a, h + 8);
    }
    ctx.strokeStyle = rgba(mix(lit, '#FFFFFF', 0.3), 0.22);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < facets.length - 1; i += 2) {
      ctx.moveTo(facets[i], b.minY - 4);
      ctx.lineTo(facets[i], y1);
    }
    ctx.stroke();
  } else {
    // A folded column: two-tone faces split by a crease, a folded corner near the top.
    const cx = (b.minX + b.maxX) / 2 + (b.maxX - b.minX) * 0.06;
    const litRight = p.lightX > cx;
    ctx.fillStyle = rgba(litRight ? '#000000' : lit, litRight ? 0.22 : 0.2);
    ctx.fillRect(b.minX - 2, b.minY - 2, cx - b.minX + 2, h + 4);
    ctx.fillStyle = rgba(litRight ? lit : '#000000', litRight ? 0.2 : 0.22);
    ctx.fillRect(cx, b.minY - 2, b.maxX - cx + 2, h + 4);
    ctx.strokeStyle = rgba(mix(lit, '#FFFFFF', 0.3), 0.25);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, b.minY);
    ctx.lineTo(cx, y1);
    for (let y = b.minY + rng.range(40, 70); y < y1 - 20; y += rng.range(50, 90)) {
      ctx.moveTo(b.minX, y);
      ctx.lineTo(cx, y + 6);
      ctx.lineTo(b.maxX, y);
    }
    ctx.stroke();
  }
  // Folds soften with depth: deep paper sinks back into shadow.
  const df = ctx.createLinearGradient(0, b.minY + 70, 0, b.minY + 300);
  df.addColorStop(0, rgba(mix(body, '#000000', 0.2), 0));
  df.addColorStop(1, rgba(mix(body, '#000000', 0.35), 0.92));
  ctx.fillStyle = df;
  ctx.fillRect(x0, b.minY + 70, w, Math.max(0, y1 - b.minY - 70));
  // Washi fibres.
  ctx.strokeStyle = rgba(mix(lit, '#FFFFFF', 0.4), 0.07);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const nf = Math.min(900, Math.round((w * Math.min(h, 300)) / 90));
  for (let i = 0; i < nf; i++) {
    const x = rng.range(x0, x1);
    const y = rng.range(b.minY, b.minY + Math.min(h, 300));
    const a = rng.range(0, Math.PI);
    const l = rng.range(3, 9);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  ctx.stroke();
  // Soft paper shading under the top edge.
  for (const run of runs(piece, isTop)) {
    const line = runLine(piece, run, 1.3, 7);
    ctx.strokeStyle = rgba(p.soil, 0.3);
    ctx.lineWidth = 34;
    ctx.beginPath();
    line.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }
  // Crimped fold strip: a zig-zag of little lit / shadowed facets just under every top edge.
  {
    const n = piece.pts.length;
    for (let i = 0; i < n; i++) {
      const nn = piece.normals[i];
      if (nn.y > -0.35) continue;
      const a = piece.pts[i];
      const c = piece.pts[(i + 1) % n];
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      const tx = (c.x - a.x) / (len || 1);
      const ty = (c.y - a.y) / (len || 1);
      let s0 = 0;
      let k = 0;
      while (s0 < len) {
        const s1 = Math.min(len, s0 + rng.range(16, 26));
        const d = rng.range(11, 18);
        const ax = a.x + tx * s0;
        const ay = a.y + ty * s0;
        const bx = a.x + tx * s1;
        const by = a.y + ty * s1;
        const mx = (ax + bx) / 2 - nn.x * d;
        const my = (ay + by) / 2 - nn.y * d;
        if (bx > pc.vx[0] - 30 && ax < pc.vx[1] + 30) {
          ctx.fillStyle = k % 2 ? rgba('#000000', 0.26) : rgba(lit, 0.34);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(mx, my);
          ctx.closePath();
          ctx.fill();
        }
        s0 = s1;
        k++;
      }
    }
  }
  ctx.restore();
  // Deckled paper edge: a pale hairline just inside the outline.
  ctx.save();
  ctx.strokeStyle = rgba(lit, 0.35);
  ctx.lineWidth = 0.8;
  trace(ctx, outline);
  ctx.stroke();
  ctx.restore();
  rim(pc, piece, p.rim, 1, { under: rgba(lit, 0.3) });
  if (!piece.def.bare) flora(pc, piece, mix(body, p.soil, 0.3));
}

export function paintCrystal(pc: PaintCtx, piece: Piece): void {
  const { ctx, p, rng } = pc;
  const body = mix(p.terrain, p.crystal, 0.8);
  const glint = mix(p.rim, '#9FE0F8', 0.4);
  const outline = wobble(piece.pts, 0.5, piece.seed, 30);
  const b = piece.box;
  ctx.save();
  trace(ctx, outline);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.minY + 300);
  g.addColorStop(0, mix(body, '#2E5A70', 0.22));
  g.addColorStop(0.3, body);
  g.addColorStop(1, mix(body, '#000000', 0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  hatch(ctx, b, pc.vx, pc.vy1, rgba(glint, 0.05), 8, -1);
  // Facet bands under every top run: shards of glass catching light at different angles.
  const n = piece.pts.length;
  for (const run of runs(piece, isTop)) {
    const P: Vec[] = [];
    const N: Vec[] = [];
    for (const i of run) {
      const a = piece.pts[i];
      const c = piece.pts[(i + 1) % n];
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      const cnt = Math.max(1, Math.round(len / rng.range(30, 55)));
      for (let k = 0; k < cnt; k++) {
        const t = k / cnt;
        const x = a.x + (c.x - a.x) * t;
        if (x < pc.vx[0] - 80 || x > pc.vx[1] + 80) continue;
        P.push({ x, y: a.y + (c.y - a.y) * t });
        N.push(piece.normals[i]);
      }
    }
    const last = piece.pts[(run[run.length - 1] + 1) % n];
    P.push(last);
    N.push(piece.normals[run[run.length - 1]]);
    for (const [d0, d1, amp] of [
      [14, 40, 0.75],
      [52, 100, 0.28],
    ] as const) {
      const Q = P.map((q, i) => {
        const d = rng.range(d0, d1);
        return { x: q.x - N[i].x * d + rng.range(-8, 8), y: q.y - N[i].y * d };
      });
      const base = d0 === 14 ? P : P.map((q, i) => ({ x: q.x - N[i].x * (d0 - 14), y: q.y - N[i].y * (d0 - 14) }));
      for (let i = 0; i < P.length - 1; i++) {
        const tri = (A: Vec, B: Vec, C: Vec, shade: number) => {
          ctx.fillStyle = shade > 0 ? rgba(glint, shade * amp) : rgba('#000000', -shade * amp);
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.lineTo(C.x, C.y);
          ctx.closePath();
          ctx.fill();
        };
        const lightward = (base[i].x + base[i + 1].x) / 2 < p.lightX ? 1 : -1;
        tri(base[i], base[i + 1], Q[i], (i % 2 === 0 ? 0.13 : 0.04) * (lightward > 0 ? 1 : 0.6));
        tri(base[i + 1], Q[i + 1], Q[i], i % 3 === 0 ? -0.22 : 0.02);
      }
      ctx.strokeStyle = rgba(glint, 0.16 * amp);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < P.length - 1; i++) {
        ctx.moveTo(base[i].x, base[i].y);
        ctx.lineTo(Q[i].x, Q[i].y);
        ctx.lineTo(base[i + 1].x, base[i + 1].y);
        ctx.moveTo(Q[i].x, Q[i].y);
        ctx.lineTo(Q[i + 1].x, Q[i + 1].y);
      }
      ctx.stroke();
    }
    // Glints: baked sparkles on some facet corners; a few twinkle live.
    for (let i = 1; i < P.length - 1; i++) {
      if (!rng.chance(0.3)) continue;
      const q = P[i];
      sparkle(ctx, q.x, q.y + 2, rng.range(3, 6), '#EAF8FF', 0.55);
      if (rng.chance(0.35)) pc.accents.push({ kind: 'glint', x: q.x + rng.range(-10, 10), y: q.y + rng.range(4, 30), r: rng.range(4, 8), ph: rng.range(0, TAU) });
    }
  }
  ctx.restore();
  rim(pc, piece, mix(p.rim, '#DFF6FF', 0.5), 1, { under: rgba(glint, 0.3) });
  if (!piece.def.bare && p.flora === 'frost') flora(pc, piece, mix(body, '#000000', 0.2));
}

/** A mushroom stem: pale, fibrous, with a skirt, lit from the glowing cap above. */
export function paintStem(pc: PaintCtx, piece: Piece): void {
  const { ctx, p, rng } = pc;
  const b = piece.box;
  const cx = (b.minX + b.maxX) / 2;
  const w = b.maxX - b.minX;
  const outline = wobble(piece.pts, 0.8, piece.seed, 12);
  ctx.save();
  trace(ctx, outline);
  const g = ctx.createLinearGradient(b.minX, 0, b.maxX, 0);
  const s = p.stem;
  g.addColorStop(0, mix(s, '#000000', 0.55));
  g.addColorStop(0.35, mix(s, '#000000', 0.15));
  g.addColorStop(0.6, s);
  g.addColorStop(1, mix(s, '#000000', 0.5));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = rgba(mix(s, '#FFFFFF', 0.4), 0.18);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = b.minX + 2; x < b.maxX; x += rng.range(2.5, 4.5)) {
    ctx.moveTo(x, b.minY);
    ctx.quadraticCurveTo(x + rng.range(-1.5, 1.5), (b.minY + b.maxY) / 2, x + rng.range(-1, 1), b.maxY);
  }
  ctx.stroke();
  // Glow from the cap spilling down the stem.
  const cg = ctx.createLinearGradient(0, b.minY, 0, b.minY + 70);
  cg.addColorStop(0, rgba('#FF8CC6', 0.35));
  cg.addColorStop(1, rgba('#FF8CC6', 0));
  ctx.fillStyle = cg;
  ctx.fillRect(b.minX, b.minY, w, 70);
  // Fade into the ground at the foot.
  const fg = ctx.createLinearGradient(0, b.maxY - 50, 0, b.maxY);
  fg.addColorStop(0, rgba(p.terrain, 0));
  fg.addColorStop(1, rgba(p.terrain, 0.9));
  ctx.fillStyle = fg;
  ctx.fillRect(b.minX, b.maxY - 50, w, 50);
  ctx.restore();
  // Skirt (annulus) just below the cap.
  const sy = b.minY + Math.min(26, (b.maxY - b.minY) * 0.2);
  ctx.fillStyle = mix(s, '#000000', 0.2);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, sy);
  ctx.quadraticCurveTo(cx - w * 0.85, sy + 8, cx - w * 0.7, sy + 12);
  ctx.quadraticCurveTo(cx, sy + 7, cx + w * 0.7, sy + 12);
  ctx.quadraticCurveTo(cx + w * 0.85, sy + 8, cx + w * 0.5, sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(mix(s, '#FFFFFF', 0.5), 0.35);
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** A bouncy mushroom cap: glossy magenta dome, luminous spots, gills, and a hot pink spring rim. */
export function paintCap(pc: PaintCtx, piece: Piece, scalePx: number): void {
  const { ctx, rng } = pc;
  const b = piece.box;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2;
  // Build-time bloom around the cap.
  ctx.save();
  ctx.shadowColor = 'rgba(255,80,170,0.55)';
  ctx.shadowBlur = 18 * scalePx;
  trace(ctx, piece.pts);
  ctx.fillStyle = '#E04E98';
  ctx.fill();
  ctx.restore();
  ctx.save();
  trace(ctx, piece.pts);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.maxY);
  g.addColorStop(0, '#FFB6DC');
  g.addColorStop(0.35, '#F2629F');
  g.addColorStop(0.75, '#B23A86');
  g.addColorStop(1, '#6A2468');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // Gills: a dark band with fine radiating lines along the underside.
  ctx.fillStyle = rgba('#3E1240', 0.75);
  ctx.fillRect(b.minX, b.maxY - h * 0.28, w, h * 0.3);
  ctx.strokeStyle = rgba('#FF9ACB', 0.35);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = b.minX + 3; x < b.maxX - 2; x += 3.2) {
    ctx.moveTo(cx + (x - cx) * 0.6, b.maxY + 2);
    ctx.lineTo(x, b.maxY - h * 0.28);
  }
  ctx.stroke();
  // Hatching on the dome's shadow side keeps it inked, not plastic.
  ctx.strokeStyle = rgba('#5A1650', 0.3);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = b.minX - h; x < b.maxX; x += 4) {
    ctx.moveTo(x, b.maxY);
    ctx.lineTo(x + h, b.minY);
  }
  ctx.stroke();
  const shade = ctx.createLinearGradient(b.minX, 0, b.maxX, 0);
  shade.addColorStop(0, rgba('#FFB6DC', 0.25));
  shade.addColorStop(0.5, rgba('#FFB6DC', 0.12));
  shade.addColorStop(1, rgba('#FFB6DC', 0));
  ctx.fillStyle = shade;
  ctx.fillRect(b.minX, b.minY, w, h * 0.7);
  // Luminous spots.
  const nSpots = Math.max(3, Math.round(w / 22));
  for (let i = 0; i < nSpots; i++) {
    const x = b.minX + w * (0.12 + (0.76 * (i + rng.range(0.1, 0.9))) / nSpots);
    const y = b.minY + h * rng.range(0.22, 0.52);
    const r = rng.range(2.6, 5.2) * Math.min(1.2, w / 90);
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    sg.addColorStop(0, 'rgba(255,245,252,0.95)');
    sg.addColorStop(0.4, 'rgba(255,220,240,0.8)');
    sg.addColorStop(1, 'rgba(255,200,230,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.2, r * 0.85, 0, 0, TAU);
    ctx.fill();
  }
  // Gloss.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(b.minX + w * 0.12, b.minY + h * 0.36);
  ctx.quadraticCurveTo(b.minX + w * 0.16, b.minY + h * 0.08, b.minX + w * 0.34, b.minY + h * 0.05);
  ctx.stroke();
  ctx.restore();
  // Spring rim: the bouncy surface glows like spring ink.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const run of runs(piece, (n) => n.y < -0.2)) {
    const line = runLine(piece, run, 0, 100);
    for (const [lw, col, a] of [
      [8, '#FF5FAE', 0.28],
      [2.6, '#FFC4E2', 0.95],
      [1, '#FFFFFF', 0.7],
    ] as const) {
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = lw;
      ctx.beginPath();
      line.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
  }
  ctx.restore();
  pc.accents.push({ kind: 'cap', x: cx, y: b.minY + h * 0.4, r: Math.max(40, w * 0.75), ph: rng.range(0, TAU) });
}

/** Brambles: a crimson tangle bristling with thorns. It must read as DANGER at a glance. */
export function paintBramble(pc: PaintCtx, piece: Piece, scalePx: number): void {
  const { ctx, rng } = pc;
  const b = piece.box;
  const outline = wobble(piece.pts, 2.2, piece.seed + 99, 8);
  // Hot halo (build-time blur).
  ctx.save();
  ctx.shadowColor = 'rgba(255,40,80,0.7)';
  ctx.shadowBlur = 16 * scalePx;
  trace(ctx, outline);
  ctx.fillStyle = '#3A0814';
  ctx.fill();
  ctx.restore();
  ctx.save();
  trace(ctx, outline);
  const g = ctx.createLinearGradient(0, b.minY, 0, b.maxY);
  g.addColorStop(0, '#4A0A1C');
  g.addColorStop(1, '#1E0309');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // A dense tangle: curling tendrils, each bristling with little thorns.
  const area = (b.maxX - b.minX) * (b.maxY - b.minY);
  const vines = Math.max(6, Math.round(area / 260));
  ctx.lineCap = 'round';
  for (let i = 0; i < vines; i++) {
    const x = rng.range(b.minX, b.maxX);
    const y = rng.range(b.minY + 2, b.maxY);
    const r = rng.range(5, 14);
    const a0 = rng.range(0, TAU);
    const sweep = rng.range(2.2, 4.6) * (rng.chance(0.5) ? 1 : -1);
    const bright = i % 3 === 0;
    ctx.strokeStyle = bright ? '#D0204A' : '#7A0E28';
    ctx.lineWidth = bright ? 1.5 : 2.4;
    ctx.beginPath();
    const steps = 10;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      const rr = r * (1 - (0.6 * k) / steps);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = bright ? '#FF4A6E' : '#B81E40';
    for (let k = 1; k < steps; k += 3) {
      const a = a0 + (sweep * k) / steps;
      const rr = r * (1 - (0.6 * k) / steps);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      const out = a + (sweep > 0 ? -0.4 : 0.4);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(out + 1.57) * 1.3, py + Math.sin(out + 1.57) * 1.3);
      ctx.lineTo(px + Math.cos(out) * 4.5, py + Math.sin(out) * 4.5);
      ctx.lineTo(px + Math.cos(out - 1.57) * 1.3, py + Math.sin(out - 1.57) * 1.3);
      ctx.fill();
    }
  }
  ctx.restore();
  // Big outward thorns along every edge except the buried bottom.
  const n = piece.pts.length;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = piece.pts[i];
    const c = piece.pts[(i + 1) % n];
    const nn = piece.normals[i];
    if (nn.y > 0.6) continue;
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    const ux = (c.x - a.x) / (len || 1);
    const uy = (c.y - a.y) / (len || 1);
    for (let s = rng.range(2, 6); s < len - 2; s += rng.range(5, 9)) {
      const x = a.x + ux * s;
      const y = a.y + uy * s;
      const hgt = rng.chance(0.25) ? rng.range(11, 16) : rng.range(5, 10);
      const lean = rng.range(-0.55, 0.55);
      const tx = x + (nn.x + ux * lean) * hgt;
      const ty = y + (nn.y + uy * lean) * hgt;
      const tg = ctx.createLinearGradient(x, y, tx, ty);
      tg.addColorStop(0, '#9A1232');
      tg.addColorStop(0.6, '#FF3B5C');
      tg.addColorStop(1, '#FFC2CE');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(x - ux * 3, y - uy * 3);
      ctx.quadraticCurveTo(x + (tx - x) * 0.5 - ux * 0.8, y + (ty - y) * 0.5 - uy * 0.8, tx, ty);
      ctx.lineTo(x + ux * 3, y + uy * 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Crimson rim.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,60,100,0.35)';
  ctx.lineWidth = 2;
  trace(ctx, outline);
  ctx.stroke();
  ctx.restore();
  pc.accents.push({ kind: 'thorn', x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, r: Math.max(34, (b.maxX - b.minX) * 0.7), ph: rng.range(0, TAU) });
}

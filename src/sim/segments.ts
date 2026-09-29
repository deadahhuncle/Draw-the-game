import type { Material } from '../core/types';

/** A collision segment: a capsule from A to B with half-width `hw` (0 for terrain edges). */
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  hw: number;
  mat: Material;
  /** Bounce speed override for 'bounce' material. */
  bounce?: number;
  /** Unit direction for 'rush' material (the direction the stroke was drawn). */
  dx?: number;
  dy?: number;
  /** Surface velocity (u/s) — moving platforms carry Wick with them. */
  vx?: number;
  vy?: number;
  /** Who owns the segment. */
  owner: SegOwner;
  /** Query de-duplication stamp (internal). */
  _stamp?: number;
}

export type SegOwner =
  | { kind: 'terrain'; index: number }
  | { kind: 'wall' }
  | { kind: 'stroke'; id: number }
  | { kind: 'entity'; index: number };

/** Uniform grid for fast "segments near a point" queries. */
export class SegGrid {
  private cells = new Map<number, Seg[]>();
  private stamp = 1;
  constructor(
    private readonly cell = 64,
    public segs: Seg[] = [],
  ) {
    this.rebuild(segs);
  }

  private key(cx: number, cy: number): number {
    // Supports cx, cy in roughly [-32768, 32767].
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  rebuild(segs: Seg[]): void {
    this.segs = segs;
    this.cells.clear();
    for (const s of segs) this.insert(s);
  }

  insert(s: Seg): void {
    const c = this.cell;
    const pad = s.hw + 1;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / c);
    const x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / c);
    const y0 = Math.floor((Math.min(s.ay, s.by) - pad) / c);
    const y1 = Math.floor((Math.max(s.ay, s.by) + pad) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(s);
      }
    }
  }

  /** Calls `fn` once for every segment whose cell overlaps the query circle's AABB. */
  query(x: number, y: number, r: number, fn: (s: Seg) => void): void {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c);
    const y1 = Math.floor((y + r) / c);
    const stamp = ++this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const s of arr) {
          if (s._stamp === stamp) continue;
          s._stamp = stamp;
          fn(s);
        }
      }
    }
  }
}

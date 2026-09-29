import { INK_HW, SIM_SIMPLIFY_EPS } from '../core/constants';
import { dist, lerpVec, simplifyRDP, type Vec } from '../core/math';
import type { InkType } from '../core/types';
import type { Seg } from './segments';

export interface Stroke {
  id: number;
  ink: InkType;
  /** Resampled pen points (~PEN_SAMPLE spacing), in drawing order. */
  pts: Vec[];
  /** Arc length = ink cost. */
  len: number;
  /** Sim time when the stroke began (-1 = drawn during plan mode). */
  born: number;
  /** True once the pen lifted. */
  done: boolean;
  /** Arc-length intervals eaten by moths during the current run (restored on reset). */
  bites: [number, number][];
}

/** Split a stroke into the polylines that survive its bites. */
export function livePieces(s: Stroke): Vec[][] {
  if (s.pts.length < 2) return [];
  if (s.bites.length === 0) return [s.pts];
  const cum = cumulativeLengths(s.pts);
  const total = cum[cum.length - 1];
  const alive: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of mergeIntervals(s.bites)) {
    if (a > cursor) alive.push([cursor, Math.min(a, total)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < total) alive.push([cursor, total]);
  return alive.filter(([a, b]) => b - a > 1).map(([a, b]) => subPolyline(s.pts, cum, a, b));
}

export function cumulativeLengths(pts: readonly Vec[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}

/** The part of a polyline between arc lengths u0 and u1 (with interpolated ends). */
export function subPolyline(pts: readonly Vec[], cum: readonly number[], u0: number, u1: number): Vec[] {
  const at = (u: number): Vec => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < u) i++;
    const l = cum[i] - cum[i - 1];
    return lerpVec(pts[i - 1], pts[i], l > 1e-9 ? (u - cum[i - 1]) / l : 0);
  };
  const out: Vec[] = [at(u0)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > u0 && cum[i] < u1) out.push(pts[i]);
  out.push(at(u1));
  return out;
}

export function mergeIntervals(iv: [number, number][]): [number, number][] {
  const sorted = iv.slice().sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Build collision segments for a stroke's surviving pieces. */
export function strokeSegments(s: Stroke): Seg[] {
  const out: Seg[] = [];
  const mat = s.ink === 'spring' ? 'bounce' : s.ink === 'comet' ? 'rush' : 'solid';
  for (const piece of livePieces(s)) {
    const simp = simplifyRDP(piece, SIM_SIMPLIFY_EPS);
    for (let i = 1; i < simp.length; i++) {
      const a = simp[i - 1];
      const b = simp[i];
      const l = dist(a, b);
      if (l < 1e-6) continue;
      const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, hw: INK_HW, mat, owner: { kind: 'stroke', id: s.id } };
      if (mat === 'rush') {
        seg.dx = (b.x - a.x) / l;
        seg.dy = (b.y - a.y) / l;
      }
      out.push(seg);
    }
    // A single-point piece still needs a collider (a dot of ink).
    if (simp.length === 1) {
      const a = simp[0];
      out.push({ ax: a.x, ay: a.y, bx: a.x, by: a.y, hw: INK_HW, mat, owner: { kind: 'stroke', id: s.id } });
    }
  }
  return out;
}

/** Arc-length position of the point on the stroke closest to (x,y). */
export function arcLengthAt(s: Stroke, x: number, y: number): { s: number; d2: number } {
  let best = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1];
    const b = s.pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    const l = Math.sqrt(l2);
    let t = l2 > 1e-12 ? ((x - a.x) * abx + (y - a.y) * aby) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - x;
    const dy = a.y + aby * t - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bestS = acc + l * t;
    }
    acc += l;
  }
  return { s: bestS, d2: best };
}

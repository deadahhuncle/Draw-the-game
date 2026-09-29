// Concise helpers for authoring levels by hand. Coordinates are world units (1280×720, y down).
import { H, W } from '../core/constants';
import type { Vec } from '../core/math';
import type { EntityDef, InkType, LevelDef, NoteDef, SolutionStroke, TerrainDef } from '../core/types';

export type Pt = [number, number];
export type LevelSpec = Omit<LevelDef, 'id'>;

/** How far terrain that touches the page edge is extended off-page (so it reaches the screen edges). */
export const OFFPAGE = 600;

export const pts = (arr: readonly Pt[]): Vec[] => arr.map(([x, y]) => ({ x, y }));
export const P = (x: number, y: number): Vec => ({ x, y });

type TerrainOpts = Omit<TerrainDef, 'pts'>;

/**
 * A ground mass described by its top profile (left → right). The polygon is closed straight down
 * to below the screen. A profile starting at x ≤ 0 (or ending at x ≥ W) is extended off-page.
 */
export function ground(profile: readonly Pt[], opts: TerrainOpts & { bottom?: number } = {}): TerrainDef {
  const { bottom = H + OFFPAGE, ...rest } = opts;
  const top = profile.map(([x, y]) => [x, y] as Pt);
  if (top[0][0] <= 0) top.unshift([-OFFPAGE, top[0][1]]);
  if (top[top.length - 1][0] >= W) top.push([W + OFFPAGE, top[top.length - 1][1]]);
  const poly: Pt[] = [...top, [top[top.length - 1][0], bottom], [top[0][0], bottom]];
  return { pts: pts(poly), ...rest };
}

/** An axis-aligned block. */
export function block(x: number, y: number, w: number, h: number, opts: TerrainOpts = {}): TerrainDef {
  return {
    pts: pts([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]),
    ...opts,
  };
}

/** Any polygon (clockwise or counter-clockwise). */
export function poly(points: readonly Pt[], opts: TerrainOpts = {}): TerrainDef {
  return { pts: pts(points), ...opts };
}

/** A floating rock: a slightly irregular slab with a flat walkable top from x to x+w at height y. */
export function ledge(x: number, y: number, w: number, depth = 46, opts: TerrainOpts = {}): TerrainDef {
  const d = depth;
  return {
    pts: pts([
      [x, y],
      [x + w, y],
      [x + w - 6, y + d * 0.55],
      [x + w * 0.72, y + d],
      [x + w * 0.35, y + d * 0.9],
      [x + 5, y + d * 0.5],
    ]),
    style: 'rock',
    ...opts,
  };
}

/** A patch of brambles sitting on the ground between x1 and x2 (ground surface at y), `h` tall. */
export function brambles(x1: number, x2: number, y: number, h = 30): TerrainDef {
  return {
    pts: pts([
      [x1, y + 6],
      [x1 + 8, y - h * 0.7],
      [(x1 + x2) / 2, y - h],
      [x2 - 8, y - h * 0.7],
      [x2, y + 6],
    ]),
    mat: 'hazard',
    style: 'bramble',
  };
}

/** A hazard polygon (thorny vines hanging, bramble walls…). */
export function thorns(points: readonly Pt[]): TerrainDef {
  return { pts: pts(points), mat: 'hazard', style: 'bramble' };
}

/**
 * A mushroom: a solid stem rising from the ground at (x, groundY) and a bouncy cap whose flat top
 * is at `topY`. Returns [stem, cap].
 */
export function mushroom(x: number, groundY: number, topY: number, capW = 96, bounce?: number): TerrainDef[] {
  const capH = 26;
  const stemW = Math.max(18, capW * 0.24);
  const stem = block(x - stemW / 2, topY + capH - 4, stemW, groundY - (topY + capH - 4) + 8, { style: 'wood', bare: true });
  const hw = capW / 2;
  const cap: TerrainDef = {
    pts: pts([
      [x - hw, topY + capH],
      [x - hw + 4, topY + 10],
      [x - hw + 16, topY + 2],
      [x - hw + 30, topY],
      [x + hw - 30, topY],
      [x + hw - 16, topY + 2],
      [x + hw - 4, topY + 10],
      [x + hw, topY + capH],
    ]),
    mat: 'bounce',
    style: 'mushroom',
    bare: true,
  };
  if (bounce) cap.bounce = bounce;
  return [stem, cap];
}

/** A reference-solution stroke. */
export function ink(type: InkType, points: readonly Pt[], t?: number): SolutionStroke {
  return t === undefined ? { ink: type, pts: pts(points) } : { ink: type, pts: pts(points), t };
}

/** A handwritten note. */
export function note(x: number, y: number, text: string, extra: Partial<NoteDef> = {}): NoteDef {
  return { x, y, text, ...extra };
}

export const inkpot = (x: number, y: number, amount = 200): EntityDef => ({ kind: 'inkpot', x, y, amount });

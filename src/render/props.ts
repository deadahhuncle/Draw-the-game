import type { Vec } from '../core/math';
import type { InkType, LevelDef, NoteDef } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { INK_COLORS, type Palette } from './palettes';
import { glowSprite, starPath, starSprite } from './particles';

export const HAND_FONT = '"Caveat Variable", "Caveat", "Bradley Hand", cursive';

const TAU = Math.PI * 2;

// ───────────────────────────── home-lamp ─────────────────────────────

/** Lantern centre relative to the lamp's ground point. */
export const LAMP_DX = 18;
export const LAMP_DY = -54;

/**
 * The home-lamp: a big sister of Wick — a paper lantern hung from a crooked post. `lit` 0..1 is the
 * ignition; `flare` 0..1 the white-hot moment the flame arrives.
 */
export function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, lit: number, time: number, p: Palette, flare = 0): void {
  const lx = x + LAMP_DX;
  const ly = y + LAMP_DY;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);

  // Light behind everything (so the post reads as a silhouette against it).
  ctx.globalCompositeOperation = 'lighter';
  const idle = 0.2 + 0.1 * pulse;
  const g0 = idle * (1 - lit) + lit * 0.75;
  const gr = 34 + 16 * pulse * (1 - lit) + lit * (110 + 8 * Math.sin(time * 3.3));
  ctx.globalAlpha = g0;
  ctx.drawImage(glowSprite(p.accent), lx - gr, ly - gr, gr * 2, gr * 2);
  if (lit > 0.01) {
    // Rays turning slowly: the lamp is home.
    // Rays fan upward and sway gently (light spilling into the sky, not into the ground).
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(Math.sin(time * 0.35) * 0.12);
    ctx.globalAlpha = 0.34 * lit;
    const rr = 200 + 20 * Math.sin(time * 0.9);
    ctx.drawImage(raysSprite(), -rr, -rr, rr * 2, rr * 2);
    ctx.rotate(-Math.sin(time * 0.23 + 1) * 0.2);
    ctx.globalAlpha = 0.2 * lit;
    ctx.drawImage(raysSprite(), -rr * 0.72, -rr * 0.72, rr * 1.44, rr * 1.44);
    ctx.restore();
    ctx.globalAlpha = 0.45 * lit;
    ctx.drawImage(glowSprite('#FFF1D0'), lx - 36, ly - 36, 72, 72);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Post: a crooked stick of ink, with a hook arm.
  ctx.strokeStyle = '#140B06';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 3);
  ctx.bezierCurveTo(x - 3, y - 30, x + 2, y - 52, x + 0.5, y - 80);
  ctx.quadraticCurveTo(x + 1, y - 90, x + 11, y - 88);
  ctx.quadraticCurveTo(x + 18, y - 87, x + 19, y - 81);
  ctx.stroke();
  // A little crossbar.
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 64);
  ctx.lineTo(x + 5, y - 66);
  ctx.stroke();
  // Hanging cord.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x + 19, y - 81);
  ctx.lineTo(lx, ly - 15);
  ctx.stroke();
  // Foot: a tuft of ink at the base.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const [dx, h] of [
    [-6, 6],
    [-3, 9],
    [2, 8],
    [5, 5],
  ]) {
    ctx.moveTo(x + dx, y + 2);
    ctx.quadraticCurveTo(x + dx * 1.2, y - h * 0.6, x + dx * 1.5 + 1, y - h);
  }
  ctx.stroke();

  // Lantern: unlit paper cross-fades to lit paper.
  const sw = 2 * 13;
  const sh = 2 * 17;
  const spr = lampSprites();
  const sway = Math.sin(time * 1.3) * 0.03 * (1 - lit * 0.5);
  ctx.save();
  ctx.translate(lx, ly - 15);
  ctx.rotate(sway);
  ctx.translate(0, 15);
  if (lit < 0.999) ctx.drawImage(spr.unlit, -sw, -sh, sw * 2, sh * 2);
  if (lit > 0.001) {
    ctx.globalAlpha = lit;
    ctx.drawImage(spr.lit, -sw, -sh, sw * 2, sh * 2);
    ctx.globalAlpha = 1;
  }
  // The flame inside (a bright shape seen through the paper).
  ctx.globalCompositeOperation = 'lighter';
  if (lit > 0) {
    const fk = 1 + 0.08 * Math.sin(time * 15) + 0.05 * Math.sin(time * 27);
    ctx.globalAlpha = 0.85 * lit;
    ctx.fillStyle = '#FFF6DA';
    ctx.beginPath();
    ctx.moveTo(0, -9 * fk);
    ctx.quadraticCurveTo(3.4, -1, 2.6, 2.5);
    ctx.arc(0, 2.5, 2.6, 0, Math.PI);
    ctx.quadraticCurveTo(-3.4, -1, 0, -9 * fk);
    ctx.fill();
  } else {
    // Unlit: a waiting ember — the lamp is asking to be lit.
    ctx.globalAlpha = 0.45 + 0.45 * pulse;
    ctx.drawImage(glowSprite(p.accent), -9, -6, 18, 18);
    ctx.fillStyle = '#FFE2A8';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.beginPath();
    ctx.arc(0, 3, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  if (flare > 0.001) {
    ctx.globalCompositeOperation = 'lighter';
    const f = flare * flare;
    ctx.globalAlpha = f;
    const r = 60 + 140 * (1 - flare);
    ctx.drawImage(glowSprite('#FFF6E4'), lx - r * 0.5, ly - r * 0.5, r, r);
    ctx.globalAlpha = 0.7 * f;
    ctx.drawImage(glowSprite(p.accent), lx - r * 1.4, ly - r * 1.4, r * 2.8, r * 2.8);
    ctx.globalAlpha = 0.9 * f;
    ctx.drawImage(starSprite('#FFF4D8'), lx - 60 * flare, ly - 60 * flare, 120 * flare, 120 * flare);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

let lampCache: { lit: HTMLCanvasElement; unlit: HTMLCanvasElement } | null = null;

function lampSprites(): { lit: HTMLCanvasElement; unlit: HTMLCanvasElement } {
  if (!lampCache) lampCache = { lit: paintLamp(true), unlit: paintLamp(false) };
  return lampCache;
}

/** The lantern body at 4×: rx 11, ry 14, lacquered caps, ribs, paper grain. Box = 26×34 units. */
function paintLamp(lit: boolean): HTMLCanvasElement {
  const S = 4;
  const c = document.createElement('canvas');
  c.width = 52 * S;
  c.height = 68 * S;
  const g = c.getContext('2d')!;
  g.setTransform(S, 0, 0, S, 26 * S, 34 * S);
  const rx = 11;
  const ry = 14;
  const body = () => {
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  };
  const grad = g.createRadialGradient(0, 2, 1, 0, 0, ry);
  if (lit) {
    grad.addColorStop(0, '#FFFDF0');
    grad.addColorStop(0.5, '#FFE9B8');
    grad.addColorStop(0.85, '#FFB860');
    grad.addColorStop(1, '#E4843E');
  } else {
    grad.addColorStop(0, '#5E4A3C');
    grad.addColorStop(0.7, '#3C2E26');
    grad.addColorStop(1, '#241A15');
  }
  body();
  g.fillStyle = grad;
  g.fill();
  g.save();
  body();
  g.clip();
  g.strokeStyle = lit ? 'rgba(190,100,40,0.35)' : 'rgba(10,6,4,0.55)';
  g.lineWidth = 0.55;
  for (const k of [-0.75, -0.38, 0, 0.38, 0.75]) {
    g.beginPath();
    if (k === 0) {
      g.moveTo(0, -ry);
      g.lineTo(0, ry);
    } else g.ellipse(0, 0, Math.abs(k) * rx, ry, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    g.stroke();
  }
  g.lineWidth = 0.4;
  for (let yy = -ry + 4; yy < ry; yy += 4.5) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2));
    g.beginPath();
    g.moveTo(-half, yy);
    g.quadraticCurveTo(0, yy + 1.2, half, yy);
    g.stroke();
  }
  if (!lit) {
    // A faint rim of moonlight on the unlit paper.
    g.strokeStyle = 'rgba(255,220,180,0.18)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0.8, 0.8, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
  }
  g.restore();
  body();
  g.strokeStyle = lit ? 'rgba(160,70,20,0.6)' : 'rgba(0,0,0,0.6)';
  g.lineWidth = 0.7;
  g.stroke();
  g.fillStyle = '#140B06';
  const cap = (y0: number, w0: number, w1: number, h: number) => {
    g.beginPath();
    g.moveTo(-w0 / 2, y0);
    g.lineTo(w0 / 2, y0);
    g.lineTo(w1 / 2, y0 + h);
    g.lineTo(-w1 / 2, y0 + h);
    g.closePath();
    g.fill();
  };
  cap(-ry - 1.5, 9, 12, 3.4);
  cap(ry - 1.9, 12, 9, 3.4);
  // Tassel.
  g.strokeStyle = lit ? '#C0502A' : '#4A2418';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(0, ry + 1.5);
  g.lineTo(0, ry + 5.5);
  g.moveTo(-1, ry + 5);
  g.lineTo(-1.4, ry + 9);
  g.moveTo(1, ry + 5);
  g.lineTo(1.4, ry + 9);
  g.moveTo(0, ry + 5);
  g.lineTo(0, ry + 9.5);
  g.stroke();
  return c;
}

let rays: HTMLCanvasElement | null = null;

/** Soft light rays (warm white, radial falloff), 256 px. */
function raysSprite(): HTMLCanvasElement {
  if (rays) return rays;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  const grad = g.createRadialGradient(0, 0, 6, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,236,200,0.9)');
  grad.addColorStop(0.3, 'rgba(255,214,150,0.35)');
  grad.addColorStop(1, 'rgba(255,200,130,0)');
  g.fillStyle = grad;
  const n = 9;
  for (let i = 0; i < n; i++) {
    // Upper half only, a little uneven.
    const a = -Math.PI + 0.3 + ((i + 0.5) / n) * (Math.PI - 0.6) + Math.sin(i * 7.1) * 0.08;
    const w = 0.035 + (Math.sin(i * 3.3) * 0.5 + 0.5) * 0.06;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 128 * (0.7 + 0.3 * (Math.sin(i * 5.7) * 0.5 + 0.5)), a - w, a + w);
    g.closePath();
    g.fill();
  }
  rays = c;
  return c;
}

// ───────────────────────────── sparks ─────────────────────────────

/** A spark: a four-point star with orbiting motes and a halo. */
export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, p: Palette, alpha = 1, i = 0): void {
  const bob = Math.sin(time * 2 + i * 1.7) * 3;
  const pulse = 0.88 + 0.12 * Math.sin(time * 4 + i);
  const cy = y + bob;
  ctx.globalCompositeOperation = 'lighter';
  // Halo.
  ctx.globalAlpha = alpha * (0.55 + 0.2 * pulse);
  ctx.drawImage(glowSprite(p.accent), x - 36, cy - 36, 72, 72);
  ctx.globalAlpha = alpha * 0.35;
  ctx.drawImage(glowSprite('#FFF4D6'), x - 12, cy - 12, 24, 24);
  // Twinkle: long hairline rays flash now and then.
  const tw = Math.max(0, Math.sin(time * 1.3 + i * 2.4)) ** 12;
  if (tw > 0.02) {
    const s = 26 * (0.6 + tw * 0.4);
    ctx.globalAlpha = alpha * tw * 0.9;
    ctx.drawImage(starSprite('#FFF4D6'), x - s, cy - s, s * 2, s * 2);
  }
  // Orbiting motes (the ones behind are dimmer).
  for (let k = 0; k < 3; k++) {
    const a = time * 1.6 + i + (k * TAU) / 3;
    const mx = x + Math.cos(a) * 19;
    const my = cy + Math.sin(a) * 6.5 - 1;
    const front = Math.sin(a) > 0;
    ctx.globalAlpha = alpha * (front ? 1 : 0.45);
    ctx.drawImage(glowSprite('#FFF1C8'), mx - 4.5, my - 4.5, 9, 9);
  }
  ctx.globalCompositeOperation = 'source-over';
  // The star: inked outline, warm body, white-hot heart.
  ctx.save();
  ctx.translate(x, cy);
  ctx.rotate(Math.sin(time * 0.8 + i) * 0.12);
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(40,18,8,0.55)';
  ctx.lineWidth = 2.2;
  starPath(ctx, 14 * pulse, 4.2);
  ctx.stroke();
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.fillStyle = '#FFFBEE';
  starPath(ctx, 10 * pulse, 2.6);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ───────────────────────────── tutorial notes ─────────────────────────────

interface NoteSprite {
  c: HTMLCanvasElement;
  /** Text box in world units. */
  w: number;
  h: number;
  pad: number;
}
const noteCache = new WeakMap<NoteDef, { key: string; s: NoteSprite }>();

const fontOk = new Map<string, number>();

/** Is the font loaded? (`check` is costly: remember successes, re-ask at most 4×/s.) */
function fontReady(font: string): boolean {
  const seen = fontOk.get(font);
  if (seen === -1) return true;
  const now = performance.now();
  if (seen !== undefined && now - seen < 250) return false;
  try {
    const fs = document.fonts;
    if (!fs || fs.check(font)) {
      fontOk.set(font, -1);
      return true;
    }
    void fs.load(font);
  } catch {
    fontOk.set(font, -1);
    return true;
  }
  fontOk.set(font, now);
  return false;
}

function noteSprite(n: NoteDef, color: string, px: number): NoteSprite {
  const size = n.size ?? 30;
  const font = `600 ${size}px ${HAND_FONT}`;
  // Until the handwriting font has loaded, keep re-rendering (it's lazily fetched on first use).
  const key = `${color}@${px.toFixed(3)}:${fontReady(font) ? 1 : 0}`;
  const hit = noteCache.get(n);
  if (hit && hit.key === key) return hit.s;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(n.text).width) + 4;
  const h = Math.ceil(size * 1.5);
  const pad = 6;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((w + pad * 2) * px));
  c.height = Math.max(1, Math.ceil(h * px));
  const g = c.getContext('2d')!;
  g.scale(px, px);
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(n.text, pad + 2, h / 2);
  const s = { c, w, h, pad };
  noteCache.set(n, { key, s });
  return s;
}

/**
 * A handwritten note. `reveal` 0..1 writes the text left → right with a glowing nib; the arrow is
 * drawn in afterwards (`arrow` 0..1). `px` = device px per world unit (sprite resolution).
 */
export function drawNote(ctx: CanvasRenderingContext2D, n: NoteDef, p: Palette, alpha: number, reveal = 1, arrow = 1, time = 0, px = 2): void {
  if (alpha <= 0.003) return;
  const s = noteSprite(n, p.note, px);
  const r = Math.max(0, Math.min(1, reveal));
  if (r > 0) {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(((n.rot ?? 0) * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    const fullW = s.w + s.pad * 2;
    const vis = s.pad + s.w * r;
    ctx.drawImage(s.c, 0, 0, Math.max(1, (vis / fullW) * s.c.width), s.c.height, -fullW / 2, -s.h / 2, vis, s.h);
    if (r < 1) {
      // The nib, writing.
      const nx = -fullW / 2 + vis;
      const ny = Math.sin(time * 26) * 3 + Math.sin(time * 11) * 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.9;
      ctx.drawImage(glowSprite('#FFE7B0'), nx - 10, ny - 10, 20, 20);
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite('#FFFFFF'), nx - 3, ny - 3, 6, 6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  if (n.arrow && arrow > 0) drawNoteArrow(ctx, n.arrow, p.note, alpha, Math.min(1, arrow));
  ctx.globalAlpha = 1;
}

function drawNoteArrow(ctx: CanvasRenderingContext2D, a: [number, number, number, number], color: string, alpha: number, k: number): void {
  const [x1, y1, x2, y2] = a;
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const body = Math.min(1, k / 0.75);
  ctx.beginPath();
  const N = 16;
  for (let i = 0; i <= N * body; i++) {
    const t = i / N;
    const u = 1 - t;
    const x = u * u * x1 + 2 * u * t * mx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * my + t * t * y2;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  if (k > 0.75) {
    const hk = (k - 0.75) / 0.25;
    const ang = Math.atan2(y2 - my, x2 - mx);
    const L = 11 * hk;
    ctx.beginPath();
    ctx.moveTo(x2 - Math.cos(ang - 0.45) * L, y2 - Math.sin(ang - 0.45) * L);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang + 0.5) * L * 0.9, y2 - Math.sin(ang + 0.5) * L * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

/** Seconds a note takes to write (text + arrow). */
export function noteDuration(n: NoteDef): number {
  return 0.3 + n.text.length * 0.042 + (n.arrow ? 0.45 : 0);
}

// ───────────────────────────── ghosts ─────────────────────────────

interface GhostPath {
  len: number;
  /** Dots every GAP units: x, y, arc s. */
  dots: Float32Array;
  nd: number;
}
const ghostCache = new WeakMap<readonly Vec[], GhostPath>();
const GAP = 12;

function ghostPath(pts: readonly Vec[]): GhostPath {
  let g = ghostCache.get(pts);
  if (g) return g;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1];
  const nd = Math.max(2, Math.floor(len / GAP) + 1);
  const dots = new Float32Array(nd * 3);
  let seg = 1;
  for (let d = 0; d < nd; d++) {
    const s = (d / (nd - 1)) * len;
    while (seg < pts.length - 1 && cum[seg] < s) seg++;
    const a = pts[seg - 1];
    const b = pts[seg];
    const l = cum[seg] - cum[seg - 1];
    const t = l > 1e-6 ? Math.max(0, Math.min(1, (s - cum[seg - 1]) / l)) : 0;
    dots[d * 3] = a.x + (b.x - a.x) * t;
    dots[d * 3 + 1] = a.y + (b.y - a.y) * t;
    dots[d * 3 + 2] = s;
  }
  g = { len, dots, nd };
  ghostCache.set(pts, g);
  return g;
}

/**
 * A suggestion line (tutorial ghosts and hints): a dotted path with a pen-down ring at its start, an
 * arrowhead at its end and a glowing nib that travels along it in the drawing direction.
 */
export function drawGhost(ctx: CanvasRenderingContext2D, pts: readonly Vec[], ink: InkType, time: number, alpha: number): void {
  if (pts.length < 2 || alpha <= 0.003) return;
  const g = ghostPath(pts);
  const col = INK_COLORS[ink];
  const speed = 240;
  const cycle = g.len / speed + 1.1;
  const u = (time % cycle) / (cycle - 1.1);
  const head = Math.min(1, u) * g.len;
  const drawing = u <= 1;
  ctx.globalCompositeOperation = 'lighter';
  const spr = glowSprite(col.halo);
  ctx.fillStyle = col.core;
  for (let d = 0; d < g.nd; d++) {
    const x = g.dots[d * 3];
    const y = g.dots[d * 3 + 1];
    const s = g.dots[d * 3 + 2];
    const behind = head - s;
    const trail = drawing && behind >= 0 ? Math.max(0, 1 - behind / 90) : 0;
    const r = 2.6 + trail * 3.5;
    ctx.globalAlpha = alpha * (0.4 + 0.6 * trail);
    ctx.drawImage(spr, x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.globalAlpha = alpha * (0.5 + 0.5 * trail);
    ctx.beginPath();
    ctx.arc(x, y, 1.3 + trail * 0.6, 0, TAU);
    ctx.fill();
  }
  // Start: pen-down ring. End: arrowhead.
  const ring = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.strokeStyle = col.halo;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = alpha * (0.5 + 0.4 * ring);
  ctx.beginPath();
  ctx.arc(g.dots[0], g.dots[1], 7 + ring * 2, 0, TAU);
  ctx.stroke();
  const e = (g.nd - 1) * 3;
  const pe = (g.nd - 2) * 3;
  const ang = Math.atan2(g.dots[e + 1] - g.dots[pe + 1], g.dots[e] - g.dots[pe]);
  const ex = g.dots[e];
  const ey = g.dots[e + 1];
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.85;
  ctx.beginPath();
  ctx.moveTo(ex - Math.cos(ang - 0.6) * 9, ey - Math.sin(ang - 0.6) * 9);
  ctx.lineTo(ex + Math.cos(ang) * 2, ey + Math.sin(ang) * 2);
  ctx.lineTo(ex - Math.cos(ang + 0.6) * 9, ey - Math.sin(ang + 0.6) * 9);
  ctx.stroke();
  // Travelling nib.
  if (drawing) {
    let hx = ex;
    let hy = ey;
    for (let d = 1; d < g.nd; d++) {
      if (g.dots[d * 3 + 2] >= head) {
        const s0 = g.dots[(d - 1) * 3 + 2];
        const t = (head - s0) / Math.max(1e-6, g.dots[d * 3 + 2] - s0);
        hx = g.dots[(d - 1) * 3] + (g.dots[d * 3] - g.dots[(d - 1) * 3]) * t;
        hy = g.dots[(d - 1) * 3 + 1] + (g.dots[d * 3 + 1] - g.dots[(d - 1) * 3 + 1]) * t;
        break;
      }
    }
    const fade = Math.min(1, u * 8, (1 - u) * 8 + 0.2);
    ctx.globalAlpha = alpha * fade;
    ctx.drawImage(spr, hx - 16, hy - 16, 32, 32);
    ctx.drawImage(starSprite('#FFFFFF'), hx - 8, hy - 8, 16, 16);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────────── no-ink zones (moving to entities) ─────────────────────────────

/** Wet-paper zones where ink won't take. */
export function drawNoInk(ctx: CanvasRenderingContext2D, level: LevelDef, time: number): void {
  if (!level.noInk?.length) return;
  for (const z of level.noInk) {
    ctx.save();
    ctx.beginPath();
    z.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,150,200,0.10)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(170,200,255,0.16)';
    ctx.lineWidth = 1.2;
    const off = (time * 6) % 14;
    ctx.beginPath();
    for (let x = -800; x < 2200; x += 14) {
      ctx.moveTo(x + off, -50);
      ctx.lineTo(x + off + 800, 800);
    }
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(190,210,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    z.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────────── pen nib ─────────────────────────────

/**
 * The pen cursor. `r` is the ring radius in world units (sized by the renderer so it peeks out from
 * under a fingertip). The ring doubles as a tiny ink gauge (`inkFrac`). Blocked → a red, shaking
 * "can't draw here".
 */
export function drawNib(ctx: CanvasRenderingContext2D, x: number, y: number, ink: InkType, blocked: boolean, time: number, inkFrac = 1, r = 22, down = true): void {
  const col = INK_COLORS[ink];
  ctx.lineCap = 'round';
  if (blocked) {
    x += Math.sin(time * 61) * 0.9;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(glowSprite('#FF4D5E'), x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#FF6B78';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = time * 20;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    const c = 4.5;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - c, y - c);
    ctx.lineTo(x + c, y + c);
    ctx.moveTo(x + c, y - c);
    ctx.lineTo(x - c, y + c);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.globalCompositeOperation = 'lighter';
  const gr = 16 + Math.sin(time * 10) * 1.5;
  ctx.globalAlpha = down ? 0.9 : 0.5;
  ctx.drawImage(glowSprite(col.halo), x - gr, y - gr, gr * 2, gr * 2);
  ctx.globalAlpha = 1;
  ctx.drawImage(glowSprite('#FFFFFF'), x - 5, y - 5, 10, 10);
  ctx.globalCompositeOperation = 'source-over';
  if (r <= 0) return;
  // Ink gauge ring.
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = col.halo;
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  const f = Math.max(0, Math.min(1, inkFrac));
  if (f > 0.002) {
    ctx.globalAlpha = f < 0.2 ? 0.55 + 0.45 * Math.abs(Math.sin(time * 9)) : 0.9;
    ctx.strokeStyle = f < 0.2 ? '#FFB0A0' : col.core;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function sparkPositions(sim: Simulation): Vec[] {
  return sim.level.sparks;
}

/** '#rrggbb' + alpha → rgba(). Passes through other colour strings unchanged. */
export function hexA(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

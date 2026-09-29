import type { Vec } from '../core/math';
import type { InkType, LevelDef, NoteDef } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { INK_COLORS, type Palette } from './palettes';

export const HAND_FONT = '"Caveat Variable", "Caveat", "Bradley Hand", cursive';

/** The home-lamp: a paper lantern on a crooked post. `lit` 0..1 animates the ignition. */
export function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, lit: number, time: number, p: Palette): void {
  ctx.save();
  ctx.translate(x, y);
  // Post.
  ctx.strokeStyle = '#1A1008';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(-2, -40, 1, -78);
  ctx.moveTo(1, -76);
  ctx.quadraticCurveTo(10, -84, 18, -80);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(18, -80);
  ctx.lineTo(18, -70);
  ctx.stroke();
  // Glow.
  const pulse = 0.5 + 0.5 * Math.sin(time * 2);
  const glow = 0.12 + 0.1 * pulse + lit * 0.6;
  const gr = 40 + lit * 90;
  const g = ctx.createRadialGradient(18, -54, 2, 18, -54, gr);
  g.addColorStop(0, hexA(p.accent, glow));
  g.addColorStop(1, hexA(p.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(18 - gr, -54 - gr, gr * 2, gr * 2);
  // Lantern body.
  const body = ctx.createLinearGradient(8, -70, 28, -40);
  body.addColorStop(0, lit > 0.05 ? '#FFF2CC' : '#6B5A4A');
  body.addColorStop(1, lit > 0.05 ? '#FFB45A' : '#3E3128');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(18, -54, 11, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.6)';
  ctx.lineWidth = 1;
  for (const k of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(18, -54, Math.abs(k) * 11 + 0.5, 15, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#1A1008';
  ctx.fillRect(12, -71, 12, 3);
  ctx.fillRect(13, -40, 10, 3);
  // Unlit hint: a tiny ember waiting.
  if (lit < 0.05) {
    ctx.fillStyle = hexA(p.accent, 0.4 + 0.4 * pulse);
    ctx.beginPath();
    ctx.arc(18, -53, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A spark: four-point star with a halo. */
export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, p: Palette, alpha = 1, i = 0): void {
  const bob = Math.sin(time * 2 + i * 1.7) * 3;
  const rot = time * 0.6 + i;
  const pulse = 0.85 + 0.15 * Math.sin(time * 4 + i);
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
  g.addColorStop(0, hexA(p.accent, 0.55));
  g.addColorStop(1, hexA(p.accent, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(rot * 0.3);
  ctx.fillStyle = '#FFF8E2';
  const s = 9 * pulse;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = k % 2 === 0 ? s : s * 0.28;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawNote(ctx: CanvasRenderingContext2D, n: NoteDef, p: Palette, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.note;
  ctx.strokeStyle = p.note;
  ctx.translate(n.x, n.y);
  ctx.rotate(((n.rot ?? 0) * Math.PI) / 180);
  ctx.font = `600 ${n.size ?? 30}px ${HAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n.text, 0, 0);
  ctx.restore();
  if (n.arrow) {
    const [x1, y1, x2, y2] = n.arrow;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.note;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
    const my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    const ang = Math.atan2(y2 - my, x2 - mx);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.45) * 11, y2 - Math.sin(ang - 0.45) * 11);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang + 0.45) * 11, y2 - Math.sin(ang + 0.45) * 11);
    ctx.stroke();
    ctx.restore();
  }
}

/** Dotted suggestion line (tutorial ghosts and hints). */
export function drawGhost(ctx: CanvasRenderingContext2D, pts: readonly Vec[], ink: InkType, time: number, alpha: number): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = INK_COLORS[ink].halo;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 10]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

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

/** The pen nib cursor while drawing. */
export function drawNib(ctx: CanvasRenderingContext2D, x: number, y: number, ink: InkType, blocked: boolean, time: number): void {
  const col = INK_COLORS[ink];
  ctx.save();
  ctx.translate(x, y);
  if (blocked) {
    ctx.strokeStyle = 'rgba(255,120,120,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(6, 6);
    ctx.moveTo(6, -6);
    ctx.lineTo(-6, 6);
    ctx.stroke();
  } else {
    ctx.globalCompositeOperation = 'lighter';
    const r = 12 + Math.sin(time * 10) * 1.5;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, hexA(col.halo, 0.8));
    g.addColorStop(1, hexA(col.halo, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

import type { Entity } from '../sim/entity';
import { Crumble, Gate, Glowworm, Inkpot, Moth, Mover, Rain, Wind, Wisp } from '../sim/entities';
import type { Simulation } from '../sim/simulation';
import type { Palette } from './palettes';
import { hexA } from './props';

/**
 * Entity art. Each kind draws itself from its sim state. `layer` 'back' is drawn behind ink & Wick,
 * 'front' in front of them.
 */
export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, sim: Simulation, time: number, p: Palette, layer: 'back' | 'front'): void {
  if (e instanceof Mover && layer === 'back') return drawMover(ctx, e, p);
  if (e instanceof Gate && layer === 'back') return drawGate(ctx, e);
  if (e instanceof Crumble && layer === 'back') return drawCrumble(ctx, e, sim, time);
  if (e instanceof Wind && layer === 'back') return drawWind(ctx, e, time);
  if (e instanceof Glowworm && layer === 'back') return drawGlowworm(ctx, e, time);
  if (e instanceof Inkpot && layer === 'front') return drawInkpot(ctx, e, time);
  if (e instanceof Wisp && layer === 'front') return drawWisp(ctx, e, time, p);
  if (e instanceof Rain && layer === 'front') return drawRain(ctx, e);
  if (e instanceof Moth && layer === 'front') return drawMoth(ctx, e, time);
}

function drawMover(ctx: CanvasRenderingContext2D, e: Mover, p: Palette): void {
  const pts = e.def.pts;
  ctx.save();
  ctx.translate(e.ox, e.oy);
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.fillStyle = p.terrain;
  ctx.fill();
  ctx.strokeStyle = p.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, e: Gate): void {
  const d = e.def;
  if (e.open >= 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(d.x - 4, d.y - (d.dir === 'down' ? 0 : d.h), d.w + 8, d.h * 2);
  ctx.clip();
  const y = d.y + e.offset;
  ctx.fillStyle = '#E9DCC4';
  ctx.fillRect(d.x, y, d.w, d.h);
  ctx.strokeStyle = '#8A6A48';
  ctx.lineWidth = 1.5;
  for (let yy = y + 12; yy < y + d.h; yy += 18) {
    ctx.beginPath();
    ctx.moveTo(d.x, yy);
    ctx.lineTo(d.x + d.w, yy);
    ctx.stroke();
  }
  ctx.strokeRect(d.x, y, d.w, d.h);
  ctx.restore();
}

function drawCrumble(ctx: CanvasRenderingContext2D, e: Crumble, sim: Simulation, time: number): void {
  if (e.gone) return;
  const d = e.def;
  const shaking = e.touchedAt >= 0 ? Math.sin(time * 60) * 1.2 : 0;
  void sim;
  ctx.save();
  ctx.translate(shaking, 0);
  ctx.fillStyle = '#D9C9A8';
  ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.strokeStyle = '#7A6040';
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
  ctx.restore();
}

function drawWind(ctx: CanvasRenderingContext2D, e: Wind, time: number): void {
  const d = e.def;
  const mag = Math.hypot(d.fx, d.fy) || 1;
  const ux = d.fx / mag;
  const uy = d.fy / mag;
  ctx.save();
  ctx.beginPath();
  ctx.rect(d.x, d.y, d.w, d.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(220,235,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const n = Math.round((d.w * d.h) / 5000);
  for (let i = 0; i < n; i++) {
    const hx = ((i * 97.3) % d.w) + d.x;
    const hy = ((i * 53.7) % d.h) + d.y;
    const t = (time * mag * 0.12 + i * 37) % (Math.max(d.w, d.h) + 60);
    const x = hx + ux * t - ux * 30;
    const y = hy + uy * t - uy * 30;
    const wx = ((x - d.x) % d.w + d.w) % d.w + d.x;
    const wy = ((y - d.y) % d.h + d.h) % d.h + d.y;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + ux * 22, wy + uy * 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlowworm(ctx: CanvasRenderingContext2D, e: Glowworm, time: number): void {
  const { x, y } = e.def;
  const a = 0.6 + 0.4 * Math.sin(time * 2 + e.index);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
  g.addColorStop(0, `rgba(182,255,138,${0.6 * a})`);
  g.addColorStop(1, 'rgba(182,255,138,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 30, y - 30, 60, 60);
  ctx.restore();
}

function drawInkpot(ctx: CanvasRenderingContext2D, e: Inkpot, time: number): void {
  if (e.taken) return;
  const { x, y } = e.def;
  const bob = Math.sin(time * 2.4 + e.index) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
  g.addColorStop(0, 'rgba(143,184,255,0.55)');
  g.addColorStop(1, 'rgba(143,184,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-26, -26, 52, 52);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#1B2240';
  ctx.strokeStyle = '#CFE0FF';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-8, -4);
  ctx.quadraticCurveTo(-11, 10, 0, 10);
  ctx.quadraticCurveTo(11, 10, 8, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-4, -9, 8, 5);
  ctx.strokeRect(-4, -9, 8, 5);
  ctx.fillStyle = '#8FB8FF';
  ctx.beginPath();
  ctx.ellipse(0, 1, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWisp(ctx: CanvasRenderingContext2D, e: Wisp, time: number, p: Palette): void {
  const { x, y } = e.def;
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 1.8 + e.index) * 2);
  if (e.lit) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, hexA(p.accent, 0.6));
    g.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, 80, 80);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = e.lit ? '#FFE8B0' : '#4A4038';
  ctx.strokeStyle = e.lit ? '#FFB45A' : '#8A7A6A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, e: Rain): void {
  const d = e.def;
  ctx.save();
  // Cloud.
  ctx.fillStyle = 'rgba(40,50,62,0.9)';
  const w = d.x2 - d.x1;
  for (let i = 0; i <= 6; i++) {
    const cx = d.x1 + (w * i) / 6;
    ctx.beginPath();
    ctx.arc(cx, d.y - 14 - (i % 2) * 8, 22 + (i % 3) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Drops.
  ctx.strokeStyle = 'rgba(190,215,240,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const p of e.drops) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.02, p.y - 12);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMoth(ctx: CanvasRenderingContext2D, e: Moth, time: number): void {
  const flap = Math.sin(time * (e.hunting ? 40 : 22) + e.index) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(220,210,190,0.9)';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.beginPath();
    ctx.ellipse(6, -2, 8 * (0.4 + flap * 0.6), 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3A3028';
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.2, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

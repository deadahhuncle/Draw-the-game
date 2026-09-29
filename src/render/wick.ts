import { WICK_R } from '../core/constants';
import { clamp } from '../core/math';
import type { SimEvent } from '../core/types';
import type { Simulation } from '../sim/simulation';

/**
 * Wick: a paper-lantern sprite with a candle flame, two dot eyes and scurrying ink legs.
 * All animation is cosmetic state layered on top of the sim (squash & stretch, blinks, gaze…).
 */
export class WickArt {
  private squash = 0; // + = squashed (wide), - = stretched (tall)
  private squashV = 0;
  private blinkT = 2;
  private blink = 0;
  private lookX = 0;
  private lookY = 0;
  private lean = 0;
  private happy = 0;
  private scared = 0;
  private dead = 0;
  deathCause = '';
  private turnWobble = 0;
  private lastFacing = 1;
  private idleBob = 0;
  /** World-space point Wick looks at (pen), or null. */
  lookAt: { x: number; y: number } | null = null;

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'land':
        this.squashV += clamp(e.speed / 900, 0.15, 0.9) * 9;
        break;
      case 'bounce':
        this.squashV -= 9;
        break;
      case 'turn':
        this.turnWobble = 1;
        break;
      case 'win':
        this.happy = 1;
        break;
      case 'death':
        this.dead = 0.001;
        this.deathCause = e.cause;
        break;
      case 'reset':
        this.dead = 0;
        this.happy = 0;
        this.scared = 0;
        this.squash = 0;
        this.squashV = 0;
        break;
    }
  }

  update(dt: number, sim: Simulation): void {
    // Spring for squash.
    const k = 180;
    const damp = 14;
    this.squashV += (-k * this.squash - damp * this.squashV) * dt;
    this.squash += this.squashV * dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const w = sim.wick;
    const running = sim.phase === 'running';
    const tgtLean = running ? clamp(w.vx / 900, -0.25, 0.25) : 0;
    this.lean += (tgtLean - this.lean) * Math.min(1, dt * 8);
    const falling = running && !w.grounded && w.vy > 300;
    this.scared += ((falling ? 1 : 0) - this.scared) * Math.min(1, dt * 6);
    this.turnWobble = Math.max(0, this.turnWobble - dt * 3);
    if (w.facing !== this.lastFacing) this.lastFacing = w.facing;
    this.idleBob += dt;
    if (this.dead > 0) this.dead = Math.min(1, this.dead + dt * 2.2);
    // Gaze.
    let gx = w.facing * 0.8;
    let gy = 0;
    if (this.lookAt) {
      const dx = this.lookAt.x - w.x;
      const dy = this.lookAt.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      gx = dx / d;
      gy = dy / d;
    } else if (falling) gy = 0.8;
    this.lookX += (gx - this.lookX) * Math.min(1, dt * 10);
    this.lookY += (gy - this.lookY) * Math.min(1, dt * 10);
  }

  draw(ctx: CanvasRenderingContext2D, sim: Simulation, x: number, y: number, time: number): void {
    const w = sim.wick;
    const R = WICK_R;
    const running = sim.phase === 'running';
    const flame = w.flame;
    ctx.save();
    ctx.translate(x, y);

    // Warm light pool.
    const glowR = 70 + 10 * Math.sin(time * 3.1) * 0.5;
    const g = ctx.createRadialGradient(0, -6, 4, 0, -6, glowR);
    g.addColorStop(0, `rgba(255,200,120,${0.28 * flame * (1 - this.dead)})`);
    g.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-glowR, -glowR - 6, glowR * 2, glowR * 2);

    const bob = running ? 0 : Math.sin(this.idleBob * 2.2) * 0.8;
    const sq = clamp(this.squash, -0.35, 0.35) + this.turnWobble * Math.sin(this.turnWobble * 20) * 0.06;
    const sx = 1 + sq;
    const sy = 1 - sq;

    // Legs.
    ctx.save();
    ctx.strokeStyle = '#2A1A10';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    const legPhase = w.walkDist / 15 * Math.PI;
    const air = !w.grounded && running;
    for (const side of [-1, 1]) {
      const hipX = side * 5;
      const swing = running && w.grounded ? Math.sin(legPhase + (side > 0 ? Math.PI : 0)) * 6 : 0;
      const lift = running && w.grounded ? Math.max(0, Math.cos(legPhase + (side > 0 ? Math.PI : 0))) * 3 : 0;
      ctx.beginPath();
      ctx.moveTo(hipX, R * 0.55 * sy);
      if (air) ctx.lineTo(hipX + side * 3 - w.facing * 2, R + 1);
      else ctx.lineTo(hipX + swing * w.facing, R + 2 - lift);
      ctx.stroke();
    }
    ctx.restore();

    ctx.translate(0, bob);
    ctx.rotate(this.lean + (this.dead > 0 ? this.dead * 0.5 * w.facing : 0));
    ctx.scale(sx, sy);

    // Body — paper lantern.
    const body = ctx.createRadialGradient(-4, -4, 2, 0, 0, R + 2);
    const lit = 1 - this.dead * 0.7;
    body.addColorStop(0, `rgba(255,250,235,${lit})`);
    body.addColorStop(0.6, `rgba(255,228,180,${0.95 * lit + 0.05})`);
    body.addColorStop(1, `rgba(225,160,90,1)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.96, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ribs.
    ctx.strokeStyle = 'rgba(170,100,50,0.35)';
    ctx.lineWidth = 1;
    for (const rx of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(rx) * R + 0.5, R * 0.96, 0, -Math.PI / 2, Math.PI / 2, rx < 0);
      ctx.stroke();
    }
    // Caps.
    ctx.fillStyle = '#3A2414';
    ctx.fillRect(-6, -R - 1, 12, 3);
    ctx.fillRect(-5, R - 2.5, 10, 3);

    // Face.
    const ex = this.lookX * 3.2;
    const ey = this.lookY * 2.4 - 1;
    ctx.fillStyle = '#2A1A10';
    const eyeH = Math.max(0.25, 1 - this.blink) * (1 + this.scared * 0.35);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      if (this.dead > 0.3) {
        // X eyes.
        ctx.strokeStyle = '#2A1A10';
        ctx.lineWidth = 1.3;
        const cx = side * 4.8 + ex * 0.5;
        ctx.moveTo(cx - 1.8, ey - 1.8);
        ctx.lineTo(cx + 1.8, ey + 1.8);
        ctx.moveTo(cx + 1.8, ey - 1.8);
        ctx.lineTo(cx - 1.8, ey + 1.8);
        ctx.stroke();
      } else if (this.happy > 0) {
        ctx.strokeStyle = '#2A1A10';
        ctx.lineWidth = 1.4;
        ctx.arc(side * 4.8 + ex * 0.4, ey + 1, 2.2, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else {
        ctx.ellipse(side * 4.8 + ex, ey, 1.7, 2.3 * eyeH, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mouth.
    ctx.strokeStyle = '#2A1A10';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (this.happy > 0) ctx.arc(ex * 0.5, ey + 4, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (this.scared > 0.4) ctx.ellipse(ex * 0.5, ey + 5.5, 1.4, 1.9 * this.scared, 0, 0, Math.PI * 2);
    if (this.happy > 0 || this.scared > 0.4) ctx.stroke();
    // Cheeks.
    ctx.fillStyle = 'rgba(255,120,110,0.28)';
    ctx.beginPath();
    ctx.arc(-8 + ex * 0.5, ey + 3.5, 2.4, 0, Math.PI * 2);
    ctx.arc(8 + ex * 0.5, ey + 3.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Flame (not scaled with the body).
    if (this.dead < 0.5) {
      const fl = flame * (1 - this.dead * 2);
      const tip = -R - 4 - 16 * fl * (1 + 0.12 * Math.sin(time * 17) + 0.08 * Math.sin(time * 29));
      const sway = -this.lean * 30 - w.vx * 0.012 + Math.sin(time * 7) * 1.2;
      ctx.save();
      ctx.translate(x, y + bob - R * sy + 1);
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(0, -8 * fl, 1, 0, -8 * fl, 24 * fl + 2);
      fg.addColorStop(0, 'rgba(255,220,140,0.55)');
      fg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, -8 * fl, 24 * fl + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const h = tip + R;
      ctx.fillStyle = '#FF9A3C';
      ctx.beginPath();
      ctx.moveTo(-4.2 * fl, 0);
      ctx.quadraticCurveTo(-5 * fl, h * 0.45, sway, h);
      ctx.quadraticCurveTo(5 * fl, h * 0.45, 4.2 * fl, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FFF1C9';
      ctx.beginPath();
      ctx.moveTo(-2 * fl, 0);
      ctx.quadraticCurveTo(-2.4 * fl, h * 0.35, sway * 0.6, h * 0.62);
      ctx.quadraticCurveTo(2.4 * fl, h * 0.35, 2 * fl, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

import { WICK_R } from '../core/constants';
import { clamp } from '../core/math';
import type { DeathCause, SimEvent } from '../core/types';
import type { Simulation } from '../sim/simulation';
import { glowSprite } from './particles';

/**
 * Wick: a paper-lantern sprite with a candle flame for a head-feather, two dot eyes and scurrying ink
 * legs. Everything here is cosmetic state layered on top of the sim: squash & stretch, a walk cycle,
 * blinks and gaze, idle behaviours while you plan, a "ready!" hop, per-cause failure beats and the
 * celebration at the lamp.
 *
 * Only `sim.phase`, `sim.time` and `sim.wick` are required (the DOM WickSprite feeds a tiny fake sim);
 * anything else (sparks, level geometry) is used when present.
 */

// ── proportions (world units, origin = Wick's centre; the hitbox is a circle of radius WICK_R) ──
const BODY_CY = -2.2;
const BODY_RX = 13.6;
const BODY_RY = 12.6;
const CAP_TOP = BODY_CY - BODY_RY; // top of the paper
const CAP_BOT = BODY_CY + BODY_RY;
const FEET_Y = WICK_R;
const HIP_X = 2.6;
const HIP_Y = CAP_BOT - 0.4;
const INK = '#24160D';

const SPRITE_S = 4; // sprite px per world unit
const SPRITE_U = 40; // sprite box (world units)

type Mood = 'none' | 'happy' | 'scared' | 'sad' | 'sigh' | 'excited';
type IdleKind = 'look' | 'hop' | 'stretch' | 'peek' | 'stargaze' | 'wiggle';

interface Idle {
  kind: IdleKind;
  t: number;
  dur: number;
  /** Gaze target for peek (world), if found. */
  px: number;
  py: number;
}

interface SimLike {
  phase: string;
  time: number;
  wick: Simulation['wick'];
  level?: Simulation['level'];
  sparks?: boolean[];
  solidAt?: Simulation['solidAt'];
  fieldAt?: Simulation['fieldAt'];
}

const wind = { x: 0, y: 0 };

export class WickArt {
  /** World-space point Wick looks at (the pen while drawing), or null. */
  lookAt: { x: number; y: number } | null = null;
  /** The home-lamp's lantern (world) — Wick looks at it while celebrating. */
  lampAt: { x: number; y: number } | null = null;
  /** Reduced motion: no idle hops/wiggles, calmer flame. */
  calm = false;

  // ── outputs for the renderer (world coords, valid after draw) ──
  /** Base of the flame (top of the lantern). */
  readonly head = { x: 0, y: 0 };
  /** Tip of the flame. */
  readonly tip = { x: 0, y: 0 };
  /** Current flame size 0..~1.6 (0 = out). */
  flameSize = 1;
  /** Is the body drawn at all (false once popped / fallen)? */
  visible = true;

  deathCause: DeathCause | '' = '';

  // squash & stretch (along a vertical axis on the ground, along velocity in the air)
  private sq = 0; // + = stretched tall, - = squashed wide
  private sqV = 0;
  private airS = 0;
  private axis = 0;
  private pivot = 1; // 1 = feet pivot (grounded), 0 = centre
  private lean = 0;
  // visual hop (independent of the sim)
  private hopY = 0;
  private hopV = 0;
  private pendingHop = -1;
  private pendingHopV = 0;
  // face
  private blinkT = 2.2;
  private blink = 0;
  private doubleBlink = false;
  private lookX = 0.8;
  private lookY = 0;
  private face = 1; // smoothed facing (-1..1): eyes slide across when turning
  private mood: Mood = 'none';
  private moodT = 0;
  private scared = 0;
  private sparkle = 0;
  private glance: { x: number; y: number; t: number } | null = null;
  // flame
  private tipX = 0;
  private tipY = -17;
  private tipVX = 0;
  private tipVY = 0;
  private flameScale = 1;
  private flameTarget = 1;
  private flameBoost = 0;
  private flameDip = 0;
  // life & death
  private deadT = -1;
  private winT = -1;
  private lit = 1;
  private shiver = 0;
  // idle
  private idle: Idle | null = null;
  private idleWait = 2.5;
  private lastIdle: IdleKind | null = null;
  private planT = 0;
  private lastPhase = '';
  private time = 0;
  private grounded = true;

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'land':
        this.sqV -= clamp(e.speed / 900, 0.12, 0.85) * 8;
        if (e.speed > 700) this.blink = 1;
        break;
      case 'bounce':
        this.sqV += 7;
        this.flameBoost = Math.max(this.flameBoost, 0.35);
        break;
      case 'turn':
        // A little bonk against the wall.
        this.sqV -= 3.2;
        this.blink = 1;
        break;
      case 'spark':
        this.sparkle = 1;
        this.sqV += 2.5;
        this.flameBoost = Math.max(this.flameBoost, 0.3);
        break;
      case 'inkpot':
        this.sparkle = 0.7;
        this.blink = 1;
        break;
      case 'rain-hit':
        this.flameDip = 1;
        this.sqV -= 1.6;
        this.blink = 1;
        break;
      case 'rush-start':
        this.flameBoost = Math.max(this.flameBoost, 0.45);
        this.setMood('excited', 0.8);
        break;
      case 'go':
        // "Ready!" — a quick crouch, then a hop.
        this.idle = null;
        this.sqV -= 5.5;
        this.pendingHop = 0.07;
        this.pendingHopV = -150;
        this.flameBoost = 0.6;
        this.setMood('excited', 1.1);
        break;
      case 'win':
        this.winT = 0;
        this.mood = 'happy';
        this.moodT = 99;
        this.sqV -= 4;
        this.pendingHop = 0.32;
        this.pendingHopV = -165;
        break;
      case 'death':
        this.deadT = 0;
        this.deathCause = e.cause;
        this.idle = null;
        if (e.cause === 'doused') {
          this.shiver = 1;
          this.setMood('sad', 99);
        } else if (e.cause === 'stuck') {
          this.setMood('sigh', 99);
          this.sqV -= 2;
          this.flameTarget = 0.55;
        } else if (e.cause === 'fall') {
          this.setMood('scared', 99);
        }
        break;
      case 'reset':
        this.deadT = -1;
        this.winT = -1;
        this.deathCause = '';
        this.mood = 'none';
        this.moodT = 0;
        this.scared = 0;
        this.sq = 0;
        this.sqV = 0;
        this.hopY = 0;
        this.hopV = 0;
        this.pendingHop = -1;
        this.flameTarget = 1;
        this.flameScale = 0.2; // the flame re-kindles
        this.flameBoost = 0.4;
        this.shiver = 0;
        this.idle = null;
        this.idleWait = 1.6;
        this.glance = null;
        this.planT = 0;
        this.blink = 1;
        break;
    }
  }

  /** Give the flame away to the lamp (celebration). It shrinks to an ember and slowly regrows. */
  giveFlame(): void {
    this.flameScale = 0.18;
    this.flameTarget = 1;
  }

  /** Look at a point for a moment (e.g. the stroke the player just drew). */
  glanceAt(x: number, y: number, dur = 0.9, hop = false): void {
    this.glance = { x, y, t: dur };
    if (hop && !this.calm && this.hopY === 0 && this.pendingHop < 0) {
      this.pendingHop = 0.12;
      this.pendingHopV = -85;
      this.sparkle = Math.max(this.sparkle, 0.5);
    }
  }

  private setMood(m: Mood, t: number): void {
    if (this.mood === 'happy' || (this.deadT >= 0 && m !== 'sad' && m !== 'sigh' && m !== 'scared')) return;
    this.mood = m;
    this.moodT = t;
  }

  update(dt: number, simIn: Simulation): void {
    const sim = simIn as unknown as SimLike;
    const w = sim.wick;
    this.time += dt;
    const running = sim.phase === 'running';
    const plan = sim.phase === 'plan';
    if (sim.phase !== this.lastPhase) {
      if (plan) this.planT = 0;
      this.lastPhase = sim.phase;
    }
    this.planT += dt;
    this.grounded = w.grounded || !running;

    // ── squash spring ──
    const k = 260;
    const damp = 15;
    this.sqV += (-k * this.sq - damp * this.sqV) * dt;
    this.sq += this.sqV * dt;
    // Velocity stretch in the air, along the direction of travel.
    const sp = Math.hypot(w.vx, w.vy);
    const airTarget = running && !w.grounded ? clamp((sp - 150) / 2600, 0, 0.2) : 0;
    this.airS += (airTarget - this.airS) * Math.min(1, dt * 14);
    if (running && !w.grounded && sp > 60) {
      const ang = Math.atan2(w.vx, -w.vy); // 0 = moving straight up
      let d = ang - this.axis;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.axis += d * Math.min(1, dt * 12);
    } else this.axis += (0 - this.axis) * Math.min(1, dt * 10);
    this.pivot += ((this.grounded ? 1 : 0) - this.pivot) * Math.min(1, dt * 16);

    // ── visual hop ──
    if (this.pendingHop >= 0) {
      this.pendingHop -= dt;
      if (this.pendingHop < 0) {
        this.hopV = this.pendingHopV;
        this.sqV += 5;
      }
    }
    if (this.hopY < 0 || this.hopV !== 0) {
      this.hopV += 1500 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY >= 0) {
        this.sqV -= Math.min(7, this.hopV / 30);
        this.hopY = 0;
        this.hopV = 0;
      }
    }
    if (running && !w.grounded) {
      this.hopY *= Math.max(0, 1 - dt * 12);
    }

    // ── lean ──
    let tgtLean = 0;
    if (running && w.grounded) tgtLean = clamp(w.vx / 1100, -0.3, 0.3) + (w.onRush ? Math.sign(w.vx) * 0.08 : 0);
    if (this.idle?.kind === 'peek') tgtLean = w.facing * 0.2 * Math.sin(Math.min(1, this.idle.t / 0.3) * Math.PI * 0.5);
    if (this.idle?.kind === 'wiggle') tgtLean = Math.sin(this.idle.t * 18) * 0.12 * (1 - this.idle.t / this.idle.dur);
    if (this.winT >= 0) tgtLean = Math.sin(this.winT * 9) * 0.06 * Math.max(0, 1 - this.winT / 2);
    this.lean += (tgtLean - this.lean) * Math.min(1, dt * 9);

    // ── face turn ──
    this.face += (w.facing - this.face) * Math.min(1, dt * 11);

    // ── blinks ──
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      if (!this.doubleBlink && Math.random() < 0.22) {
        this.doubleBlink = true;
        this.blinkT = 0.22;
      } else {
        this.doubleBlink = false;
        this.blinkT = 2 + Math.random() * 3.2;
      }
    }
    this.blink = Math.max(0, this.blink - dt * 7.5);
    this.sparkle = Math.max(0, this.sparkle - dt * 1.3);

    // ── mood ──
    const falling = running && !w.grounded && w.vy > 420;
    this.scared += ((falling ? 1 : 0) - this.scared) * Math.min(1, dt * 7);
    if (this.moodT < 90) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.mood = 'none';
    }

    // ── flame ──
    this.flameScale += (this.flameTarget - this.flameScale) * Math.min(1, dt * (this.winT >= 0 ? 1.1 : 2.4));
    this.flameBoost = Math.max(0, this.flameBoost - dt * 1.4);
    this.flameDip = Math.max(0, this.flameDip - dt * 2.2);

    // ── death & win clocks ──
    if (this.deadT >= 0) this.deadT += dt;
    if (this.winT >= 0) this.winT += dt;
    const litTarget = this.deadT >= 0 && (this.deathCause === 'doused' || this.deathCause === 'hazard') ? 0 : 1;
    this.lit += (litTarget - this.lit) * Math.min(1, dt * 5);
    this.shiver = Math.max(0, this.shiver - dt * 0.9);
    if (this.glance) {
      this.glance.t -= dt;
      if (this.glance.t <= 0) this.glance = null;
    }

    // ── idle behaviours (planning, not drawing) ──
    if (plan && this.deadT < 0 && this.winT < 0 && !this.lookAt) {
      if (this.idle) {
        this.idle.t += dt;
        if (this.idle.t >= this.idle.dur) this.idle = null;
      } else if (!this.calm || Math.random() < 0.5) {
        this.idleWait -= dt;
        if (this.idleWait <= 0) this.startIdle(sim);
      }
    } else if (!plan) this.idle = null;

    // ── gaze ──
    let gx = w.facing * 0.85;
    let gy = running ? 0.1 : 0.05;
    if (this.winT >= 0 && this.lampAt) {
      const dx = this.lampAt.x - w.x;
      const dy = this.lampAt.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      gx = dx / d;
      gy = dy / d;
    } else if (this.deadT >= 0) {
      gx = 0;
      gy = this.deathCause === 'fall' ? -0.9 : 0.5;
    } else if (this.lookAt) {
      const dx = this.lookAt.x - w.x;
      const dy = this.lookAt.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      const near = clamp(d / 60, 0.3, 1);
      gx = (dx / d) * near;
      gy = (dy / d) * near;
    } else if (this.glance) {
      const dx = this.glance.x - w.x;
      const dy = this.glance.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      gx = dx / d;
      gy = dy / d;
    } else if (falling) {
      gx = w.facing * 0.2;
      gy = 0.9;
    } else if (running && sim.level && sim.sparks) {
      // Eyes on the prize: look at a nearby uncollected spark.
      let best = 170 * 170;
      const sparks = sim.level.sparks;
      for (let i = 0; i < sparks.length; i++) {
        if (sim.sparks[i]) continue;
        const dx = sparks[i].x - w.x;
        const dy = sparks[i].y - w.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          const d = Math.sqrt(d2) || 1;
          gx = dx / d;
          gy = dy / d;
        }
      }
    } else if (this.idle) {
      const it = this.idle;
      const u = it.t / it.dur;
      if (it.kind === 'look') {
        // Over the shoulder, a beat, back ahead.
        const back = u < 0.15 ? u / 0.15 : u < 0.55 ? 1 : u < 0.7 ? 1 - (u - 0.55) / 0.15 : 0;
        gx = w.facing * (0.85 - 1.8 * back);
        gy = -0.15 * back;
      } else if (it.kind === 'peek') {
        const dx = it.px - w.x;
        const dy = it.py - w.y;
        const d = Math.hypot(dx, dy) || 1;
        gx = dx / d;
        gy = dy / d;
      } else if (it.kind === 'stargaze') {
        gx = w.facing * 0.35;
        gy = -0.95;
      } else if (it.kind === 'stretch') {
        gx = 0;
        gy = -0.3;
      }
    }
    const kk = Math.min(1, dt * (this.lookAt ? 14 : 8));
    this.lookX += (gx - this.lookX) * kk;
    this.lookY += (gy - this.lookY) * kk;

    // ── flame tip spring (lags behind motion, streams when fast) ──
    const fl = this.flameStrength(w.flame);
    const hgt = 17 * fl;
    let tx = -w.vx * 0.02 - this.lean * 14;
    let ty = -hgt - Math.max(0, w.vy) * 0.014 - Math.max(0, sp - 250) * 0.01;
    // Gusts bend the flame (a quiet hint that there is wind here, even while planning).
    if (typeof sim.fieldAt === 'function') {
      wind.x = 0;
      wind.y = 0;
      try {
        sim.fieldAt.call(sim, w.x, w.y, wind);
      } catch {
        wind.x = wind.y = 0;
      }
      tx += clamp(wind.x * 0.0045, -9, 9) * Math.min(1, fl * 1.5);
      ty += clamp(wind.y * 0.003, -8, 5) * Math.min(1, fl * 1.5);
    }
    const wob = this.calm ? 0.4 : 1;
    tx += (Math.sin(this.time * 7.1) * 1.1 + Math.sin(this.time * 13.7) * 0.45) * wob * fl;
    ty = Math.min(ty, -hgt * 0.45);
    tx = clamp(tx, -16, 16);
    ty = Math.max(ty, -hgt * 2.1);
    const fk = 240;
    const fd = 13;
    this.tipVX += (fk * (tx - this.tipX) - fd * this.tipVX) * dt;
    this.tipVY += (fk * (ty - this.tipY) - fd * this.tipVY) * dt;
    this.tipX += this.tipVX * dt;
    this.tipY += this.tipVY * dt;
    this.flameSize = fl;
  }

  private flameStrength(simFlame: number): number {
    let f = simFlame * this.flameScale * (1 + this.flameBoost * 0.5) * (1 - this.flameDip * 0.35);
    if (this.deadT >= 0 && (this.deathCause === 'doused' || this.deathCause === 'hazard')) f *= Math.max(0, 1 - this.deadT * 6);
    if (this.deadT >= 0 && this.deathCause === 'stuck') f *= 0.6;
    return Math.max(0, f);
  }

  private startIdle(sim: SimLike): void {
    const kinds: IdleKind[] = this.calm ? ['look', 'stargaze', 'peek'] : ['look', 'hop', 'stretch', 'peek', 'stargaze', 'wiggle', 'peek', 'look'];
    let kind = kinds[(Math.random() * kinds.length) | 0];
    if (kind === this.lastIdle) kind = kinds[(Math.random() * kinds.length) | 0];
    // First idle on a fresh plan is a peek at what lies ahead.
    if (this.planT < 5 && this.lastIdle === null) kind = 'peek';
    this.lastIdle = kind;
    const dur = { look: 2.4, hop: 0.6, stretch: 1.5, peek: 1.9, stargaze: 2.2, wiggle: 0.8 }[kind];
    const it: Idle = { kind, t: 0, dur, px: 0, py: 0 };
    if (kind === 'peek') {
      const g = this.findGap(sim);
      it.px = g.x;
      it.py = g.y;
    }
    if (kind === 'hop') {
      this.pendingHop = 0.08;
      this.pendingHopV = -120;
      this.sqV -= 4;
    }
    if (kind === 'stretch') {
      this.sqV += 5;
      this.flameBoost = 0.5;
    }
    this.idle = it;
    this.idleWait = 2.6 + Math.random() * 3.4;
  }

  /** Where does the ground ahead run out? (For peeking.) Falls back to "a bit ahead and down". */
  private findGap(sim: SimLike): { x: number; y: number } {
    const w = sim.wick;
    const f = w.facing;
    const fallback = { x: w.x + f * 90, y: w.y + 50 };
    if (typeof sim.solidAt !== 'function') return fallback;
    try {
      let gy = w.y + WICK_R;
      for (let d = 24; d < 520; d += 12) {
        const x = w.x + f * d;
        // Walk the ground line: search down from the previous height for solid ground.
        let found = false;
        for (let dy = -30; dy <= 40; dy += 6) {
          if (sim.solidAt.call(sim, x, gy + dy, 2)) {
            gy = gy + dy;
            found = true;
            break;
          }
        }
        if (!found) return { x, y: gy + 30 };
      }
    } catch {
      /* fake sim */
    }
    return fallback;
  }

  draw(ctx: CanvasRenderingContext2D, simIn: Simulation, x: number, y: number, time: number): void {
    const sim = simIn as unknown as SimLike;
    const w = sim.wick;
    const running = sim.phase === 'running';
    const dead = this.deadT >= 0;
    const cause = this.deathCause;
    this.visible = !(dead && cause === 'hazard');
    if (!this.visible) {
      this.flameSize = 0;
      return;
    }
    const fl = this.flameSize;
    const hop = this.hopY;
    const shiverX = this.shiver > 0 ? Math.sin(time * 71) * 0.9 * this.shiver : 0;
    const bob = running && w.grounded ? -Math.abs(Math.sin((w.walkDist / 15) * Math.PI)) * 1.1 : plan(sim) ? Math.sin(time * 2.1) * 0.45 : 0;

    ctx.save();
    ctx.translate(x + shiverX, y + hop);

    // ── warm light pool ──
    const glowA = (0.3 + 0.14 * fl) * Math.min(1, fl * 1.6) * this.lit;
    if (glowA > 0.01) {
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const gr = 48 + 18 * fl + Math.sin(time * 3.1) * 2;
      ctx.globalAlpha = glowA;
      ctx.drawImage(glowSprite('#FF9E4A'), -gr, -gr - 4, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp;
    }

    // ── body transform (computed by hand so the legs can find the hips) ──
    const s = clamp(this.sq + this.airS, -0.32, 0.32);
    const sAlong = 1 + s;
    const sAcross = 1 / sAlong;
    // Idle stretch holds tall for a moment.
    const stretchHold = this.idle?.kind === 'stretch' ? Math.sin(Math.min(1, this.idle.t / this.idle.dur) * Math.PI) * 0.1 : 0;
    const sigh = dead && cause === 'stuck' ? Math.min(1, this.deadT * 2.5) * 0.09 : 0;
    const extraY = stretchHold - sigh;
    const pivY = BODY_CY + (FEET_Y - BODY_CY) * this.pivot;
    const ca = Math.cos(this.axis);
    const sa = Math.sin(this.axis);
    const cl = Math.cos(this.lean);
    const sl = Math.sin(this.lean);
    // M = T(0,pivY+bob) · R(lean) · R(axis) · S(sAcross, sAlong·(1+extraY)) · R(-axis) · T(0,-pivY)
    const sx0 = sAcross;
    const sy0 = sAlong * (1 + extraY);
    // Symmetric scale along the rotated axis: A = R(axis) S R(-axis)
    const a11 = ca * ca * sx0 + sa * sa * sy0;
    const a12 = ca * sa * (sx0 - sy0);
    const a22 = sa * sa * sx0 + ca * ca * sy0;
    // Then lean: L = R(lean) · A
    const m11 = cl * a11 - sl * a12;
    const m12 = cl * a12 - sl * a22;
    const m21 = sl * a11 + cl * a12;
    const m22 = sl * a12 + cl * a22;
    const ty0 = pivY + bob;
    // local (u,v) → (m11*u + m12*(v - pivY), ty0 + m21*u + m22*(v - pivY))
    const bx = (u: number, v: number) => m11 * u + m12 * (v - pivY);
    const by = (u: number, v: number) => ty0 + m21 * u + m22 * (v - pivY);

    // ── legs ──
    this.drawLegs(ctx, sim, bx, by);

    // ── body ──
    ctx.save();
    ctx.transform(m11, m21, m12, m22, -m12 * pivY, ty0 - m22 * pivY);
    const sprites = getBodySprites();
    const hw = SPRITE_U / 2;
    if (this.lit < 0.999) ctx.drawImage(sprites.unlit, -hw, -hw + BODY_CY, SPRITE_U, SPRITE_U);
    if (this.lit > 0.001) {
      ctx.globalAlpha = this.lit;
      ctx.drawImage(sprites.lit, -hw, -hw + BODY_CY, SPRITE_U, SPRITE_U);
      // Inner light breathes with the flame.
      const inner = (0.16 + 0.1 * Math.sin(time * 9.3) * Math.sin(time * 5.1)) * Math.min(1, fl) * this.lit;
      if (inner > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = inner;
        ctx.drawImage(glowSprite('#FFD9A0'), -BODY_RX, BODY_CY - BODY_RY, BODY_RX * 2, BODY_RY * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    this.drawFace(ctx, sim, time);
    ctx.restore();

    // ── handle + flame (drawn upright; flames rise) ──
    const hx = bx(0, CAP_TOP - 1.2);
    const hy = by(0, CAP_TOP - 1.2);
    this.head.x = x + shiverX + hx;
    this.head.y = y + hop + hy;
    this.drawHandle(ctx, bx, by);
    if (fl > 0.02) this.drawFlame(ctx, hx, hy, fl, time, w.flame);
    this.tip.x = this.head.x + this.tipX * Math.min(1, fl * 1.4);
    this.tip.y = this.head.y + this.tipY;
    ctx.restore();
  }

  private drawLegs(ctx: CanvasRenderingContext2D, sim: SimLike, bx: (u: number, v: number) => number, by: (u: number, v: number) => number): void {
    const w = sim.wick;
    const running = sim.phase === 'running';
    const air = running && !w.grounded;
    const f = w.facing;
    const phase = (w.walkDist / 15) * Math.PI;
    const dead = this.deadT >= 0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.55;
    ctx.lineCap = 'round';
    ctx.fillStyle = INK;
    // Ground slope under the feet (so feet sit on hills).
    const slope = running && w.grounded && w.ny < -0.3 ? -w.nx / w.ny : 0;
    // Seen side-on while walking, the hips nearly overlap (legs scissor, never cross into an X).
    const walking = running && !dead && !air;
    const hs = walking ? 0.9 : HIP_X;
    for (let side = -1; side <= 1; side += 2) {
      const hipX = bx(side * hs, HIP_Y);
      const hipY = by(side * hs, HIP_Y);
      let fx: number;
      let fy: number;
      if (air) {
        if (w.vy > 380) {
          // Falling: legs scurry on thin air.
          const q = this.time * 34 + (side > 0 ? Math.PI : 0);
          fx = hipX + side * 1.6 + Math.sin(q) * 2.6;
          fy = hipY + 6 + Math.cos(q) * 0.8;
        } else {
          // Tucked.
          fx = hipX + side * 1.2 - f * 1.4;
          fy = hipY + 3.4;
        }
      } else if (running && !dead) {
        const q = phase + (side > 0 ? Math.PI : 0);
        const swing = Math.sin(q) * 4.8;
        const lift = Math.max(0, Math.cos(q)) * 2.8;
        fx = side * 0.4 + swing * f;
        fy = FEET_Y - lift + fx * slope;
      } else {
        // Standing: feet planted apart, a little bow-legged.
        fx = side * (HIP_X + 2);
        fy = FEET_Y;
      }
      // Knee: a slight forward bend (outward when standing still).
      const standing = !air && !(running && !dead);
      const kx = (hipX + fx) / 2 + (standing ? side * 1.1 : f * 1.3);
      const ky = (hipY + fy) / 2;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.quadraticCurveTo(kx, ky, fx, fy);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(fx + f * 0.7, fy - 0.2, 1.7, 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHandle(ctx: CanvasRenderingContext2D, bx: (u: number, v: number) => number, by: (u: number, v: number) => number): void {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx(-4.6, CAP_TOP + 0.4), by(-4.6, CAP_TOP + 0.4));
    ctx.bezierCurveTo(bx(-5, CAP_TOP - 7.5), by(-5, CAP_TOP - 7.5), bx(5, CAP_TOP - 7.5), by(5, CAP_TOP - 7.5), bx(4.6, CAP_TOP + 0.4), by(4.6, CAP_TOP + 0.4));
    ctx.stroke();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, bx: number, by: number, fl: number, time: number, simFlame: number): void {
    // Sputter when weak.
    const weak = clamp(1 - simFlame, 0, 1);
    const sputter = weak > 0.3 ? 1 - weak * 0.35 * (0.5 + 0.5 * Math.sin(time * 23) * Math.sin(time * 9.7)) : 1;
    const flick = (1 + 0.09 * Math.sin(time * 17.3) + 0.06 * Math.sin(time * 29.1 + 1) + 0.04 * Math.sin(time * 43.7 + 2)) * sputter;
    const wf = 4.5 * Math.min(1.25, 0.55 + 0.45 * fl);
    const tx = bx + this.tipX * Math.min(1, fl * 1.4);
    const ty = by + this.tipY * flick;
    const cx = bx;
    const cy = by - wf * 0.8;

    // Bloom (additive sprites).
    ctx.globalCompositeOperation = 'lighter';
    const mx = (cx + tx) / 2;
    const my = (cy + ty) / 2;
    ctx.globalAlpha = 0.55 * Math.min(1, fl);
    const r1 = 12 + 12 * fl;
    ctx.drawImage(glowSprite('#FFB054'), mx - r1, my - r1, r1 * 2, r1 * 2);
    ctx.globalAlpha = 0.16 * Math.min(1, fl);
    const r2 = 34 + 20 * fl;
    ctx.drawImage(glowSprite('#FF8A3A'), mx - r2, my - r2, r2 * 2, r2 * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Outer, middle, core.
    flamePath(ctx, cx, cy, tx, ty, wf);
    ctx.fillStyle = '#FF7A2E';
    ctx.globalAlpha = 0.95;
    ctx.fill();
    flamePath(ctx, cx, cy + wf * 0.12, cx + (tx - cx) * 0.8, cy + (ty - cy) * 0.8, wf * 0.74);
    ctx.fillStyle = '#FFBE45';
    ctx.globalAlpha = 1;
    ctx.fill();
    flamePath(ctx, cx, cy + wf * 0.28, cx + (tx - cx) * 0.52, cy + (ty - cy) * 0.5, wf * 0.44);
    ctx.fillStyle = '#FFF8E0';
    ctx.fill();
    // A breath of blue at the root, like a real candle.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#7FA6FF';
    ctx.beginPath();
    ctx.ellipse(cx, cy + wf * 0.78, wf * 0.42, wf * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawFace(ctx: CanvasRenderingContext2D, sim: SimLike, time: number): void {
    void sim;
    const face = this.face;
    const lx = this.lookX;
    const ly = this.lookY;
    const cx = face * 2.1 + lx * 1.1;
    const eyeY = 0.4 + ly * 1.5;
    const spacing = 4.5;
    const mood = this.mood;
    const scared = Math.max(this.scared, mood === 'scared' ? 1 : 0);
    const lit = this.lit;

    // Cheeks.
    const blush = mood === 'happy' ? 0.55 : mood === 'excited' ? 0.42 : 0.3;
    ctx.fillStyle = `rgba(255,112,100,${(blush * (0.4 + 0.6 * lit)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx - 7.6 + face * 0.4, eyeY + 3.6, 2.4, 1.45, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 7.6 + face * 0.4, eyeY + 3.6, 2.4, 1.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let side = -1; side <= 1; side += 2) {
      // The far eye is a touch narrower (the face is on a sphere).
      const far = side === -Math.sign(face || 1) ? 1 - Math.abs(face) * 0.14 : 1;
      const ex = cx + side * spacing + lx * 1.3;
      const ey = eyeY;
      if (mood === 'happy') {
        // ^ ^
        ctx.lineWidth = 1.45;
        ctx.beginPath();
        ctx.moveTo(ex - 2.1, ey + 0.9);
        ctx.quadraticCurveTo(ex, ey - 2.6, ex + 2.1, ey + 0.9);
        ctx.stroke();
        continue;
      }
      if (mood === 'sad') {
        // Closed, downcast.
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(ex - 2, ey - 0.2);
        ctx.quadraticCurveTo(ex, ey + 1.9, ex + 2, ey - 0.2);
        ctx.stroke();
        continue;
      }
      const big = 1 + scared * 0.3 + (mood === 'excited' ? 0.08 : 0) + this.sparkle * 0.12;
      const rx = 1.8 * big * far;
      let ry = 2.5 * big * Math.max(0.12, 1 - this.blink);
      let oy = 0;
      if (mood === 'sigh') {
        // Half-lidded.
        ry *= 0.55;
        oy = 0.9;
      }
      ctx.beginPath();
      ctx.ellipse(ex, ey + oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (ry > 1 && lit > 0.3) {
        // Catch-light (bigger when something sparkly happens).
        ctx.fillStyle = '#FFF7E4';
        const cr = 0.6 + this.sparkle * 0.45;
        ctx.beginPath();
        ctx.arc(ex - 0.55 + lx * 0.3, ey + oy - ry * 0.38, cr, 0, Math.PI * 2);
        ctx.fill();
        if (this.sparkle > 0.3) {
          ctx.beginPath();
          ctx.arc(ex + 0.7, ey + oy + ry * 0.35, cr * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = INK;
      }
      if (mood === 'sigh') {
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(ex - rx - 0.3, ey + oy - ry);
        ctx.lineTo(ex + rx + 0.3, ey + oy - ry);
        ctx.stroke();
      }
    }

    // Mouth.
    const mx = cx + lx * 0.9;
    const my = eyeY + 4.3;
    if (mood === 'happy') {
      ctx.fillStyle = '#5B2418';
      ctx.beginPath();
      ctx.moveTo(mx - 2.3, my - 0.6);
      ctx.quadraticCurveTo(mx, my + 3.6, mx + 2.3, my - 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FF8C8C';
      ctx.beginPath();
      ctx.ellipse(mx, my + 1.2, 1, 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (scared > 0.35) {
      ctx.beginPath();
      ctx.ellipse(mx, my + 0.6, 1.1 * scared + 0.2, 1.5 * scared + 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'sad') {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - 1.8, my + 1.2);
      ctx.quadraticCurveTo(mx - 0.9, my + 0.3, mx, my + 1);
      ctx.quadraticCurveTo(mx + 0.9, my + 1.7, mx + 1.8, my + 0.9);
      ctx.stroke();
    } else if (mood === 'sigh') {
      ctx.beginPath();
      ctx.ellipse(mx + 0.3, my + 0.5, 0.9, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'excited' || this.sparkle > 0.4) {
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(mx - 1.6, my);
      ctx.quadraticCurveTo(mx, my + 1.8, mx + 1.6, my);
      ctx.stroke();
    } else if (this.idle?.kind === 'stretch') {
      const k = Math.sin((this.idle.t / this.idle.dur) * Math.PI);
      ctx.beginPath();
      ctx.ellipse(mx, my + 0.5, 1.1 * k, 1.5 * k + 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    void time;
  }
}

function plan(sim: SimLike): boolean {
  return sim.phase === 'plan';
}

/** A teardrop flame: round belly centred at (cx, cy) with radius w, rising to the tip (tx, ty). */
function flamePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, tx: number, ty: number, w: number): void {
  const h = cy - ty;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.bezierCurveTo(cx + w * 0.35 + (tx - cx) * 0.35, cy - h * 0.55, cx + w * 1.05, cy - h * 0.25, cx + w, cy);
  ctx.arc(cx, cy, w, 0, Math.PI);
  ctx.bezierCurveTo(cx - w * 1.05, cy - h * 0.25, cx - w * 0.35 + (tx - cx) * 0.35, cy - h * 0.55, tx, ty);
  ctx.closePath();
}

// ───────────────────────────── body sprites ─────────────────────────────

let bodySprites: { lit: HTMLCanvasElement; unlit: HTMLCanvasElement } | null = null;

function getBodySprites(): { lit: HTMLCanvasElement; unlit: HTMLCanvasElement } {
  if (!bodySprites) bodySprites = { lit: paintBody(true), unlit: paintBody(false) };
  return bodySprites;
}

/** The paper lantern, painted once at 4× (paper grain, ribs, lacquered caps). */
function paintBody(lit: boolean): HTMLCanvasElement {
  const px = SPRITE_U * SPRITE_S;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.setTransform(SPRITE_S, 0, 0, SPRITE_S, px / 2, px / 2);
  // Body centred at (0,0) here; the draw call offsets by BODY_CY.
  const rx = BODY_RX;
  const ry = BODY_RY;
  const body = () => {
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  };
  // Paper: light from within — bright heart, warm edges where the paper is seen at a glance.
  const grad = g.createRadialGradient(-1.5, 1.5, 1, 0, 0, rx * 1.02);
  if (lit) {
    grad.addColorStop(0, '#FFFDF2');
    grad.addColorStop(0.45, '#FFF0CF');
    grad.addColorStop(0.78, '#FFD08E');
    grad.addColorStop(1, '#F29752');
  } else {
    grad.addColorStop(0, '#B9AE9E');
    grad.addColorStop(0.55, '#9A8C7A');
    grad.addColorStop(1, '#63554A');
  }
  body();
  g.fillStyle = grad;
  g.fill();

  g.save();
  body();
  g.clip();
  // Paper grain: tiny fibres and a mottled wash.
  let seed = lit ? 11 : 12;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 14; i++) {
    g.fillStyle = lit ? `rgba(255,200,140,${0.05 + rnd() * 0.06})` : `rgba(90,70,50,${0.05 + rnd() * 0.05})`;
    g.beginPath();
    g.ellipse((rnd() - 0.5) * rx * 1.8, (rnd() - 0.5) * ry * 1.8, 1.5 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 0.18;
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * rx * 2;
    const y = (rnd() - 0.5) * ry * 2;
    const a = rnd() * Math.PI;
    const l = 0.8 + rnd() * 2.2;
    g.strokeStyle = rnd() < 0.5 ? (lit ? 'rgba(255,255,255,0.35)' : 'rgba(230,220,200,0.25)') : lit ? 'rgba(200,120,60,0.18)' : 'rgba(60,45,30,0.2)';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Ribs: bamboo meridians seen through the paper.
  g.strokeStyle = lit ? 'rgba(196,112,52,0.30)' : 'rgba(70,50,35,0.4)';
  g.lineWidth = 0.55;
  for (const k of [-0.8, -0.42, 0.42, 0.8]) {
    g.beginPath();
    g.ellipse(0, 0, Math.abs(k) * rx, ry, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    g.stroke();
  }
  // Horizontal hoops, very faint (gives it a lantern read at a glance).
  g.lineWidth = 0.4;
  g.strokeStyle = lit ? 'rgba(196,112,52,0.14)' : 'rgba(70,50,35,0.22)';
  for (const k of [-0.55, 0.55]) {
    const yy = k * ry;
    const half = rx * Math.sqrt(1 - k * k);
    g.beginPath();
    g.moveTo(-half, yy);
    g.quadraticCurveTo(0, yy + (k > 0 ? 1.5 : -1.5) * 0.5 + 1.2, half, yy);
    g.stroke();
  }
  // Soft sheen, top-left.
  if (lit) {
    const sh = g.createRadialGradient(-5, -6, 0, -5, -6, 6);
    sh.addColorStop(0, 'rgba(255,255,255,0.55)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(-12, -13, 14, 14);
  }
  g.restore();
  // Paper edge.
  body();
  g.strokeStyle = lit ? 'rgba(170,82,30,0.55)' : 'rgba(50,35,25,0.7)';
  g.lineWidth = 0.7;
  g.stroke();

  // Lacquered caps.
  const cap = (y0: number, wTop: number, wBot: number, h: number) => {
    g.beginPath();
    g.moveTo(-wTop / 2, y0);
    g.lineTo(wTop / 2, y0);
    g.quadraticCurveTo(wBot / 2 + 0.6, y0 + h * 0.5, wBot / 2, y0 + h);
    g.lineTo(-wBot / 2, y0 + h);
    g.quadraticCurveTo(-wBot / 2 - 0.6, y0 + h * 0.5, -wTop / 2, y0);
    g.closePath();
    g.fillStyle = INK;
    g.fill();
    g.strokeStyle = 'rgba(160,110,70,0.55)';
    g.lineWidth = 0.35;
    g.beginPath();
    g.moveTo(-wTop / 2 + 0.6, y0 + 0.4);
    g.lineTo(wTop / 2 - 0.6, y0 + 0.4);
    g.stroke();
  };
  cap(-ry - 0.9, 8.4, 10.6, 3.2);
  cap(ry - 1.6, 7.6, 5.6, 2.4);
  return c;
}

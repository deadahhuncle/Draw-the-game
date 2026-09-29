import {
  DT,
  FALL_DEATH_Y,
  GOAL_R,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  GROUND_NY,
  GROUND_SNAP,
  H,
  HAZARD_GRACE,
  LAUNCH_NO_SNAP,
  BOUNCE_SPEED,
  MIN_STROKE,
  PEN_SAMPLE,
  RUSH_ACCEL,
  RUSH_GROUND_NY,
  RUSH_SPEED,
  SPARK_PICK_R,
  STUCK_DIST,
  STUCK_TIME,
  TERMINAL_VY,
  TURN_COOLDOWN,
  W,
  WALK_SPEED,
  WALL_NX,
  WICK_EXCLUSION,
  WICK_R,
} from '../core/constants';
import { closestOnSegment, dist, distToSegment2, lerpVec, pointInPolygon, polygonBounds, type Vec } from '../core/math';
import { Rng, hashString } from '../core/rng';
import type { DeathCause, InkType, LevelDef, SimEvent } from '../core/types';
import type { Entity } from './entity';
import { createEntity } from './entities';
import { SegGrid, type Seg } from './segments';
import { arcLengthAt, strokeSegments, type Stroke } from './strokes';

export type Phase = 'plan' | 'running' | 'won' | 'dead';

export interface WickState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  /** Ground normal (valid while grounded). */
  nx: number;
  ny: number;
  groundSeg: Seg | null;
  onRush: boolean;
  /** Seconds remaining with ground-snap disabled (after launches). */
  noSnap: number;
  turnCd: number;
  airTime: number;
  /** Distance walked on the ground (drives the leg cycle). */
  walkDist: number;
  /** Flame strength 0..1 (rain douses it). */
  flame: number;
  /** Time since the last rain hit (flame recovers after a while). */
  sinceHit: number;
  stuckX: number;
  stuckY: number;
  stuckT: number;
}

interface Contact {
  nx: number;
  ny: number;
  pen: number;
  seg: Seg;
  corner: boolean;
}

interface PenState {
  active: boolean;
  ink: InkType;
  stroke: Stroke | null;
  last: Vec | null;
  dry: boolean;
}

const tmp: Vec = { x: 0, y: 0 };
// A corner below Wick's centre is a step it can scramble over (any obstacle lower than its radius).
const STEP_NY = -0.06;
const EDGE_LEAVE_NY = -0.85;
const FOOT_STRIDE = 15;
const CONTACT_SLOP = 0.75;

/**
 * The deterministic game world. No DOM, no Math.random. The browser game and the headless
 * level verifier drive exactly the same code.
 */
export class Simulation {
  readonly level: LevelDef;
  phase: Phase = 'plan';
  /** Sim seconds since Go. */
  time = 0;
  steps = 0;
  attempts = 0;
  wick: WickState;
  strokes: Stroke[] = [];
  sparks: boolean[];
  sparkCount = 0;
  /** Extra ink granted by inkpots during this run. */
  inkBonus = 0;
  /** Bumped whenever stroke geometry changes (render caches key off this). */
  inkVersion = 0;
  deathCause: DeathCause | null = null;
  events: SimEvent[] = [];
  entities: Entity[] = [];
  entitySegs: Seg[] = [];
  rng: Rng;

  private nextStrokeId = 1;
  private staticGrid: SegGrid;
  private hazardGrid: SegGrid;
  private hazardPolys: { pts: Vec[]; minX: number; minY: number; maxX: number; maxY: number }[] = [];
  private inkGrid = new SegGrid(64);
  private inkDirty = true;
  private noInk: { pts: Vec[]; minX: number; minY: number; maxX: number; maxY: number }[];
  private pen: PenState = { active: false, ink: 'moon', stroke: null, last: null, dry: false };
  private footPhase = 0;
  /** Loop detector: how often each (Wick state + entity state) snapshot has been seen at a bounce/turn/land. */
  private loopSeen = new Map<string, number>();
  private externalAcc: Vec = { x: 0, y: 0 };

  constructor(level: LevelDef) {
    this.level = level;
    this.rng = new Rng(level.seed ?? hashString(level.id));
    this.sparks = level.sparks.map(() => false);
    this.wick = this.freshWick();

    const statics: Seg[] = [];
    const hazards: Seg[] = [];
    level.terrain.forEach((t, index) => {
      const mat = t.mat ?? 'solid';
      const pts = t.pts;
      if (mat === 'hazard') this.hazardPolys.push({ pts, ...polygonBounds(pts) });
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const seg: Seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, hw: 0, mat: mat === 'hazard' ? 'solid' : mat, owner: { kind: 'terrain', index } };
        if (mat === 'bounce') seg.bounce = t.bounce ?? BOUNCE_SPEED;
        (mat === 'hazard' ? hazards : statics).push(seg);
      }
    });
    // Invisible page edges: Wick turns around at x=0 and x=W.
    statics.push({ ax: 0, ay: -2000, bx: 0, by: H + 400, hw: 0, mat: 'solid', owner: { kind: 'wall' } });
    statics.push({ ax: W, ay: -2000, bx: W, by: H + 400, hw: 0, mat: 'solid', owner: { kind: 'wall' } });
    this.staticGrid = new SegGrid(64, statics);
    this.hazardGrid = new SegGrid(64, hazards);
    this.noInk = (level.noInk ?? []).map((pts) => ({ pts, ...polygonBounds(pts) }));

    this.entities = (level.entities ?? []).map((def, i) => createEntity(this, def, i));
    for (const e of this.entities) e.reset();
    this.collectEntitySegs();
  }

  // ─────────────────────────────── queries ───────────────────────────────

  get inkBudget(): number {
    return this.level.ink.budget + this.inkBonus;
  }
  get inkUsed(): number {
    let s = 0;
    for (const st of this.strokes) s += st.len;
    return s;
  }
  get inkLeft(): number {
    return Math.max(0, this.inkBudget - this.inkUsed);
  }
  get penActive(): boolean {
    return this.pen.active;
  }
  get penInk(): InkType {
    return this.pen.ink;
  }
  get currentStroke(): Stroke | null {
    return this.pen.stroke;
  }

  /** Can ink be laid at this point right now? */
  inkAllowedAt(p: Vec): 'ok' | 'wick' | 'noink' | 'bounds' {
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return 'bounds';
    if (this.phase !== 'won' && dist(p, this.wick) < WICK_EXCLUSION) return 'wick';
    for (const z of this.noInk) {
      if (p.x < z.minX || p.x > z.maxX || p.y < z.minY || p.y > z.maxY) continue;
      if (pointInPolygon(p, z.pts)) return 'noink';
    }
    return 'ok';
  }

  /** Visit every solid segment (terrain, walls, ink, entities) near a point. */
  forEachSolidNear(x: number, y: number, r: number, fn: (s: Seg) => void): void {
    if (this.inkDirty) this.rebuildInk();
    this.staticGrid.query(x, y, r, fn);
    this.inkGrid.query(x, y, r, fn);
    for (const s of this.entitySegs) {
      const minX = Math.min(s.ax, s.bx) - s.hw - r;
      const maxX = Math.max(s.ax, s.bx) + s.hw + r;
      const minY = Math.min(s.ay, s.by) - s.hw - r;
      const maxY = Math.max(s.ay, s.by) + s.hw + r;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) fn(s);
    }
  }

  /** Is there any solid surface within `r` of the point? (Rain drops, moths, etc.) */
  solidAt(x: number, y: number, r: number): Seg | null {
    let hit: Seg | null = null;
    this.forEachSolidNear(x, y, r + 4, (s) => {
      if (hit) return;
      const rr = r + s.hw;
      if (distToSegment2(x, y, s.ax, s.ay, s.bx, s.by) <= rr * rr) hit = s;
    });
    return hit;
  }

  /** Does Wick's body overlap a circle? */
  wickTouches(x: number, y: number, r: number): boolean {
    const dx = this.wick.x - x;
    const dy = this.wick.y - y;
    const rr = r + WICK_R;
    return dx * dx + dy * dy <= rr * rr;
  }

  /** Sum of entity acceleration fields (wind) at a point, added into `out`. */
  fieldAt(x: number, y: number, out: Vec): void {
    for (const e of this.entities) e.accel?.(x, y, out);
  }

  /** Plan-mode cosmetic animation for entities (rain keeps falling, moths hover). Reset again at Go. */
  idle(dt: number): void {
    if (this.phase !== 'plan') return;
    for (const e of this.entities) e.idle?.(dt);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  /** Take (and clear) pending events. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ─────────────────────────────── ink / pen ───────────────────────────────

  penDown(ink: InkType, p: Vec): boolean {
    if (this.phase === 'won' || this.phase === 'dead') return false;
    if (!this.level.ink.types.includes(ink)) return false;
    if (this.pen.active) this.penUp();
    this.pen = { active: true, ink, stroke: null, last: null, dry: false };
    this.feedPoint(p);
    return true;
  }

  penMove(p: Vec): void {
    const pen = this.pen;
    if (!pen.active || pen.dry) return;
    if (!pen.last) {
      this.feedPoint(p);
      return;
    }
    let d = dist(pen.last, p);
    while (d >= PEN_SAMPLE && pen.active && !pen.dry) {
      const q = lerpVec(pen.last!, p, PEN_SAMPLE / d);
      this.feedPoint(q);
      d = dist(pen.last!, p);
    }
  }

  penUp(p?: Vec): void {
    const pen = this.pen;
    if (!pen.active) return;
    if (p && !pen.dry && pen.stroke && pen.last && dist(pen.last, p) > 1) this.feedPoint(p);
    this.finishStroke();
    pen.active = false;
    pen.last = null;
  }

  /** Draw a complete stroke at once (reference solutions, tests). */
  drawStroke(ink: InkType, pts: readonly Vec[]): void {
    if (pts.length === 0) return;
    if (!this.penDown(ink, pts[0])) return;
    for (let i = 1; i < pts.length; i++) this.penMove(pts[i]);
    this.penUp(pts[pts.length - 1]);
  }

  private feedPoint(q: Vec): void {
    const pen = this.pen;
    const ok = this.inkAllowedAt(q);
    if (ok !== 'ok') {
      if (pen.stroke) {
        this.emit({ type: 'stroke-cut', x: q.x, y: q.y, reason: ok });
        this.finishStroke();
      }
      pen.last = { x: q.x, y: q.y };
      return;
    }
    if (!pen.stroke) {
      if (this.inkLeft <= 0.5) {
        this.emit({ type: 'ink-dry', x: q.x, y: q.y });
        pen.dry = true;
        pen.last = { x: q.x, y: q.y };
        return;
      }
      const stroke: Stroke = {
        id: this.nextStrokeId++,
        ink: pen.ink,
        pts: [{ x: q.x, y: q.y }],
        len: 0,
        born: this.phase === 'running' ? this.time : -1,
        done: false,
        bites: [],
      };
      this.strokes.push(stroke);
      pen.stroke = stroke;
      pen.last = { x: q.x, y: q.y };
      this.inkDirty = true;
      this.inkVersion++;
      this.emit({ type: 'stroke-begin', id: stroke.id, ink: stroke.ink, x: q.x, y: q.y });
      return;
    }
    const last = pen.last!;
    let segLen = dist(last, q);
    if (segLen < 1e-6) return;
    const left = this.inkLeft;
    let target = q;
    let dry = false;
    if (segLen >= left) {
      target = lerpVec(last, q, Math.max(0, left) / segLen);
      segLen = Math.max(0, left);
      dry = true;
    }
    if (segLen > 0) {
      pen.stroke.pts.push({ x: target.x, y: target.y });
      pen.stroke.len += segLen;
      this.inkDirty = true;
      this.inkVersion++;
    }
    pen.last = { x: target.x, y: target.y };
    if (dry) {
      this.emit({ type: 'ink-dry', x: target.x, y: target.y });
      this.finishStroke();
      pen.dry = true;
    }
  }

  private finishStroke(): void {
    const s = this.pen.stroke;
    if (!s) return;
    this.pen.stroke = null;
    if (s.len < MIN_STROKE) {
      this.strokes.splice(this.strokes.indexOf(s), 1);
    } else {
      s.done = true;
      this.emit({ type: 'stroke-end', id: s.id, ink: s.ink, len: s.len });
    }
    this.inkDirty = true;
    this.inkVersion++;
  }

  undo(): boolean {
    if (this.pen.active || this.strokes.length === 0) return false;
    const s = this.strokes.pop()!;
    this.inkDirty = true;
    this.inkVersion++;
    this.emit({ type: 'undo', id: s.id });
    return true;
  }

  clearInk(): void {
    if (this.pen.active) this.penUp();
    if (!this.strokes.length) return;
    this.strokes = [];
    this.inkDirty = true;
    this.inkVersion++;
    this.emit({ type: 'clear' });
  }

  /** Remove ink within radius r of (x,y) (moths). Returns the ink length eaten. */
  biteInk(x: number, y: number, r: number): number {
    let eaten = 0;
    for (const s of this.strokes) {
      if (s === this.pen.stroke) continue;
      const { s: at, d2 } = arcLengthAt(s, x, y);
      if (d2 > r * r) continue;
      const half = Math.sqrt(r * r - d2);
      s.bites.push([at - half, at + half]);
      eaten += half * 2;
      this.inkDirty = true;
      this.inkVersion++;
      this.emit({ type: 'moth-bite', x, y, strokeId: s.id });
    }
    return eaten;
  }

  /** Nearest point on any live (un-eaten) ink to (x,y), within maxDist. */
  nearestInk(x: number, y: number, maxDist: number): { x: number; y: number; d: number; strokeId: number } | null {
    if (this.inkDirty) this.rebuildInk();
    let best: { x: number; y: number; d: number; strokeId: number } | null = null;
    this.inkGrid.query(x, y, maxDist, (s) => {
      const t = closestOnSegment(x, y, s.ax, s.ay, s.bx, s.by, tmp);
      void t;
      const d = Math.hypot(tmp.x - x, tmp.y - y);
      if (d <= maxDist && (!best || d < best.d)) best = { x: tmp.x, y: tmp.y, d, strokeId: s.owner.kind === 'stroke' ? s.owner.id : -1 };
    });
    return best;
  }

  addInk(amount: number, x: number, y: number): void {
    this.inkBonus += amount;
    this.emit({ type: 'inkpot', x, y, amount });
  }

  /** Rain hit: reduce the flame. At zero Wick is doused. */
  douse(amount: number, x: number, y: number): void {
    if (this.phase !== 'running') return;
    const w = this.wick;
    w.flame = Math.max(0, w.flame - amount);
    w.sinceHit = 0;
    this.emit({ type: 'rain-hit', x, y, flame: w.flame });
    if (w.flame <= 0.001) this.die('doused');
  }

  private rebuildInk(): void {
    const segs: Seg[] = [];
    for (const s of this.strokes) for (const seg of strokeSegments(s)) segs.push(seg);
    this.inkGrid.rebuild(segs);
    this.inkDirty = false;
  }

  private collectEntitySegs(): void {
    const out: Seg[] = [];
    for (const e of this.entities) for (const s of e.segs) out.push(s);
    this.entitySegs = out;
  }

  // ─────────────────────────────── flow ───────────────────────────────

  private freshWick(): WickState {
    const s = this.level.start;
    return {
      x: s.x,
      y: s.y - WICK_R,
      vx: 0,
      vy: 0,
      facing: s.facing ?? 1,
      grounded: false,
      nx: 0,
      ny: -1,
      groundSeg: null,
      onRush: false,
      noSnap: 0,
      turnCd: 0,
      airTime: 0,
      walkDist: 0,
      flame: 1,
      sinceHit: 99,
      stuckX: s.x,
      stuckY: s.y - WICK_R,
      stuckT: 0,
    };
  }

  go(): boolean {
    if (this.phase !== 'plan') return false;
    this.phase = 'running';
    this.time = 0;
    this.attempts++;
    this.loopSeen.clear();
    // Entities may have idled cosmetically during planning — restart them from their exact t=0 state.
    for (const e of this.entities) e.reset();
    this.collectEntitySegs();
    this.emit({ type: 'go' });
    return true;
  }

  /** Back to plan mode: Wick to start, sparks & entities restored, moth bites healed. Strokes persist. */
  reset(): void {
    if (this.pen.active) this.penUp();
    this.phase = 'plan';
    this.time = 0;
    this.steps = 0;
    this.deathCause = null;
    this.wick = this.freshWick();
    this.sparks = this.level.sparks.map(() => false);
    this.sparkCount = 0;
    this.inkBonus = 0;
    for (const s of this.strokes) s.bites = [];
    // Strokes drawn mid-run with inkpot ink can't survive without the pot: trim newest run-strokes.
    while (this.inkUsed > this.level.ink.budget + 1e-6) {
      const idx = findLastIndex(this.strokes, (s) => s.born >= 0);
      if (idx < 0) break;
      this.strokes.splice(idx, 1);
    }
    this.inkDirty = true;
    this.inkVersion++;
    for (const e of this.entities) e.reset();
    this.collectEntitySegs();
    this.emit({ type: 'reset' });
  }

  die(cause: DeathCause): void {
    if (this.phase !== 'running') return;
    this.phase = 'dead';
    this.deathCause = cause;
    this.emit({ type: 'death', cause, x: this.wick.x, y: this.wick.y });
  }

  /** Advance one fixed step (DT). No-op unless running. */
  step(): void {
    if (this.phase !== 'running') return;
    this.time += DT;
    this.steps++;
    for (const e of this.entities) e.step(DT);
    this.collectEntitySegs();
    if (this.inkDirty) this.rebuildInk();
    this.stepWick();
    if (this.phase === 'running') this.checkPickups();
  }

  // ─────────────────────────────── Wick ───────────────────────────────

  private stepWick(): void {
    const w = this.wick;
    w.turnCd -= DT;
    w.noSnap -= DT;
    w.sinceHit += DT;
    if (w.sinceHit > 2.5 && w.flame < 1) w.flame = Math.min(1, w.flame + DT * 0.35);

    // External fields (wind).
    const acc = this.externalAcc;
    acc.x = 0;
    acc.y = 0;
    this.fieldAt(w.x, w.y, acc);
    if (w.grounded && acc.x * w.nx + acc.y * w.ny > GRAVITY * 0.55) {
      // A strong updraft lifts Wick off the ground.
      w.grounded = false;
      w.noSnap = LAUNCH_NO_SNAP;
    }

    // 1) Velocity.
    const wasGrounded = w.grounded;
    let wasRush = w.onRush;
    if (w.grounded) {
      const tx = -w.ny;
      const ty = w.nx;
      let vt = w.vx * tx + w.vy * ty;
      const seg = w.groundSeg;
      let target = w.facing * WALK_SPEED;
      let accel = Math.abs(vt) > WALK_SPEED + 1 ? GROUND_DECEL : GROUND_ACCEL;
      w.onRush = false;
      if (seg && seg.mat === 'rush' && seg.dx !== undefined) {
        const along = seg.dx * tx + (seg.dy ?? 0) * ty;
        if (Math.abs(along) > 0.2) {
          const s = along > 0 ? 1 : -1;
          target = s * RUSH_SPEED;
          accel = RUSH_ACCEL;
          w.onRush = true;
          w.facing = s as 1 | -1;
        }
      }
      // Wind along the ground nudges the walking speed a little.
      vt += (acc.x * tx + acc.y * ty) * DT * 0.35;
      vt = approach(vt, target, accel * DT);
      w.vx = tx * vt - w.nx * 25;
      w.vy = ty * vt - w.ny * 25;
      // Ride moving platforms.
      if (seg && (seg.vx || seg.vy)) {
        w.x += (seg.vx ?? 0) * DT;
        w.y += (seg.vy ?? 0) * DT;
      }
    } else {
      w.onRush = false;
      w.vx += acc.x * DT;
      w.vy += (GRAVITY + acc.y) * DT;
      if (w.vy > TERMINAL_VY) w.vy = TERMINAL_VY;
      w.airTime += DT;
    }
    if (w.onRush && !wasRush) this.emit({ type: 'rush-start', x: w.x, y: w.y, dx: w.vx, dy: w.vy });
    if (!w.onRush && wasRush && !w.grounded) this.emit({ type: 'rush-end', x: w.x, y: w.y });
    wasRush = w.onRush;

    // 2) Integrate.
    const px = w.x;
    w.x += w.vx * DT;
    w.y += w.vy * DT;

    // 3) Collide: push out of everything, then classify everything we're touching.
    this.resolve(w);
    const contacts = this.touching(w);

    // 4) Respond & classify.
    let ground: Contact | null = null;
    let bounced = false;
    const impactVy = w.vy;
    const walkableSet = new Set<Contact>();
    for (const c of contacts) {
      const vn = w.vx * c.nx + w.vy * c.ny;
      if (c.seg.mat === 'bounce') {
        if (!bounced && vn < 80) {
          // Springs push along their *face* normal, so brushing a rounded end-cap (walking onto a spring
          // lying on the ground, or onto the end of a tilted one) still launches the way the surface faces.
          // Only a hit squarely on the tip (> 75° off the face) uses the radial contact normal.
          const n = this.bounceNormal(c, w);
          const bvn = w.vx * n.x + w.vy * n.y;
          const bs = c.seg.bounce ?? BOUNCE_SPEED;
          const tvx = w.vx - n.x * bvn;
          const tvy = w.vy - n.y * bvn;
          w.vx = tvx + n.x * bs;
          w.vy = tvy + n.y * bs;
          if (w.vy < -bs) w.vy = -bs;
          bounced = true;
          w.noSnap = LAUNCH_NO_SNAP;
          if (Math.abs(w.vx) > 40) w.facing = w.vx > 0 ? 1 : -1;
          this.emit({ type: 'bounce', x: w.x - c.nx * WICK_R, y: w.y - c.ny * WICK_R, nx: n.x, ny: n.y, speed: bs, ink: c.seg.owner.kind === 'stroke' });
          this.loopCheck('b');
        }
        continue;
      }
      if (vn < 0) {
        w.vx -= c.nx * vn;
        w.vy -= c.ny * vn;
      }
      if (this.walkable(c, wasGrounded, w.facing)) {
        walkableSet.add(c);
        // Prefer the surface we're walking *into* (uphill ahead): that's the one that constrains motion.
        const k = c.nx * w.facing;
        const kg = ground ? ground.nx * w.facing : Infinity;
        if (!ground || k < kg - 1e-3 || (Math.abs(k - kg) <= 1e-3 && c.ny < ground.ny)) ground = c;
      }
    }

    if (bounced) {
      w.grounded = false;
      w.groundSeg = null;
    } else if (ground) {
      if (!wasGrounded) {
        // Landing: keep momentum along the surface, face the way we're travelling.
        const tx = -ground.ny;
        const ty = ground.nx;
        const vt = w.vx * tx + w.vy * ty;
        if (Math.abs(vt) > 40) w.facing = vt > 0 ? 1 : -1;
        if (w.airTime > 0.1) {
          this.emit({ type: 'land', x: w.x, y: w.y + WICK_R, speed: Math.max(0, impactVy) });
          this.loopCheck('l');
        }
        w.vx = tx * vt;
        w.vy = ty * vt;
      }
      w.grounded = true;
      w.nx = ground.nx;
      w.ny = ground.ny;
      w.groundSeg = ground.seg;
      w.airTime = 0;
    } else if (wasGrounded && w.noSnap <= 0 && Math.hypot(w.vx, w.vy) <= WALK_SPEED * 1.4 + 30) {
      const snap = this.findSnap(w);
      if (snap) {
        w.x -= snap.nx * snap.gap;
        w.y -= snap.ny * snap.gap;
        w.nx = snap.nx;
        w.ny = snap.ny;
        w.groundSeg = snap.seg;
        w.grounded = true;
      } else {
        w.grounded = false;
        w.groundSeg = null;
      }
    } else {
      w.grounded = false;
      w.groundSeg = null;
    }

    // Walls: turn around.
    for (const c of contacts) {
      if (walkableSet.has(c) || c.seg.mat === 'bounce') continue;
      if (Math.abs(c.nx) > WALL_NX && c.nx * w.facing < 0 && c.ny > -0.8 && w.turnCd <= 0 && !w.onRush) {
        w.facing = w.facing === 1 ? -1 : 1;
        w.turnCd = TURN_COOLDOWN;
        if (w.grounded) {
          // A little bump: stop, then walk the other way.
          const tx = -w.ny;
          const ty = w.nx;
          const vt = w.vx * tx + w.vy * ty;
          w.vx -= tx * vt;
          w.vy -= ty * vt;
        }
        this.emit({ type: 'turn', x: w.x, y: w.y, facing: w.facing });
        this.loopCheck('t');
        break;
      }
    }

    if (wasRush && !w.onRush && w.grounded) this.emit({ type: 'rush-end', x: w.x, y: w.y });

    // Footsteps.
    if (w.grounded) {
      const moved = Math.abs(w.x - px);
      w.walkDist += moved;
      this.footPhase += moved;
      if (this.footPhase > FOOT_STRIDE) {
        this.footPhase -= FOOT_STRIDE;
        this.emit({ type: 'step', x: w.x, y: w.y + WICK_R, foot: (Math.floor(w.walkDist / FOOT_STRIDE) % 2) as 0 | 1 });
      }
    }

    // Hazards (not solid; generous overlap test).
    if (this.touchesHazard(w.x, w.y)) {
      this.die('hazard');
      return;
    }
    if (w.y > FALL_DEATH_Y) {
      this.die('fall');
      return;
    }
    // Stuck?
    if (Math.hypot(w.x - w.stuckX, w.y - w.stuckY) > STUCK_DIST) {
      w.stuckX = w.x;
      w.stuckY = w.y;
      w.stuckT = this.time;
    } else if (this.time - w.stuckT > STUCK_TIME) {
      this.die('stuck');
    }
  }

  private bounceNormal(c: Contact, w: WickState): Vec {
    const s = c.seg;
    const sx = s.bx - s.ax;
    const sy = s.by - s.ay;
    const l = Math.hypot(sx, sy);
    if (l < 1e-6) return { x: c.nx, y: c.ny };
    let fx = -sy / l;
    let fy = sx / l;
    if ((w.x - s.ax) * fx + (w.y - s.ay) * fy < 0) {
      fx = -fx;
      fy = -fy;
    }
    const d = fx * c.nx + fy * c.ny;
    if (d > 0.25) return { x: fx, y: fy };
    if (c.corner) {
      // Stepping onto the raised end of a spring (e.g. a ramp feeding a catapult): at the tip, which side
      // Wick is on is ambiguous, so prefer the upward-facing side.
      const ux = fy <= 0 ? fx : -fx;
      const uy = fy <= 0 ? fy : -fy;
      if (uy < -0.3 && ux * c.nx + uy * c.ny > -0.2) return { x: ux, y: uy };
    }
    return { x: c.nx, y: c.ny };
  }

  private walkable(c: Contact, wasGrounded: boolean, facing: number): boolean {
    const limit = c.seg.mat === 'rush' ? RUSH_GROUND_NY : GROUND_NY;
    if (!c.corner) return c.ny < limit;
    // Corners: climb small steps ahead of us, but let go of edges behind us sooner.
    const ahead = c.nx * facing < 0;
    if (ahead) return c.ny < limit || (wasGrounded && c.ny < STEP_NY);
    return c.ny < (wasGrounded ? Math.min(limit, EDGE_LEAVE_NY) : limit);
  }

  private resolve(w: WickState): void {
    const R = WICK_R;
    for (let iter = 0; iter < 5; iter++) {
      let deepest: Contact | null = null;
      this.forEachSolidNear(w.x, w.y, R + 8, (s) => {
        const t = closestOnSegment(w.x, w.y, s.ax, s.ay, s.bx, s.by, tmp);
        const dx = w.x - tmp.x;
        const dy = w.y - tmp.y;
        const d = Math.hypot(dx, dy);
        const pen = R + s.hw - d;
        if (pen <= 1e-4) return;
        let nx: number;
        let ny: number;
        if (d > 1e-6) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const sx = s.bx - s.ax;
          const sy = s.by - s.ay;
          const l = Math.hypot(sx, sy) || 1;
          nx = -sy / l;
          ny = sx / l;
          if (nx * w.vx + ny * w.vy > 0) {
            nx = -nx;
            ny = -ny;
          }
        }
        if (!deepest || pen > deepest.pen) deepest = { nx, ny, pen, seg: s, corner: t <= 1e-3 || t >= 1 - 1e-3 };
      });
      if (!deepest) break;
      const c: Contact = deepest;
      w.x += c.nx * c.pen;
      w.y += c.ny * c.pen;
    }
  }

  /** All solid contacts within a small slop of Wick's surface (after position resolution). */
  private touching(w: WickState): Contact[] {
    const out: Contact[] = [];
    const R = WICK_R;
    this.forEachSolidNear(w.x, w.y, R + 8, (s) => {
      const t = closestOnSegment(w.x, w.y, s.ax, s.ay, s.bx, s.by, tmp);
      const dx = w.x - tmp.x;
      const dy = w.y - tmp.y;
      const d = Math.hypot(dx, dy);
      const pen = R + s.hw - d;
      if (pen <= -CONTACT_SLOP || d < 1e-6) return;
      out.push({ nx: dx / d, ny: dy / d, pen, seg: s, corner: t <= 1e-3 || t >= 1 - 1e-3 });
    });
    return out;
  }

  private findSnap(w: WickState): { nx: number; ny: number; gap: number; seg: Seg } | null {
    let best: { nx: number; ny: number; gap: number; seg: Seg } | null = null;
    this.forEachSolidNear(w.x, w.y, WICK_R + 8 + GROUND_SNAP, (s) => {
      if (s.mat === 'bounce') return;
      const t = closestOnSegment(w.x, w.y, s.ax, s.ay, s.bx, s.by, tmp);
      const dx = w.x - tmp.x;
      const dy = w.y - tmp.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return;
      const gap = d - WICK_R - s.hw;
      if (gap < -0.5 || gap > GROUND_SNAP) return;
      const c: Contact = { nx: dx / d, ny: dy / d, pen: -gap, seg: s, corner: t <= 1e-3 || t >= 1 - 1e-3 };
      if (!this.walkable(c, true, w.facing)) return;
      if (!best || gap < best.gap) best = { nx: c.nx, ny: c.ny, gap, seg: s };
    });
    return best;
  }

  /**
   * Endless loops (bouncing on a spring forever, shuttling between two walls) never trip the stuck timer.
   * The sim is deterministic, so if the same snapshot of Wick + world recurs at a bounce/turn/landing
   * four times with nothing collected in between, Wick has given up: fail as 'stuck'.
   */
  private loopCheck(kind: string): void {
    if (this.phase !== 'running') return;
    const w = this.wick;
    let key = `${kind}|${Math.round(w.x / 3)}|${Math.round(w.y / 3)}|${Math.round(w.vx / 25)}|${Math.round(w.vy / 25)}|${w.facing}|${this.sparkCount}|${this.inkVersion}`;
    for (const e of this.entities) if (e.loopKey) key += '|' + e.loopKey();
    const n = (this.loopSeen.get(key) ?? 0) + 1;
    this.loopSeen.set(key, n);
    if (n >= 4) this.die('stuck');
  }

  private touchesHazard(x: number, y: number): boolean {
    const kill = WICK_R - HAZARD_GRACE;
    let hit = false;
    this.hazardGrid.query(x, y, kill + 2, (s) => {
      if (!hit && distToSegment2(x, y, s.ax, s.ay, s.bx, s.by) < kill * kill) hit = true;
    });
    if (hit) return true;
    for (const h of this.hazardPolys) {
      if (x < h.minX || x > h.maxX || y < h.minY || y > h.maxY) continue;
      if (pointInPolygon({ x, y }, h.pts)) return true;
    }
    return false;
  }

  private checkPickups(): void {
    const w = this.wick;
    const sp = this.level.sparks;
    for (let i = 0; i < sp.length; i++) {
      if (this.sparks[i]) continue;
      const dx = sp[i].x - w.x;
      const dy = sp[i].y - w.y;
      if (dx * dx + dy * dy <= SPARK_PICK_R * SPARK_PICK_R) {
        this.sparks[i] = true;
        this.sparkCount++;
        this.emit({ type: 'spark', index: i, x: sp[i].x, y: sp[i].y, count: this.sparkCount, total: sp.length });
      }
    }
    const g = this.level.goal;
    const gx = g.x - w.x;
    const gy = g.y - WICK_R - w.y;
    if (gx * gx + gy * gy <= GOAL_R * GOAL_R) {
      this.phase = 'won';
      w.vx = 0;
      w.vy = 0;
      this.emit({ type: 'win', x: g.x, y: g.y });
    }
  }
}

function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(target, v + delta);
  if (v > target) return Math.max(target, v - delta);
  return v;
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

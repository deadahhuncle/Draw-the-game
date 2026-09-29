// Title: the living dusk world renders behind; the logo "Inklight" writes itself in light (every
// glyph contour traced by a travelling spark, then filled), and the game's own pen draws a luminous
// swash beneath it — Wick drops onto that line and paces along it while you decide to begin.
import { H, W, WICK_R } from '../core/constants';
import type { Vec } from '../core/math';
import type { LevelDef } from '../core/types';
import type { Session } from '../game/session';
import type { Insets } from '../render/view';
import { PALETTES } from '../render/palettes';
import { h, s, svg } from './dom';
import { ICONS } from './icons';
import { LOGO_BOUNDS, LOGO_GLYPHS } from './logo-glyphs';
import { onTick } from './ticker';

/** Logo width in world units, and its baseline. */
const LOGO_W = 610;
const BASELINE = 300;
const LS = LOGO_W / LOGO_BOUNDS.w;
const LINE_Y = BASELINE + 24.5 * LS + 40;
const PAD = 4;

/** Horizontal centre of the logo in world units, clear of the world's moon/sun. */
function logoCX(): number {
  const orb = PALETTES.dusk.orb;
  if (orb.y > H * 0.55) return W / 2;
  return orb.x > W / 2 ? Math.min(W / 2, orb.x - orb.r - 30 - LOGO_W / 2) : Math.max(W / 2, orb.x + orb.r + 30 + LOGO_W / 2);
}

interface SceneGeo {
  cx: number;
  x0: number;
  line: Vec[];
  drop: Vec;
}

function geometry(): SceneGeo {
  const cx = logoCX();
  const x0 = cx - LOGO_W / 2;
  const xl = x0 - 70;
  const xr = x0 + LOGO_W + 30;
  // The swash, drawn right → left from under the 't': a curl at each end (steep enough that Wick
  // turns around there) and a long gentle smile between. Built as a Catmull-Rom through hand-placed
  // control points so it reads as one continuous flourish.
  const Y = LINE_Y;
  const ctrl: Vec[] = [
    { x: xr - 22, y: Y - 52 },
    { x: xr - 8, y: Y - 51 },
    { x: xr + 1, y: Y - 40 },
    { x: xr, y: Y - 26 },
    { x: xr - 6, y: Y - 13 },
    { x: xr - 22, y: Y - 3 },
    { x: xr - 60, y: Y + 4 },
    { x: xr - (xr - xl) * 0.32, y: Y + 9 },
    { x: xr - (xr - xl) * 0.64, y: Y + 8 },
    { x: xl + 60, y: Y + 4 },
    { x: xl + 22, y: Y - 2 },
    { x: xl + 6, y: Y - 11 },
    { x: xl, y: Y - 23 },
    { x: xl + 1, y: Y - 35 },
    { x: xl + 9, y: Y - 44 },
    { x: xl + 21, y: Y - 45 },
  ];
  const line: Vec[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(3, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4));
    for (let j = 0; j < n; j++) {
      const u = j / n;
      const u2 = u * u;
      const u3 = u2 * u;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      line.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  line.push(ctrl[ctrl.length - 1]);
  return { cx, x0, line, drop: { x: xl + 52, y: LINE_Y } };
}

/** A scenic, un-winnable "level" that only exists to be the title backdrop. */
export function titleLevel(dropFromY: number): LevelDef {
  const g = geometry();
  const prof: [number, number][] = [
    [-700, 648],
    [-200, 640],
    [120, 652],
    [360, 644],
    [620, 656],
    [860, 646],
    [990, 632],
    [1080, 606],
    [1170, 598],
    [1260, 606],
    [1500, 626],
    [1980, 640],
  ];
  const pts = prof.map(([x, y]) => ({ x, y }));
  pts.push({ x: 1980, y: H + 700 }, { x: -700, y: H + 700 });
  return {
    id: 'title',
    name: 'Inklight',
    start: { x: g.drop.x, y: dropFromY, facing: 1 },
    goal: { x: 1150, y: 600 },
    ink: { budget: 100000, par: 100000, types: ['moon'] },
    terrain: [{ pts }],
    sparks: [],
    solution: [],
    seed: 7,
  };
}

/** Camera for the title: fit the page in landscape; in portrait, zoom so the logo fills the width. */
export function titleCamera(w: number, hh: number): Insets {
  const cx = logoCX();
  const fit = Math.min(w / W, hh / H);
  if (w >= hh * 1.15) return { left: 0, right: 0, top: 0, bottom: 0 };
  const sc = Math.max(fit, Math.min(w / (LOGO_W + 190), (hh * 0.9) / H));
  // Centre on the swash (it reaches further left than the word).
  const ox = w / 2 - (cx - 20) * sc;
  const oy = hh * 0.57 - BASELINE * sc;
  return { left: ox, top: oy, right: w - ox - W * sc, bottom: hh - oy - H * sc };
}

/** World y above the visible screen for a given camera (so Wick can fall in from off-screen). */
export function titleDropY(w: number, hh: number): number {
  const ins = titleCamera(w, hh);
  const aw = Math.max(1, w - ins.left - ins.right);
  const ah = Math.max(1, hh - ins.top - ins.bottom);
  const sc = Math.min(aw / W, ah / H);
  const oy = ins.top + (ah - H * sc) / 2;
  return Math.min(-40, -oy / sc - WICK_R * 3);
}

interface Trace {
  path: SVGPathElement;
  len: number;
  t0: number;
  dur: number;
  glyph: number;
  dot: boolean;
  spark: SVGCircleElement;
}

export interface TitleOptions {
  session: Session;
  /** Skip the writing animation (returning to the title). */
  quick: boolean;
  continueLabel: string | null;
  onBegin(): void;
  onSettings(): void;
}

export class TitleScreen {
  readonly el: HTMLElement;
  private logo: HTMLElement;
  private traceSvg: SVGSVGElement;
  private fillSvg: SVGSVGElement;
  private glowSvg: SVGSVGElement;
  private nib: SVGGElement;
  private traces: Trace[] = [];
  private glyphFills: SVGGElement[] = [];
  private off: (() => void) | null = null;
  private t = 0;
  private t0 = -1;
  private stage: 'writing' | 'underline' | 'ready' = 'writing';
  private penI = 0;
  private penPos: Vec | null = null;
  private geo = geometry();
  private goTimer = 0;
  private endT = 0;
  private dead = false;

  constructor(private opts: TitleOptions) {
    const vb = `${LOGO_BOUNDS.x - PAD} ${LOGO_BOUNDS.y - PAD} ${LOGO_BOUNDS.w + PAD * 2} ${LOGO_BOUNDS.h + PAD * 2}`;
    const mk = (cls: string) => s('svg', { class: cls, viewBox: vb, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
    this.glowSvg = mk('logo-glow');
    this.fillSvg = mk('logo-fill');
    this.traceSvg = mk('logo-trace');
    const defs = s(
      'defs',
      {},
      s('linearGradient', { id: 'lg-light', x1: '0', y1: '-72', x2: '0', y2: '25', gradientUnits: 'userSpaceOnUse' }, s('stop', { offset: '0', 'stop-color': '#FFF1CF' }), s('stop', { offset: '0.55', 'stop-color': '#FFD27A' }), s('stop', { offset: '1', 'stop-color': '#FFAE52' })),
      s('linearGradient', { id: 'lg-ink', x1: '0', y1: '-72', x2: '0', y2: '25', gradientUnits: 'userSpaceOnUse' }, s('stop', { offset: '0', 'stop-color': '#FFFBF2' }), s('stop', { offset: '1', 'stop-color': '#E6E4F4' })),
    );
    this.fillSvg.append(defs);
    const glowG = s('g');
    this.glowSvg.append(glowG);

    LOGO_GLYPHS.forEach((g, gi) => {
      const warm = gi >= 3;
      const fg = s('g', { class: warm ? 'lf-light' : 'lf-ink', fill: warm ? 'url(#lg-light)' : 'url(#lg-ink)', 'fill-rule': 'nonzero' });
      const d = g.contours.join(' ');
      fg.append(s('path', { d }));
      glowG.append(s('path', { d, class: warm ? 'lg-light' : 'lg-ink' }));
      this.fillSvg.append(fg);
      this.glyphFills.push(fg);
      g.contours.forEach((c, ci) => {
        const path = s('path', { d: c, class: warm ? 'lt-light' : 'lt-ink', pathLength: 1 });
        const spark = s('circle', { r: '1.5', class: 'lt-spark' });
        this.traceSvg.append(path);
        const dot = g.ch === 'i' && ci === 1;
        this.traces.push({ path, len: 0, t0: 0, dur: 0, glyph: gi, dot, spark });
      });
    });
    this.nib = s('g', { class: 'logo-nib' }, s('circle', { r: '7', class: 'nib-halo' }), s('circle', { r: '2.2', class: 'nib-core' }));
    for (const tr of this.traces) this.traceSvg.append(tr.spark);
    this.traceSvg.append(this.nib);

    this.logo = h('h1.logo', { 'aria-label': 'Inklight' }, this.glowSvg, this.fillSvg, this.traceSvg);
    const tagline = h('p.tagline', 'draw the way home before dawn');
    const tap = h('p.tap-hint', h('span', opts.continueLabel ? 'tap to continue' : 'tap to begin'), opts.continueLabel ? h('span.tap-sub', opts.continueLabel) : null);
    const gear = h('button.hud-btn.title-gear', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }, svg(ICONS.gear));
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSettings();
    });
    this.el = h('div.title-screen', { role: 'button', tabindex: '0', 'aria-label': 'Inklight — tap to begin' }, h('div.title-vignette'), this.logo, tagline, tap, gear);
    this.el.addEventListener('click', () => this.tap());
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.tap();
      }
    });
  }

  /** Begin animating. Call after the element is in the DOM and laid out. */
  start(): void {
    // Measure contour lengths (logo units) and schedule the tracing.
    let gStart = 0.35;
    let last = 0;
    let dotTrace: Trace | null = null;
    let curGlyph = -1;
    let cStart = 0;
    for (const tr of this.traces) {
      try {
        tr.len = tr.path.getTotalLength();
      } catch {
        tr.len = 200;
      }
      if (tr.dot) {
        dotTrace = tr;
        continue;
      }
      if (tr.glyph !== curGlyph) {
        if (curGlyph >= 0) gStart += 0.19;
        curGlyph = tr.glyph;
        cStart = gStart;
      } else cStart += 0.14;
      tr.t0 = cStart;
      tr.dur = 0.42 + tr.len * 0.0026;
      last = Math.max(last, tr.t0 + tr.dur);
    }
    if (dotTrace) {
      dotTrace.t0 = last - 0.1;
      dotTrace.dur = 0.32;
      last = dotTrace.t0 + dotTrace.dur;
    }
    this.endT = last;
    this.el.classList.add('live');
    if (this.opts.quick) this.finishWriting(true);
    this.off = onTick((dt, now) => this.tick(dt, now));
  }

  destroy(): void {
    this.dead = true;
    this.off?.();
    clearTimeout(this.goTimer);
    const r = this.opts.session.renderer;
    r.pen = null;
  }

  /** Screen position of Wick (CSS px) — the transition anchor. */
  wickScreen(): Vec {
    const sim = this.opts.session.sim;
    return this.opts.session.renderer.view.toScreen(sim.wick.x, sim.wick.y - 4);
  }

  /** Re-place the logo over the world (on resize). */
  layout(): void {
    const v = this.opts.session.renderer.view;
    const x = this.geo.x0 - PAD * LS;
    const y = BASELINE + (LOGO_BOUNDS.y - PAD) * LS;
    const p = v.toScreen(x, y);
    const wpx = (LOGO_BOUNDS.w + PAD * 2) * LS * v.scale;
    const hpx = (LOGO_BOUNDS.h + PAD * 2) * LS * v.scale;
    const st = this.el.style;
    st.setProperty('--logo-x', `${p.x}px`);
    st.setProperty('--logo-y', `${p.y}px`);
    st.setProperty('--logo-w', `${wpx}px`);
    st.setProperty('--logo-h', `${hpx}px`);
    st.setProperty('--px', `${v.scale * LS}`);
    const tag = v.toScreen(this.geo.cx, LINE_Y + 34);
    st.setProperty('--tag-x', `${tag.x}px`);
    st.setProperty('--tag-y', `${tag.y}px`);
    const tapY = v.toScreen(this.geo.cx, 560).y;
    st.setProperty('--tap-y', `${Math.min(window.innerHeight - 64, Math.max(tag.y + 46, tapY))}px`);
  }

  private tap(): void {
    if (this.dead) return;
    if (this.stage !== 'ready') {
      this.finishWriting(false);
      return;
    }
    this.opts.onBegin();
  }

  /** Jump to the end of the writing (tap to skip, or quick mode). */
  private finishWriting(instant: boolean): void {
    if (this.stage === 'ready') return;
    this.t = Math.max(this.t, this.endT + 1);
    for (const tr of this.traces) {
      tr.path.style.strokeDashoffset = '0';
      tr.spark.style.opacity = '0';
    }
    this.glyphFills.forEach((g) => (g.style.opacity = '1'));
    this.el.classList.add('written');
    if (instant) this.el.classList.add('instant');
    this.nib.style.opacity = '0';
    // Draw the underline at once and let Wick hop onto it.
    const sim = this.opts.session.sim;
    const r = this.opts.session.renderer;
    if (this.stage === 'underline' && sim.penActive) sim.penUp();
    if (sim.strokes.length === 0 || this.stage === 'underline') {
      sim.clearInk();
      sim.drawStroke('moon', this.geo.line);
    }
    r.pen = null;
    this.stage = 'ready';
    this.el.classList.add('ready');
    clearTimeout(this.goTimer);
    this.goTimer = window.setTimeout(() => this.opts.session.go(), instant ? 60 : 200);
  }

  /** Keep Wick pacing forever (restart if something ever knocks it off). */
  onPhase(p: string): void {
    if (p === 'plan' && this.stage === 'ready' && !this.dead) {
      clearTimeout(this.goTimer);
      this.goTimer = window.setTimeout(() => this.opts.session.go(), 500);
    }
  }

  private tick(dt: number, now: number): void {
    if (this.dead) return;
    // Wall-clock time, so a slow device still finishes the writing on schedule.
    if (this.t0 < 0) this.t0 = now - this.t * 1000;
    this.t = Math.max(this.t, (now - this.t0) / 1000);
    const t = this.t;
    if (this.stage === 'writing') {
      let lead: { x: number; y: number } | null = null;
      let leadT0 = -1;
      for (const tr of this.traces) {
        const k = Math.max(0, Math.min(1, (t - tr.t0) / Math.max(0.01, tr.dur)));
        const e = k < 1 ? 1 - (1 - k) * (1 - k) * (1 - k * 0.35) : 1;
        tr.path.style.strokeDashoffset = String(1 - e);
        if (k > 0 && k < 1) {
          const p = tr.path.getPointAtLength(e * tr.len);
          tr.spark.setAttribute('cx', p.x.toFixed(2));
          tr.spark.setAttribute('cy', p.y.toFixed(2));
          tr.spark.style.opacity = '1';
          if (tr.t0 > leadT0) {
            leadT0 = tr.t0;
            lead = p;
          }
        } else tr.spark.style.opacity = '0';
      }
      // Glyph fills bloom in as each glyph's outline closes.
      const byGlyph = new Map<number, number>();
      for (const tr of this.traces) {
        if (tr.dot) continue;
        byGlyph.set(tr.glyph, Math.max(byGlyph.get(tr.glyph) ?? 0, tr.t0 + tr.dur));
      }
      this.glyphFills.forEach((g, gi) => {
        const end = byGlyph.get(gi) ?? 0;
        const k = Math.max(0, Math.min(1, (t - end + 0.35) / 0.7));
        g.style.opacity = (k * k * (3 - 2 * k)).toFixed(3);
      });
      if (lead) {
        this.nib.setAttribute('transform', `translate(${lead.x.toFixed(2)} ${lead.y.toFixed(2)})`);
        this.nib.style.opacity = '1';
      }
      if (t >= this.endT + 0.05) {
        this.el.classList.add('written');
        this.startUnderline();
      }
    } else if (this.stage === 'underline') {
      this.drawUnderline(dt);
    } else if (this.stage === 'ready') {
      // Nothing left to animate here (Wick lives in the session).
      this.off?.();
      this.off = null;
    }
  }

  private startUnderline(): void {
    this.stage = 'underline';
    this.penI = 0;
    // Hand the nib from the logo to the world's own pen: fly it to the start of the swash.
    const v = this.opts.session.renderer.view;
    const p0 = this.geo.line[0];
    const sp = v.toScreen(p0.x, p0.y);
    const box = this.traceSvg.getBoundingClientRect();
    const vb = this.traceSvg.viewBox.baseVal;
    const lx = vb.x + ((sp.x - box.left) / box.width) * vb.width;
    const ly = vb.y + ((sp.y - box.top) / box.height) * vb.height;
    this.nib.style.transition = 'transform 0.28s cubic-bezier(.5,0,.3,1), opacity 0.2s 0.26s';
    this.nib.setAttribute('transform', `translate(${lx.toFixed(2)} ${ly.toFixed(2)})`);
    this.nib.style.transform = '';
    this.nib.style.opacity = '0';
    this.penPos = null;
    window.setTimeout(() => {
      if (this.dead || this.stage !== 'underline') return;
      const sim = this.opts.session.sim;
      this.penPos = { ...p0 };
      sim.penDown('moon', p0);
    }, 260);
  }

  private drawUnderline(dt: number): void {
    const pos = this.penPos;
    if (!pos) return;
    const sim = this.opts.session.sim;
    const r = this.opts.session.renderer;
    const line = this.geo.line;
    let budget = 900 * dt;
    while (budget > 0 && this.penI < line.length - 1) {
      const nx = line[this.penI + 1];
      const d = Math.hypot(nx.x - pos.x, nx.y - pos.y);
      if (d <= budget) {
        pos.x = nx.x;
        pos.y = nx.y;
        budget -= d;
        this.penI++;
        // Feed every vertex so tight curls stay round (the sim joins pen samples with straight lines).
        sim.penMove({ x: pos.x, y: pos.y });
      } else {
        pos.x += ((nx.x - pos.x) / d) * budget;
        pos.y += ((nx.y - pos.y) / d) * budget;
        budget = 0;
      }
    }
    sim.penMove(pos);
    r.pen = { x: pos.x, y: pos.y, ink: 'moon', down: true, blocked: false };
    if (this.penI >= line.length - 1) {
      sim.penUp(pos);
      r.pen = null;
      this.stage = 'ready';
      this.el.classList.add('ready');
      this.goTimer = window.setTimeout(() => this.opts.session.go(), 180);
    }
  }
}

/** First-launch intro: three handwritten lines. Resolves when finished or skipped. */
export function playIntro(host: HTMLElement): Promise<void> {
  const lines = ['This is Wick. Wick must be home before dawn.', 'Wick can’t jump, and never stops walking…', '…but you hold a pen full of light.'];
  return new Promise((resolve) => {
    let i = 0;
    let done = false;
    let timer = 0;
    const els = lines.map((t) => h('p.intro-line', { style: { '--chars': String(t.length) } as Record<string, string> }, t));
    const skip = h('button.pill.intro-skip', { type: 'button' }, 'skip');
    const cont = h('p.intro-cont', 'tap to continue');
    const el = h('div.intro', { role: 'dialog', 'aria-label': 'Introduction' }, h('div.intro-lines', ...els), cont, skip);
    host.append(el);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
      resolve();
    };
    const next = () => {
      if (done) return;
      if (i >= els.length) {
        finish();
        return;
      }
      const e = els[i++];
      e.classList.add('write');
      clearTimeout(timer);
      const ms = 700 + (lines[i - 1].length || 20) * 38;
      timer = window.setTimeout(() => {
        if (i >= els.length) {
          cont.classList.add('show');
          timer = window.setTimeout(finish, 2600);
        } else next();
      }, ms + 350);
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === skip) {
        finish();
        return;
      }
      // Tap: finish the line being written instantly, or move on.
      const cur = els[i - 1];
      if (cur && !cur.classList.contains('done')) {
        els.slice(0, i).forEach((x) => x.classList.add('done'));
        clearTimeout(timer);
        if (i >= els.length) {
          cont.classList.add('show');
          timer = window.setTimeout(finish, 2600);
        } else timer = window.setTimeout(next, 500);
      } else next();
    });
    for (const e of els) e.addEventListener('animationend', () => e.classList.add('done'));
    requestAnimationFrame(() => {
      el.classList.add('show');
      timer = window.setTimeout(next, 450);
    });
  });
}

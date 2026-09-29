// The journey map: one continuous hand-inked panorama of the whole night, dusk (left) to dawn
// (right). A ridge of ground carries a single footpath; every level is a lamp on it. Wick waits at
// the frontier lamp; the path Wick has walked glows with moon-ink. Locked worlds sleep under mist.
import type { LevelDef, WorldDef, WorldKey } from '../core/types';
import { audio } from '../audio/audio';
import { progress } from '../game/progress';
import { PALETTES, type Palette } from '../render/palettes';
import { WORLDS, worldOf } from '../levels';
import { ROMAN, levelTime, worldHour } from './clock';
import { f1, h, prng, s, svg } from './dom';
import { ICONS, SPARK_PATH } from './icons';
import { Scroller } from './scroller';
import { onTick } from './ticker';
import { WickSprite } from './wick-sprite';

type Pt = { x: number; y: number };
type RGB = [number, number, number];

// ───────────────────────────── colour helpers ─────────────────────────────

function parseColor(c: string): RGB {
  if (c.startsWith('#')) {
    const n = c.length === 4 ? c.slice(1).replace(/./g, (m) => m + m) : c.slice(1, 7);
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0], p[1], p[2]];
  }
  return [0, 0, 0];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The sky after the last lamp: the sun is coming. */
const DAWN_SKY = ['#3B2B5C', '#80507A', '#E4907C', '#FFC790', '#FFE7B8'];

interface Region {
  world: WorldDef;
  pal: Palette;
  x0: number;
  x1: number;
  cx: number;
  /** First lamp x. */
  lx: number;
  unlocked: boolean;
}

interface Lamp {
  level: LevelDef;
  world: WorldDef;
  x: number;
  y: number;
  n: number;
  state: 'lit' | 'open' | 'locked';
  stars: boolean[];
  el?: SVGGElement;
  btn?: HTMLButtonElement;
}

export interface JourneyOptions {
  onPlay(level: LevelDef, from: Pt): void;
  onBack(): void;
  onSettings(): void;
  /** Animate Wick walking from this level's lamp to the frontier. */
  arriveFrom?: string | null;
}

export class Journey {
  readonly el: HTMLElement;
  private sky: HTMLCanvasElement;
  private skyCtx: CanvasRenderingContext2D | null;
  private skyImg: ImageData | null = null;
  private orb: HTMLElement;
  private orbs: { x: number; y: number; r: number; color: RGB; glow: RGB; ga: number }[] = [];
  private layers: { el: HTMLElement; f: number }[] = [];
  private near: HTMLElement;
  private scroller: Scroller;
  private regions: Region[] = [];
  private lamps: Lamp[] = [];
  private ridge: Pt[] = [];
  private ridgeLen: number[] = [];
  private total = 0;
  private vw = 0;
  private vh = 0;
  private k = 1;
  private wick: WickSprite;
  private litPath: SVGPathElement | null = null;
  private litLen = 0;
  private tag: HTMLElement;
  private thumb: HTMLElement;
  private ticks: HTMLElement[] = [];
  private titles: { el: HTMLElement; x0: number; x1: number; w: number }[] = [];
  private timeline: HTMLElement;
  private frontier: LevelDef;
  private wickAt = 0;
  private off: (() => void) | null = null;
  private skyDirty = true;
  private opening = false;
  private walking = false;
  private arrived = false;
  private dead = false;

  constructor(private opts: JourneyOptions) {
    this.frontier = progress.frontier();
    this.sky = h('canvas.jr-sky', { width: '48', height: '64', 'aria-hidden': 'true' });
    this.skyCtx = this.sky.getContext('2d');
    this.near = h('div.jr-layer.jr-near');
    this.orb = h('div.jr-orb', { 'aria-hidden': 'true' }, h('i.jr-orb-halo'), h('i.jr-orb-disc'));
    const back = h('button.hud-btn', { type: 'button', 'aria-label': 'Back to title', title: 'Title' }, svg(ICONS.home));
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.ui('back');
      opts.onBack();
    });
    const gear = h('button.hud-btn', { type: 'button', 'aria-label': 'Settings', title: 'Settings' }, svg(ICONS.gear));
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.ui('open');
      opts.onSettings();
    });
    const total = progress.totalStars();
    const head = h(
      'header.jr-head',
      back,
      h('div.jr-head-mid', h('span.jr-kicker', progress.allDone() ? 'the journey · dawn' : `the journey · ${levelTime(this.frontier, worldOf(this.frontier))}`), h('span.jr-heading', 'One long night')),
      h('div.jr-head-right', h('span.jr-total', { 'aria-label': `${total} stars` }, svg(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`), h('b', String(total)), h('i', `/ ${progress.maxStars()}`)), gear),
    );
    this.thumb = h('i.jr-thumb');
    this.timeline = h('nav.jr-timeline', { 'aria-label': 'Worlds' }, h('span.jr-tl-end', 'dusk'), h('div.jr-tl-track', h('i.jr-tl-line'), h('i.jr-tl-lit'), this.thumb), h('span.jr-tl-end', 'dawn'));
    this.tag = h('div.jr-tag', { 'aria-hidden': 'true' });
    this.wick = new WickSprite(0.5);
    this.el = h('div.journey', { role: 'region', 'aria-label': 'Journey map' }, this.sky, this.near, h('div.jr-vignette'), head, this.timeline);
    this.scroller = new Scroller(this.el);
    this.scroller.onScroll = (x) => this.onScroll(x);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  /** Build (or rebuild on resize) the panorama for the current viewport. */
  build(): void {
    const center = this.total ? (this.scroller.x + this.vw / 2) / this.total : -1;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.k = Math.max(0.9, Math.min(1.45, this.vh / 390));
    this.computeLayout();
    for (const l of this.layers) l.el.remove();
    this.layers = [];
    this.near.replaceChildren();
    this.titles = [];
    this.buildLayers();
    this.buildNear();
    this.buildTimeline();
    for (const tt of this.titles) tt.w = tt.el.offsetWidth;
    this.scroller.setMax(this.total - this.vw);
    this.skyImg = null;
    if (center >= 0) this.scroller.scrollTo(center * this.total - this.vw / 2);
    else {
      const a = this.arrival();
      const fx = a ? this.lamps[a.start].x : this.wickHomeX();
      this.scroller.scrollTo(fx - this.vw * 0.42);
    }
    this.skyDirty = true;
    if (!this.off) this.off = onTick(() => this.frame());
  }

  destroy(): void {
    this.dead = true;
    this.off?.();
    this.off = null;
    this.wick.stop();
    this.scroller.destroy();
  }

  /** Wick's feet on screen (transition anchor). */
  wickScreen(): Pt {
    return { x: this.wick.x - this.scroller.x, y: this.wick.y - 10 * this.k };
  }

  /** After the entrance transition: play the arrival walk if new lamps were lit since last time. */
  async arrive(): Promise<void> {
    const arr = this.arrival();
    if (!arr || this.walking || this.arrived) return;
    this.arrived = true;
    progress.setMapWick(this.frontier.id);
    const allDone = progress.allDone();
    const to = allDone ? null : this.lamps[arr.to] ?? null;
    const endX = allDone ? this.total - 300 * this.k : to ? to.x - 17 * this.k : null;
    const ignite = (l: Lamp) => {
      if (!l.el?.classList.contains('pending')) return;
      l.el.classList.remove('pending');
      l.el.classList.add('ignite');
      audio.ui('unlock');
    };
    const start = this.lamps[arr.start];
    const toIdx = arr.to;
    const fromIdx = arr.start;
    // The lamp just lit flares up; then Wick walks on, lighting the path (and any lamps passed).
    ignite(start);
    await new Promise((r) => setTimeout(r, 700));
    if (this.dead || endX === null) return;
    this.walking = true;
    const pts = this.ridgeBetween(start.x - 17 * this.k, endX);
    const dist = Math.max(1, endX - (start.x - 17 * this.k));
    const speed = Math.max(64 * this.k, dist / 4.5);
    const follow = (x: number) => {
      if (this.scroller.busy) return;
      const want = x - this.vw * 0.45;
      if (want - this.scroller.x > 1) this.scroller.scrollTo(this.scroller.x + (want - this.scroller.x) * 0.06);
    };
    await this.wick.walkAlong(pts, speed, (x) => {
      this.setLitTo(x);
      follow(x);
      for (let i = fromIdx + 1; i < toIdx; i++) if (x >= this.lamps[i].x - 17 * this.k - 1) ignite(this.lamps[i]);
    });
    this.walking = false;
    if (this.dead) return;
    this.wickAt = endX;
    this.wick.look = to && !allDone ? { x: to.x + 9 * this.k, y: to.y - 30 * this.k } : null;
    this.placeTag();
    progress.setMapWick(this.frontier.id);
  }

  // ───────────────────────────── layout model ─────────────────────────────

  private wickHomeX(): number {
    if (progress.allDone()) return this.total - 300 * this.k;
    const fl = this.lamps.find((l) => l.level === this.frontier);
    return fl ? fl.x - 17 * this.k : 120 * this.k;
  }

  private computeLayout(): void {
    const k = this.k;
    const LEAD = 250 * k;
    const TITLE = 190 * k;
    const STEP = 104 * k;
    const TAIL = 70 * k;
    const END = 560 * k;
    const vh = this.vh;
    const rnd = prng(20251);
    this.regions = [];
    this.lamps = [];
    let x = LEAD;
    for (const w of WORLDS) {
      const n = w.levels.length;
      const x0 = x;
      const lx = x0 + TITLE;
      const x1 = lx + (n - 1) * STEP + TAIL;
      this.regions.push({ world: w, pal: PALETTES[w.key], x0, x1, cx: (x0 + x1) / 2, lx, unlocked: progress.worldUnlocked(w.index) });
      w.levels.forEach((l, i) => {
        const rec = progress.get(l.id);
        const open = progress.isUnlocked(l);
        this.lamps.push({ level: l, world: w, x: lx + i * STEP, y: 0, n: i + 1, state: rec.done ? 'lit' : open ? 'open' : 'locked', stars: rec.stars.slice() });
      });
      x = x1;
    }
    this.total = x + END;

    // The ridge: control points through every lamp, with hills and hollows between.
    const base = vh * (this.vw / vh < 1.6 ? 0.71 : 0.675);
    const A = vh * 0.065;
    const wave = (xx: number) => base + A * (0.62 * Math.sin(xx / (260 * k) + 0.7) + 0.38 * Math.sin(xx / (97 * k) + 2.1));
    const ctrl: Pt[] = [
      { x: -80 * k, y: base + A * 0.4 },
      { x: 70 * k, y: base + A * 0.2 },
    ];
    let prevX = 70 * k;
    const addBetween = (x2: number) => {
      const gap = x2 - prevX;
      const m = Math.max(1, Math.round(gap / (70 * k)));
      for (let j = 1; j < m; j++) {
        const xx = prevX + (gap * j) / m;
        ctrl.push({ x: xx, y: wave(xx) + (rnd() - 0.5) * A * 1.1 });
      }
    };
    for (const l of this.lamps) {
      addBetween(l.x - 16 * k);
      l.y = wave(l.x);
      ctrl.push({ x: l.x - 16 * k, y: l.y + 0.5 }, { x: l.x + 14 * k, y: l.y - 0.5 });
      prevX = l.x + 14 * k;
    }
    // Dawn: the land rises to a last hill where the sun comes up.
    const hillX = this.total - 300 * k;
    addBetween(hillX - 140 * k);
    ctrl.push({ x: hillX - 60 * k, y: base - A * 0.2 }, { x: hillX, y: base - A * 0.9 }, { x: hillX + 90 * k, y: base - A * 0.7 }, { x: this.total + 80 * k, y: base + A * 0.2 });
    this.ridge = catmull(ctrl, 5 * k);
    this.ridgeLen = [0];
    for (let i = 1; i < this.ridge.length; i++) this.ridgeLen.push(this.ridgeLen[i - 1] + Math.hypot(this.ridge[i].x - this.ridge[i - 1].x, this.ridge[i].y - this.ridge[i - 1].y));
    for (const l of this.lamps) l.y = this.ridgeY(l.x);
  }

  private ridgeIndex(x: number): number {
    const r = this.ridge;
    let lo = 0;
    let hi = r.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (r[m].x <= x) lo = m;
      else hi = m;
    }
    return lo;
  }

  private ridgeY(x: number): number {
    const r = this.ridge;
    const i = this.ridgeIndex(x);
    const a = r[i];
    const b = r[Math.min(r.length - 1, i + 1)];
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * t;
  }

  private lenAt(x: number): number {
    const i = this.ridgeIndex(x);
    const a = this.ridge[i];
    return this.ridgeLen[i] + Math.hypot(x - a.x, this.ridgeY(x) - a.y);
  }

  private ridgeBetween(x0: number, x1: number): Pt[] {
    const out: Pt[] = [{ x: x0, y: this.ridgeY(x0) }];
    for (const p of this.ridge) if (p.x > x0 && p.x < x1) out.push(p);
    out.push({ x: x1, y: this.ridgeY(x1) });
    return out;
  }

  /** Palette blend weights at a near-layer x: region index a, b and mix t (b = -1 → dawn). */
  private blendAt(x: number): { a: number; b: number; t: number } {
    const R = this.regions;
    if (!R.length) return { a: 0, b: 0, t: 0 };
    if (x <= R[0].cx) return { a: 0, b: 0, t: 0 };
    for (let i = 0; i < R.length - 1; i++) {
      if (x <= R[i + 1].cx) return { a: i, b: i + 1, t: smooth((x - R[i].cx) / (R[i + 1].cx - R[i].cx)) };
    }
    const last = R.length - 1;
    const dawnX = this.total - 260 * this.k;
    return { a: last, b: -1, t: smooth((x - R[last].cx) / Math.max(1, dawnX - R[last].cx)) * (progress.allDone() ? 1 : 0.55) };
  }

  // ───────────────────────────── art ─────────────────────────────

  /** Near-layer x → layer coordinate for parallax factor f. */
  private fx(x: number, f: number): number {
    return this.vw / 2 + (x - this.vw / 2) * f;
  }

  private gradientStops(get: (p: Palette) => string, f: number, width: number, dawn?: string): SVGStopElement[] {
    const out: SVGStopElement[] = [];
    for (const r of this.regions) out.push(s('stop', { offset: (this.fx(r.cx, f) / width).toFixed(4), 'stop-color': get(r.pal) }));
    if (dawn) out.push(s('stop', { offset: (this.fx(this.total - 200 * this.k, f) / width).toFixed(4), 'stop-color': dawn }));
    return out;
  }

  private layerSvg(f: number, cls: string, front = false): { el: HTMLElement; svg: SVGSVGElement; width: number } {
    const width = Math.ceil(this.vw + (this.total - this.vw) * f);
    const root = s('svg', { width, height: this.vh, viewBox: `0 0 ${width} ${this.vh}`, 'aria-hidden': 'true' });
    const el = h('div.jr-layer', { class: cls, style: { width: `${width}px` } }, root);
    this.el.insertBefore(el, front ? this.near.nextSibling : this.near);
    this.layers.push({ el, f });
    return { el, svg: root, width };
  }

  private buildLayers(): void {
    const k = this.k;
    const vh = this.vh;

    // ── Stars (very far). Three separate SVGs so twinkling is a composited opacity change on
    // whole layers, never a repaint of the panorama. ──
    const st = this.layerSvg(0.08, 'jr-stars');
    const sets = [st.svg, st.svg.cloneNode(false) as SVGSVGElement, st.svg.cloneNode(false) as SVGSVGElement];
    sets.forEach((sv, i) => sv.setAttribute('class', `tw tw${i}`));
    st.el.append(sets[1], sets[2]);
    const rs = prng(9);
    for (const r of this.regions) {
      const count = Math.round((r.x1 - r.x0) * 0.1 * r.pal.stars + 4);
      for (let i = 0; i < count; i++) {
        const x = this.fx(r.x0 + rs() * (r.x1 - r.x0), 0.08);
        const y = rs() * vh * 0.5;
        sets[i % 3].append(s('circle', { cx: f1(x), cy: f1(y), r: f1((0.5 + rs() * 1.1) * Math.min(1.2, k)) }));
      }
    }

    // One orb for the whole night, infinitely far away: it changes as you travel — the setting
    // sun, the moons of each world, then the sun coming up at the end.
    this.el.insertBefore(this.orb, this.near);
    const orbOf = (p: Palette) => {
      const g = /rgba?\(([^)]+)\)/.exec(p.orb.glow);
      const ga = g ? parseFloat(g[1].split(',')[3] ?? '0.3') : 0.3;
      return { x: 0.74, y: Math.min(0.5, Math.max(0.16, (p.orb.y / 720) * 0.72)), r: Math.max(12, p.orb.r * (vh / 720) * 0.8), color: parseColor(p.orb.color), glow: parseColor(p.orb.glow), ga };
    };
    this.orbs = this.regions.map((r) => orbOf(r.pal));
    const done = progress.allDone();
    this.orbs.push({ x: 0.7, y: done ? 0.34 : 0.54, r: 40 * k, color: parseColor('#FFE6B4'), glow: parseColor('#FFB070'), ga: done ? 0.55 : 0.4 });

    // ── Far: a soft distant ridge whose character changes world to world ──
    const far = this.layerSvg(0.3, 'jr-far');
    far.svg.append(
      s('defs', {}, s('linearGradient', { id: 'jf-fill', gradientUnits: 'userSpaceOnUse', x1: 0, x2: far.width, y1: 0, y2: 0 }, ...this.gradientStops((p) => p.hills[0], 0.3, far.width, '#B06A82'))),
      s('path', { d: this.silhouette(0.3, far.width, vh * 0.54, vh * 0.09, 1), fill: 'url(#jf-fill)', opacity: '0.9' }),
    );

    // ── Mid: nearer hills + world props (mushrooms, reeds & water, crystals, trunks, spires) ──
    const mid = this.layerSvg(0.62, 'jr-mid');
    const mdefs = s('defs', {}, s('linearGradient', { id: 'jm-fill', gradientUnits: 'userSpaceOnUse', x1: 0, x2: mid.width, y1: 0, y2: 0 }, ...this.gradientStops((p) => p.hills[1], 0.62, mid.width, '#7A4260')));
    mid.svg.append(mdefs);
    const props = s('g', { fill: 'url(#jm-fill)' });
    const glows = s('g', { class: 'jr-glows' });
    for (const r of this.regions) this.worldProps(r, mid.width, props, glows);
    mid.svg.append(props, s('path', { d: this.silhouette(0.62, mid.width, vh * 0.66, vh * 0.07, 2), fill: 'url(#jm-fill)' }), glows);

    // ── Foreground: dark grasses sliding past faster than the path (depth) ──
    const fg = this.layerSvg(1.35, 'jr-fore', true);
    const rf = prng(31);
    const top = (x: number) => vh - 40 - 7 * k * (Math.sin(x / (70 * k)) + 0.6 * Math.sin(x / (23 * k) + 1));
    let d = `M-10 ${vh + 10}`;
    for (let x = -10; x <= fg.width + 10; x += 7) d += `L${x} ${f1(top(x))}`;
    d += `L${fg.width + 10} ${vh + 10}Z`;
    const blades = s('g', { class: 'fore-blades' });
    for (let x = 0; x < fg.width; x += (5 + rf() * 22) * k) {
      const base = top(x) + 2;
      const bh = (6 + rf() * (rf() < 0.1 ? 34 : 14)) * k;
      const lean = (rf() - 0.5) * 14 * k;
      blades.append(s('path', { d: `M${f1(x - 1.6 * k)} ${f1(base)}Q${f1(x + lean * 0.3)} ${f1(base - bh * 0.6)} ${f1(x + lean)} ${f1(base - bh)}Q${f1(x + lean * 0.2 + 1 * k)} ${f1(base - bh * 0.5)} ${f1(x + 1.6 * k)} ${f1(base)}Z` }));
    }
    fg.svg.append(s('path', { d, class: 'fore-mass' }), blades);
  }

  /** A ridgeline whose shape blends between per-world characters. */
  private silhouette(f: number, width: number, base: number, amp: number, seed: number): string {
    const k = this.k;
    const step = 6;
    let d = `M-10 ${this.vh + 10}`;
    for (let x = -10; x <= width + 10; x += step) {
      const nx = this.vw / 2 + (x - this.vw / 2) / f;
      const { a, b, t } = this.blendAt(nx);
      const ya = this.shape(this.keyOf(a), x / k, seed);
      const yb = b < 0 ? this.shape('dawn', x / k, seed) : this.shape(this.keyOf(b), x / k, seed);
      const y = base - amp * (ya + (yb - ya) * t);
      d += `L${x} ${f1(y)}`;
    }
    return d + `L${width + 10} ${this.vh + 10}Z`;
  }

  private keyOf(i: number): WorldKey | 'dawn' {
    return this.regions[i]?.world.key ?? 'dusk';
  }

  private shape(key: WorldKey | 'dawn', x: number, seed: number): number {
    const p = seed * 1.7;
    switch (key) {
      case 'dusk':
        return 0.55 + 0.35 * Math.sin(x / 150 + p) + 0.2 * Math.sin(x / 61 + p * 2);
      case 'hollow': {
        const b = Math.abs(Math.sin(x / 46 + p));
        return 0.35 + 0.6 * Math.pow(b, 0.5) * (0.6 + 0.4 * Math.sin(x / 131 + p));
      }
      case 'starwater':
        return 0.18 + 0.12 * Math.sin(x / 210 + p) + 0.05 * Math.sin(x / 33 + p);
      case 'storm': {
        const tri = (u: number) => 1 - 2 * Math.abs(((u % 1) + 1) % 1 - 0.5);
        return 0.3 + 0.75 * tri(x / 88 + p) * (0.55 + 0.45 * Math.sin(x / 57 + p * 3));
      }
      case 'mothwood': {
        const c = Math.abs(Math.sin(x / 18 + p)) * 0.25 + Math.abs(Math.sin(x / 41 + p * 2)) * 0.35;
        return 0.9 + c;
      }
      case 'daybreak': {
        const u = ((x / 74 + p) % 1 + 1) % 1;
        const spire = Math.max(0, 1 - Math.abs(u - 0.5) * 9);
        return 0.35 + 0.25 * Math.sin(x / 140 + p) + 1.1 * spire * (0.5 + 0.5 * Math.sin(x / 190 + p));
      }
      default:
        return 0.25 + 0.2 * Math.sin(x / 180 + p);
    }
  }

  private worldProps(r: Region, width: number, g: SVGGElement, glows: SVGGElement): void {
    const k = this.k;
    const vh = this.vh;
    const rnd = prng(r.world.index * 101);
    const X = (x: number) => this.fx(x, 0.62);
    const accent = r.pal.accent;
    const span = r.x1 - r.x0;
    const count = Math.round(span / (150 * k));
    void width;
    for (let i = 0; i < count; i++) {
      const x = X(r.x0 + (i + 0.3 + rnd() * 0.4) * (span / count));
      const gy = vh * 0.66 - vh * 0.03;
      switch (r.world.key) {
        case 'dusk': {
          // Round trees on thin trunks.
          const th = (26 + rnd() * 30) * k;
          const cr = (10 + rnd() * 9) * k;
          g.append(s('path', { d: `M${f1(x - 1.2 * k)} ${f1(gy)}L${f1(x - 0.6 * k)} ${f1(gy - th)}L${f1(x + 0.6 * k)} ${f1(gy - th)}L${f1(x + 1.2 * k)} ${f1(gy)}Z` }), s('circle', { cx: f1(x), cy: f1(gy - th - cr * 0.6), r: f1(cr) }));
          break;
        }
        case 'hollow': {
          // Giant mushrooms with glowing spots.
          const th = (30 + rnd() * 46) * k;
          const cw = (18 + rnd() * 20) * k;
          const top = gy - th;
          g.append(
            s('path', { d: `M${f1(x - 3 * k)} ${f1(gy)}Q${f1(x - 1 * k)} ${f1(top + th * 0.4)} ${f1(x - 2 * k)} ${f1(top)}L${f1(x + 2 * k)} ${f1(top)}Q${f1(x + 2 * k)} ${f1(top + th * 0.4)} ${f1(x + 4 * k)} ${f1(gy)}Z` }),
            s('path', { d: `M${f1(x - cw)} ${f1(top + 2 * k)}Q${f1(x - cw * 0.9)} ${f1(top - cw * 0.75)} ${f1(x)} ${f1(top - cw * 0.8)}Q${f1(x + cw * 0.9)} ${f1(top - cw * 0.75)} ${f1(x + cw)} ${f1(top + 2 * k)}Z` }),
          );
          for (let j = 0; j < 3; j++) glows.append(s('circle', { cx: f1(x + (rnd() - 0.5) * cw * 1.2), cy: f1(top - rnd() * cw * 0.5), r: f1((1 + rnd() * 1.4) * k), fill: accent, class: 'glow-dot' }));
          break;
        }
        case 'starwater': {
          // Reeds, and the river's moonlit ripples between the far hills and the near bank.
          for (let j = 0; j < 4; j++) {
            const rx = x + (j - 1.5) * 4 * k;
            const rh = (16 + rnd() * 22) * k;
            g.append(s('path', { d: `M${f1(rx)} ${f1(gy + 6 * k)}Q${f1(rx + 2 * k)} ${f1(gy - rh * 0.5)} ${f1(rx + (rnd() - 0.3) * 8 * k)} ${f1(gy - rh)}`, fill: 'none', stroke: 'url(#jm-fill)', 'stroke-width': f1(1.4 * k) }));
          }
          const wy = vh * 0.575;
          for (let j = 0; j < 5; j++) {
            const wx = x + (rnd() - 0.5) * 120 * k;
            const ww = (10 + rnd() * 34) * k;
            glows.append(s('path', { d: `M${f1(wx)} ${f1(wy + j * 5.5 * k)}h${f1(ww)}`, stroke: '#D8E6FF', 'stroke-width': f1(1.1 * k), 'stroke-linecap': 'round', opacity: (0.18 + rnd() * 0.3).toFixed(2) }));
          }
          break;
        }
        case 'storm': {
          // Glass shards below; heavy cloud banks and slanting rain above.
          const sh = (22 + rnd() * 40) * k;
          const sw = (6 + rnd() * 8) * k;
          const lean = (rnd() - 0.5) * 10 * k;
          g.append(s('path', { d: `M${f1(x - sw)} ${f1(gy)}L${f1(x + lean)} ${f1(gy - sh)}L${f1(x + sw)} ${f1(gy)}Z` }));
          glows.append(s('path', { d: `M${f1(x + lean)} ${f1(gy - sh)}L${f1(x + sw * 0.6)} ${f1(gy - sh * 0.35)}`, stroke: r.pal.rim, 'stroke-width': f1(1 * k), opacity: '0.5', fill: 'none' }));
          const cy = vh * (0.14 + rnd() * 0.12);
          const cw = (46 + rnd() * 40) * k;
          let cloud = '';
          for (let j = 0; j < 5; j++) {
            const bx = x - cw / 2 + (cw * j) / 4;
            const br = (12 + rnd() * 12) * k * (j === 0 || j === 4 ? 0.7 : 1);
            cloud += `M${f1(bx - br)} ${f1(cy)}a${f1(br)} ${f1(br)} 0 1 1 ${f1(br * 2)} 0a${f1(br)} ${f1(br)} 0 1 1 ${f1(-br * 2)} 0`;
          }
          g.append(s('path', { d: cloud + `M${f1(x - cw / 2 - 8 * k)} ${f1(cy)}h${f1(cw + 16 * k)}v${f1(10 * k)}h${f1(-cw - 16 * k)}Z`, fill: '#141B24', opacity: '0.92' }));
          let rain = '';
          for (let j = 0; j < 9; j++) {
            const rx = x - cw / 2 + rnd() * cw;
            const ry = cy + 12 * k + rnd() * 30 * k;
            rain += `M${f1(rx)} ${f1(ry)}l${f1(-5 * k)} ${f1(16 * k)}`;
          }
          glows.append(s('path', { d: rain, stroke: '#BFD4EA', 'stroke-width': f1(0.8 * k), opacity: '0.28', 'stroke-linecap': 'round' }));
          break;
        }
        case 'mothwood': {
          // A dark canopy overhead, trunks beneath it, glow-worms low in the dark.
          const tw = (5 + rnd() * 7) * k;
          const top = vh * (0.06 + rnd() * 0.08);
          g.append(s('path', { d: `M${f1(x - tw)} ${f1(gy + 4 * k)}Q${f1(x - tw * 0.6)} ${f1(top + 60 * k)} ${f1(x - tw * 0.5)} ${f1(top)}L${f1(x + tw * 0.5)} ${f1(top)}Q${f1(x + tw * 0.6)} ${f1(top + 60 * k)} ${f1(x + tw)} ${f1(gy + 4 * k)}Z` }));
          let canopy = '';
          for (let j = 0; j < 4; j++) {
            const bx = x + (rnd() - 0.5) * 90 * k;
            const by = top + (rnd() - 0.4) * 30 * k;
            const br = (22 + rnd() * 22) * k;
            canopy += `M${f1(bx - br)} ${f1(by)}a${f1(br)} ${f1(br * 0.8)} 0 1 1 ${f1(br * 2)} 0a${f1(br)} ${f1(br * 0.8)} 0 1 1 ${f1(-br * 2)} 0`;
          }
          g.append(s('path', { d: canopy }));
          for (let j = 0; j < 3; j++) glows.append(s('circle', { cx: f1(x + (rnd() - 0.5) * 70 * k), cy: f1(gy - rnd() * 90 * k), r: f1((0.9 + rnd()) * k), fill: r.pal.rim, class: 'glow-dot' }));
          break;
        }
        case 'daybreak': {
          // Folded-paper spires with one lit window.
          const sh = (40 + rnd() * 60) * k;
          const sw = (6 + rnd() * 6) * k;
          const top = gy - sh;
          g.append(s('path', { d: `M${f1(x - sw)} ${f1(gy)}L${f1(x - sw)} ${f1(top + sw * 1.4)}L${f1(x)} ${f1(top)}L${f1(x + sw)} ${f1(top + sw * 1.4)}L${f1(x + sw)} ${f1(gy)}Z` }));
          if (rnd() < 0.6) glows.append(s('rect', { x: f1(x - 1.4 * k), y: f1(top + sw * 2.2 + rnd() * sh * 0.3), width: f1(2.8 * k), height: f1(4 * k), fill: accent, class: 'glow-dot' }));
          break;
        }
      }
    }
  }

  private buildNear(): void {
    const k = this.k;
    const vh = this.vh;
    const W = Math.ceil(this.total);
    this.near.style.width = `${W}px`;
    const root = s('svg', { class: 'jr-ground', width: W, height: vh, viewBox: `0 0 ${W} ${vh}`, 'aria-hidden': 'true' });
    const defs = s(
      'defs',
      {},
      s('linearGradient', { id: 'jn-fill', gradientUnits: 'userSpaceOnUse', x1: 0, x2: W, y1: 0, y2: 0 }, ...this.gradientStops((p) => p.terrain, 1, W, '#2A1726')),
      s('linearGradient', { id: 'jn-rim', gradientUnits: 'userSpaceOnUse', x1: 0, x2: W, y1: 0, y2: 0 }, ...this.gradientStops((p) => p.rim, 1, W, '#FFE6B8')),
      s('linearGradient', { id: 'jn-hatch-c', gradientUnits: 'userSpaceOnUse', x1: 0, x2: W, y1: 0, y2: 0 }, ...this.gradientStops((p) => p.hatch, 1, W)),
      s('pattern', { id: 'jn-hatch', width: f1(7 * k), height: f1(7 * k), patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-38)' }, s('path', { d: `M0 0V${f1(7 * k)}`, stroke: '#fff', 'stroke-width': f1(0.8), opacity: '0.07' })),
      s('radialGradient', { id: 'jn-glow' }, s('stop', { offset: '0', 'stop-color': '#FFD27A', 'stop-opacity': '0.55' }), s('stop', { offset: '0.45', 'stop-color': '#FFB45A', 'stop-opacity': '0.18' }), s('stop', { offset: '1', 'stop-color': '#FFB45A', 'stop-opacity': '0' })),
    );
    root.append(defs);

    // Ground mass, hatch, rim light.
    let top = '';
    this.ridge.forEach((p, i) => (top += `${i ? 'L' : 'M'}${f1(p.x)} ${f1(p.y)}`));
    const last = this.ridge[this.ridge.length - 1];
    const first = this.ridge[0];
    const mass = `${top}L${f1(last.x)} ${vh + 10}L${f1(first.x)} ${vh + 10}Z`;
    root.append(s('path', { d: mass, fill: 'url(#jn-fill)' }), s('path', { d: mass, fill: 'url(#jn-hatch)' }), s('path', { d: top, fill: 'none', stroke: 'url(#jn-rim)', 'stroke-width': f1(1.6 * k), opacity: '0.75', 'stroke-linecap': 'round' }));

    // Grass & world trinkets along the rim.
    const deco = s('g', { fill: 'none', stroke: 'url(#jn-rim)', 'stroke-width': f1(1 * k), 'stroke-linecap': 'round', opacity: '0.55' });
    const solid = s('g', { fill: 'url(#jn-fill)' });
    const rnd = prng(77);
    for (let x = 30 * k; x < W; x += (14 + rnd() * 26) * k) {
      if (this.lamps.some((l) => Math.abs(l.x - x) < 26 * k)) continue;
      const y = this.ridgeY(x) + 1;
      const { a } = this.blendAt(x);
      const key = this.regions[a]?.world.key ?? 'dusk';
      const r = rnd();
      if (key === 'hollow' && r < 0.18) {
        const mh = (5 + rnd() * 6) * k;
        solid.append(s('path', { d: `M${f1(x - 1.2 * k)} ${f1(y)}L${f1(x - 1 * k)} ${f1(y - mh)}L${f1(x + 1 * k)} ${f1(y - mh)}L${f1(x + 1.2 * k)} ${f1(y)}Z` }));
        deco.append(s('path', { d: `M${f1(x - 5 * k)} ${f1(y - mh)}Q${f1(x)} ${f1(y - mh - 7 * k)} ${f1(x + 5 * k)} ${f1(y - mh)}Z`, fill: 'url(#jn-fill)' }));
      } else if (key === 'storm' && r < 0.14) {
        const ch = (6 + rnd() * 8) * k;
        deco.append(s('path', { d: `M${f1(x - 3 * k)} ${f1(y)}L${f1(x)} ${f1(y - ch)}L${f1(x + 3 * k)} ${f1(y)}`, fill: 'url(#jn-fill)' }));
      } else if (key === 'daybreak' && r < 0.1) {
        const ph = (10 + rnd() * 8) * k;
        deco.append(s('path', { d: `M${f1(x)} ${f1(y)}V${f1(y - ph)}l${f1(6 * k)} ${f1(2 * k)}l${f1(-6 * k)} ${f1(2 * k)}` }));
      } else if (key === 'starwater' && r < 0.2) {
        const rh = (7 + rnd() * 9) * k;
        deco.append(s('path', { d: `M${f1(x)} ${f1(y)}q${f1(1 * k)} ${f1(-rh * 0.6)} ${f1(3 * k)} ${f1(-rh)}M${f1(x + 2 * k)} ${f1(y)}q0 ${f1(-rh * 0.4)} ${f1(-2 * k)} ${f1(-rh * 0.8)}` }));
      } else if (key === 'mothwood' && r < 0.14) {
        const fh = (6 + rnd() * 6) * k;
        deco.append(s('path', { d: `M${f1(x)} ${f1(y)}q${f1(-1 * k)} ${f1(-fh)} ${f1(4 * k)} ${f1(-fh)}q${f1(2 * k)} ${f1(1 * k)} 0 ${f1(3 * k)}` }));
      } else {
        const gh = (2.5 + rnd() * 4) * k;
        deco.append(s('path', { d: `M${f1(x - 2 * k)} ${f1(y)}l${f1(-1 * k)} ${f1(-gh)}M${f1(x)} ${f1(y)}l${f1(0.4 * k)} ${f1(-gh * 1.3)}M${f1(x + 2 * k)} ${f1(y)}l${f1(1.2 * k)} ${f1(-gh * 0.9)}` }));
      }
    }
    root.append(solid, deco);

    // The footpath: faint dotted ink everywhere; glowing moon-ink where Wick has walked.
    const trailD = this.offsetPath(-3.5 * k);
    root.append(s('path', { d: trailD, class: 'jr-trail', 'stroke-width': f1(1.6 * k), 'stroke-dasharray': `${f1(0.1)} ${f1(6 * k)}` }));
    const litHalo = s('path', { d: trailD, class: 'jr-lit-halo', 'stroke-width': f1(6 * k) });
    const lit = s('path', { d: trailD, class: 'jr-lit', 'stroke-width': f1(1.6 * k) });
    root.append(litHalo, lit);
    this.litPath = lit;
    this.litLen = this.ridgeLen[this.ridgeLen.length - 1] + 400;
    for (const p of [lit, litHalo]) p.style.strokeDasharray = `${this.litLen} ${this.litLen}`;
    (lit as SVGPathElement & { _halo?: SVGPathElement })._halo = litHalo;

    // Start marker.
    const sx = 70 * k;
    const sy = this.ridgeY(sx);
    root.append(s('path', { d: `M${f1(sx)} ${f1(sy)}V${f1(sy - 20 * k)}M${f1(sx - 1 * k)} ${f1(sy - 18 * k)}h${f1(16 * k)}l${f1(4 * k)} ${f1(3 * k)}l${f1(-4 * k)} ${f1(3 * k)}h${f1(-16 * k)}`, class: 'jr-sign', 'stroke-width': f1(1.3 * k) }));

    // Lamps.
    const lampsG = s('g', { class: 'jr-lamps' });
    const rl = prng(5);
    for (const l of this.lamps) {
      const g = this.lampArt(l, rl());
      lampsG.append(g);
      l.el = g;
    }
    root.append(lampsG);
    this.near.append(root);

    // World titles (HTML for crisp type), fog over locked worlds, lamp buttons, Wick, tag.
    const firstLocked = this.regions.findIndex((r) => !r.unlocked);
    for (const r of this.regions) {
      const st = progress.worldStars(r.world.index);
      const done = progress.worldDone(r.world.index);
      const t = h(
        'div.jr-title',
        { class: `${r.unlocked ? '' : 'locked'} ${done ? 'done' : ''}`, style: { left: `${r.x0 + 26 * k}px`, '--accent': r.pal.accent } as Record<string, string> },
        h('span.jr-t-num', h('b', ROMAN[r.world.index] ?? ''), h('i', worldHour(r.world))),
        h('span.jr-t-name', r.world.name),
        h('span.jr-t-sub', r.unlocked ? r.world.subtitle : 'veiled in mist'),
        r.unlocked ? h('span.jr-t-stars', svg(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`), `${st.got}/${st.max}`) : null,
      );
      this.near.append(t);
      this.titles.push({ el: t, x0: r.x0 + 26 * k, x1: r.x1 - 30 * k, w: 0 });
    }
    if (firstLocked >= 0) {
      const fx0 = this.regions[firstLocked].x0 - 90 * k;
      this.near.append(h('div.jr-fog', { style: { left: `${fx0}px`, width: `${W - fx0}px`, '--edge': `${140 * k}px` } as Record<string, string> }, h('i.fog-a'), h('i.fog-b'), h('i.fog-c')));
    }
    // End of the night.
    const endX = this.total - 300 * k;
    this.near.append(h('div.jr-dawn', { style: { left: `${endX}px`, top: `${this.ridgeY(endX) - 150 * k}px` } }, progress.allDone() ? 'home, by sunrise' : 'dawn'));

    for (const l of this.lamps) {
      const label = `${l.level.id} ${l.level.name}${l.state === 'lit' ? ` — ${l.stars.filter(Boolean).length} of 3 stars` : l.state === 'locked' ? ' — locked' : ''}`;
      const b = h('button.jr-lamp-btn', { type: 'button', 'aria-label': label, title: `${l.level.id} · ${l.level.name}`, class: l.state, style: { left: `${l.x - 22 * k}px`, top: `${l.y - 50 * k}px`, width: `${48 * k}px`, height: `${64 * k}px` } });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tapLamp(l);
      });
      b.addEventListener('focus', () => {
        const sx2 = l.x - this.scroller.x;
        if (sx2 < 80 || sx2 > this.vw - 80) this.scroller.scrollTo(l.x - this.vw / 2, 300);
        this.placeTag(l);
      });
      l.btn = b;
      this.near.append(b);
    }

    // Wick.
    const arr = this.arrival();
    this.wickAt = arr && !this.walking && !this.arrived ? this.lamps[arr.start].x - 17 * k : this.wickHomeX();
    this.wick.stop();
    this.wick = new WickSprite(0.5 * k);
    this.wick.placeAt(this.wickAt, this.ridgeY(this.wickAt) + 1);
    this.wick.setFacing(1);
    this.near.append(this.wick.el, this.tag);
    this.wick.start();
    this.setLitTo(this.wickAt);
    this.placeTag();
  }

  /** The ridge offset a little (the trail runs just below the rim). */
  private offsetPath(dy: number): string {
    let d = '';
    const r = this.ridge;
    for (let i = 0; i < r.length; i += 2) d += `${i ? 'L' : 'M'}${f1(r[i].x)} ${f1(r[i].y - dy)}`;
    return d;
  }

  private setLitTo(x: number): void {
    if (!this.litPath) return;
    const L = this.lenAt(x);
    const off = String(this.litLen - L);
    this.litPath.style.strokeDashoffset = off;
    const halo = (this.litPath as SVGPathElement & { _halo?: SVGPathElement })._halo;
    if (halo) halo.style.strokeDashoffset = off;
  }

  /** The arrival walk: lamp indices [start, to). Long absences only replay the last few lamps. */
  private arrival(): { start: number; to: number } | null {
    const fromId = this.opts.arriveFrom;
    const fromIdx = fromId ? this.lamps.findIndex((x) => x.level.id === fromId) : -1;
    if (fromIdx < 0) return null;
    const to = progress.allDone() ? this.lamps.length : this.lamps.findIndex((x) => x.level === this.frontier);
    if (to <= fromIdx) return null;
    return { start: Math.max(fromIdx, to - 3), to };
  }

  /** Lit since Wick last stood on the map: shown dark until Wick walks past and lights it. */
  private isPending(l: Lamp): boolean {
    const a = this.arrival();
    if (!a || l.state !== 'lit') return false;
    const i = this.lamps.indexOf(l);
    return i >= a.start && i < a.to;
  }

  private lampArt(l: Lamp, r: number): SVGGElement {
    const k = this.k;
    const g = s('g', { class: `jr-lamp ${l.state}${l.level === this.frontier && !progress.allDone() ? ' frontier' : ''}${this.isPending(l) ? ' pending' : ''}`, transform: `translate(${f1(l.x)} ${f1(l.y)})`, style: `--fl:${(r * 3).toFixed(2)}s` });
    const lx = 9 * k;
    const ly = -26 * k;
    if (l.state === 'lit') g.append(s('circle', { class: 'lamp-glow', cx: f1(lx), cy: f1(ly), r: f1(30 * k), fill: 'url(#jn-glow)' }));
    if (l.level === this.frontier) g.append(s('circle', { class: 'lamp-pulse', cx: f1(lx), cy: f1(ly), r: f1(11 * k) }));
    g.append(
      s('path', { class: 'lamp-post', d: `M0 1Q${f1(-1.5 * k)} ${f1(-18 * k)} ${f1(0.6 * k)} ${f1(-36 * k)}Q${f1(5 * k)} ${f1(-40 * k)} ${f1(lx)} ${f1(-38 * k)}V${f1(ly - 7 * k)}`, 'stroke-width': f1(1.7 * k) }),
      s('ellipse', { class: 'lamp-body', cx: f1(lx), cy: f1(ly), rx: f1(5.2 * k), ry: f1(7 * k) }),
      s('path', { class: 'lamp-rib', d: `M${f1(lx)} ${f1(ly - 7 * k)}V${f1(ly + 7 * k)}M${f1(lx - 2.6 * k)} ${f1(ly - 6 * k)}Q${f1(lx - 4 * k)} ${f1(ly)} ${f1(lx - 2.6 * k)} ${f1(ly + 6 * k)}M${f1(lx + 2.6 * k)} ${f1(ly - 6 * k)}Q${f1(lx + 4 * k)} ${f1(ly)} ${f1(lx + 2.6 * k)} ${f1(ly + 6 * k)}`, 'stroke-width': f1(0.6 * k) }),
      s('path', { class: 'lamp-cap', d: `M${f1(lx - 3 * k)} ${f1(ly - 7.2 * k)}h${f1(6 * k)}M${f1(lx - 2.6 * k)} ${f1(ly + 7.2 * k)}h${f1(5.2 * k)}`, 'stroke-width': f1(1.4 * k) }),
    );
    if (l.state !== 'lit') g.append(s('circle', { class: 'lamp-ember', cx: f1(lx), cy: f1(ly + 1 * k), r: f1(1.4 * k) }));
    // Stars and number beneath.
    if (l.state === 'lit') {
      for (let i = 0; i < 3; i++) {
        const sx = (i - 1) * 7.5 * k + 1.5 * k;
        g.append(s('path', { class: `lamp-star${l.stars[i] ? ' on' : ''}`, d: SPARK_PATH, transform: `translate(${f1(sx - 3.1 * k)} ${f1(9 * k)}) scale(${(0.26 * k).toFixed(3)})` }));
      }
    }
    const num = s('text', { class: 'lamp-num', x: f1(1.5 * k), y: f1((l.state === 'lit' ? 24 : 15) * k), 'font-size': f1(8.5 * k) });
    num.textContent = String(l.n);
    g.append(num);
    return g;
  }

  private buildTimeline(): void {
    const track = this.timeline.querySelector('.jr-tl-track') as HTMLElement;
    for (const t of this.ticks) t.remove();
    this.ticks = [];
    for (const r of this.regions) {
      const b = h('button.jr-tick', { type: 'button', class: r.unlocked ? '' : 'locked', style: { left: `${(r.cx / this.total) * 100}%` }, 'aria-label': `${r.world.name}`, title: r.world.name }, h('span', ROMAN[r.world.index] ?? ''));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.ui('tap');
        this.scroller.scrollTo(r.lx + 150 * this.k - this.vw / 2, 700);
      });
      this.ticks.push(b);
      track.append(b);
    }
    const litTo = (this.wickHomeX() / this.total) * 100;
    (track.querySelector('.jr-tl-lit') as HTMLElement).style.width = `${litTo}%`;
  }

  // ───────────────────────────── interaction ─────────────────────────────

  private tapLamp(l: Lamp): void {
    if (this.opening) return;
    if (l.state === 'locked') {
      audio.ui('deny');
      l.el?.classList.remove('deny');
      void (l.el as unknown as HTMLElement)?.getBoundingClientRect();
      l.el?.classList.add('deny');
      const firstOpen = this.frontier;
      this.showTag(l, 'light the lamps before it', firstOpen);
      return;
    }
    this.opening = true;
    audio.ui('open');
    l.el?.classList.add('opening');
    const isFront = l.level === this.frontier;
    const from = isFront ? this.wickScreen() : { x: l.x + 9 * this.k - this.scroller.x, y: l.y - 26 * this.k };
    if (isFront) this.wick.look = { x: l.x + 9 * this.k, y: l.y - 30 * this.k };
    this.opts.onPlay(l.level, from);
  }

  /** Allow tapping again (if the level failed to open). */
  reopen(): void {
    this.opening = false;
  }

  private placeTag(l?: Lamp): void {
    const t = l ?? this.lamps.find((x) => x.level === this.frontier);
    if (!t || (!l && progress.allDone())) {
      this.tag.classList.remove('show');
      return;
    }
    this.showTag(t);
  }

  private showTag(l: Lamp, note?: string, _front?: LevelDef): void {
    void _front;
    this.tag.replaceChildren(h('b', l.level.id), h('span', note ?? l.level.name));
    this.tag.style.left = `${l.x + 9 * this.k}px`;
    this.tag.style.top = `${l.y - 62 * this.k}px`;
    this.tag.classList.toggle('note', !!note);
    this.tag.classList.add('show');
    if (note) {
      window.setTimeout(() => {
        if (!this.dead) this.placeTag();
      }, 1800);
    }
  }

  /** Arrow/Home/End scrolling. Returns true if the key was used. */
  keyNav(key: string): boolean {
    if (key === 'ArrowRight') this.scroller.nudge(this.vw * 0.4);
    else if (key === 'ArrowLeft') this.scroller.nudge(-this.vw * 0.4);
    else if (key === 'Home') this.scroller.scrollTo(0, 600);
    else if (key === 'End') this.scroller.scrollTo(this.total, 600);
    else return false;
    return true;
  }

  /** Enter on the journey screen opens the frontier. */
  playFrontier(): void {
    const l = this.lamps.find((x) => x.level === this.frontier);
    if (l && l.state !== 'locked') this.tapLamp(l);
  }

  focusFrontier(): void {
    this.lamps.find((x) => x.level === this.frontier)?.btn?.focus({ preventScroll: true });
  }

  // ───────────────────────────── per frame ─────────────────────────────

  private onScroll(x: number): void {
    this.near.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
    // World titles behave like sticky headers: pinned to the left edge while their world is in view.
    const pad = 22 * this.k + 44;
    for (const tt of this.titles) {
      const want = Math.max(tt.x0, Math.min(x + pad, tt.x1 - tt.w));
      tt.el.style.transform = `translate3d(${(want - tt.x0).toFixed(1)}px,0,0)`;
    }
    for (const l of this.layers) l.el.style.transform = `translate3d(${(-x * l.f).toFixed(1)}px,0,0)`;
    const c = Math.max(0, Math.min(1, (x + this.vw / 2) / Math.max(1, this.total)));
    this.thumb.style.left = `${(c * 100).toFixed(2)}%`;
    this.skyDirty = true;
  }

  private frame(): void {
    if (this.skyDirty) {
      this.skyDirty = false;
      this.paintSky();
    }
  }

  private paintSky(): void {
    const ctx = this.skyCtx;
    if (!ctx || !this.regions.length) return;
    const cols = this.sky.width;
    const rows = this.sky.height;
    if (!this.skyImg) this.skyImg = ctx.createImageData(cols, rows);
    const img = this.skyImg;
    const pals = this.regions.map((r) => r.pal.sky.map(parseColor));
    const dawn = DAWN_SKY.map(parseColor);
    const horizon = rows * 0.8;
    const stops: RGB[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let c = 0; c < cols; c++) {
      const nx = this.scroller.x + ((c + 0.5) / cols) * this.vw;
      const { a, b, t } = this.blendAt(nx);
      const A = pals[a];
      const B = b < 0 ? dawn : pals[b];
      for (let i = 0; i < 5; i++) stops[i] = mix(A[i] ?? A[A.length - 1], B[i] ?? B[B.length - 1], t);
      for (let r = 0; r < rows; r++) {
        const u = Math.min(1, r / horizon) * 4;
        const i0 = Math.min(3, Math.floor(u));
        const col = mix(stops[i0], stops[i0 + 1], u - i0);
        const o = (r * cols + c) * 4;
        img.data[o] = col[0];
        img.data[o + 1] = col[1];
        img.data[o + 2] = col[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Tint the chrome with the region's accent; move and recolour the orb.
    const { a, b, t } = this.blendAt(this.scroller.x + this.vw / 2);
    const oa = this.orbs[a];
    const ob = b < 0 ? this.orbs[this.orbs.length - 1] : this.orbs[b];
    if (oa && ob) {
      const lerp = (u: number, v: number) => u + (v - u) * t;
      const r = lerp(oa.r, ob.r);
      const os = this.orb.style;
      os.transform = `translate3d(${(lerp(oa.x, ob.x) * this.vw).toFixed(1)}px, ${(lerp(oa.y, ob.y) * this.vh).toFixed(1)}px, 0) scale(${(r / 50).toFixed(3)})`;
      os.setProperty('--oc', css(mix(oa.color, ob.color, t)));
      os.setProperty('--og', css(mix(oa.glow, ob.glow, t), Math.min(0.7, lerp(oa.ga, ob.ga) * 1.6)));
    }
    const acc = mix(parseColor(this.regions[a].pal.accent), b < 0 ? parseColor('#FFE3AE') : parseColor(this.regions[b].pal.accent), t);
    this.el.style.setProperty('--region-accent', css(acc));
  }
}

/** Uniform Catmull-Rom through control points, sampled every ~`step` px along x. */
function catmull(p: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil((p2.x - p1.x) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
  }
  out.push(p[p.length - 1]);
  return out;
}


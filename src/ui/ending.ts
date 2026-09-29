// The ending: the sun comes up over the last hill, Wick walks the final steps home, a few quiet
// lines, then the credits. Tap to hurry it along.
import { audio } from '../audio/audio';
import { progress } from '../game/progress';
import { f1, h, prng, s, svg } from './dom';
import { SPARK_PATH } from './icons';
import { btn } from './sheets';
import { WickSprite } from './wick-sprite';

const LINES = ['The last lamp is lit.', 'Down in the meadow, the grass remembers the light.', 'Wick is home.'];

export interface EndingOptions {
  onDone(): void;
  /** Viewed from the credits button (skip straight to the roll). */
  creditsOnly?: boolean;
}

export class Ending {
  readonly el: HTMLElement;
  private wick: WickSprite;
  private timers: number[] = [];
  private stage = 0;
  private credits: HTMLElement;
  private lines: HTMLElement[];

  constructor(private opts: EndingOptions) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = Math.max(0.85, Math.min(1.5, vh / 390));
    // Hills: two ridgelines, the near one carrying the home-lamp.
    const rnd = prng(3);
    const ridge = (base: number, amp: number, f: number, ph: number) => {
      let d = `M-10 ${vh + 10}`;
      for (let x = -10; x <= vw + 10; x += 8) d += `L${x} ${f1(base - amp * (0.6 * Math.sin(x / f + ph) + 0.4 * Math.sin(x / (f * 0.37) + ph * 2)))}`;
      return d + `L${vw + 10} ${vh + 10}Z`;
    };
    const lampX = vw * 0.7;
    const nearBase = vh * 0.8;
    const nearY = (x: number) => nearBase - 10 * k * (0.6 * Math.sin(x / (240 * k) + 1) + 0.4 * Math.sin(x / (240 * k * 0.37) + 2));
    const ly = nearY(lampX);
    const hills = s(
      'svg',
      { class: 'e-hills', viewBox: `0 0 ${vw} ${vh}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      s('path', { d: ridge(vh * 0.7, 26 * k, 190 * k, rnd() * 6), class: 'e-far' }),
      s('path', { d: ridge(nearBase, 10 * k, 240 * k, 1), class: 'e-near' }),
      s('defs', {}, s('radialGradient', { id: 'e-glow' }, s('stop', { offset: '0', 'stop-color': '#FFE2A6', 'stop-opacity': '0.9' }), s('stop', { offset: '0.35', 'stop-color': '#FFC56E', 'stop-opacity': '0.35' }), s('stop', { offset: '1', 'stop-color': '#FFB45A', 'stop-opacity': '0' }))),
      s(
        'g',
        { class: 'e-lamp', transform: `translate(${f1(lampX)} ${f1(ly)}) scale(${(k * 1.2).toFixed(3)})` },
        s('circle', { cx: 9, cy: -26, r: 46, class: 'e-lamp-glow', fill: 'url(#e-glow)' }),
        s('path', { d: 'M0 1Q-1.5 -18 .6 -36Q5 -40 9 -38V-33', class: 'e-post' }),
        s('ellipse', { cx: 9, cy: -26, rx: 5.2, ry: 7, class: 'e-body' }),
        s('path', { d: 'M9 -33V-19M6.4 -32Q5 -26 6.4 -20M11.6 -32Q13 -26 11.6 -20', class: 'e-rib' }),
        s('path', { d: 'M6 -33.2h6M6.4 -18.8h5.2', class: 'e-cap' }),
      ),
    );
    this.wick = new WickSprite(0.62 * k);
    this.wick.placeAt(-40, nearY(0));
    this.lines = LINES.map((t) => h('p.e-line', t));
    const total = progress.totalStars();
    this.credits = h(
      'div.e-credits',
      h('p.e-thanks', 'Thank you for walking Wick home.'),
      h('div.e-roll', h('h2.e-logo', 'Ink', h('span', 'light')), h('p', 'a small game of light and lines'), h('p.e-made', 'Made with Claude'), h('p.e-small', 'set in Fraunces, DM Mono & Caveat · every sound is synthesized as you play'), h('p.e-stars', svg(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`), `${total} / ${progress.maxStars()} stars gathered`)),
      h('div.e-actions', btn('Journey', 'journey', () => this.done(), 'primary', 'close')),
    );
    this.el = h(
      'div.ending',
      { role: 'dialog', 'aria-label': 'Dawn' },
      h('div.e-sky.e-night'),
      h('div.e-sky.e-rose'),
      h('div.e-sky.e-gold'),
      h('div.e-stars'),
      h('div.e-sun', h('i.e-rays'), h('i.e-disc')),
      hills,
      this.wick.el,
      h('p.e-time', '6:58 am'),
      h('div.e-lines', ...this.lines),
      this.credits,
      h('button.pill.e-skip', { type: 'button', onclick: (e: Event) => (e.stopPropagation(), this.skipToCredits()) }, 'skip'),
    );
    this.el.style.setProperty('--k', String(k));
    this.el.addEventListener('click', () => this.advance());
    this.lampPt = { x: lampX - 20 * k, y: ly + 1 };
    this.nearY = nearY;
  }

  private lampPt: { x: number; y: number };
  private nearY: (x: number) => number;

  start(): void {
    this.wick.start();
    requestAnimationFrame(() => this.el.classList.add('rise'));
    if (this.opts.creditsOnly) {
      this.skipToCredits();
      this.wick.placeAt(this.lampPt.x, this.lampPt.y);
      this.wick.happy();
      return;
    }
    audio.setMode('win');
    const walk: { x: number; y: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = -40 + ((this.lampPt.x + 40) * i) / 24;
      walk.push({ x, y: this.nearY(x) + 1 });
    }
    this.at(900, () => void this.wick.walkAlong(walk, undefined).then(() => this.wick.happy()));
    LINES.forEach((_, i) => this.at(2600 + i * 2800, () => this.showLine(i)));
    this.at(2600 + LINES.length * 2800 + 400, () => this.skipToCredits());
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private showLine(i: number): void {
    this.lines.forEach((l, j) => l.classList.toggle('show', j === i));
    this.stage = i + 1;
  }

  private advance(): void {
    if (this.el.classList.contains('credits')) return;
    if (this.stage < LINES.length) {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      this.showLine(this.stage);
      if (this.stage < LINES.length) this.at(2200, () => this.advance());
      else this.at(2000, () => this.skipToCredits());
    } else this.skipToCredits();
  }

  private skipToCredits(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.lines.forEach((l) => l.classList.remove('show'));
    this.el.classList.add('rise', 'risen', 'credits');
    this.stage = LINES.length;
    progress.markEndingSeen();
    setTimeout(() => (this.credits.querySelector('.btn') as HTMLElement | null)?.focus({ preventScroll: true }), 900);
  }

  private done(): void {
    this.destroy();
    this.opts.onDone();
  }

  destroy(): void {
    this.timers.forEach(clearTimeout);
    this.wick.stop();
  }
}

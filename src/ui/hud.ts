import type { InkType, LevelDef, SimEvent, WorldDef } from '../core/types';
import { audio } from '../audio/audio';
import { haptic } from '../game/haptics';
import { progress } from '../game/progress';
import { INK_COLORS } from '../render/palettes';
import type { Phase, Simulation } from '../sim/simulation';
import { levelTime } from './clock';
import { h, s, svg } from './dom';
import { ICONS, SPARK_PATH, type IconName } from './icons';

export interface HudActions {
  go(): void;
  retry(): void;
  undo(): void;
  clear(): void;
  hint(on: boolean): void;
  ink(type: InkType): void;
  pause(): void;
}

const INK_LABEL: Record<InkType, string> = { moon: 'Moon', spring: 'Spring', comet: 'Comet' };
const INK_BLURB: Record<InkType, string> = { moon: 'solid ground', spring: 'bouncy', comet: 'rushes onward' };
const HOLD_MS = 650;
/** The hold-to-clear gesture is taught once per app run, on the first undo. */
let taughtHold = false;

function iconBtn(name: IconName, label: string, cls: string): HTMLButtonElement {
  return h('button.hud-btn', { class: cls, 'aria-label': label, title: label, type: 'button' }, svg(ICONS[name]));
}

/** A progress ring for round buttons (pathLength-normalised so CSS can animate dashoffset 1 → 0). */
function ring(r: number, cls: string): SVGSVGElement {
  const size = r * 2 + 4;
  return s('svg', { class: cls, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' }, s('circle', { cx: size / 2, cy: size / 2, r, pathLength: 1 }));
}

/**
 * In-level heads-up display. Lives in the gutters beside the level and along its top edge.
 * Positioned with CSS variables set by the app layout (--lvl-x/y/w/h, --space-l/r).
 */
export class Hud {
  readonly el: HTMLElement;
  private meter: HTMLElement;
  private meterPar: HTMLElement;
  private goBtn: HTMLButtonElement;
  private hintBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private inkLabel: HTMLElement;
  private inks: HTMLElement | null = null;
  private slots = new Map<InkType, HTMLButtonElement>();
  private sparkEls: HTMLElement[] = [];
  private intro: HTMLElement;
  private note: HTMLElement;
  private ask: HTMLElement | null = null;
  private hintOn = false;
  private lastInk = -1;
  private lastBudget = -1;
  private lastStrokes = -1;
  private phase: Phase = 'plan';
  private fails = 0;
  private nudged = false;
  private noteTimer = 0;
  private introTimer = 0;
  private holdTimer = 0;
  private holdNoteTimer = 0;
  private holding = false;
  private active: InkType;

  constructor(
    private level: LevelDef,
    world: WorldDef,
    private actions: HudActions,
  ) {
    const { budget, par } = level.ink;
    this.active = level.ink.types[0];

    // ── Top edge: level id · ink fuse · sparks ──
    this.meterPar = h('div.meter-par', { title: 'par' }, h('span', 'par'));
    this.meter = h(
      'div.meter',
      { role: 'meter', 'aria-label': 'Ink remaining', 'aria-valuemin': '0', 'aria-valuemax': String(budget), 'aria-valuenow': String(budget) },
      h('span.meter-label', 'ink'),
      h('div.meter-line', h('div.meter-track'), h('div.meter-fill'), this.meterPar, h('div.meter-ember-wrap', h('i.meter-ember'))),
    );
    this.meter.style.setProperty('--frac', '1');
    this.placePar(par, budget);

    const sparks = h('div.hud-sparks', { 'aria-label': `Sparks: 0 of ${level.sparks.length}` });
    for (let i = 0; i < level.sparks.length; i++) {
      const sp = h('span.hud-spark', svg(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`));
      this.sparkEls.push(sp);
      sparks.append(sp);
    }
    const top = h('div.hud-top', h('span.hud-id', level.id), this.meter, sparks);

    // ── Tools gutter: inks · undo ──
    const tools = h('div.gutter.gutter-a');
    this.inkLabel = h('span.ink-label', { 'aria-live': 'polite' });
    if (level.ink.types.length > 1) {
      const sel = h('i.inks-sel');
      this.inks = h('div.inks', { role: 'radiogroup', 'aria-label': 'Ink' }, sel);
      level.ink.types.forEach((t, i) => {
        const col = INK_COLORS[t];
        const b = h(
          'button.ink-slot',
          { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `${INK_LABEL[t]} ink — ${INK_BLURB[t]} (${i + 1})`, title: `${INK_LABEL[t]} ink (${i + 1})`, style: { '--ink-core': col.core, '--ink-halo': col.halo } as Record<string, string> },
          h('span.ink-dot'),
        );
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.active !== t) audio.ui('select');
          this.selectInk(t);
          actions.ink(t);
        });
        this.slots.set(t, b);
        this.inks!.append(b);
      });
      tools.append(h('div.ink-group', this.inks, this.inkLabel));
    } else {
      tools.append(h('div.ink-group.single', this.inkLabel));
    }
    this.undoBtn = iconBtn('undo', 'Undo stroke — hold to clear all ink', 'undo');
    this.undoBtn.append(ring(21, 'hold-ring'));
    this.wireUndo();
    tools.append(h('div.gutter-spacer'), this.undoBtn);

    // ── Flow gutter: pause · hint · go ──
    const pause = iconBtn('pause', 'Pause (Esc)', 'pause');
    pause.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.ui('open');
      actions.pause();
    });
    this.hintBtn = iconBtn('hint', 'Hint', 'hint');
    this.hintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHint();
    });
    this.goBtn = h(
      'button.go-btn',
      { type: 'button', 'aria-label': 'Go (Space)' },
      ring(33, 'go-count'),
      h('span.go-face', h('span.go-ico.go-play', svg(ICONS.go)), h('span.go-ico.go-retry', svg(ICONS.retry)), h('span.go-label', h('b.l-go', 'go'), h('b.l-retry', 'retry'))),
    );
    if (level.autoStart) {
      this.goBtn.classList.add('hurry');
      this.goBtn.style.setProperty('--hurry', `${level.autoStart}s`);
    }
    this.goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pressGo();
    });
    const flow = h('div.gutter.gutter-b', pause, this.hintBtn, h('div.gutter-spacer'), this.goBtn);

    // ── Level intro card ──
    this.intro = h(
      'div.level-intro',
      { 'aria-live': 'polite' },
      h('span.li-kicker', h('span', world.name), h('i', '·'), h('span', level.id), h('i', '·'), h('span', levelTime(level, world))),
      h('span.li-name', level.name),
      h('span.li-rule', h('i'), svg(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`), h('i')),
      level.autoStart ? h('span.li-hurry', `no time to plan — Wick sets off in ${level.autoStart}s`) : null,
    );
    this.note = h('div.hud-note', { 'aria-live': 'polite' });

    this.el = h('div.hud', { 'data-phase': 'plan' }, top, tools, flow, this.intro, this.note);
    if (level.ink.types.length === 1) this.el.classList.add('single-ink');
    this.selectInk(this.active);
  }

  // ───────────────────────────── pieces ─────────────────────────────

  private placePar(par: number, budget: number): void {
    const f = Math.max(0, Math.min(1, 1 - par / Math.max(1, budget)));
    this.meterPar.style.left = `${f * 100}%`;
    this.meterPar.style.display = par >= budget ? 'none' : '';
  }

  private wireUndo(): void {
    const b = this.undoBtn;
    let down = false;
    let fired = false;
    const cancel = () => {
      clearTimeout(this.holdTimer);
      clearTimeout(this.holdNoteTimer);
      b.classList.remove('holding');
      this.holding = false;
    };
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = true;
      fired = false;
      this.holding = true;
      if (this.lastStrokes <= 0) return;
      b.classList.add('holding');
      this.holdNoteTimer = window.setTimeout(() => this.showNote('keep holding to clear all ink', 'a', 1600), 220);
      this.holdTimer = window.setTimeout(() => {
        fired = true;
        cancel();
        b.classList.add('cleared');
        setTimeout(() => b.classList.remove('cleared'), 500);
        haptic('medium');
        audio.ui('back');
        this.showNote('ink cleared', 'a', 1100);
        this.actions.clear();
      }, HOLD_MS);
    });
    const up = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const wasHolding = this.holding;
      cancel();
      if (fired || !wasHolding || e.type !== 'pointerup') return;
      this.hideNote();
      this.undo();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', (e) => {
      if (down && e.pointerType === 'mouse') {
        down = false;
        cancel();
      }
    });
    // Keyboard activation (Enter/Space on a focused button) arrives as a click with detail 0.
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail === 0) this.undo();
    });
  }

  undo(): void {
    if (this.lastStrokes <= 0) {
      audio.ui('deny');
      return;
    }
    audio.ui('back');
    this.actions.undo();
    if (!taughtHold) {
      taughtHold = true;
      this.showNote('tip: hold to clear all ink', 'a', 2600);
    }
  }

  private pressGo(): void {
    this.goBtn.classList.remove('pressed');
    void this.goBtn.offsetWidth;
    this.goBtn.classList.add('pressed');
    if (this.phase === 'plan') {
      audio.unlock();
      this.dismissIntro();
      this.actions.go();
    } else if (this.phase !== 'won') {
      audio.ui('back');
      this.actions.retry();
    }
  }

  /** Keyboard: space. */
  goOrRetry(): void {
    this.pressGo();
  }

  toggleHint(): void {
    if (this.hintOn) {
      this.setHint(false);
      return;
    }
    if (progress.hintAllowed(this.level.id)) {
      this.setHint(true);
      return;
    }
    this.askHint();
  }

  private setHint(on: boolean): void {
    this.hintOn = on;
    this.hintBtn.classList.toggle('on', on);
    this.hintBtn.classList.remove('nudge');
    this.hintBtn.setAttribute('aria-pressed', String(on));
    audio.ui(on ? 'open' : 'close');
    this.closeAsk();
    this.actions.hint(on);
  }

  private askHint(): void {
    if (this.ask) {
      this.closeAsk();
      return;
    }
    audio.ui('open');
    const yes = h('button.pill.warm', { type: 'button' }, 'Show me');
    const no = h('button.pill', { type: 'button' }, 'Not yet');
    yes.addEventListener('click', (e) => {
      e.stopPropagation();
      progress.allowHint(this.level.id);
      this.setHint(true);
    });
    no.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.ui('close');
      this.closeAsk();
    });
    this.ask = h('div.hint-ask', { role: 'dialog', 'aria-label': 'Reveal a hint?' }, h('p', 'Reveal a faint ghost of one way home?'), h('div.hint-ask-row', no, yes));
    this.el.append(this.ask);
    requestAnimationFrame(() => this.ask?.classList.add('show'));
    yes.focus({ preventScroll: true });
  }

  private closeAsk(): void {
    const a = this.ask;
    if (!a) return;
    this.ask = null;
    a.classList.remove('show');
    setTimeout(() => a.remove(), 250);
  }

  private showNote(text: string, side: 'a' | 'b', ms = 3200): void {
    clearTimeout(this.noteTimer);
    this.note.textContent = text;
    this.note.dataset.side = side;
    this.note.classList.add('show');
    this.noteTimer = window.setTimeout(() => this.hideNote(), ms);
  }

  private hideNote(): void {
    this.note.classList.remove('show');
  }

  // ───────────────────────────── public ─────────────────────────────

  /** Show the level title card (brief; never blocks drawing). */
  showIntro(): void {
    this.intro.classList.remove('show', 'hide');
    void this.intro.offsetWidth;
    this.intro.classList.add('show');
    clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => this.dismissIntro(), 2600);
  }

  dismissIntro(): void {
    clearTimeout(this.introTimer);
    if (this.intro.classList.contains('show')) this.intro.classList.add('hide');
  }

  /** HUD entrance (after a screen transition). */
  enter(): void {
    this.el.classList.remove('enter');
    void this.el.offsetWidth;
    this.el.classList.add('enter');
  }

  setPaused(p: boolean): void {
    this.el.classList.toggle('paused', p);
    if (p) this.closeAsk();
  }

  selectInk(t: InkType): void {
    if (!this.level.ink.types.includes(t)) return;
    this.active = t;
    const col = INK_COLORS[t];
    this.el.style.setProperty('--ink-core', col.core);
    this.el.style.setProperty('--ink-halo', col.halo);
    const i = this.level.ink.types.indexOf(t);
    this.inks?.style.setProperty('--sel', String(i));
    for (const [k, b] of this.slots) {
      b.classList.toggle('active', k === t);
      b.setAttribute('aria-checked', String(k === t));
    }
    this.inkLabel.textContent = INK_LABEL[t];
    this.inkLabel.classList.remove('flash');
    void this.inkLabel.offsetWidth;
    this.inkLabel.classList.add('flash');
  }

  setPhase(p: Phase): void {
    const prev = this.phase;
    this.phase = p;
    this.el.dataset.phase = p;
    const running = p === 'running' || p === 'dead';
    this.goBtn.setAttribute('aria-label', running ? 'Stop and retry (Space)' : 'Go (Space)');
    if (p === 'running') this.dismissIntro();
    if (p === 'plan' && prev !== 'plan' && this.level.autoStart) {
      // Restart the hurry countdown ring.
      this.goBtn.classList.remove('hurry');
      void this.goBtn.offsetWidth;
      this.goBtn.classList.add('hurry');
    }
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'spark': {
        const el = this.sparkEls[e.index];
        if (el) {
          el.classList.remove('got');
          void el.offsetWidth;
          el.classList.add('got');
        }
        this.el.querySelector('.hud-sparks')?.setAttribute('aria-label', `Sparks: ${e.count} of ${e.total}`);
        break;
      }
      case 'reset':
        this.sparkEls.forEach((el) => el.classList.remove('got'));
        break;
      case 'death':
        this.fails++;
        if (this.fails >= 3 && !this.hintOn && !this.nudged) {
          this.nudged = true;
          this.hintBtn.classList.add('nudge');
          setTimeout(() => this.showNote('stuck? a hint is here', 'b', 4200), 900);
        }
        break;
      case 'ink-dry':
        this.meter.classList.remove('dry');
        void this.meter.offsetWidth;
        this.meter.classList.add('dry');
        break;
      case 'inkpot':
        this.meter.classList.remove('refill');
        void this.meter.offsetWidth;
        this.meter.classList.add('refill');
        break;
    }
  }

  /** Per frame; cheap (only touches the DOM when numbers change). */
  update(sim: Simulation): void {
    const left = Math.round(sim.inkLeft);
    const budget = Math.round(sim.inkBudget);
    if (budget !== this.lastBudget) {
      this.lastBudget = budget;
      this.placePar(this.level.ink.par, budget);
      this.meter.setAttribute('aria-valuemax', String(budget));
      this.lastInk = -1;
    }
    if (left !== this.lastInk) {
      this.lastInk = left;
      const frac = Math.max(0, Math.min(1, sim.inkLeft / Math.max(1, sim.inkBudget)));
      this.meter.style.setProperty('--frac', frac.toFixed(4));
      this.meter.setAttribute('aria-valuenow', String(left));
      this.el.classList.toggle('over-par', sim.inkUsed > this.level.ink.par + 0.5);
      this.el.classList.toggle('empty-ink', frac <= 0.001);
    }
    const n = sim.strokes.length;
    if (n !== this.lastStrokes) {
      this.lastStrokes = n;
      this.undoBtn.classList.toggle('empty', n === 0);
    }
  }
}

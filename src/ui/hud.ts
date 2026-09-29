import type { InkType, LevelDef, SimEvent } from '../core/types';
import { audio } from '../audio/audio';
import { INK_COLORS } from '../render/palettes';
import type { Phase, Simulation } from '../sim/simulation';
import { h, svg } from './dom';
import { ICONS, type IconName } from './icons';

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

function iconBtn(name: IconName, label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button.hud-btn', { class: cls, 'aria-label': label, title: label, type: 'button' }, svg(ICONS[name]));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/**
 * In-level heads-up display. Lives in the gutters beside the level and along its top edge.
 * Positioned with CSS variables set by the app layout (--lvl-x/y/w/h, --safe-*).
 */
export class Hud {
  readonly el: HTMLElement;
  private meterFill: HTMLElement;
  private meterNum: HTMLElement;
  private meterPar: HTMLElement;
  private goBtn: HTMLButtonElement;
  private hintBtn: HTMLButtonElement;
  private swatches = new Map<InkType, HTMLButtonElement>();
  private sparkEls: HTMLElement[] = [];
  private hintOn = false;
  private lastInk = -1;
  private phase: Phase = 'plan';
  private fails = 0;

  constructor(
    private level: LevelDef,
    actions: HudActions,
  ) {
    const { budget, par } = level.ink;
    this.meterFill = h('div.meter-fill');
    this.meterPar = h('div.meter-par', { style: { left: `${(1 - par / budget) * 100}%` }, title: 'par' });
    this.meterNum = h('div.meter-num', String(budget));
    const meter = h('div.meter', { role: 'meter', 'aria-label': 'Ink remaining' }, h('div.meter-track'), this.meterFill, this.meterPar, this.meterNum);

    const title = h('div.hud-title', h('span.hud-id', level.id), h('span.hud-name', level.name));

    const sparks = h('div.hud-sparks', { 'aria-label': 'Sparks' });
    for (let i = 0; i < level.sparks.length; i++) {
      const s = h('span.hud-spark', svg(ICONS.spark));
      this.sparkEls.push(s);
      sparks.append(s);
    }

    const left = h('div.gutter.gutter-a');
    for (const t of level.ink.types) {
      const col = INK_COLORS[t];
      const b = h(
        'button.swatch',
        { type: 'button', 'aria-label': `${INK_LABEL[t]} ink`, title: `${INK_LABEL[t]} ink`, style: { '--ink-core': col.core, '--ink-halo': col.halo } as Record<string, string> },
        h('span.swatch-dot'),
        h('span.swatch-label', INK_LABEL[t]),
      );
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectInk(t);
        audio.ui('select');
        actions.ink(t);
      });
      this.swatches.set(t, b);
      left.append(b);
    }
    left.append(h('div.gutter-sep'));
    left.append(
      iconBtn('undo', 'Undo stroke', 'undo', () => {
        audio.ui('back');
        actions.undo();
      }),
    );
    this.hintBtn = iconBtn('hint', 'Show hint', 'hint', () => {
      this.hintOn = !this.hintOn;
      this.hintBtn.classList.toggle('on', this.hintOn);
      this.hintBtn.classList.remove('nudge');
      audio.ui(this.hintOn ? 'open' : 'close');
      actions.hint(this.hintOn);
    });
    left.append(this.hintBtn);

    this.goBtn = h('button.go-btn', { type: 'button', 'aria-label': 'Go' }, svg(ICONS.go), h('span.go-label', 'Go'));
    this.goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.phase === 'plan') actions.go();
      else actions.retry();
    });
    const right = h(
      'div.gutter.gutter-b',
      iconBtn('pause', 'Pause', 'pause', () => {
        audio.ui('open');
        actions.pause();
      }),
      h('div.gutter-spacer'),
      this.goBtn,
      h('div.gutter-spacer'),
      iconBtn('clear', 'Clear all ink', 'clear', () => {
        audio.ui('back');
        actions.clear();
      }),
    );

    this.el = h('div.hud', title, meter, sparks, left, right);
    this.selectInk(level.ink.types[0]);
    if (level.ink.types.length === 1) this.el.classList.add('single-ink');
  }

  selectInk(t: InkType): void {
    for (const [k, b] of this.swatches) b.classList.toggle('active', k === t);
  }

  setPhase(p: Phase): void {
    this.phase = p;
    this.el.dataset.phase = p;
    const running = p !== 'plan';
    this.goBtn.replaceChildren(svg(running ? ICONS.retry : ICONS.go), h('span.go-label', running ? 'Retry' : 'Go'));
    this.goBtn.setAttribute('aria-label', running ? 'Stop and retry' : 'Go');
    if (p === 'plan') this.sparkEls.forEach((s) => s.classList.remove('got'));
  }

  onEvent(e: SimEvent): void {
    if (e.type === 'spark') {
      const el = this.sparkEls[e.index];
      if (el) el.classList.add('got');
    } else if (e.type === 'death') {
      this.fails++;
      if (this.fails >= 3 && !this.hintOn) this.hintBtn.classList.add('nudge');
    } else if (e.type === 'ink-dry') {
      this.el.querySelector('.meter')?.classList.remove('dry');
      void (this.el.querySelector('.meter') as HTMLElement | null)?.offsetWidth;
      this.el.querySelector('.meter')?.classList.add('dry');
    }
  }

  update(sim: Simulation): void {
    const left = Math.round(sim.inkLeft);
    if (left !== this.lastInk) {
      this.lastInk = left;
      const frac = Math.max(0, Math.min(1, sim.inkLeft / Math.max(1, sim.inkBudget)));
      this.meterFill.style.transform = `scaleX(${frac})`;
      this.meterNum.textContent = String(left);
      this.el.classList.toggle('over-par', sim.inkUsed > this.level.ink.par + 0.5);
    }
  }
}

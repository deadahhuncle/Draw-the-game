// Overlay cards: pause, settings, confirm, level complete, world complete.
import type { LevelDef, WorldDef } from '../core/types';
import { audio } from '../audio/audio';
import type { RecordResult } from '../game/progress';
import { progress } from '../game/progress';
import { settings, type Settings } from '../game/settings';
import type { WinInfo } from '../game/session';
import { levelTime, ROMAN, worldHour } from './clock';
import { h, svg } from './dom';
import { ICONS, SPARK_PATH, type IconName } from './icons';

const starSvg = (cls = '') => svg(`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK_PATH}"/></svg>`);

export function btn(label: string, icon: IconName | null, onClick: () => void, cls = '', sound: 'tap' | 'back' | 'open' | 'close' = 'tap'): HTMLButtonElement {
  const b = h('button.btn', { type: 'button', class: cls }, icon ? svg(ICONS[icon]) : null, h('span', label));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.ui(sound);
    onClick();
  });
  return b;
}

// ───────────────────────────── settings controls ─────────────────────────────

function slider(label: string, icon: IconName, key: 'music' | 'sfx'): HTMLElement {
  const input = h('input.range', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': `${label} volume` });
  const val = h('span.set-val');
  const sync = () => {
    const v = Math.round(settings.get()[key] * 100);
    input.value = String(v);
    input.style.setProperty('--v', `${v}%`);
    val.textContent = v === 0 ? 'off' : String(v);
  };
  sync();
  input.addEventListener('input', () => {
    settings.set({ [key]: Number(input.value) / 100 } as Partial<Settings>);
    sync();
  });
  input.addEventListener('change', () => audio.ui('select'));
  input.addEventListener('click', (e) => e.stopPropagation());
  return h('label.set-row.set-slider', svg(ICONS[icon]), h('span.set-name', label), input, val);
}

function toggle(label: string, icon: IconName, key: 'haptics' | 'leftHanded' | 'reducedMotion', sub?: string): HTMLElement {
  const sw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': label });
  const sync = () => sw.setAttribute('aria-checked', String(!!settings.get()[key]));
  sync();
  const row = h('div.set-row.set-toggle', svg(ICONS[icon]), h('span.set-name', label, sub ? h('small', sub) : null), sw);
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    settings.set({ [key]: !settings.get()[key] } as Partial<Settings>);
    sync();
    audio.ui('select');
  });
  return row;
}

export function settingsControls(): HTMLElement {
  return h(
    'div.settings',
    slider('Music', 'music', 'music'),
    slider('Sound', 'sound', 'sfx'),
    toggle('Haptics', 'vibrate', 'haptics'),
    toggle('Left-handed', 'hand', 'leftHanded', 'mirror the controls'),
    toggle('Reduced motion', 'motion', 'reducedMotion'),
  );
}

// ───────────────────────────── pause ─────────────────────────────

export interface PauseCtx {
  level: LevelDef;
  world: WorldDef;
  onResume(): void;
  onRestart(): void;
  onJourney(): void;
}

export function pauseSheet(c: PauseCtx): HTMLElement {
  return h(
    'div.sheet.pause',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
    h(
      'div.sheet-col.sheet-main',
      h('p.kicker', h('span', 'paused'), h('i', '·'), h('span', levelTime(c.level, c.world))),
      h('h2', c.level.name),
      h('p.sheet-sub', `${c.world.name} · ${c.level.id}`),
      h(
        'div.sheet-stack',
        btn('Resume', 'go', c.onResume, 'primary wide', 'close'),
        btn('Restart level', 'retry', c.onRestart, 'wide'),
        btn('Journey', 'journey', c.onJourney, 'wide', 'back'),
      ),
    ),
    h('div.sheet-rule'),
    h('div.sheet-col', settingsControls()),
  );
}

// ───────────────────────────── settings (from title / journey) ─────────────────────────────

export interface SettingsCtx {
  onClose(): void;
  onReset(): void;
  onCredits(): void;
}

export function settingsSheet(c: SettingsCtx): HTMLElement {
  const close = h('button.hud-btn.sheet-close', { type: 'button', 'aria-label': 'Close settings' }, svg(ICONS.close));
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.ui('close');
    c.onClose();
  });
  const stars = progress.totalStars();
  return h(
    'div.sheet.settings-sheet',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' },
    close,
    h(
      'div.sheet-col.sheet-main',
      h('p.kicker', 'settings'),
      h('h2', 'The night is yours'),
      h('p.sheet-sub', `${stars} of ${progress.maxStars()} stars gathered`),
      h('div.sheet-stack', btn('Credits', 'credits', c.onCredits, 'wide'), btn('Reset progress', 'reset', c.onReset, 'wide danger')),
    ),
    h('div.sheet-rule'),
    h('div.sheet-col', settingsControls()),
  );
}

// ───────────────────────────── confirm ─────────────────────────────

export function confirmSheet(title: string, body: string, yes: string, onYes: () => void, onNo: () => void, danger = false): HTMLElement {
  return h(
    'div.sheet.confirm',
    { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', title),
    h('p.confirm-body', body),
    h('div.sheet-actions', btn('Keep it', null, onNo, '', 'close'), btn(yes, null, onYes, danger ? 'danger' : 'primary', 'back')),
  );
}

// ───────────────────────────── level complete ─────────────────────────────

export interface CompleteCtx {
  level: LevelDef;
  world: WorldDef;
  info: WinInfo;
  rec: RecordResult;
  nextLabel: string;
  onNext(): void;
  onReplay(): void;
  onJourney(): void;
}

const STAR_T0 = 380;
const STAR_GAP = 520;

export function completeCard(c: CompleteCtx): { el: HTMLElement; skip(): void } {
  const { info, rec, level } = c;
  const timers: number[] = [];
  // Star 1 — the lamp.
  const s1 = h('div.cstar', { class: rec.stars[0] ? 'on' : '' }, h('div.cstar-mark', starSvg('cs-ghost'), starSvg('cs-lit'), h('i.cs-burst')), h('span.cstar-name', 'Lit'), h('span.cstar-sub', 'Wick is home'));
  // Star 2 — sparks x/n (dots fill in one by one).
  const dots = h('span.cs-dots');
  for (let i = 0; i < info.totalSparks; i++) dots.append(h('i', { class: i < info.sparks ? 'got' : '', style: { '--j': String(i) } as Record<string, string> }));
  const s2 = h('div.cstar', { class: rec.stars[1] ? 'on' : '' }, h('div.cstar-mark', starSvg('cs-ghost'), starSvg('cs-lit'), h('i.cs-burst')), h('span.cstar-name', 'Sparks'), h('span.cstar-sub', dots, h('b', `${info.sparks}/${info.totalSparks}`)));
  // Star 3 — frugal: a tiny ink bar with the par tick.
  const used = Math.round(info.ink);
  const budget = Math.max(1, info.budget);
  const bar = h(
    'span.cs-bar',
    { style: { '--used': String(Math.min(1, info.ink / budget)), '--par': String(Math.min(1, info.par / budget)) } as Record<string, string> },
    h('i.cs-bar-fill'),
    h('i.cs-bar-par'),
  );
  const s3 = h(
    'div.cstar',
    { class: rec.stars[2] ? 'on' : 'over' },
    h('div.cstar-mark', starSvg('cs-ghost'), starSvg('cs-lit'), h('i.cs-burst')),
    h('span.cstar-name', 'Frugal'),
    h('span.cstar-sub', bar, h('b', `${used} / ${info.par}`)),
  );
  const stars = [s1, s2, s3];
  stars.forEach((st, i) => {
    st.style.setProperty('--d', `${STAR_T0 + i * STAR_GAP}ms`);
    if (rec.fresh[i] && !rec.firstClear) st.append(h('span.cs-new', 'new'));
    st.setAttribute('aria-label', `${['Lit', 'Sparks', 'Frugal'][i]}: ${rec.stars[i] ? 'earned' : 'not earned'}`);
  });
  const bestTxt = rec.newBestInk ? `new best — ${used} ink (was ${Math.round(rec.prevBestInk ?? 0)})` : rec.firstClear ? '' : rec.best.every(Boolean) ? 'every star, gathered' : '';

  const actions = h(
    'div.sheet-actions',
    btn('Replay', 'retry', c.onReplay),
    btn('Journey', 'journey', c.onJourney, '', 'back'),
    btn(c.nextLabel, 'next', c.onNext, 'primary'),
  );
  const el = h(
    'div.sheet.complete',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${level.name} — lamp lit` },
    h('p.kicker', h('span', c.world.name), h('i', '·'), h('span', level.id), h('i', '·'), h('span', levelTime(level, c.world))),
    h('h2', level.name),
    h('div.cstars', ...stars),
    h('p.complete-best', { class: bestTxt ? '' : 'empty' }, bestTxt || ' '),
    actions,
  );
  rec.stars.forEach((on, i) => {
    timers.push(window.setTimeout(() => audio.ui(on ? 'star' : 'tap'), STAR_T0 + i * STAR_GAP + 180));
  });
  const skip = () => {
    if (el.classList.contains('instant')) return;
    el.classList.add('instant');
    timers.forEach(clearTimeout);
  };
  el.addEventListener('click', skip);
  return { el, skip };
}

// ───────────────────────────── world complete ─────────────────────────────

export interface WorldCtx {
  world: WorldDef;
  next: WorldDef | undefined;
  onContinue(): void;
}

export function worldCard(c: WorldCtx): HTMLElement {
  const { world } = c;
  const st = progress.worldStars(world.index);
  const lamps = h('div.wc-lamps');
  world.levels.forEach((l, i) => {
    const got = progress.get(l.id).stars.filter(Boolean).length;
    lamps.append(h('span.wc-lamp', { style: { '--i': String(i) } as Record<string, string>, title: `${l.id} · ${got}/3` }, svg(ICONS.lamp)));
  });
  const nextLine = c.next ? `The night deepens. ${c.next.name} lies ahead.` : 'The sky is paling. Dawn is close.';
  const el = h(
    'div.world-card',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${world.name} — every lamp lit`, 'data-world': world.key },
    h('p.kicker', h('span', ROMAN[world.index] ?? String(world.index)), h('i', '·'), h('span', worldHour(world))),
    h('h2', world.name),
    h('p.wc-sub', 'every lamp lit'),
    lamps,
    h('p.wc-stars', starSvg(), h('span', `${st.got} / ${st.max}`)),
    h('p.wc-next', nextLine),
    btn(c.next ? 'Onward' : 'Toward dawn', 'next', c.onContinue, 'primary'),
  );
  el.addEventListener('click', () => el.classList.add('instant'));
  return el;
}

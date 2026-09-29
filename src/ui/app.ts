import type { LevelDef } from '../core/types';
import { audio } from '../audio/audio';
import { progress } from '../game/progress';
import { Session, type WinInfo } from '../game/session';
import { settings } from '../game/settings';
import { ALL_LEVELS, WORLDS, getLevel, nextLevel, worldOf } from '../levels';
import type { Insets } from '../render/view';
import { clear, h, svg } from './dom';
import { Hud } from './hud';
import { ICONS } from './icons';

export interface DebugFlags {
  level?: string;
  solve: boolean;
  go: boolean;
  unlock: boolean;
}

/**
 * The app shell: owns the canvas, the current screen (title / journey / play) and overlays
 * (pause, level complete). Layout = full-bleed canvas + HUD in safe-area-aware gutters.
 */
export class App {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private layer: HTMLElement;
  private overlay: HTMLElement;
  private probe: HTMLElement;
  private session: Session | null = null;
  private hud: Hud | null = null;
  private screen: 'title' | 'journey' | 'play' = 'title';

  constructor(root: HTMLElement, private flags: DebugFlags) {
    this.root = root;
    this.canvas = h('canvas.stage', { 'aria-label': 'Inklight play area' });
    this.layer = h('div.layer');
    this.overlay = h('div.overlay');
    this.probe = h('div.safe-probe');
    root.append(this.canvas, this.layer, this.overlay, this.probe);
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden && this.screen === 'play' && this.session && !this.session.paused) this.pause();
    });
    window.addEventListener('keydown', (e) => this.key(e));
    settings.subscribe((s) => {
      audio.setVolumes(s.music, s.sfx);
      root.classList.toggle('left-handed', s.leftHanded);
      if (this.session) this.session.renderer.opts.reducedMotion = s.reducedMotion;
      this.layout();
    });
    const s = settings.get();
    audio.setVolumes(s.music, s.sfx);
    root.classList.toggle('left-handed', s.leftHanded);
    if (flags.unlock) progress.setUnlockAll(true);
  }

  start(): void {
    const lvl = this.flags.level ? getLevel(this.flags.level) : undefined;
    if (lvl) this.play(lvl);
    else this.showTitle();
  }

  // ───────────────────────────── layout ─────────────────────────────

  private insets(): Insets {
    const cs = getComputedStyle(this.probe);
    const px = (v: string) => parseFloat(v) || 0;
    const sl = px(cs.paddingLeft);
    const sr = px(cs.paddingRight);
    const st = px(cs.paddingTop);
    const sb = px(cs.paddingBottom);
    const w = window.innerWidth;
    const gutter = Math.round(Math.min(96, Math.max(60, w * 0.075)));
    return { left: sl + gutter, right: sr + gutter, top: st + 6, bottom: sb + 6 };
  }

  layout(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ins = this.insets();
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    if (this.session) {
      this.session.resize(w, hgt, dpr, this.screen === 'play' ? ins : { left: 0, right: 0, top: 0, bottom: 0 });
      const r = this.session.renderer.view.levelRect;
      const st = this.root.style;
      st.setProperty('--lvl-x', `${r.x}px`);
      st.setProperty('--lvl-y', `${r.y}px`);
      st.setProperty('--lvl-w', `${r.w}px`);
      st.setProperty('--lvl-h', `${r.h}px`);
      st.setProperty('--gutter-l', `${ins.left}px`);
      st.setProperty('--gutter-r', `${ins.right}px`);
    }
    this.root.classList.toggle('portrait', hgt > w);
  }

  // ───────────────────────────── screens ─────────────────────────────

  private endSession(): void {
    this.session?.destroy();
    this.session = null;
    this.hud = null;
  }

  /** A calm backdrop: the first level of a world, idling (no HUD). */
  private backdrop(level: LevelDef): void {
    this.endSession();
    this.session = new Session(this.canvas, level, worldOf(level));
    this.session.input.enabled = false;
    this.session.renderer.backdrop = true;
    this.layout();
    this.session.start();
    audio.setMode('menu');
  }

  showTitle(): void {
    this.screen = 'title';
    this.root.dataset.screen = 'title';
    this.backdrop(ALL_LEVELS[0]);
    clear(this.overlay);
    clear(this.layer);
    const begin = h('button.btn.primary', { type: 'button' }, progress.frontier() === ALL_LEVELS[0] ? 'Begin' : 'Continue');
    begin.addEventListener('click', () => {
      audio.unlock();
      audio.ui('open');
      this.showJourney();
    });
    this.layer.append(
      h(
        'div.title-screen',
        h('h1.logo', 'Ink', h('span.logo-light', 'light')),
        h('p.tagline', 'draw the way home before dawn'),
        begin,
      ),
    );
    this.layout();
  }

  showJourney(): void {
    this.screen = 'journey';
    this.root.dataset.screen = 'journey';
    const front = progress.frontier();
    this.backdrop(WORLDS[worldOf(front).index - 1].levels[0]);
    clear(this.overlay);
    clear(this.layer);
    const worlds = h('div.journey-worlds');
    for (const w of WORLDS) {
      const unlocked = progress.worldUnlocked(w.index);
      const stars = progress.worldStars(w.index);
      const row = h('div.journey-levels');
      for (const l of w.levels) {
        const rec = progress.get(l.id);
        const open = progress.isUnlocked(l);
        const b = h(
          'button.node',
          { type: 'button', class: `${rec.done ? 'done' : ''} ${open ? '' : 'locked'} ${l === front ? 'frontier' : ''}`, 'aria-label': `Level ${l.id} ${l.name}`, disabled: !open },
          h('span.node-lamp', svg(ICONS.lamp)),
          h('span.node-id', l.id.split('-')[1]),
          h('span.node-stars', ...rec.stars.map((s) => h('i', { class: s ? 'on' : '' }))),
        );
        b.addEventListener('click', () => {
          audio.ui('tap');
          this.play(l);
        });
        row.append(b);
      }
      worlds.append(
        h(
          'section.journey-world',
          { class: unlocked ? '' : 'locked', 'data-world': w.key },
          h('header', h('span.world-num', `${w.index}`), h('h2', w.name), h('span.world-sub', w.subtitle), h('span.world-stars', `${stars.got}/${stars.max}`)),
          row,
        ),
      );
    }
    const back = h('button.hud-btn.back', { type: 'button', 'aria-label': 'Back' }, svg(ICONS.home));
    back.addEventListener('click', () => {
      audio.ui('back');
      this.showTitle();
    });
    this.layer.append(h('div.journey', back, h('h1.journey-title', 'The Journey'), worlds));
    this.layout();
    requestAnimationFrame(() => this.layer.querySelector('.frontier')?.scrollIntoView({ block: 'center', inline: 'center' }));
  }

  play(level: LevelDef): void {
    this.screen = 'play';
    this.root.dataset.screen = 'play';
    this.endSession();
    clear(this.overlay);
    clear(this.layer);
    progress.setLastLevel(level.id);
    const world = worldOf(level);
    const session = new Session(this.canvas, level, world, {
      onPhase: (p) => this.hud?.setPhase(p),
      onEvent: (e) => this.hud?.onEvent(e),
      onFrame: (sim) => this.hud?.update(sim),
      onWin: (info) => this.complete(level, info),
    });
    this.session = session;
    const hud = new Hud(level, {
      go: () => {
        audio.unlock();
        session.go();
      },
      retry: () => session.retry(),
      undo: () => session.undo(),
      clear: () => session.clear(),
      hint: (on) => session.showHint(on),
      ink: (t) => session.setInk(t),
      pause: () => this.pause(),
    });
    this.hud = hud;
    session.setInk(level.ink.types[0]);
    this.layer.append(hud.el, h('div.level-card', h('span.level-card-id', `${world.name} · ${level.id}`), h('span.level-card-name', level.name)));
    this.layout();
    session.start();
    if (this.flags.solve) session.autoSolve();
    if (this.flags.go) setTimeout(() => session.go(), 300);
  }

  private pause(): void {
    const s = this.session;
    if (!s || this.screen !== 'play') return;
    s.setPaused(true);
    audio.setMode('menu');
    clear(this.overlay);
    const resume = () => {
      audio.ui('close');
      clear(this.overlay);
      this.overlay.classList.remove('show');
      s.setPaused(false);
      audio.setMode(s.sim.phase === 'running' ? 'run' : 'plan');
    };
    const toggle = (label: string, icon: keyof typeof ICONS, get: () => boolean, set: (v: boolean) => void) => {
      const b = h('button.toggle', { type: 'button', 'aria-pressed': String(get()) }, svg(ICONS[icon]), h('span', label));
      b.addEventListener('click', () => {
        set(!get());
        b.setAttribute('aria-pressed', String(get()));
        audio.ui('select');
      });
      return b;
    };
    const st = settings;
    const card = h(
      'div.sheet',
      h('h2', 'Paused'),
      h('p.sheet-sub', `${s.level.id} · ${s.level.name}`),
      h(
        'div.sheet-actions',
        this.btn('Resume', 'go', resume, 'primary'),
        this.btn('Restart', 'retry', () => {
          resume();
          s.retry();
          s.clear();
        }),
        this.btn('Journey', 'map', () => {
          this.overlay.classList.remove('show');
          this.showJourney();
        }),
      ),
      h(
        'div.sheet-toggles',
        toggle('Music', 'music', () => st.get().music > 0, (v) => st.set({ music: v ? 0.7 : 0 })),
        toggle('Sound', 'sound', () => st.get().sfx > 0, (v) => st.set({ sfx: v ? 0.85 : 0 })),
        toggle('Haptics', 'vibrate', () => st.get().haptics, (v) => st.set({ haptics: v })),
        toggle('Left-handed', 'hand', () => st.get().leftHanded, (v) => st.set({ leftHanded: v })),
      ),
    );
    this.overlay.append(card);
    this.overlay.classList.add('show');
  }

  private complete(level: LevelDef, info: WinInfo): void {
    const rec = progress.record(level.id, { sparks: info.sparks, totalSparks: info.totalSparks, ink: info.ink, par: info.par });
    const next = nextLevel(level);
    clear(this.overlay);
    const labels = ['Lamp lit', `Sparks ${info.sparks}/${info.totalSparks}`, `Ink ${Math.round(info.ink)} / par ${info.par}`];
    const stars = h(
      'div.stars',
      ...rec.stars.map((on, i) => h('div.star', { class: on ? 'on' : '', style: { '--i': String(i) } as Record<string, string> }, svg(ICONS.spark), h('span', labels[i]))),
    );
    const card = h(
      'div.sheet.complete',
      h('p.sheet-kicker', `${level.id}`),
      h('h2', level.name),
      stars,
      h(
        'div.sheet-actions',
        this.btn('Replay', 'retry', () => {
          this.overlay.classList.remove('show');
          clear(this.overlay);
          this.session?.retry();
        }),
        this.btn('Journey', 'map', () => {
          this.overlay.classList.remove('show');
          this.showJourney();
        }),
        next
          ? this.btn('Next', 'next', () => {
              this.overlay.classList.remove('show');
              this.play(next);
            }, 'primary')
          : this.btn('Dawn', 'next', () => {
              this.overlay.classList.remove('show');
              this.showJourney();
            }, 'primary'),
      ),
    );
    this.overlay.append(card);
    this.overlay.classList.add('show');
    rec.stars.forEach((on, i) => {
      if (on) setTimeout(() => audio.ui('star'), 350 + i * 260);
    });
  }

  private btn(label: string, icon: keyof typeof ICONS, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = h('button.btn', { type: 'button', class: cls }, svg(ICONS[icon]), h('span', label));
    b.addEventListener('click', () => {
      audio.ui('tap');
      onClick();
    });
    return b;
  }

  private key(e: KeyboardEvent): void {
    if (this.screen !== 'play' || !this.session) return;
    const s = this.session;
    if (e.key === 'Escape') this.overlay.classList.contains('show') ? null : this.pause();
    if (this.overlay.classList.contains('show')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      s.sim.phase === 'plan' ? s.go() : s.retry();
    } else if (e.key === 'z' || e.key === 'Backspace') s.undo();
    else if (e.key === 'r') s.retry();
    else if (e.key >= '1' && e.key <= '3') {
      const t = s.level.ink.types[parseInt(e.key, 10) - 1];
      if (t) {
        s.setInk(t);
        this.hud?.selectInk(t);
      }
    }
  }
}

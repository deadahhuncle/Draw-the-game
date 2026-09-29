import type { InkType, LevelDef, WorldDef } from '../core/types';
import { audio } from '../audio/audio';
import { progress } from '../game/progress';
import { Session, type WinInfo } from '../game/session';
import { settings } from '../game/settings';
import { ALL_LEVELS, WORLDS, getLevel, nextLevel, worldOf } from '../levels';
import type { Insets } from '../render/view';
import type { Phase } from '../sim/simulation';
import { clear, h, svg } from './dom';
import { Ending } from './ending';
import { Hud } from './hud';
import { ICONS } from './icons';
import { Journey } from './journey';
import { completeCard, confirmSheet, pauseSheet, settingsSheet, worldCard } from './sheets';
import { TitleScreen, playIntro, titleCamera, titleDropY, titleLevel } from './title';
import { irisBusy, irisClose, irisOpen, setTransitionReducedMotion } from './transition';

export interface DebugFlags {
  level?: string;
  solve: boolean;
  go: boolean;
  unlock: boolean;
  /** Debug: open a screen directly — journey | settings | ending | credits | complete | world. */
  screen?: string;
  /** Debug: pretend the first N levels are done. */
  done?: number;
  /** Debug: Wick last stood at this level on the map (to replay the arrival walk). */
  from?: string;
}

type Screen = 'title' | 'journey' | 'play' | 'ending';
type OverlayKind = 'pause' | 'complete' | 'world' | 'settings' | 'confirm' | null;
type Pt = { x: number; y: number };

const ZERO: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * The app shell: owns the canvas, the current screen (title / journey / play / ending) and the
 * overlays (pause, level complete, world complete, settings). Layout = full-bleed canvas with the
 * level fitted between safe-area-aware HUD gutters; screens change through an ink iris anchored on Wick.
 */
export class App {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private layer: HTMLElement;
  private overlay: HTMLElement;
  private probe: HTMLElement;
  private rotate: HTMLElement;
  private session: Session | null = null;
  private hud: Hud | null = null;
  private title: TitleScreen | null = null;
  private journey: Journey | null = null;
  private ending: Ending | null = null;
  private screen: Screen = 'title';
  private overlayKind: OverlayKind = null;
  private overlayBack: (() => void) | null = null;
  private completeSkip: (() => void) | null = null;
  private completeNext: (() => void) | null = null;
  private completeReplay: (() => void) | null = null;
  private busy = false;
  private layoutRaf = 0;

  constructor(root: HTMLElement, private flags: DebugFlags) {
    this.root = root;
    this.canvas = h('canvas.stage', { 'aria-label': 'Inklight play area' });
    this.layer = h('div.layer');
    this.overlay = h('div.overlay');
    this.probe = h('div.safe-probe');
    this.rotate = h(
      'div.rotate',
      { 'aria-live': 'polite' },
      h('div.rotate-phone', svg(ICONS.phone)),
      h('p.rotate-line', 'Turn your phone sideways —', h('br'), 'the night is wide.'),
      h('p.rotate-sub', 'Inklight plays in landscape'),
    );
    root.append(this.canvas, this.layer, this.overlay, this.rotate, this.probe);
    const relayout = () => {
      cancelAnimationFrame(this.layoutRaf);
      this.layoutRaf = requestAnimationFrame(() => this.layout(true));
    };
    window.addEventListener('resize', relayout);
    window.visualViewport?.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden && this.screen === 'play' && this.session && !this.session.paused && !this.overlayKind) this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) root.classList.add('kb');
      this.key(e);
    });
    window.addEventListener('pointerdown', () => root.classList.remove('kb'), { capture: true });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && this.overlayBack) this.overlayBack();
    });
    settings.subscribe(() => this.applySettings());
    this.applySettings();
    if (flags.unlock) progress.setUnlockAll(true);
    if (flags.done !== undefined) progress.debugComplete(flags.done);
    if (flags.from) progress.setMapWick(flags.from);
  }

  start(): void {
    const lvl = this.flags.level ? getLevel(this.flags.level) : undefined;
    if (lvl) {
      this.play(lvl, null);
      return;
    }
    switch (this.flags.screen) {
      case 'journey':
        this.showJourney(null);
        return;
      case 'settings':
        this.showTitle(true, null);
        this.openSettings();
        return;
      case 'ending':
      case 'credits':
        this.showEnding(this.flags.screen === 'credits', null);
        return;
      case 'world': {
        const w = WORLDS[0];
        this.play(w.levels[w.levels.length - 1], null);
        setTimeout(() => this.showWorldComplete(w, () => {}), 400);
        return;
      }
      case 'complete': {
        const l = ALL_LEVELS[0];
        this.play(l, null);
        setTimeout(() => this.complete(l, { sparks: 2, totalSparks: l.sparks.length, ink: l.ink.par * 0.9, par: l.ink.par, budget: l.ink.budget }), 400);
        return;
      }
    }
    this.showTitle(false, null);
  }

  private applySettings(): void {
    const s = settings.get();
    audio.setVolumes(s.music, s.sfx);
    const handChanged = this.root.classList.contains('left-handed') !== s.leftHanded;
    this.root.classList.toggle('left-handed', s.leftHanded);
    document.documentElement.classList.toggle('reduce-motion', s.reducedMotion);
    setTransitionReducedMotion(s.reducedMotion);
    if (this.session) this.session.renderer.opts.reducedMotion = s.reducedMotion;
    if (handChanged) this.layout(false);
  }

  // ───────────────────────────── layout ─────────────────────────────

  private safe(): Insets {
    const cs = getComputedStyle(this.probe);
    const px = (v: string) => parseFloat(v) || 0;
    return { left: px(cs.paddingLeft), right: px(cs.paddingRight), top: px(cs.paddingTop), bottom: px(cs.paddingBottom) };
  }

  private insets(): Insets {
    const sa = this.safe();
    const w = window.innerWidth;
    const gutter = Math.round(Math.min(96, Math.max(60, w * 0.075)));
    return { left: sa.left + gutter, right: sa.right + gutter, top: sa.top + 6, bottom: sa.bottom + 6 };
  }

  layout(rebuild = false): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const portrait = hgt > w;
    this.root.classList.toggle('portrait', portrait);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    if (this.session) {
      const ins = this.screen === 'play' ? this.insets() : this.screen === 'title' ? titleCamera(w, hgt) : ZERO;
      this.session.resize(w, hgt, dpr, ins);
      const r = this.session.renderer.view.levelRect;
      const st = this.root.style;
      st.setProperty('--lvl-x', `${r.x}px`);
      st.setProperty('--lvl-y', `${r.y}px`);
      st.setProperty('--lvl-w', `${r.w}px`);
      st.setProperty('--lvl-h', `${r.h}px`);
      st.setProperty('--space-l', `${Math.max(0, r.x)}px`);
      st.setProperty('--space-r', `${Math.max(0, w - r.x - r.w)}px`);
      st.setProperty('--meter-y', `${r.y >= 44 ? r.y - 26 : r.y + 12}px`);
    }
    this.title?.layout();
    if (rebuild) this.journey?.build();
    // Rotating to portrait mid-run: pause so Wick doesn't walk on unsupervised.
    if (portrait && this.screen === 'play' && this.session && !this.session.paused && !this.overlayKind && this.session.sim.phase === 'running') {
      this.pause();
    }
  }

  // ───────────────────────────── plumbing ─────────────────────────────

  private endSession(): void {
    this.session?.destroy();
    this.session = null;
    this.hud = null;
  }

  private teardown(): void {
    this.hideOverlay();
    this.title?.destroy();
    this.title = null;
    this.journey?.destroy();
    this.journey = null;
    this.ending?.destroy();
    this.ending = null;
    this.endSession();
    clear(this.layer);
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    this.root.dataset.screen = s;
  }

  /** Where Wick is on screen right now (the iris anchor). */
  private wickAnchor(): Pt {
    if (this.screen === 'title' && this.title) return this.title.wickScreen();
    if (this.screen === 'journey' && this.journey) return this.journey.wickScreen();
    if (this.session) {
      const w = this.session.sim.wick;
      return this.session.renderer.view.toScreen(w.x, w.y - 4);
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  /** Iris out of the current screen, run `build`, iris into the new one. */
  private async transition(from: Pt | (() => Pt) | null, build: () => void, to: () => Pt): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    try {
      if (from) await irisClose(from);
      try {
        build();
      } catch (e) {
        // Never leave the player behind a closed iris.
        console.error(e);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (from)
        await irisOpen(() => {
          try {
            return to();
          } catch {
            return center();
          }
        });
    } finally {
      this.busy = false;
    }
  }

  private showOverlay(kind: OverlayKind, el: HTMLElement, back: (() => void) | null): void {
    clear(this.overlay);
    this.overlay.append(el);
    this.overlayKind = kind;
    this.overlayBack = back;
    this.overlay.dataset.kind = kind ?? '';
    this.overlay.classList.add('show');
    this.root.classList.add('has-overlay');
    requestAnimationFrame(() => {
      const f = el.querySelector<HTMLElement>('.btn.primary') ?? el.querySelector<HTMLElement>('.btn, button');
      f?.focus({ preventScroll: true });
    });
  }

  private hideOverlay(): void {
    this.overlay.classList.remove('show');
    this.root.classList.remove('has-overlay');
    this.overlayKind = null;
    this.overlayBack = null;
    this.completeSkip = this.completeNext = this.completeReplay = null;
    clear(this.overlay);
  }

  // ───────────────────────────── title ─────────────────────────────

  private showTitle(quick: boolean, from: Pt | (() => Pt) | null): void {
    void this.transition(
      from,
      () => {
        this.teardown();
        this.setScreen('title');
        const w = window.innerWidth;
        const hh = window.innerHeight;
        const level = titleLevel(titleDropY(w, hh));
        const session = new Session(this.canvas, level, WORLDS[0], {
          onPhase: (p) => this.title?.onPhase(p),
        });
        session.input.enabled = false;
        session.renderer.backdrop = true;
        this.session = session;
        const front = progress.frontier();
        const cont = progress.started() ? `${front.id} · ${front.name}` : null;
        const title = new TitleScreen({
          session,
          quick: quick || settings.get().reducedMotion,
          continueLabel: cont,
          onBegin: () => this.begin(),
          onSettings: () => {
            audio.unlock();
            audio.ui('open');
            this.openSettings();
          },
        });
        this.title = title;
        this.layer.append(title.el);
        this.layout();
        session.start();
        title.start();
        audio.setMode('menu');
      },
      () => ({ x: window.innerWidth / 2, y: window.innerHeight * 0.45 }),
    );
  }

  private async begin(): Promise<void> {
    if (this.busy || this.overlayKind) return;
    audio.unlock();
    audio.ui('open');
    if (!progress.seenIntro && this.title) {
      this.busy = true;
      this.root.classList.add('intro-on');
      await playIntro(this.layer);
      this.root.classList.remove('intro-on');
      progress.markIntroSeen();
      this.busy = false;
    }
    this.showJourney(() => this.wickAnchor());
  }

  // ───────────────────────────── journey ─────────────────────────────

  private showJourney(from: Pt | (() => Pt) | null): void {
    let jr: Journey | null = null;
    void this.transition(
      from,
      () => {
        this.teardown();
        this.setScreen('journey');
        const front = progress.frontier();
        const mw = progress.mapWick;
        const mi = mw ? ALL_LEVELS.findIndex((l) => l.id === mw) : -1;
        const fi = ALL_LEVELS.indexOf(front);
        const arriveFrom = mi >= 0 && (mi < fi || (progress.allDone() && mi <= fi && progress.isDone(ALL_LEVELS[mi].id))) ? mw : null;
        jr = new Journey({
          arriveFrom,
          onBack: () => this.showTitle(true, () => this.wickAnchor()),
          onSettings: () => this.openSettings(),
          onPlay: (level, at) => this.openLevel(level, at),
        });
        this.journey = jr;
        this.layer.append(jr.el);
        jr.build();
        if (!arriveFrom) progress.setMapWick(front.id);
        audio.setWorld(worldOf(front).key);
        audio.setMode('menu');
      },
      () => this.journey?.wickScreen() ?? { x: 0, y: 0 },
    ).then(() => {
      if (jr && this.journey === jr) {
        void jr.arrive();
        if (this.root.classList.contains('kb')) jr.focusFrontier();
      }
    });
  }

  private openLevel(level: LevelDef, at: Pt): void {
    if (this.busy) {
      this.journey?.reopen();
      return;
    }
    audio.unlock();
    this.play(level, at);
  }

  // ───────────────────────────── play ─────────────────────────────

  play(level: LevelDef, from: Pt | (() => Pt) | null): void {
    void this.transition(
      from,
      () => {
        this.teardown();
        this.setScreen('play');
        this.startLevel(level);
      },
      () => this.wickAnchor(),
    ).then(() => {
      this.hud?.enter();
      this.hud?.showIntro();
    });
  }

  private startLevel(level: LevelDef): void {
    progress.setLastLevel(level.id);
    const world = worldOf(level);
    let hud: Hud | null = null;
    const session = new Session(this.canvas, level, world, {
      onPhase: (p: Phase) => hud?.setPhase(p),
      onEvent: (e) => hud?.onEvent(e),
      onFrame: (sim) => hud?.update(sim),
      onWin: (info) => this.complete(level, info),
    });
    this.session = session;
    hud = new Hud(level, world, {
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
    session.input.onStrokeStart = () => hud?.dismissIntro();
    session.setInk(level.ink.types[0]);
    this.layer.append(hud.el);
    this.layout();
    session.start();
    if (this.flags.solve) session.autoSolve();
    if (this.flags.go) setTimeout(() => session.go(), 300);
  }

  private setInk(t: InkType): void {
    if (!this.session || !this.session.level.ink.types.includes(t)) return;
    this.session.setInk(t);
    this.hud?.selectInk(t);
    audio.ui('select');
  }

  private pause(): void {
    const s = this.session;
    if (!s || this.screen !== 'play' || this.overlayKind) return;
    s.setPaused(true);
    this.hud?.setPaused(true);
    audio.setMode('menu');
    const world = worldOf(s.level);
    const resume = () => {
      this.hideOverlay();
      s.setPaused(false);
      this.hud?.setPaused(false);
      audio.setMode(s.sim.phase === 'running' ? 'run' : 'plan');
    };
    this.showOverlay(
      'pause',
      pauseSheet({
        level: s.level,
        world,
        onResume: resume,
        onRestart: () => {
          resume();
          s.retry();
          s.clear();
        },
        onJourney: () => {
          this.hideOverlay();
          this.showJourney(() => this.wickAnchor());
        },
      }),
      resume,
    );
  }

  private complete(level: LevelDef, info: WinInfo): void {
    const world = worldOf(level);
    const rec = progress.record(level.id, { sparks: info.sparks, totalSparks: info.totalSparks, ink: info.ink, par: info.par });
    const next = nextLevel(level);
    const lastOfWorld = world.levels[world.levels.length - 1] === level && WORLDS.includes(world);
    const celebrate = lastOfWorld && !progress.celebrated(world.key) && progress.worldDone(world.index);
    const finale = !next && WORLDS.includes(world) && progress.allDone();
    const goNext = () => {
      this.hideOverlay();
      const after = () => {
        if (finale) this.showEnding(false, () => this.wickAnchor());
        else if (next) this.play(next, () => this.wickAnchor());
        else this.showJourney(() => this.wickAnchor());
      };
      if (celebrate) this.showWorldComplete(world, after);
      else after();
    };
    const replay = () => {
      this.hideOverlay();
      this.session?.retry();
    };
    const card = completeCard({
      level,
      world,
      info,
      rec,
      nextLabel: finale ? 'Dawn' : next ? 'Next' : 'Journey',
      onNext: goNext,
      onReplay: replay,
      onJourney: () => {
        this.hideOverlay();
        if (celebrate) this.showWorldComplete(world, () => this.showJourney(() => this.wickAnchor()));
        else this.showJourney(() => this.wickAnchor());
      },
    });
    this.showOverlay('complete', card.el, null);
    this.completeSkip = card.skip;
    this.completeNext = goNext;
    this.completeReplay = replay;
  }

  private showWorldComplete(world: WorldDef, then: () => void): void {
    progress.markCelebrated(world.key);
    const idx = WORLDS.indexOf(world);
    audio.ui('unlock');
    this.showOverlay(
      'world',
      worldCard({
        world,
        next: WORLDS[idx + 1],
        onContinue: () => {
          this.hideOverlay();
          then();
        },
      }),
      null,
    );
  }

  // ───────────────────────────── ending & settings ─────────────────────────────

  private showEnding(creditsOnly: boolean, from: Pt | (() => Pt) | null): void {
    void this.transition(
      from,
      () => {
        this.teardown();
        this.setScreen('ending');
        const e = new Ending({ creditsOnly, onDone: () => this.showJourney({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) });
        this.ending = e;
        this.layer.append(e.el);
        e.start();
      },
      () => ({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.6 }),
    );
  }

  private openSettings(): void {
    const close = () => this.hideOverlay();
    this.showOverlay(
      'settings',
      settingsSheet({
        onClose: close,
        onCredits: () => {
          this.hideOverlay();
          this.showEnding(true, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        },
        onReset: () => {
          this.showOverlay(
            'confirm',
            confirmSheet(
              'Forget the whole night?',
              'Every lamp you have lit and every star you have gathered will be forgotten. Settings are kept.',
              'Reset progress',
              () => {
                progress.reset();
                this.hideOverlay();
                this.showTitle(false, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
              },
              () => this.openSettings(),
              true,
            ),
            () => this.openSettings(),
          );
        },
      }),
      close,
    );
  }

  // ───────────────────────────── keyboard ─────────────────────────────

  private key(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (irisBusy() || this.busy) return;
    const k = e.key;
    const target = e.target as HTMLElement | null;
    const onControl = !!target && (target.tagName === 'INPUT' || (target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')));

    if (this.overlayKind) {
      if (k === 'Escape') {
        e.preventDefault();
        this.overlayBack?.();
        return;
      }
      if (this.overlayKind === 'complete') {
        if (onControl) {
          this.completeSkip?.();
          return;
        }
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          this.completeNext?.();
        } else if (k === 'r') this.completeReplay?.();
      }
      return;
    }

    switch (this.screen) {
      case 'title':
        if ((k === 'Enter' || k === ' ') && !onControl) {
          e.preventDefault();
          if (!target?.closest('.title-screen')) this.title?.el.click();
        }
        break;
      case 'journey':
        if (k === 'Escape') this.showTitle(true, () => this.wickAnchor());
        else if ((k === 'Enter' || k === ' ') && !onControl) {
          e.preventDefault();
          this.journey?.playFrontier();
        } else if (this.journey?.keyNav(k)) e.preventDefault();
        break;
      case 'play': {
        const s = this.session;
        if (!s || !this.hud) return;
        if (k === 'Escape' || k === 'p') {
          e.preventDefault();
          this.pause();
        } else if ((k === ' ' || k === 'Enter') && !onControl) {
          e.preventDefault();
          this.hud.goOrRetry();
        } else if (k === 'z' || k === 'Z' || k === 'Backspace') {
          e.preventDefault();
          this.hud.undo();
        } else if (k === 'r') {
          if (s.sim.phase !== 'plan') s.retry();
        } else if (k === 'h') this.hud.toggleHint();
        else if (k >= '1' && k <= '3') {
          const t = s.level.ink.types[parseInt(k, 10) - 1];
          if (t) this.setInk(t);
        }
        break;
      }
      case 'ending':
        break;
    }
  }
}

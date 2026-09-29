// Horizontal momentum scrolling for the journey map: touch, mouse drag, wheel and keys, with
// inertia and soft rubber-band edges. Taps pass through as clicks; drags swallow the click.
import { onTick } from './ticker';

export class Scroller {
  x = 0;
  max = 0;
  onScroll: (x: number) => void = () => {};
  /** Called when the user starts interacting (to cancel automatic camera moves). */
  onGrab: () => void = () => {};
  private v = 0;
  private dragging = false;
  private pid: number | null = null;
  private startX = 0;
  private startScroll = 0;
  private moved = false;
  private samples: { t: number; x: number }[] = [];
  private off: (() => void) | null = null;
  private target: { x: number; t0: number; from: number; ms: number } | null = null;
  private suppress = false;
  private readonly abort = new AbortController();

  constructor(private el: HTMLElement) {
    const sig = { signal: this.abort.signal };
    el.addEventListener('pointerdown', this.down, sig);
    el.addEventListener('pointermove', this.move, sig);
    el.addEventListener('pointerup', this.up, sig);
    el.addEventListener('pointercancel', this.up, sig);
    el.addEventListener('wheel', this.wheel, { passive: false, signal: this.abort.signal });
    el.addEventListener(
      'click',
      (e) => {
        if (this.suppress) {
          e.stopPropagation();
          e.preventDefault();
          this.suppress = false;
        }
      },
      { capture: true, signal: this.abort.signal },
    );
  }

  destroy(): void {
    this.abort.abort();
    this.off?.();
    this.off = null;
  }

  setMax(max: number): void {
    this.max = Math.max(0, max);
    this.x = Math.max(0, Math.min(this.max, this.x));
    this.onScroll(this.x);
  }

  /** Jump or glide to a scroll position. */
  scrollTo(x: number, ms = 0): void {
    const tx = Math.max(0, Math.min(this.max, x));
    this.v = 0;
    if (ms <= 0) {
      this.target = null;
      this.x = tx;
      this.onScroll(this.x);
      return;
    }
    this.target = { x: tx, t0: performance.now(), from: this.x, ms };
    this.run();
  }

  /** Nudge by a delta with a short glide (keyboard). */
  nudge(dx: number): void {
    this.scrollTo((this.target?.x ?? this.x) + dx, 380);
  }

  get busy(): boolean {
    return this.dragging || Math.abs(this.v) > 5 || !!this.target;
  }

  private run(): void {
    if (!this.off) this.off = onTick((dt, now) => this.step(dt, now));
  }

  private step(dt: number, now: number): void {
    if (this.dragging) return;
    if (this.target) {
      const k = Math.min(1, (now - this.target.t0) / this.target.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.x = this.target.from + (this.target.x - this.target.from) * e;
      this.onScroll(this.x);
      if (k >= 1) this.target = null;
      else return;
    }
    // Inertia + rubber band.
    if (this.x < 0 || this.x > this.max) {
      const edge = this.x < 0 ? 0 : this.max;
      const d = edge - this.x;
      this.v = this.v * Math.exp(-dt * 14) + d * 60 * dt;
      this.x += this.v * dt;
      if (Math.abs(d) < 0.5 && Math.abs(this.v) < 20) {
        this.x = edge;
        this.v = 0;
      }
    } else {
      this.x += this.v * dt;
      this.v *= Math.exp(-dt * 3.2);
      if (Math.abs(this.v) < 8) this.v = 0;
    }
    this.onScroll(this.x);
    if (this.v === 0 && this.x >= 0 && this.x <= this.max) {
      this.off?.();
      this.off = null;
    }
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.pid !== null) return;
    this.pid = e.pointerId;
    this.dragging = true;
    this.moved = false;
    this.suppress = false;
    this.startX = e.clientX;
    this.startScroll = this.x;
    this.v = 0;
    this.target = null;
    this.samples = [{ t: performance.now(), x: e.clientX }];
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    const dx = e.clientX - this.startX;
    if (!this.moved && Math.abs(dx) > 7) {
      this.moved = true;
      this.onGrab();
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (!this.moved) return;
    let x = this.startScroll - dx;
    // Resist beyond the ends.
    if (x < 0) x = -this.band(-x);
    else if (x > this.max) x = this.max + this.band(x - this.max);
    this.x = x;
    this.onScroll(this.x);
    const now = performance.now();
    this.samples.push({ t: now, x: e.clientX });
    while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
  };

  private band(d: number): number {
    const lim = 120;
    return lim * (1 - 1 / (d / lim + 1));
  }

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    this.dragging = false;
    if (this.moved) {
      this.suppress = true;
      setTimeout(() => (this.suppress = false), 0);
      const a = this.samples[0];
      const b = this.samples[this.samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      this.v = dt > 0.008 ? -(b.x - a.x) / dt : 0;
      this.v = Math.max(-5200, Math.min(5200, this.v));
    }
    this.run();
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
    this.target = null;
    this.onGrab();
    this.x = Math.max(-40, Math.min(this.max + 40, this.x + d * k));
    this.v = 0;
    this.onScroll(this.x);
    this.run();
  };
}

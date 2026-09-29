import type { Vec } from '../core/math';
import type { InkType } from '../core/types';
import { audio } from '../audio/audio';
import type { Renderer } from '../render/renderer';
import type { Simulation } from '../sim/simulation';

/**
 * Turns pointer input on the canvas into pen strokes. Light exponential smoothing removes finger
 * jitter without adding noticeable lag; coalesced events keep fast strokes smooth.
 */
export class PenInput {
  ink: InkType = 'moon';
  enabled = true;
  private pointerId: number | null = null;
  private smooth: Vec | null = null;
  private lastT = 0;
  private lastP: Vec | null = null;
  onStrokeStart: (() => void) | null = null;
  onStrokeEnd: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getSim: () => Simulation,
    private readonly renderer: Renderer,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('lostpointercapture', this.up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('lostpointercapture', this.up);
  }

  /** Abort any stroke in progress (pause, level end). */
  cancel(): void {
    if (this.pointerId !== null) {
      this.getSim().penUp();
      this.pointerId = null;
      audio.pen(false);
      this.onStrokeEnd?.();
    }
    this.renderer.pen = null;
  }

  private world(e: PointerEvent): Vec {
    const r = this.canvas.getBoundingClientRect();
    return this.renderer.view.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    audio.unlock();
    const sim = this.getSim();
    const p = this.world(e);
    if (!sim.penDown(this.ink, p)) return;
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.smooth = p;
    this.lastP = p;
    this.lastT = performance.now();
    this.renderer.pen = { x: p.x, y: p.y, ink: this.ink, down: true, blocked: sim.inkAllowedAt(p) !== 'ok' };
    audio.pen(true, p.x, p.y, 0, this.ink);
    this.onStrokeStart?.();
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const sim = this.getSim();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    for (const ev of list) {
      const raw = this.world(ev);
      const s = this.smooth!;
      const k = 0.6;
      s.x += (raw.x - s.x) * k;
      s.y += (raw.y - s.y) * k;
      sim.penMove({ x: s.x, y: s.y });
    }
    const s = this.smooth!;
    const now = performance.now();
    const dtm = Math.max(1, now - this.lastT);
    const speed = this.lastP ? Math.hypot(s.x - this.lastP.x, s.y - this.lastP.y) / (dtm / 1000) : 0;
    this.lastT = now;
    this.lastP = { x: s.x, y: s.y };
    this.renderer.pen = { x: s.x, y: s.y, ink: this.ink, down: true, blocked: sim.inkAllowedAt(s) !== 'ok' || sim.inkLeft <= 0.5 };
    audio.pen(true, s.x, s.y, speed, this.ink);
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const sim = this.getSim();
    const raw = this.world(e);
    const s = this.smooth ?? raw;
    sim.penUp({ x: (s.x + raw.x) / 2, y: (s.y + raw.y) / 2 });
    this.pointerId = null;
    this.smooth = null;
    this.renderer.pen = null;
    audio.pen(false);
    this.onStrokeEnd?.();
  };
}

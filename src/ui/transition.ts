// Screen transitions: an ink iris. The page floods with night-ink except a wobbling ring of light
// around an anchor (usually Wick), which closes to a point; the next screen then opens from its anchor.
import { ease, f1, s, tween } from './dom';

type Pt = { x: number; y: number };
type Anchor = Pt | (() => Pt);

let root: SVGSVGElement | null = null;
let blot: SVGPathElement;
let rim: SVGPathElement;
let halo: SVGPathElement;
let reduced = false;

export function setTransitionReducedMotion(on: boolean): void {
  reduced = on;
}

function ensure(): SVGSVGElement {
  if (root) return root;
  blot = s('path', { class: 'iris-blot', 'fill-rule': 'evenodd' });
  halo = s('path', { class: 'iris-halo' });
  rim = s('path', { class: 'iris-rim' });
  root = s('svg', { class: 'iris', 'aria-hidden': 'true' }, blot, halo, rim);
  (document.getElementById('app') ?? document.body).append(root);
  return root;
}

const at = (a: Anchor): Pt => {
  const p = typeof a === 'function' ? a() : a;
  // Keep the ring on screen even if its anchor (a falling Wick) is not.
  return { x: Math.max(24, Math.min(window.innerWidth - 24, p.x)), y: Math.max(24, Math.min(window.innerHeight - 24, p.y)) };
};

function ringPath(cx: number, cy: number, r: number, t: number): string {
  if (r <= 0.5) return '';
  const n = 56;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.03 * Math.sin(a * 3 + t * 2.1) + 0.018 * Math.sin(a * 7 - t * 3.3) + 0.01 * Math.sin(a * 13 + t * 5);
    const x = cx + Math.cos(a) * r * wob;
    const y = cy + Math.sin(a) * r * wob;
    d += (i === 0 ? 'M' : 'L') + f1(x) + ' ' + f1(y);
  }
  return d + 'Z';
}

function draw(p: Pt, r: number, t: number, glow: number): void {
  const w = window.innerWidth;
  const hh = window.innerHeight;
  root!.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  const ring = ringPath(p.x, p.y, r, t);
  blot.setAttribute('d', `M-10 -10H${w + 10}V${hh + 10}H-10Z` + ring);
  rim.setAttribute('d', ring);
  halo.setAttribute('d', ring);
  rim.style.opacity = String(glow);
  halo.style.opacity = String(glow * 0.9);
}

const maxR = (p: Pt) => Math.hypot(Math.max(p.x, window.innerWidth - p.x), Math.max(p.y, window.innerHeight - p.y)) + 40;

/** Cover the screen, closing onto the anchor. Resolves when fully dark. */
export async function irisClose(anchor: Anchor, ms = 520): Promise<void> {
  const el = ensure();
  el.classList.add('on');
  el.style.opacity = '1';
  if (reduced) {
    draw({ x: -999, y: -999 }, 0, 0, 0);
    el.style.opacity = '0';
    await tween(260, (k) => (el.style.opacity = String(k)), ease.linear);
    return;
  }
  const t0 = performance.now();
  const start = maxR(at(anchor));
  await tween(
    ms,
    (k) => {
      const p = at(anchor);
      // Close quickly to a small ring around the anchor, linger a beat, then pinch shut.
      const r = k < 0.72 ? start + (34 - start) * ease.outCubic(k / 0.72) : 34 * (1 - ease.inCubic((k - 0.72) / 0.28));
      draw(p, r, (performance.now() - t0) / 1000, Math.min(1, k * 3));
    },
    ease.linear,
  );
  draw({ x: 0, y: 0 }, 0, 0, 0);
}

/** Reveal the screen, opening from the anchor. */
export async function irisOpen(anchor: Anchor, ms = 640): Promise<void> {
  const el = ensure();
  el.classList.add('on');
  if (reduced) {
    draw({ x: -999, y: -999 }, 0, 0, 0);
    await tween(300, (k) => (el.style.opacity = String(1 - k)), ease.linear);
    el.classList.remove('on');
    return;
  }
  el.style.opacity = '1';
  const t0 = performance.now();
  await tween(
    ms,
    (k) => {
      const p = at(anchor);
      const end = maxR(p);
      // Pop open to a small ring (Wick framed in light), then sweep out.
      const r = k < 0.3 ? 34 * ease.outBack(k / 0.3) : 34 + (end - 34) * ease.inOutCubic((k - 0.3) / 0.7);
      draw(p, r, (performance.now() - t0) / 1000, 1 - Math.max(0, (k - 0.55) / 0.45));
    },
    ease.linear,
  );
  el.classList.remove('on');
}

/** Is a transition currently covering the screen? */
export function irisBusy(): boolean {
  return !!root?.classList.contains('on');
}

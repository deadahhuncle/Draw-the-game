// One shared requestAnimationFrame loop for UI animation (map Wick, title pen, ending…).
// Runs only while something is subscribed, so idle screens cost nothing.

export type TickFn = (dt: number, now: number) => void;

const fns = new Set<TickFn>();
let raf = 0;
let last = 0;

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  for (const fn of [...fns]) {
    try {
      fn(dt, now);
    } catch (e) {
      fns.delete(fn);
      console.error(e);
    }
  }
  raf = fns.size ? requestAnimationFrame(loop) : 0;
}

/** Subscribe to the UI frame loop. Returns an unsubscribe function. */
export function onTick(fn: TickFn): () => void {
  fns.add(fn);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  return () => fns.delete(fn);
}

// Tiny colour toolkit for the world painters. Everything here runs at cache-build time, never per frame
// in a hot loop, so clarity beats speed.

export type RGB = [number, number, number];

const cache = new Map<string, RGB>();

/** Parse #rgb, #rrggbb, rgb() or rgba() (alpha ignored). */
export function parse(c: string): RGB {
  const hit = cache.get(c);
  if (hit) return hit;
  let out: RGB = [0, 0, 0];
  const s = c.trim();
  if (s[0] === '#') {
    const h = s.slice(1);
    if (h.length === 3) out = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    else out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else {
    const m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) {
      const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
      out = [r, g, b];
    }
  }
  cache.set(c, out);
  return out;
}

/** Alpha of an rgba() string (1 for anything else). */
export function alphaOf(c: string): number {
  const m = /rgba\(([^)]+)\)/i.exec(c);
  if (!m) return 1;
  const parts = m[1].split(',');
  return parts.length > 3 ? parseFloat(parts[3]) : 1;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function hex(rgb: RGB): string {
  return '#' + rgb.map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}

/** Any colour at a given alpha. */
export function rgba(c: string | RGB, a: number): string {
  const [r, g, b] = typeof c === 'string' ? parse(c) : c;
  return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** Linear mix a → b. */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Lighten (amt > 0, toward white) or darken (amt < 0, toward black). */
export function tone(c: string, amt: number): string {
  return amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt);
}

/** Mix a list of stops at position t ∈ [0,1]. */
export function ramp(stops: readonly string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return mix(stops[i], stops[i + 1], k - i);
}

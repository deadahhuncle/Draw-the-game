// Tiny DOM helpers: h('div.cls#id', {attrs, on*: handlers}, ...children), SVG building, tweens.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S extends `${infer T}#${string}` ? T : S;
type ElementOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

export function h<S extends string>(tag: S, attrs?: Attrs | Child, ...children: Child[]): ElementOf<S>;
export function h(tag: string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m ? m[1] : 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else (el.style as unknown as Record<string, string>)[sk] = sv;
        }
      } else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'class') el.className = (el.className + ' ' + String(v)).trim();
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  } else if (attrs !== undefined) {
    children.unshift(attrs as Child);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Parse an SVG string into an element. */
export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

const SVGNS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}, ...children: (Node | null | undefined | false)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Next animation frame(s) — lets a freshly inserted element pick up its start styles. */
export const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export const ease = {
  linear: (t: number) => t,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
};

/** rAF tween: calls fn(eased 0..1). Resolves when done. `cancel()` on the returned handle stops it early. */
export function tween(ms: number, fn: (k: number) => void, easing: (t: number) => number = ease.inOutCubic): Promise<void> & { cancel(): void } {
  let raf = 0;
  let done: () => void = () => {};
  const p = new Promise<void>((res) => {
    done = res;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
      fn(easing(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else res();
    };
    raf = requestAnimationFrame(step);
  }) as Promise<void> & { cancel(): void };
  p.cancel = () => {
    cancelAnimationFrame(raf);
    done();
  };
  return p;
}

/** Deterministic tiny PRNG for procedural UI art (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Format a number for SVG path data. */
export const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();

/** True when the user prefers (or has chosen) reduced motion. */
export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion');
}

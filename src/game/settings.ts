import { load, save } from './storage';

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  leftHanded: boolean;
  reducedMotion: boolean;
}

const KEY = 'inklight.settings.v1';
const DEFAULTS: Settings = {
  music: 0.7,
  sfx: 0.85,
  haptics: true,
  leftHanded: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();
let current: Settings = load(KEY, DEFAULTS);

export const settings = {
  get(): Settings {
    return current;
  },
  set(patch: Partial<Settings>): void {
    current = { ...current, ...patch };
    save(KEY, current);
    for (const l of listeners) l(current);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

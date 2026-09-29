import { settings } from './settings';

export type Haptic = 'tick' | 'light' | 'medium' | 'double' | 'win';

const PATTERNS: Record<Haptic, number | number[]> = {
  tick: 6,
  light: 12,
  medium: 22,
  double: [18, 60, 18],
  win: [10, 40, 10, 40, 60],
};

export function haptic(kind: Haptic): void {
  if (!settings.get().haptics) return;
  // Browsers block vibration before the first user gesture.
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* unsupported */
  }
}

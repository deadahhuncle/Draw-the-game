// Audio engine facade. Everything is synthesized with Web Audio at runtime (see docs/DESIGN.md §8).
// The rest of the game only talks to this interface.
import type { InkType, SimEvent, WorldKey } from '../core/types';

export type AudioMode = 'menu' | 'plan' | 'run' | 'win';
export type UiSound = 'tap' | 'back' | 'open' | 'close' | 'select' | 'star' | 'unlock' | 'deny';

export interface AudioEngine {
  /** Must be called from a user gesture (creates/resumes the AudioContext). Safe to call repeatedly. */
  unlock(): void;
  setWorld(key: WorldKey): void;
  setMode(mode: AudioMode): void;
  onEvent(e: SimEvent): void;
  /** The pen instrument: call on every pen move while drawing; `down=false` releases it. y in world units. */
  pen(down: boolean, x?: number, y?: number, speed?: number, ink?: InkType): void;
  ui(name: UiSound): void;
  setVolumes(music: number, sfx: number): void;
  /** Pause everything (app hidden / game paused). */
  suspend(on: boolean): void;
}

class SilentAudio implements AudioEngine {
  unlock(): void {}
  setWorld(): void {}
  setMode(): void {}
  onEvent(): void {}
  pen(): void {}
  ui(): void {}
  setVolumes(): void {}
  suspend(): void {}
}

export let audio: AudioEngine = new SilentAudio();

export function installAudio(engine: AudioEngine): void {
  audio = engine;
}

// World → scene factory.
import type { WorldKey } from '../../core/types';
import { DaybreakScene } from './daybreak';
import { DuskScene } from './dusk';
import { HollowScene } from './hollow';
import type { PaintEnv } from './kit';
import { MothwoodScene } from './mothwood';
import type { Scene, SceneState } from './scene';
import { StarwaterScene } from './starwater';
import { StormScene } from './storm';

export function createScene(world: WorldKey, env: PaintEnv, state: SceneState): Scene {
  switch (world) {
    case 'hollow':
      return new HollowScene(env, state);
    case 'starwater':
      return new StarwaterScene(env, state);
    case 'storm':
      return new StormScene(env, state);
    case 'mothwood':
      return new MothwoodScene(env, state);
    case 'daybreak':
      return new DaybreakScene(env, state);
    default:
      return new DuskScene(env, state);
  }
}

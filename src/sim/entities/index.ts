import type { EntityDef } from '../../core/types';
import type { Entity } from '../entity';
import type { Simulation } from '../simulation';
import { Crumble } from './crumble';
import { Gate } from './gate';
import { Glowworm } from './glowworm';
import { Inkpot } from './inkpot';
import { Moth } from './moth';
import { Mover } from './mover';
import { Rain } from './rain';
import { Wind } from './wind';
import { Wisp } from './wisp';

export function createEntity(sim: Simulation, def: EntityDef, index: number): Entity {
  switch (def.kind) {
    case 'inkpot':
      return new Inkpot(sim, def, index);
    case 'rain':
      return new Rain(sim, def, index);
    case 'wind':
      return new Wind(sim, def, index);
    case 'moth':
      return new Moth(sim, def, index);
    case 'wisp':
      return new Wisp(sim, def, index);
    case 'gate':
      return new Gate(sim, def, index);
    case 'mover':
      return new Mover(sim, def, index);
    case 'crumble':
      return new Crumble(sim, def, index);
    case 'glowworm':
      return new Glowworm(sim, def, index);
  }
}

export { Crumble, Gate, Glowworm, Inkpot, Moth, Mover, Rain, Wind, Wisp };

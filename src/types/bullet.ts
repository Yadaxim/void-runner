import type { PhysicsBody, Vector2 } from './physics';

export type BulletVisualType = 'bolt' | 'beam_pulse' | 'orb' | 'missile' | 'mine';

export interface BulletSpec {
  id: string;
  name: string;
  mass: number;
  speed: number;
  inheritShipVelocity: boolean;
  damage: number;
  attractedByGravity: boolean;
  seeking: boolean;
  turnRatio?: number;
  infinite: boolean;
  lifespan: number;
  visualType: BulletVisualType;
  colour: string;
}

export interface BulletInstance {
  id: string;
  specId: string;
  body: PhysicsBody;
  ownerId: string;
  targetId?: string;
  age: number;
  trailPositions: Vector2[];
}

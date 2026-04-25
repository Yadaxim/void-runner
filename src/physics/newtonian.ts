import type { PhysicsBody, Vector2 } from '../types';

export function applyForce(_body: PhysicsBody, _force: Vector2, _dt: number): PhysicsBody {
  throw new Error('not implemented');
}

export function integrateVelocity(_body: PhysicsBody, _dt: number): PhysicsBody {
  throw new Error('not implemented');
}

export function integratePosition(_body: PhysicsBody, _dt: number): PhysicsBody {
  throw new Error('not implemented');
}

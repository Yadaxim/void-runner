import type { Vector2 } from '../types';

export function circleCircle(_aPos: Vector2, _aRadius: number, _bPos: Vector2, _bRadius: number): boolean {
  throw new Error('not implemented');
}

export function pointInCircle(_point: Vector2, _center: Vector2, _radius: number): boolean {
  return distance(_point, _center) <= _radius;
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

import { GRAVITY_CONSTANT, MIN_GRAVITY_DISTANCE } from '../constants';
import { Vector2 } from './vector2';

export function computeGravity(
  shipPosition: Vector2,
  shipMass: number,
  bodies: { position: Vector2; mass: number; radius?: number }[],
  G: number = GRAVITY_CONSTANT
): Vector2 {
  if (shipMass <= 0 || bodies.length === 0) {
    return Vector2.zero();
  }

  let totalForce = Vector2.zero();
  for (const body of bodies) {
    const toBody = body.position.sub(shipPosition);
    if (typeof body.radius === 'number' && body.radius > 0 && toBody.magnitudeSquared() <= body.radius * body.radius) {
      continue;
    }
    const distanceSq = Math.max(toBody.magnitudeSquared(), MIN_GRAVITY_DISTANCE * MIN_GRAVITY_DISTANCE);
    const direction = toBody.normalise();
    const magnitude = (G * shipMass * body.mass) / distanceSq;
    totalForce = totalForce.add(direction.scale(magnitude));
  }

  return totalForce;
}

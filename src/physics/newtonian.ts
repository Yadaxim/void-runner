import { Vector2 } from './vector2';

export function applyForce(velocity: Vector2, force: Vector2, mass: number, dt: number): Vector2 {
  if (mass <= 0 || dt <= 0) {
    return velocity;
  }

  const acceleration = force.scale(1 / mass);
  return velocity.add(acceleration.scale(dt));
}

export function integratePosition(position: Vector2, velocity: Vector2, dt: number): Vector2 {
  if (dt <= 0) {
    return position;
  }

  return position.add(velocity.scale(dt));
}

export function clampVelocity(velocity: Vector2, topSpeed: number): Vector2 {
  if (topSpeed <= 0) {
    return Vector2.zero();
  }

  const speed = velocity.magnitude();
  if (speed <= topSpeed || speed === 0) {
    return velocity;
  }

  return velocity.scale(topSpeed / speed);
}

export function applyAngularForce(angularVelocity: number, torque: number, mass: number, dt: number): number {
  if (mass <= 0 || dt <= 0) {
    return angularVelocity;
  }

  const angularAcceleration = torque / mass;
  return angularVelocity + angularAcceleration * dt;
}

export function integrateAngle(angle: number, angularVelocity: number, dt: number): number {
  if (dt <= 0) {
    return angle;
  }

  return angle + angularVelocity * dt;
}

export function clampAngularVelocity(angularVelocity: number, topAngularSpeed: number): number {
  if (topAngularSpeed <= 0) {
    return 0;
  }

  if (angularVelocity > topAngularSpeed) {
    return topAngularSpeed;
  }
  if (angularVelocity < -topAngularSpeed) {
    return -topAngularSpeed;
  }

  return angularVelocity;
}

export function applyAngularDamping(angularVelocity: number, dampingStrength: number, dt: number): number {
  if (dampingStrength <= 0 || dt <= 0 || angularVelocity === 0) {
    return angularVelocity;
  }

  const dampingFactor = dampingStrength * dt;
  const nextAngularVelocity = angularVelocity - angularVelocity * dampingFactor;

  if (Math.sign(nextAngularVelocity) !== Math.sign(angularVelocity)) {
    return 0;
  }

  return nextAngularVelocity;
}

export function applyLinearDamping(velocity: Vector2, dampingStrength: number, dt: number): Vector2 {
  if (dampingStrength <= 0 || dt <= 0) {
    return velocity;
  }

  const dampingFactor = dampingStrength * dt;
  if (dampingFactor >= 1) {
    return Vector2.zero();
  }

  return velocity.sub(velocity.scale(dampingFactor));
}

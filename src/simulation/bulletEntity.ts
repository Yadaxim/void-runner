import { GRAVITY_CONSTANT, MIN_GRAVITY_DISTANCE } from '../constants';
import { Vector2 } from '../physics/vector2';
import {
  getBulletBallisticScale,
  getBulletSeekingAbility,
  type BulletInstance,
  type BulletSpec,
  type ShipState
} from '../types';
import type { ShipEntity } from './shipEntity';

let bulletCounter = 0;

function angleFromDirection(direction: Vector2): number {
  return Math.atan2(direction.x, -direction.y);
}

export class BulletEntity {
  readonly instance: BulletInstance;
  private readonly spec: BulletSpec;
  private expiredByHit = false;

  constructor(
    spec: BulletSpec,
    ownerState: ShipState,
    spawnOffsetAngle: number,
    targetId: string | null,
    muzzleHullLength: number
  ) {
    this.spec = spec;
    const muzzleAngle = ownerState.angle + spawnOffsetAngle;
    const muzzleDir = Vector2.fromAngle(muzzleAngle);
    const muzzleVelocity = muzzleDir.scale(spec.speed);
    const hullLength = muzzleHullLength;
    const spawnPosition = (ownerState.position as Vector2).add(muzzleDir.scale(hullLength / 2 + 4));

    const velocity = spec.inheritShipVelocity
      ? (ownerState.velocity as Vector2).add(muzzleVelocity)
      : muzzleVelocity;

    this.instance = {
      id: `bullet_${bulletCounter++}`,
      specId: spec.id,
      ownerId: ownerState.id,
      targetId: targetId ?? undefined,
      age: 0,
      trailPositions: [spawnPosition],
      body: {
        position: spawnPosition,
        velocity,
        angle: velocity.magnitude() > 0 ? angleFromDirection(velocity) : muzzleAngle,
        angularVelocity: 0,
        mass: Math.max(0.001, spec.mass)
      }
    };
  }

  update(
    dt: number,
    gravitySources: { position: Vector2; mass: number }[],
    target: ShipEntity | null
  ): void {
    const ballisticScale = getBulletBallisticScale(this.spec);
    if (ballisticScale > 0 && gravitySources.length > 0) {
      let gravityAcceleration = Vector2.zero();
      for (const source of gravitySources) {
        const toSource = (source.position as Vector2).sub(this.instance.body.position as Vector2);
        const distanceSq = Math.max(
          toSource.magnitudeSquared(),
          MIN_GRAVITY_DISTANCE * MIN_GRAVITY_DISTANCE
        );
        if (distanceSq <= 0) {
          continue;
        }
        const direction = toSource.normalise();
        const accelMagnitude = (GRAVITY_CONSTANT * source.mass) / distanceSq;
        gravityAcceleration = gravityAcceleration.add(direction.scale(accelMagnitude));
      }
      this.instance.body.velocity = (this.instance.body.velocity as Vector2).add(
        gravityAcceleration.scale(dt * ballisticScale)
      );
    }

    const seeking = getBulletSeekingAbility(this.spec);
    if (seeking && target) {
      const toTarget = (target.state.position as Vector2).sub(this.instance.body.position as Vector2);
      if (toTarget.magnitudeSquared() > 0) {
        const targetAngle = angleFromDirection(toTarget);
        const currentVelocity = this.instance.body.velocity as Vector2;
        const currentAngle =
          currentVelocity.magnitudeSquared() > 0 ? angleFromDirection(currentVelocity) : targetAngle;
        const maxTurn = seeking.turnRatio * dt;
        let delta = targetAngle - currentAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const clampedDelta = Math.max(-maxTurn, Math.min(maxTurn, delta));
        const newAngle = currentAngle + clampedDelta;
        this.instance.body.velocity = Vector2.fromAngle(newAngle).scale(this.spec.speed);
      }
    }

    this.instance.body.position = (this.instance.body.position as Vector2).add(
      (this.instance.body.velocity as Vector2).scale(dt)
    );
    this.instance.body.angle =
      (this.instance.body.velocity as Vector2).magnitudeSquared() > 0
        ? angleFromDirection(this.instance.body.velocity as Vector2)
        : this.instance.body.angle;
    this.instance.trailPositions.push(this.instance.body.position as Vector2);
    while (this.instance.trailPositions.length > 4) {
      this.instance.trailPositions.shift();
    }
    this.instance.age += dt;
  }

  isExpired(): boolean {
    return this.expiredByHit || (!this.spec.infinite && this.instance.age >= this.spec.lifespan);
  }

  markHit(): void {
    this.expiredByHit = true;
  }

  getPosition(): Vector2 {
    return this.instance.body.position as Vector2;
  }

  getAngle(): number {
    return this.instance.body.angle;
  }

  getTrailPositions(): Vector2[] {
    return this.instance.trailPositions as Vector2[];
  }

  getSpec(): BulletSpec {
    return this.spec;
  }
}

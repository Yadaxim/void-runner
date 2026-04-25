import { childPRNG, SplitMix64 } from '../core/prng';
import { Vector2 } from '../physics/vector2';
import type { Landable } from '../types';
import type { ShipEntity } from './shipEntity';

export type NPCState = 'patrol' | 'trade' | 'hostile' | 'flee';

export interface NPCInputs {
  forward: boolean;
  reverse: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  autoBrakeLinear: boolean;
  autoBrakeRotation: boolean;
  fireZ: boolean;
  fireX: boolean;
  fireC: boolean;
  fireV: boolean;
  fireB: boolean;
}

const ROTATION_THRESHOLD_RAD = 0.08;
const WAYPOINT_REACHED_DISTANCE = 80;

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function angleToTarget(from: Vector2, to: Vector2): number {
  const delta = to.sub(from);
  return Math.atan2(delta.x, -delta.y);
}

function defaultInputs(): NPCInputs {
  return {
    forward: false,
    reverse: false,
    rotateCW: false,
    rotateCCW: false,
    autoBrakeLinear: true,
    autoBrakeRotation: true,
    fireZ: false,
    fireX: false,
    fireC: false,
    fireV: false,
    fireB: false
  };
}

function rotateToward(
  selfAngle: number,
  targetAngle: number,
  _angularVelocity: number
): { rotateCW: boolean; rotateCCW: boolean; autoBrakeRotation: boolean; angleDiff: number } {
  const diff = wrapAngle(targetAngle - selfAngle);
  if (diff > ROTATION_THRESHOLD_RAD) {
    return { rotateCW: true, rotateCCW: false, autoBrakeRotation: false, angleDiff: diff };
  }
  if (diff < -ROTATION_THRESHOLD_RAD) {
    return { rotateCW: false, rotateCCW: true, autoBrakeRotation: false, angleDiff: diff };
  }
  return { rotateCW: false, rotateCCW: false, autoBrakeRotation: true, angleDiff: diff };
}

export class NPCController {
  private state: NPCState;
  private patrolTarget: Vector2;
  private patrolPoints: Vector2[];
  private aggroRange = 1200;
  private fleeHPThreshold = 0.25;
  private fireRange = 400;
  private preferredCombatRange = 100;
  private patrolIndex = 0;
  private strafeTimer = 0;
  private strafeDirection: -1 | 1 = 1;
  private readonly prng: SplitMix64;
  private tradePointA: Vector2 | null = null;
  private tradePointB: Vector2 | null = null;
  private tradeToA = false;
  private readonly alwaysHostile: boolean;

  constructor(initialState: NPCState, sectorSeed: number, factionId: string) {
    this.state = initialState;
    this.alwaysHostile = initialState === 'hostile';
    this.prng = childPRNG(sectorSeed, `npc_controller_${factionId}_${initialState}`);
    const waypointCount = this.prng.nextInt(3, 4);
    this.patrolPoints = Array.from({ length: waypointCount }, () => this.randomSectorPoint(300));
    this.patrolTarget = this.patrolPoints[0];
  }

  getState(): NPCState {
    return this.state;
  }

  update(
    dt: number,
    self: ShipEntity,
    player: ShipEntity,
    _otherNPCs: ShipEntity[],
    landables: Landable[]
  ): NPCInputs {
    const selfPos = self.state.position as Vector2;
    const playerPos = player.state.position as Vector2;
    const playerDistance = Vector2.distance(selfPos, playerPos);

    if (this.state === 'patrol' && playerDistance <= this.aggroRange && this.isHostileToPlayer(self)) {
      this.state = 'hostile';
    }
    if (this.state === 'hostile' && self.state.maxHP > 0 && self.state.currentHP / self.state.maxHP < this.fleeHPThreshold) {
      this.state = 'flee';
    }

    if (this.state === 'patrol') {
      return this.updatePatrol(self, playerDistance);
    }
    if (this.state === 'trade') {
      return this.updateTrade(self, landables);
    }
    if (this.state === 'hostile') {
      return this.updateHostile(dt, self, player, playerDistance);
    }
    return this.updateFlee(self, player, playerDistance);
  }

  private isHostileToPlayer(self: ShipEntity): boolean {
    return (self.state.factionId ?? '') === 'pirates';
  }

  private updatePatrol(self: ShipEntity, playerDistance: number): NPCInputs {
    const inputs = defaultInputs();
    if (playerDistance > this.aggroRange || !this.isHostileToPlayer(self)) {
      const selfPos = self.state.position as Vector2;
      const targetAngle = angleToTarget(selfPos, this.patrolTarget);
      const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
      inputs.rotateCW = rotation.rotateCW;
      inputs.rotateCCW = rotation.rotateCCW;
      inputs.autoBrakeRotation = rotation.autoBrakeRotation;
      if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
        inputs.forward = true;
        inputs.autoBrakeLinear = false;
      }
      if (Vector2.distance(selfPos, this.patrolTarget) <= WAYPOINT_REACHED_DISTANCE) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        this.patrolTarget = this.patrolPoints[this.patrolIndex];
      }
    }
    return inputs;
  }

  private updateTrade(self: ShipEntity, landables: Landable[]): NPCInputs {
    const inputs = defaultInputs();
    this.ensureTradeRoute(landables);
    const target = this.tradeToA ? this.tradePointA : this.tradePointB;
    if (!target) {
      return inputs;
    }
    const selfPos = self.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, target);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    inputs.rotateCW = rotation.rotateCW;
    inputs.rotateCCW = rotation.rotateCCW;
    inputs.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (20 * Math.PI) / 180) {
      inputs.forward = true;
      inputs.autoBrakeLinear = false;
    }
    if (Vector2.distance(selfPos, target) <= WAYPOINT_REACHED_DISTANCE) {
      this.tradeToA = !this.tradeToA;
    }
    return inputs;
  }

  private updateHostile(dt: number, self: ShipEntity, player: ShipEntity, playerDistance: number): NPCInputs {
    const inputs = defaultInputs();
    if (!this.alwaysHostile && playerDistance > this.aggroRange * 1.5) {
      this.state = 'patrol';
      return this.updatePatrol(self, playerDistance);
    }
    const selfPos = self.state.position as Vector2;
    const playerPos = player.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, playerPos);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    inputs.rotateCW = rotation.rotateCW;
    inputs.rotateCCW = rotation.rotateCCW;
    inputs.autoBrakeRotation = rotation.autoBrakeRotation;
    const absAngleDiff = Math.abs(rotation.angleDiff);

    if (playerDistance > this.preferredCombatRange + 100) {
      if (Math.abs(rotation.angleDiff) < (35 * Math.PI) / 180) {
        inputs.forward = true;
        inputs.autoBrakeLinear = false;
      }
    } else if (playerDistance < this.preferredCombatRange - 100) {
      if (Math.abs(rotation.angleDiff) < (35 * Math.PI) / 180) {
        inputs.reverse = true;
        inputs.autoBrakeLinear = false;
      }
    } else if (absAngleDiff < (30 * Math.PI) / 180) {
      this.strafeTimer += dt;
      if (this.strafeTimer >= 1.5) {
        this.strafeTimer = 0;
        this.strafeDirection = this.strafeDirection === 1 ? -1 : 1;
      }
      inputs.autoBrakeLinear = false;
      if (this.strafeDirection === 1) {
        inputs.rotateCW = true;
        inputs.rotateCCW = false;
        inputs.autoBrakeRotation = false;
      } else {
        inputs.rotateCCW = true;
        inputs.rotateCW = false;
        inputs.autoBrakeRotation = false;
      }
    } else {
      // Prioritize turning in place to reacquire targets that moved behind us.
      this.strafeTimer = 0;
    }

    if (Math.abs(rotation.angleDiff) < (20 * Math.PI) / 180 && playerDistance <= this.fireRange) {
      inputs.fireZ = true;
    }
    return inputs;
  }

  private updateFlee(self: ShipEntity, player: ShipEntity, playerDistance: number): NPCInputs {
    const inputs = defaultInputs();
    if (playerDistance > this.aggroRange * 2) {
      this.state = 'patrol';
      return this.updatePatrol(self, playerDistance);
    }
    const selfPos = self.state.position as Vector2;
    const awayDirection = selfPos.sub(player.state.position as Vector2);
    const targetAngle =
      awayDirection.magnitudeSquared() > 0
        ? Math.atan2(awayDirection.x, -awayDirection.y)
        : self.state.angle;
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    inputs.rotateCW = rotation.rotateCW;
    inputs.rotateCCW = rotation.rotateCCW;
    inputs.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
      inputs.forward = true;
      inputs.autoBrakeLinear = false;
    }
    return inputs;
  }

  private ensureTradeRoute(landables: Landable[]): void {
    if (this.tradePointA && this.tradePointB) {
      return;
    }
    if (landables.length >= 2) {
      const firstIndex = this.prng.nextInt(0, landables.length - 1);
      let secondIndex = this.prng.nextInt(0, landables.length - 1);
      if (secondIndex === firstIndex) {
        secondIndex = (secondIndex + 1) % landables.length;
      }
      this.tradePointA = landables[firstIndex].position as Vector2;
      this.tradePointB = landables[secondIndex].position as Vector2;
      return;
    }
    if (landables.length === 1) {
      this.tradePointA = landables[0].position as Vector2;
      this.tradePointB = this.randomSectorPoint(250);
      return;
    }
    this.tradePointA = this.randomSectorPoint(250);
    this.tradePointB = this.randomSectorPoint(250);
  }

  private randomSectorPoint(inset: number): Vector2 {
    const min = -1600 + inset;
    const max = 1600 - inset;
    return new Vector2(this.prng.nextInt(min, max), this.prng.nextInt(min, max));
  }
}

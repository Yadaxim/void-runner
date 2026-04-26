import {
  NPC_AGGRO_RANGE,
  NPC_DEAGGRO_RANGE_MULTIPLIER,
  NPC_FIRE_RANGE,
  NPC_FLEE_HP_THRESHOLD,
  NPC_PREFERRED_COMBAT_RANGE,
  NPC_STRAFE_INTERVAL,
  NPC_THREAT_MEMORY_DURATION,
  PATROL_WAYPOINT_ARRIVAL_RADIUS,
  PATROL_WAYPOINT_COUNT,
  SECTOR_HEIGHT,
  SECTOR_WIDTH,
  TRANSIT_APPROACH_BRAKE_RADIUS,
  TRANSIT_LOITER_DRIFT_FORCE,
  TRANSIT_LOITER_DRIFT_INTERVAL,
  TRANSIT_LOITER_MAX,
  TRANSIT_LOITER_MIN,
  TRANSIT_LOITER_RADIUS
} from '../constants';
import { childPRNG, SplitMix64 } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import type { Landable } from '../types';
import type { ShipEntity } from './shipEntity';

export type NPCState = 'patrol' | 'transit' | 'trade' | 'hostile' | 'flee';
type TransitPhase = 'approaching' | 'loitering' | 'departing';

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
const TAIL_DISTANCE = 500;

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
  private aggroRange = NPC_AGGRO_RANGE;
  private fleeHPThreshold = NPC_FLEE_HP_THRESHOLD;
  private fireRange = NPC_FIRE_RANGE;
  private preferredCombatRange = NPC_PREFERRED_COMBAT_RANGE;
  private patrolIndex = 0;
  private strafeTimer = 0;
  private strafeDirection: -1 | 1 = 1;
  private readonly prng: SplitMix64;
  private tradePointA: Vector2 | null = null;
  private tradePointB: Vector2 | null = null;
  private tradeToA = false;
  private readonly alwaysHostile: boolean;

  private aggroTargetId: string | null = null;
  private aggroTargetType: 'player' | 'npc' = 'player';
  private threatMemory: Map<string, number> = new Map();
  private threatTimers: Map<string, number> = new Map();

  private transitPhase: TransitPhase = 'approaching';
  private transitTarget: Vector2 | null = null;
  private loiterTimer = 0;
  private loiterDriftTimer = TRANSIT_LOITER_DRIFT_INTERVAL;
  private departureTarget: Vector2 | null = null;

  constructor(initialState: NPCState, sectorSeed: number, factionId: string) {
    this.state = initialState;
    this.alwaysHostile = initialState === 'hostile';
    this.prng = childPRNG(sectorSeed, `npc_controller_${factionId}_${initialState}`);
    this.patrolPoints = Array.from({ length: PATROL_WAYPOINT_COUNT }, () => this.randomSectorPoint(300));
    this.patrolTarget = this.patrolPoints[0];
    this.loiterTimer = this.randomRange(TRANSIT_LOITER_MIN, TRANSIT_LOITER_MAX);
  }

  getState(): NPCState {
    return this.state;
  }

  getAggroTargetId(): string | null {
    return this.aggroTargetId;
  }

  receiveAttack(attackerId: string, _attackerFactionId: string | null, damage: number): void {
    const current = this.threatMemory.get(attackerId) ?? 0;
    this.threatMemory.set(attackerId, current + damage);
    this.threatTimers.set(attackerId, NPC_THREAT_MEMORY_DURATION);

    if (this.aggroTargetId === null || this.getThreat(attackerId) > this.getThreat(this.aggroTargetId)) {
      this.aggroTargetId = attackerId;
      this.aggroTargetType = attackerId === 'player' ? 'player' : 'npc';
    }

    if (this.state !== 'hostile' && this.state !== 'flee') {
      this.state = 'hostile';
    }
  }

  update(
    dt: number,
    self: ShipEntity,
    player: ShipEntity,
    otherNPCs: ShipEntity[],
    landables: Landable[],
    worldState: WorldState
  ): NPCInputs {
    this.updateThreatMemory(dt);

    const selfPos = self.state.position as Vector2;
    const playerPos = player.state.position as Vector2;
    const playerDistance = Vector2.distance(selfPos, playerPos);

    if (this.state === 'patrol' || this.state === 'transit' || this.state === 'trade') {
      if (
        playerDistance <= this.aggroRange &&
        this.isHostileToward(self.state.factionId, player.state.factionId, 'player', worldState)
      ) {
        this.aggroTargetId = 'player';
        this.aggroTargetType = 'player';
        this.state = 'hostile';
      }

      for (const npc of otherNPCs) {
        const npcDistance = Vector2.distance(selfPos, npc.state.position as Vector2);
        if (npcDistance > this.aggroRange) continue;
        if (this.isHostileToward(self.state.factionId, npc.state.factionId, npc.state.id, worldState)) {
          this.aggroTargetId = npc.state.id;
          this.aggroTargetType = 'npc';
          this.state = 'hostile';
          break;
        }
      }
    }

    if (this.state === 'hostile' && self.state.maxHP > 0 && self.state.currentHP / self.state.maxHP < this.fleeHPThreshold) {
      this.state = 'flee';
    }

    if (this.state === 'patrol') return this.updatePatrol(self, player, playerDistance, worldState);
    if (this.state === 'transit') return this.updateTransit(dt, self, landables);
    if (this.state === 'trade') return this.updateTrade(self, landables);
    if (this.state === 'hostile') return this.updateHostile(dt, self, player, otherNPCs);
    return this.updateFlee(self, player, otherNPCs, playerDistance);
  }

  private updatePatrol(
    self: ShipEntity,
    player: ShipEntity,
    playerDistance: number,
    worldState: WorldState
  ): NPCInputs {
    const inputs = defaultInputs();
    const factionId = self.state.factionId;
    const tier = factionId ? worldState.getReputationTier(factionId) : 'neutral';
    if (tier === 'unfriendly') return this.updateTailPlayer(self, player, playerDistance);

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
    if (Vector2.distance(selfPos, this.patrolTarget) <= PATROL_WAYPOINT_ARRIVAL_RADIUS) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this.patrolTarget = this.patrolPoints[this.patrolIndex];
    }
    return inputs;
  }

  private updateTransit(dt: number, self: ShipEntity, landables: Landable[]): NPCInputs {
    const inputs = defaultInputs();
    if (!this.transitTarget) {
      this.transitTarget = this.pickTransitTarget(self, landables);
    }

    if (this.transitPhase === 'approaching') {
      const target = this.transitTarget ?? this.randomSectorPoint(200);
      const selfPos = self.state.position as Vector2;
      const dist = Vector2.distance(selfPos, target);
      const targetAngle = angleToTarget(selfPos, target);
      const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
      inputs.rotateCW = rotation.rotateCW;
      inputs.rotateCCW = rotation.rotateCCW;
      inputs.autoBrakeRotation = rotation.autoBrakeRotation;
      if (dist <= TRANSIT_APPROACH_BRAKE_RADIUS) {
        inputs.autoBrakeLinear = true;
      } else if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
        inputs.forward = true;
        inputs.autoBrakeLinear = false;
      }
      if (dist <= TRANSIT_LOITER_RADIUS) {
        this.transitPhase = 'loitering';
        this.loiterTimer = this.randomRange(TRANSIT_LOITER_MIN, TRANSIT_LOITER_MAX);
        this.loiterDriftTimer = TRANSIT_LOITER_DRIFT_INTERVAL;
      }
      return inputs;
    }

    if (this.transitPhase === 'loitering') {
      this.loiterTimer -= dt;
      this.loiterDriftTimer -= dt;
      inputs.autoBrakeLinear = true;
      inputs.autoBrakeRotation = true;
      if (this.loiterDriftTimer <= 0) {
        const impulseAngle = this.prng.next() * Math.PI * 2;
        self.state = {
          ...self.state,
          velocity: (self.state.velocity as Vector2).add(Vector2.fromAngle(impulseAngle).scale(TRANSIT_LOITER_DRIFT_FORCE))
        };
        this.loiterDriftTimer = TRANSIT_LOITER_DRIFT_INTERVAL;
      }
      if (this.loiterTimer <= 0) {
        this.transitPhase = 'departing';
        self.isLeaving = true;
      }
      return inputs;
    }

    if (!this.departureTarget) {
      this.departureTarget = this.pickDepartureTarget();
      self.isLeaving = true;
    }
    const selfPos = self.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, this.departureTarget);
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

  private updateTailPlayer(self: ShipEntity, player: ShipEntity, playerDistance: number): NPCInputs {
    const inputs = defaultInputs();
    const selfPos = self.state.position as Vector2;
    const playerPos = player.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, playerPos);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    inputs.rotateCW = rotation.rotateCW;
    inputs.rotateCCW = rotation.rotateCCW;
    inputs.autoBrakeRotation = rotation.autoBrakeRotation;

    if (playerDistance > TAIL_DISTANCE + 75 && Math.abs(rotation.angleDiff) < (30 * Math.PI) / 180) {
      inputs.forward = true;
      inputs.autoBrakeLinear = false;
    } else if (playerDistance < TAIL_DISTANCE - 75 && Math.abs(rotation.angleDiff) < (30 * Math.PI) / 180) {
      inputs.reverse = true;
      inputs.autoBrakeLinear = false;
    }
    return inputs;
  }

  private updateTrade(self: ShipEntity, landables: Landable[]): NPCInputs {
    const inputs = defaultInputs();
    this.ensureTradeRoute(landables);
    const target = this.tradeToA ? this.tradePointA : this.tradePointB;
    if (!target) return inputs;
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
    if (Vector2.distance(selfPos, target) <= PATROL_WAYPOINT_ARRIVAL_RADIUS) {
      this.tradeToA = !this.tradeToA;
    }
    return inputs;
  }

  private updateHostile(dt: number, self: ShipEntity, player: ShipEntity, otherNPCs: ShipEntity[]): NPCInputs {
    const inputs = defaultInputs();
    const target = this.resolveAggroTarget(player, otherNPCs);
    if (!target) {
      this.clearAggro();
      this.state = 'patrol';
      return defaultInputs();
    }

    const selfPos = self.state.position as Vector2;
    const targetPos = target.state.position as Vector2;
    const targetDistance = Vector2.distance(selfPos, targetPos);

    if (
      !this.alwaysHostile &&
      !this.threatMemory.has(target.state.id) &&
      targetDistance > this.aggroRange * NPC_DEAGGRO_RANGE_MULTIPLIER
    ) {
      this.clearAggro();
      this.state = 'patrol';
      return defaultInputs();
    }

    const targetAngle = angleToTarget(selfPos, targetPos);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    inputs.rotateCW = rotation.rotateCW;
    inputs.rotateCCW = rotation.rotateCCW;
    inputs.autoBrakeRotation = rotation.autoBrakeRotation;
    const absAngleDiff = Math.abs(rotation.angleDiff);

    if (targetDistance > this.preferredCombatRange + 100) {
      if (absAngleDiff < (35 * Math.PI) / 180) {
        inputs.forward = true;
        inputs.autoBrakeLinear = false;
      }
    } else if (targetDistance < this.preferredCombatRange - 100) {
      if (absAngleDiff < (35 * Math.PI) / 180) {
        inputs.reverse = true;
        inputs.autoBrakeLinear = false;
      }
    } else if (absAngleDiff < (30 * Math.PI) / 180) {
      this.strafeTimer += dt;
      if (this.strafeTimer >= NPC_STRAFE_INTERVAL) {
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
    }

    if (Math.abs(rotation.angleDiff) < (20 * Math.PI) / 180 && targetDistance <= this.fireRange) {
      inputs.fireZ = true;
    }
    return inputs;
  }

  private updateFlee(self: ShipEntity, player: ShipEntity, otherNPCs: ShipEntity[], playerDistance: number): NPCInputs {
    const inputs = defaultInputs();
    self.isLeaving = true;
    const threatTarget = this.resolveAggroTarget(player, otherNPCs) ?? player;
    const threatDistance =
      threatTarget.state.id === 'player'
        ? playerDistance
        : Vector2.distance(self.state.position as Vector2, threatTarget.state.position as Vector2);

    if (threatDistance > this.aggroRange * 2) {
      this.clearAggro();
      this.state = 'patrol';
      return defaultInputs();
    }

    const selfPos = self.state.position as Vector2;
    const awayDirection = selfPos.sub(threatTarget.state.position as Vector2);
    const targetAngle = awayDirection.magnitudeSquared() > 0 ? Math.atan2(awayDirection.x, -awayDirection.y) : self.state.angle;
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
    if (this.tradePointA && this.tradePointB) return;
    if (landables.length >= 2) {
      const firstIndex = this.prng.nextInt(0, landables.length - 1);
      let secondIndex = this.prng.nextInt(0, landables.length - 1);
      if (secondIndex === firstIndex) secondIndex = (secondIndex + 1) % landables.length;
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

  private updateThreatMemory(dt: number): void {
    for (const [id, timer] of this.threatTimers) {
      const next = timer - dt;
      if (next <= 0) {
        this.threatTimers.delete(id);
        this.threatMemory.delete(id);
        if (this.aggroTargetId === id) {
          this.aggroTargetId = this.getHighestThreatId();
          this.aggroTargetType = this.aggroTargetId === 'player' ? 'player' : 'npc';
          if (!this.aggroTargetId && this.state === 'hostile') {
            this.state = 'patrol';
          }
        }
      } else {
        this.threatTimers.set(id, next);
      }
    }
  }

  private getThreat(id: string | null): number {
    if (!id) return 0;
    return this.threatMemory.get(id) ?? 0;
  }

  private getHighestThreatId(): string | null {
    let maxDamage = 0;
    let maxId: string | null = null;
    for (const [id, damage] of this.threatMemory) {
      if (damage > maxDamage) {
        maxDamage = damage;
        maxId = id;
      }
    }
    return maxId;
  }

  private resolveAggroTarget(player: ShipEntity, otherNPCs: ShipEntity[]): ShipEntity | null {
    if (!this.aggroTargetId) return null;
    if (this.aggroTargetType === 'player' || this.aggroTargetId === 'player') return player;
    return otherNPCs.find((npc) => npc.state.id === this.aggroTargetId) ?? null;
  }

  private clearAggro(): void {
    this.aggroTargetId = null;
    this.aggroTargetType = 'player';
  }

  private isHostileToward(
    selfFactionId: string | null,
    targetFactionId: string | null,
    targetId: string,
    worldState: WorldState
  ): boolean {
    if (this.threatMemory.has(targetId)) return true;
    if (selfFactionId && targetFactionId && worldState.areFactionsHostile(selfFactionId, targetFactionId)) return true;
    if (targetId === 'player' && selfFactionId) return worldState.getReputationTier(selfFactionId) === 'hostile';
    return false;
  }

  private pickTransitTarget(self: ShipEntity, landables: Landable[]): Vector2 {
    if (landables.length === 0) {
      return this.randomSectorPoint(220);
    }
    const selfPos = self.state.position as Vector2;
    let nearest = landables[0].position as Vector2;
    let nearestDist = Vector2.distance(selfPos, nearest);
    for (const landable of landables) {
      const d = Vector2.distance(selfPos, landable.position as Vector2);
      if (d < nearestDist) {
        nearest = landable.position as Vector2;
        nearestDist = d;
      }
    }
    return nearest;
  }

  private pickDepartureTarget(): Vector2 {
    const edge = ['north', 'south', 'east', 'west'][this.prng.nextInt(0, 3)] as 'north' | 'south' | 'east' | 'west';
    const halfWidth = SECTOR_WIDTH / 2;
    const halfHeight = SECTOR_HEIGHT / 2;
    if (edge === 'north') return new Vector2((this.prng.next() - 0.5) * SECTOR_WIDTH * 0.875, -(halfHeight + 200));
    if (edge === 'south') return new Vector2((this.prng.next() - 0.5) * SECTOR_WIDTH * 0.875, halfHeight + 200);
    if (edge === 'east') return new Vector2(halfWidth + 200, (this.prng.next() - 0.5) * SECTOR_HEIGHT * 0.875);
    return new Vector2(-(halfWidth + 200), (this.prng.next() - 0.5) * SECTOR_HEIGHT * 0.875);
  }

  private randomSectorPoint(inset: number): Vector2 {
    const min = -(SECTOR_WIDTH / 2) + inset;
    const max = SECTOR_WIDTH / 2 - inset;
    return new Vector2(this.prng.nextInt(min, max), this.prng.nextInt(min, max));
  }

  private randomRange(min: number, max: number): number {
    return min + this.prng.next() * (max - min);
  }
}

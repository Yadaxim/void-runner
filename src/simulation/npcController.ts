import {
  LANDING_SPEED_THRESHOLD,
  NPC_AGGRO_RANGE,
  NPC_DEAGGRO_RANGE_MULTIPLIER,
  NPC_FIRE_RANGE,
  NPC_FLEE_HP_THRESHOLD,
  NPC_HOSTILE_AIM_ANGLE_DEADBAND_RAD,
  NPC_HOSTILE_AIM_PULSE_PERIOD_SEC,
  NPC_HOSTILE_AIM_PULSE_THRUST_DUTY,
  NPC_PREFERRED_COMBAT_RANGE,
  NPC_STRAFE_INTERVAL,
  NPC_THREAT_MEMORY_DURATION,
  PATROL_WAYPOINT_ARRIVAL_RADIUS,
  PATROL_WAYPOINT_COUNT,
  SECTOR_SIZE,
  TRANSIT_APPROACH_BRAKE_RADIUS,
  TRANSIT_LOITER_EXTENSION,
  TRANSIT_LOITER_DRIFT_THRESHOLD,
  TRANSIT_LOITER_MAX,
  TRANSIT_LOITER_MIN,
  TRANSIT_LOITER_RADIUS
} from '../constants';
import { childPRNG, SplitMix64 } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import type { Landable } from '../types';
import type { ShipControlFrame } from './shipControlFrame';
import { defaultControlFrame, zeroControlFrame } from './shipControlFrame';
import type { ShipEntity } from './shipEntity';

export type NPCState = 'patrol' | 'transit' | 'trade' | 'hostile' | 'flee';
type TransitPhase = 'approaching' | 'loitering' | 'departing';

const ROTATION_THRESHOLD_RAD = 0.08;
const TAIL_DISTANCE = 500;

/**
 * Playtest: chase / back-off / strafe band around `NPC_PREFERRED_COMBAT_RANGE` in hostile AI.
 */
export const NPC_HOSTILE_DISTANCE_KEEPING_ENABLED = true;

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

function rotateToward(
  selfAngle: number,
  targetAngle: number,
  _angularVelocity: number,
  alignThresholdRad: number = ROTATION_THRESHOLD_RAD
): { rotateCW: boolean; rotateCCW: boolean; autoBrakeRotation: boolean; angleDiff: number } {
  const diff = wrapAngle(targetAngle - selfAngle);
  if (diff > alignThresholdRad) {
    return { rotateCW: true, rotateCCW: false, autoBrakeRotation: false, angleDiff: diff };
  }
  if (diff < -alignThresholdRad) {
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
  private departureTarget: Vector2 | null = null;
  private readonly factionId: string;
  /** Accumulator for hostile/tail aim pulse while target is in weapon range (player-parity rotation brake). */
  private aimPulsePhaseSec = 0;

  constructor(initialState: NPCState, sectorSeed: number, factionId: string) {
    this.state = initialState;
    this.factionId = factionId;
    this.alwaysHostile = initialState === 'hostile';
    this.prng = childPRNG(sectorSeed, `npc_controller_${factionId}_${initialState}`);
    this.patrolPoints = Array.from({ length: PATROL_WAYPOINT_COUNT }, () => this.randomSectorPoint(300));
    this.patrolTarget = this.patrolPoints[0];
    this.loiterTimer = this.randomRange(TRANSIT_LOITER_MIN, TRANSIT_LOITER_MAX);
  }

  getState(): NPCState {
    return this.state;
  }

  getDebugModeLabel(): string {
    if (this.state === 'transit') {
      return `transit:${this.transitPhase}`;
    }
    return this.state;
  }

  getAggroTargetId(): string | null {
    return this.aggroTargetId;
  }

  getHostilityState(): 'none' | 'toPlayer' | 'toOther' {
    if (this.state !== 'hostile' || !this.aggroTargetId) {
      return 'none';
    }
    return this.aggroTargetType === 'player' ? 'toPlayer' : 'toOther';
  }

  receiveAttack(attackerId: string, attackerFactionId: string | null, damage: number): void {
    if (attackerFactionId !== null && attackerFactionId === this.factionId) {
      return;
    }
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
  ): ShipControlFrame {
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

    if (this.state === 'hostile' && self.state.maxHullHP > 0 && self.state.currentHullHP / self.state.maxHullHP < this.fleeHPThreshold) {
      this.state = 'flee';
    }

    if (this.state === 'patrol') return this.updatePatrol(dt, self, player, playerDistance, worldState);
    if (this.state === 'transit') return this.updateTransit(dt, self, landables, worldState);
    if (this.state === 'trade') return this.updateTrade(self, landables);
    if (this.state === 'hostile') return this.updateHostile(dt, self, player, otherNPCs);
    return this.updateFlee(self, player, otherNPCs, playerDistance);
  }

  private updatePatrol(
    dt: number,
    self: ShipEntity,
    player: ShipEntity,
    playerDistance: number,
    worldState: WorldState
  ): ShipControlFrame {
    const frame = defaultControlFrame();
    const factionId = self.state.factionId;
    const tier = factionId ? worldState.getReputationTier(factionId) : 'neutral';
    if (tier === 'unfriendly') return this.updateTailPlayer(dt, self, player, playerDistance);

    const selfPos = self.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, this.patrolTarget);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
      frame.thrusters.forward = true;
      frame.thrusters.autoBrakeLinear = false;
    }
    if (Vector2.distance(selfPos, this.patrolTarget) <= PATROL_WAYPOINT_ARRIVAL_RADIUS) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this.patrolTarget = this.patrolPoints[this.patrolIndex];
    }
    return frame;
  }

  private updateTransit(dt: number, self: ShipEntity, landables: Landable[], worldState: WorldState): ShipControlFrame {
    const frame = defaultControlFrame();
    if (!this.transitTarget) {
      this.transitTarget = this.pickTransitTarget(self, landables);
    }

    if (this.transitPhase === 'approaching') {
      const target = this.transitTarget ?? this.randomSectorPoint(200);
      const selfPos = self.state.position as Vector2;
      const dist = Vector2.distance(selfPos, target);
      const targetAngle = angleToTarget(selfPos, target);
      let rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
      frame.thrusters.rotateCW = rotation.rotateCW;
      frame.thrusters.rotateCCW = rotation.rotateCCW;
      frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
      if (dist <= TRANSIT_APPROACH_BRAKE_RADIUS && (self.state.velocity as Vector2).magnitude() > LANDING_SPEED_THRESHOLD) {
        if (self.hasAutoBrake(worldState)) {
          frame.thrusters.autoBrakeLinear = true;
        } else if (self.hasReverseThruster(worldState)) {
          if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
            frame.thrusters.reverse = true;
            frame.thrusters.autoBrakeLinear = false;
          }
        } else {
          const velocity = self.state.velocity as Vector2;
          const retrogradeTarget =
            velocity.magnitudeSquared() > 0
              ? selfPos.sub(velocity)
              : selfPos.add(Vector2.fromAngle(self.state.angle).scale(-1));
          const retrogradeAngle = angleToTarget(selfPos, retrogradeTarget);
          rotation = rotateToward(self.state.angle, retrogradeAngle, self.state.angularVelocity);
          frame.thrusters.rotateCW = rotation.rotateCW;
          frame.thrusters.rotateCCW = rotation.rotateCCW;
          frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
          if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
            frame.thrusters.forward = true;
            frame.thrusters.autoBrakeLinear = false;
          }
        }
      } else if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
        frame.thrusters.forward = true;
        frame.thrusters.autoBrakeLinear = false;
      }
      if (dist <= TRANSIT_LOITER_RADIUS) {
        this.transitPhase = 'loitering';
        this.loiterTimer = this.randomRange(TRANSIT_LOITER_MIN, TRANSIT_LOITER_MAX);
      }
      return frame;
    }

    if (this.transitPhase === 'loitering') {
      const selfPos = self.state.position as Vector2;
      const target = this.transitTarget ?? selfPos;
      const driftDistance = Vector2.distance(selfPos, target);
      this.loiterTimer -= dt;
      if (driftDistance > TRANSIT_LOITER_RADIUS * TRANSIT_LOITER_DRIFT_THRESHOLD) {
        this.transitPhase = 'approaching';
        return defaultControlFrame();
      }
      if (this.loiterTimer <= 0) {
        const ruleState = self.spawnRuleStateRef;
        const minPresent = Number.isFinite(ruleState?.rule.minPresent) ? Math.max(0, Math.floor(ruleState!.rule.minPresent)) : 0;
        if (ruleState && ruleState.currentCount - 1 < minPresent) {
          this.loiterTimer = TRANSIT_LOITER_MIN * TRANSIT_LOITER_EXTENSION;
          return zeroControlFrame();
        }
        this.transitPhase = 'departing';
        self.isLeaving = true;
      }
      return zeroControlFrame();
    }

    if (!this.departureTarget) {
      this.departureTarget = this.pickDepartureTarget();
      self.isLeaving = true;
    }
    const selfPos = self.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, this.departureTarget);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
      frame.thrusters.forward = true;
      frame.thrusters.autoBrakeLinear = false;
    }
    return frame;
  }

  private updateTailPlayer(dt: number, self: ShipEntity, player: ShipEntity, playerDistance: number): ShipControlFrame {
    const frame = defaultControlFrame();
    const selfPos = self.state.position as Vector2;
    const playerPos = player.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, playerPos);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;

    if (playerDistance > TAIL_DISTANCE + 75 && Math.abs(rotation.angleDiff) < (30 * Math.PI) / 180) {
      frame.thrusters.forward = true;
      frame.thrusters.autoBrakeLinear = false;
    } else if (playerDistance < TAIL_DISTANCE - 75 && Math.abs(rotation.angleDiff) < (30 * Math.PI) / 180) {
      frame.thrusters.reverse = true;
      frame.thrusters.autoBrakeLinear = false;
    }
    this.applyWeaponRangeRotationPulse(dt, frame, playerDistance <= this.fireRange);
    return frame;
  }

  private updateTrade(self: ShipEntity, landables: Landable[]): ShipControlFrame {
    const frame = defaultControlFrame();
    this.ensureTradeRoute(landables);
    const target = this.tradeToA ? this.tradePointA : this.tradePointB;
    if (!target) return frame;
    const selfPos = self.state.position as Vector2;
    const targetAngle = angleToTarget(selfPos, target);
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (20 * Math.PI) / 180) {
      frame.thrusters.forward = true;
      frame.thrusters.autoBrakeLinear = false;
    }
    if (Vector2.distance(selfPos, target) <= PATROL_WAYPOINT_ARRIVAL_RADIUS) {
      this.tradeToA = !this.tradeToA;
    }
    return frame;
  }

  private updateHostile(dt: number, self: ShipEntity, player: ShipEntity, otherNPCs: ShipEntity[]): ShipControlFrame {
    const frame = defaultControlFrame();
    const target = this.resolveAggroTarget(player, otherNPCs);
    if (!target) {
      this.clearAggro();
      this.state = 'patrol';
      return defaultControlFrame();
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
      return defaultControlFrame();
    }

    const targetAngle = angleToTarget(selfPos, targetPos);
    const rotation = rotateToward(
      self.state.angle,
      targetAngle,
      self.state.angularVelocity,
      NPC_HOSTILE_AIM_ANGLE_DEADBAND_RAD
    );
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
    const absAngleDiff = Math.abs(rotation.angleDiff);

    if (NPC_HOSTILE_DISTANCE_KEEPING_ENABLED) {
      if (targetDistance > NPC_PREFERRED_COMBAT_RANGE + 100) {
        if (absAngleDiff < (35 * Math.PI) / 180) {
          frame.thrusters.forward = true;
          frame.thrusters.autoBrakeLinear = false;
        }
      } else if (targetDistance < NPC_PREFERRED_COMBAT_RANGE - 100) {
        if (absAngleDiff < (35 * Math.PI) / 180) {
          frame.thrusters.reverse = true;
          frame.thrusters.autoBrakeLinear = false;
        }
      } else if (absAngleDiff < (30 * Math.PI) / 180) {
        if (targetDistance > this.fireRange) {
          this.strafeTimer += dt;
          if (this.strafeTimer >= NPC_STRAFE_INTERVAL) {
            this.strafeTimer = 0;
            this.strafeDirection = this.strafeDirection === 1 ? -1 : 1;
          }
          frame.thrusters.autoBrakeLinear = false;
          if (this.strafeDirection === 1) {
            frame.thrusters.rotateCW = true;
            frame.thrusters.rotateCCW = false;
            frame.thrusters.autoBrakeRotation = false;
          } else {
            frame.thrusters.rotateCCW = true;
            frame.thrusters.rotateCW = false;
            frame.thrusters.autoBrakeRotation = false;
          }
        }
        // In weapon range: keep facing from rotateToward above — no orbit strafe; pulse applies below.
      }
    }

    if (Math.abs(rotation.angleDiff) < (20 * Math.PI) / 180 && targetDistance <= this.fireRange) {
      frame.weapons.Z = true;
    }
    this.applyWeaponRangeRotationPulse(dt, frame, targetDistance <= this.fireRange);
    return frame;
  }

  private updateFlee(self: ShipEntity, player: ShipEntity, otherNPCs: ShipEntity[], playerDistance: number): ShipControlFrame {
    const frame = defaultControlFrame();
    self.isLeaving = true;
    const threatTarget = this.resolveAggroTarget(player, otherNPCs) ?? player;
    const threatDistance =
      threatTarget.state.id === 'player'
        ? playerDistance
        : Vector2.distance(self.state.position as Vector2, threatTarget.state.position as Vector2);

    if (threatDistance > this.aggroRange * 2) {
      this.clearAggro();
      this.state = 'patrol';
      return defaultControlFrame();
    }

    const selfPos = self.state.position as Vector2;
    const awayDirection = selfPos.sub(threatTarget.state.position as Vector2);
    const targetAngle = awayDirection.magnitudeSquared() > 0 ? Math.atan2(awayDirection.x, -awayDirection.y) : self.state.angle;
    const rotation = rotateToward(self.state.angle, targetAngle, self.state.angularVelocity);
    frame.thrusters.rotateCW = rotation.rotateCW;
    frame.thrusters.rotateCCW = rotation.rotateCCW;
    frame.thrusters.autoBrakeRotation = rotation.autoBrakeRotation;
    if (Math.abs(rotation.angleDiff) < (25 * Math.PI) / 180) {
      frame.thrusters.forward = true;
      frame.thrusters.autoBrakeLinear = false;
    }
    return frame;
  }

  /**
   * While target is in weapon range, pulse rotation thrusters so coast segments match player physics:
   * auto-brake rotation only bites when rotate thrusters are off.
   */
  private applyWeaponRangeRotationPulse(dt: number, frame: ShipControlFrame, inWeaponRange: boolean): void {
    if (!inWeaponRange) {
      this.aimPulsePhaseSec = 0;
      return;
    }
    this.aimPulsePhaseSec += dt;
    const period = NPC_HOSTILE_AIM_PULSE_PERIOD_SEC;
    while (this.aimPulsePhaseSec >= period) {
      this.aimPulsePhaseSec -= period;
    }
    const thrustOn = this.aimPulsePhaseSec < period * NPC_HOSTILE_AIM_PULSE_THRUST_DUTY;
    if (!thrustOn) {
      frame.thrusters.rotateCW = false;
      frame.thrusters.rotateCCW = false;
      frame.thrusters.autoBrakeRotation = true;
    }
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
    const half = SECTOR_SIZE / 2;
    if (edge === 'north') return new Vector2((this.prng.next() - 0.5) * SECTOR_SIZE * 0.875, -(half + 200));
    if (edge === 'south') return new Vector2((this.prng.next() - 0.5) * SECTOR_SIZE * 0.875, half + 200);
    if (edge === 'east') return new Vector2(half + 200, (this.prng.next() - 0.5) * SECTOR_SIZE * 0.875);
    return new Vector2(-(half + 200), (this.prng.next() - 0.5) * SECTOR_SIZE * 0.875);
  }

  private randomSectorPoint(inset: number): Vector2 {
    const min = -(SECTOR_SIZE / 2) + inset;
    const max = SECTOR_SIZE / 2 - inset;
    return new Vector2(this.prng.nextInt(min, max), this.prng.nextInt(min, max));
  }

  private randomRange(min: number, max: number): number {
    return min + this.prng.next() * (max - min);
  }
}

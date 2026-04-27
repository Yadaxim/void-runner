import {
  FUEL_USE_LINEAR_THRUSTER_PER_SECOND,
  FUEL_USE_ROTATION_THRUSTER_PER_SECOND,
  NPC_FADE_DURATION,
  NPC_LEAVING_OPACITY
} from '../constants';
import type { AutoBrakeItem, ShipState, ThrusterItem } from '../types';
import {
  applyForce,
  clampVelocity,
  integrateAngle,
  integratePosition
} from '../physics/newtonian';
import { Vector2 } from '../physics/vector2';
import type { Landable } from '../types';
import type { WorldState } from '../core/worldState';
import type { NPCController, NPCInputs, NPCState } from './npcController';
import type { SpawnRuleState } from './sector';

export interface ThrusterInputs {
  forward: boolean;
  reverse: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  autoBrakeLinear: boolean;
  autoBrakeRotation: boolean;
}

export class ShipEntity {
  state: ShipState;
  private destroyed = false;
  private npcController: NPCController | null = null;
  private npcBehaviourType: NPCState | null = null;
  private npcLastState: NPCState | null = null;
  spawnRuleStateRef: SpawnRuleState | null = null;
  spawnAge = 0;
  isLeaving = false;

  private pendingForce: Vector2 = Vector2.zero();
  private pendingTorque = 0;
  private autoBrakeLinear = false;
  private autoBrakeRotation = false;
  private autoBrakeLinearActive = false;
  private autoBrakeRotationActive = false;
  private forwardThrusterRequested = false;
  private reverseThrusterRequested = false;
  private rotateCWThrusterRequested = false;
  private rotateCCWThrusterRequested = false;
  private linearThrustersActive = false;
  private rotationThrustersActive = false;

  constructor(initialState: ShipState) {
    this.state = initialState;
    this.autoBrakeLinear = initialState.autoBrakeLinearEnabled;
    this.autoBrakeRotation = initialState.autoBrakeRotationEnabled;
  }

  isLinearAutoBrakeEnabled(): boolean {
    return this.autoBrakeLinear;
  }

  isRotationAutoBrakeEnabled(): boolean {
    return this.autoBrakeRotation;
  }

  applyExternalForce(force: Vector2): void {
    this.pendingForce = this.pendingForce.add(force);
  }

  attachNPCController(controller: NPCController, behaviourType: NPCState): void {
    this.npcController = controller;
    this.npcBehaviourType = behaviourType;
    this.npcLastState = behaviourType;
  }

  getNPCBehaviourType(): NPCState | null {
    return this.npcBehaviourType;
  }

  getNPCState(): NPCState | null {
    return this.npcLastState;
  }

  getNPCController(): NPCController | null {
    return this.npcController;
  }

  isNPCHostile(): boolean {
    return this.getNPCHostilityState() !== 'none';
  }

  getNPCHostilityState(): 'none' | 'toPlayer' | 'toOther' {
    if (this.npcController) {
      return this.npcController.getHostilityState();
    }
    if (this.npcLastState === 'hostile' || this.npcBehaviourType === 'hostile') {
      return 'toPlayer';
    }
    return 'none';
  }

  getOpacity(): number {
    if (this.spawnAge < NPC_FADE_DURATION) {
      return this.spawnAge / NPC_FADE_DURATION;
    }
    if (this.isLeaving) {
      return NPC_LEAVING_OPACITY;
    }
    return 1.0;
  }

  markDestroyed(): void {
    this.destroyed = true;
  }

  isDestroyed(): boolean {
    return this.destroyed || this.state.currentHullHP <= 0;
  }

  recalculateMaxHP(worldState: WorldState): void {
    const hullSpec = worldState.getHullSpec(this.state.hullSpecId);
    if (!hullSpec) {
      return;
    }
    const newMaxHP = hullSpec.baseHP;
    const delta = newMaxHP - this.state.maxHullHP;
    this.state.maxHullHP = newMaxHP;
    if (delta > 0) {
      this.state.currentHullHP = Math.min(this.state.currentHullHP + delta, newMaxHP);
    }
    this.state.currentHullHP = Math.min(this.state.currentHullHP, newMaxHP);
  }

  getTotalArmourMass(worldState: WorldState): number {
    return this.state.equipmentSlots
      .filter((slot) => slot.itemId !== null)
      .reduce((total, slot) => {
        const item = worldState.getEquipmentItem(slot.itemId!);
        if (item?.type === 'armour') {
          return total + item.mass;
        }
        return total;
      }, 0);
  }

  getThrusterForce(
    slotType: 'thruster_forward' | 'thruster_reverse' | 'thruster_rotate',
    worldState: WorldState
  ): number {
    const slot = this.state.equipmentSlots.find((s) => s.slotType === slotType);
    if (!slot?.itemId) return 0;
    const item = worldState.getEquipmentItem(slot.itemId);
    if (!item || item.type !== 'thruster') return 0;
    return (item as ThrusterItem).force;
  }

  getAutoBrake(worldState: WorldState): AutoBrakeItem | null {
    const slot = this.state.equipmentSlots.find((s) => s.slotType === 'autoBrake');
    if (!slot?.itemId) return null;
    const item = worldState.getEquipmentItem(slot.itemId);
    if (!item || item.type !== 'autoBrake') return null;
    return item as AutoBrakeItem;
  }

  hasAutoBrake(worldState: WorldState): boolean {
    return this.getAutoBrake(worldState) !== null;
  }

  hasReverseThruster(worldState: WorldState): boolean {
    return this.getThrusterForce('thruster_reverse', worldState) > 0;
  }

  getEffectiveMass(worldState: WorldState): number {
    const hullSpec = worldState.getHullSpec(this.state.hullSpecId);
    const hullMass = hullSpec?.hullMass ?? 100;
    const equipMass = this.state.equipmentSlots.reduce((total, slot) => {
      if (!slot.itemId) return total;
      return total + (worldState.getEquipmentItem(slot.itemId)?.mass ?? 0);
    }, 0);
    const cargoMass = this.state.cargo.reduce((total, item) => total + item.weight, 0);
    return hullMass + equipMass + cargoMass;
  }

  getTopSpeed(worldState: WorldState): number {
    return worldState.getHullSpec(this.state.hullSpecId)?.topSpeed ?? 250;
  }

  getTopAngularSpeed(worldState: WorldState): number {
    return worldState.getHullSpec(this.state.hullSpecId)?.topAngularSpeed ?? 3.0;
  }

  applyThrusterInputs(inputs: ThrusterInputs, worldState: WorldState, dt: number): void {
    this.autoBrakeLinear = inputs.autoBrakeLinear;
    this.autoBrakeRotation = inputs.autoBrakeRotation;
    this.forwardThrusterRequested = inputs.forward;
    this.reverseThrusterRequested = inputs.reverse;
    this.rotateCWThrusterRequested = inputs.rotateCW;
    this.rotateCCWThrusterRequested = inputs.rotateCCW;

    const mass = this.getEffectiveMass(worldState);
    const autoBrake = this.getAutoBrake(worldState);
    const availableFuel = Math.max(0, this.state.fuel);

    const forwardForce = this.forwardThrusterRequested
      ? this.getThrusterForce('thruster_forward', worldState)
      : 0;
    const reverseForce = this.reverseThrusterRequested
      ? this.getThrusterForce('thruster_reverse', worldState)
      : 0;
    const rotateForce = (this.rotateCWThrusterRequested || this.rotateCCWThrusterRequested)
      ? this.getThrusterForce('thruster_rotate', worldState)
      : 0;

    const activeLinearThrusters = (forwardForce > 0 ? 1 : 0) + (reverseForce > 0 ? 1 : 0);
    const activeRotationThrusters = rotateForce > 0 && (this.rotateCWThrusterRequested || this.rotateCCWThrusterRequested) ? 1 : 0;
    const requestedFuel =
      (activeLinearThrusters * FUEL_USE_LINEAR_THRUSTER_PER_SECOND +
        activeRotationThrusters * FUEL_USE_ROTATION_THRUSTER_PER_SECOND) *
      dt;
    const fuelScale = requestedFuel > 0 ? Math.min(1, availableFuel / requestedFuel) : 1;
    const fuelConsumed = requestedFuel * fuelScale;

    if (forwardForce > 0 && fuelScale > 0) {
      const dir = Vector2.fromAngle(this.state.angle);
      this.pendingForce = this.pendingForce.add(dir.scale(forwardForce * fuelScale));
    }
    if (reverseForce > 0 && fuelScale > 0) {
      const dir = Vector2.fromAngle(this.state.angle).scale(-1);
      this.pendingForce = this.pendingForce.add(dir.scale(reverseForce * fuelScale));
    }
    if (this.rotateCWThrusterRequested && rotateForce > 0 && fuelScale > 0) {
      this.pendingTorque += (rotateForce * fuelScale) / mass;
    }
    if (this.rotateCCWThrusterRequested && rotateForce > 0 && fuelScale > 0) {
      this.pendingTorque -= (rotateForce * fuelScale) / mass;
    }
    if (this.autoBrakeRotation && rotateForce > 0 && fuelScale > 0) {
      const av = this.state.angularVelocity;
      if (Math.abs(av) > 0.01) {
        this.pendingTorque -= Math.sign(av) * ((rotateForce * fuelScale) / mass) * 0.5;
      }
    }

    if (this.autoBrakeLinear && autoBrake) {
      this.autoBrakeLinearActive = true;
    }
    if (this.autoBrakeRotation && autoBrake) {
      this.autoBrakeRotationActive = true;
    }

    this.linearThrustersActive = fuelScale > 0 && activeLinearThrusters > 0;
    this.rotationThrustersActive = fuelScale > 0 && activeRotationThrusters > 0;
    this.state.fuel = Math.max(0, this.state.fuel - fuelConsumed);
  }

  update(
    dt: number,
    worldState: WorldState,
    externalInputs?: ThrusterInputs,
    context?: { player: ShipEntity; otherNPCs: ShipEntity[]; landables: Landable[] }
  ): NPCInputs | null {
    let npcInputs: NPCInputs | null = null;
    if (this.npcController && !this.state.isPlayerControlled && context) {
      npcInputs = this.npcController.update(dt, this, context.player, context.otherNPCs, context.landables, worldState);
      this.applyThrusterInputs(npcInputs, worldState, dt);
      this.npcLastState = this.npcController.getState();
    } else if (externalInputs) {
      this.applyThrusterInputs(externalInputs, worldState, dt);
    }

    const mass = this.getEffectiveMass(worldState);
    const autoBrake = this.getAutoBrake(worldState);
    let nextVelocity = applyForce(this.state.velocity as Vector2, this.pendingForce, mass, dt);
    let nextAngularVelocity = this.state.angularVelocity + this.pendingTorque * dt;

    if (this.autoBrakeLinearActive && autoBrake) {
      nextVelocity = nextVelocity.scale(Math.max(0, 1 - autoBrake.dampingFactor * dt));
    }
    if (this.autoBrakeRotationActive && autoBrake) {
      nextAngularVelocity *= Math.max(0, 1 - autoBrake.angularDampingFactor * dt);
    }

    const topSpeed = this.getTopSpeed(worldState);
    const topAngularSpeed = this.getTopAngularSpeed(worldState);
    nextVelocity = clampVelocity(nextVelocity, topSpeed);
    nextAngularVelocity = Math.max(-topAngularSpeed, Math.min(topAngularSpeed, nextAngularVelocity));

    this.state = {
      ...this.state,
      velocity: nextVelocity,
      angularVelocity: nextAngularVelocity,
      position: integratePosition(this.state.position as Vector2, nextVelocity, dt),
      angle: integrateAngle(this.state.angle, nextAngularVelocity, dt),
      autoBrakeLinearEnabled: this.autoBrakeLinear,
      autoBrakeRotationEnabled: this.autoBrakeRotation
    };

    this.pendingForce = Vector2.zero();
    this.pendingTorque = 0;
    this.autoBrakeLinearActive = false;
    this.autoBrakeRotationActive = false;
    this.linearThrustersActive = false;
    this.rotationThrustersActive = false;
    this.forwardThrusterRequested = false;
    this.reverseThrusterRequested = false;
    this.rotateCWThrusterRequested = false;
    this.rotateCCWThrusterRequested = false;

    this.spawnAge += dt;
    return npcInputs;
  }
}

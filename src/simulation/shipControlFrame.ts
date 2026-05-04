import type { WorldState } from '../core/worldState';
import type { WeaponFireKey } from '../types';

/** Thruster + auto-brake booleans shared by player, NPC, and replay/autopilot paths. */
export interface ShipThrusterInputs {
  forward: boolean;
  reverse: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  autoBrakeLinear: boolean;
  autoBrakeRotation: boolean;
}

/**
 * One simulation tick: thrusters plus weapon fire keys.
 * Human keyboard, scripted NPC, recorded replay, and future neural output all emit this shape.
 */
export interface ShipControlFrame {
  thrusters: ShipThrusterInputs;
  weapons: Record<WeaponFireKey, boolean>;
}

export interface ShipThrustApplyTarget {
  applyThrusterInputs(inputs: ShipThrusterInputs, worldState: WorldState, dt: number): void;
}

export function emptyWeaponFireInputs(): Record<WeaponFireKey, boolean> {
  return { Z: false, X: false, C: false, V: false, B: false };
}

/** NPC default: auto-brake toggles on; no thrust; no weapons. */
export function defaultThrusterHold(): ShipThrusterInputs {
  return {
    forward: false,
    reverse: false,
    rotateCW: false,
    rotateCCW: false,
    autoBrakeLinear: true,
    autoBrakeRotation: true
  };
}

/** All thruster booleans false (e.g. transit drift). */
export function zeroThrusterInputs(): ShipThrusterInputs {
  return {
    forward: false,
    reverse: false,
    rotateCW: false,
    rotateCCW: false,
    autoBrakeLinear: false,
    autoBrakeRotation: false
  };
}

export function defaultControlFrame(): ShipControlFrame {
  return { thrusters: defaultThrusterHold(), weapons: emptyWeaponFireInputs() };
}

export function zeroControlFrame(): ShipControlFrame {
  return { thrusters: zeroThrusterInputs(), weapons: emptyWeaponFireInputs() };
}

/** Single entry for applying thruster torques from any control source. */
export function applyShipControlFrame(
  ship: ShipThrustApplyTarget,
  frame: ShipControlFrame,
  worldState: WorldState,
  dt: number
): void {
  ship.applyThrusterInputs(frame.thrusters, worldState, dt);
}

import {
  AI_OUTPUT_THRESHOLD,
  OUTPUT_VECTOR_SIZE
} from '../constants';
import type { ShipState, WeaponFireKey } from '../types';
import type { TimestampedControlFrame } from './controlFrameRecorder';
import type { ShipControlFrame, ShipThrusterInputs } from './shipControlFrame';
import { emptyWeaponFireInputs, zeroThrusterInputs } from './shipControlFrame';

/** Canonical row-major order for NN logits / probabilities — must match {@link OUTPUT_VECTOR_SIZE}. */
export const SHIP_CONTROL_THRUSTER_ORDER: (keyof ShipThrusterInputs)[] = [
  'forward',
  'reverse',
  'rotateCW',
  'rotateCCW',
  'autoBrakeLinear',
  'autoBrakeRotation'
];

export const SHIP_CONTROL_WEAPON_KEY_ORDER: WeaponFireKey[] = ['Z', 'X', 'C', 'V', 'B'];

if (SHIP_CONTROL_THRUSTER_ORDER.length + SHIP_CONTROL_WEAPON_KEY_ORDER.length !== OUTPUT_VECTOR_SIZE) {
  throw new Error('OUTPUT_VECTOR_SIZE must match thruster + weapon key count');
}

/** Stable string for “brain trained on this hull + equipment + weapon layout”. */
export function computeShipLoadoutFingerprint(ship: ShipState): string {
  const slots = ship.equipmentSlots
    .map((s) => `${s.slotType}:${s.itemId ?? ''}`)
    .join('|');
  const weapons = ship.weaponLoadout
    .map((w) => `${w.fireKey}:${w.itemId}:${w.stackCount}`)
    .join('|');
  return `${ship.hullSpecId}#${slots}#${weapons}`;
}

/** Training / inference labels: 0/1 in canonical {@link SHIP_CONTROL_*_ORDER}. */
export function encodeShipControlFrameToFloat32Array(frame: ShipControlFrame): Float32Array {
  const out = new Float32Array(OUTPUT_VECTOR_SIZE);
  let i = 0;
  for (const key of SHIP_CONTROL_THRUSTER_ORDER) {
    out[i++] = frame.thrusters[key] ? 1 : 0;
  }
  for (const key of SHIP_CONTROL_WEAPON_KEY_ORDER) {
    out[i++] = frame.weapons[key] ? 1 : 0;
  }
  return out;
}

export function decodeVectorToShipControlFrame(
  raw: ArrayLike<number>,
  threshold: number = AI_OUTPUT_THRESHOLD
): ShipControlFrame {
  const thrusters = { ...zeroThrusterInputs() };
  const weapons = emptyWeaponFireInputs();
  let i = 0;
  for (const key of SHIP_CONTROL_THRUSTER_ORDER) {
    thrusters[key] = i < raw.length && Number(raw[i]) >= threshold;
    i += 1;
  }
  for (const key of SHIP_CONTROL_WEAPON_KEY_ORDER) {
    weapons[key] = i < raw.length && Number(raw[i]) >= threshold;
    i += 1;
  }
  return { thrusters, weapons };
}

/** Row-major `frames.length × OUTPUT_VECTOR_SIZE` for imitation-learning targets. */
export function trainingLabelsFromRecording(frames: TimestampedControlFrame[]): Float32Array {
  const n = frames.length;
  const out = new Float32Array(n * OUTPUT_VECTOR_SIZE);
  for (let r = 0; r < n; r += 1) {
    const row = encodeShipControlFrameToFloat32Array(frames[r]!.frame);
    out.set(row, r * OUTPUT_VECTOR_SIZE);
  }
  return out;
}

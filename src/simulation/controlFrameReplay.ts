import {
  MAX_DELTA_SECONDS,
  MAX_RADIATION_DAMAGE_PER_SECOND
} from '../constants';
import type { WorldState } from '../core/worldState';
import { makeHeadlessSim, type HeadlessSimOptions } from '../sim/headlessSim';
import { computeGravity } from '../physics/gravity';
import { Vector2 } from '../physics/vector2';
import type { TimestampedControlFrame } from './controlFrameRecorder';
import { applyShipControlFrame } from './shipControlFrame';

/** Imitation-learning targets (flattened rows) — same canonical layout as {@link OUTPUT_VECTOR_SIZE}. */
export { trainingLabelsFromRecording } from './shipControlNeural';
import type { SectorSimulation } from './sector';
import type { ShipEntity } from './shipEntity';

export interface HeadlessControlFrameReplayOptions extends HeadlessSimOptions {
  frames: TimestampedControlFrame[];
  /** Homing / bullet targeting — same role as flight HUD ship target. Default null. */
  playerWeaponTargetId?: string | null;
  /** Synthetic wall-clock ms for shield/reactor ticks; advances by dt×1000 each step. */
  initialNowMs?: number;
}

function clampDt(raw: number): number {
  return Math.min(MAX_DELTA_SECONDS, Math.max(0, raw));
}

/** Delta implied by consecutive {@link TimestampedControlFrame.timeSeconds} samples. */
export function deltaSecondsForRecordedFrame(
  frames: TimestampedControlFrame[],
  index: number,
  fallbackDt: number
): number {
  if (index + 1 < frames.length) {
    return clampDt(frames[index + 1]!.timeSeconds - frames[index]!.timeSeconds);
  }
  if (index > 0) {
    return clampDt(frames[index]!.timeSeconds - frames[index - 1]!.timeSeconds);
  }
  return fallbackDt;
}

/**
 * Runs the same player physics + sector tick ordering as {@link FlightScreen} update,
 * feeding recorded control frames. Uses optional `nowMs` on sector ticks so headless runs are deterministic.
 */
export function runHeadlessControlFrameReplay(opts: HeadlessControlFrameReplayOptions): {
  worldState: WorldState;
  playerShip: ShipEntity;
  sectorSimulation: SectorSimulation;
} {
  const {
    frames,
    playerWeaponTargetId = null,
    initialNowMs = 1_000_000,
    ...simOpts
  } = opts;

  const { worldState, playerShip, sectorSimulation } = makeHeadlessSim(simOpts);
  const landables = worldState.getLandablesInCurrentSector();
  let nowMs = initialNowMs;
  const fallbackDt = 1 / 60;

  for (let i = 0; i < frames.length; i += 1) {
    const sample = frames[i]!;
    const frame = sample.frame;
    const dt = deltaSecondsForRecordedFrame(frames, i, fallbackDt);

    const mass = playerShip.getEffectiveMass(worldState);
    const gravity = computeGravity(
      playerShip.state.position as Vector2,
      mass,
      landables.map((landable) => ({
        position: landable.position as Vector2,
        mass: landable.mass,
        radius: landable.radius
      }))
    );
    playerShip.applyExternalForce(gravity);
    applyShipControlFrame(playerShip, frame, worldState, dt);
    playerShip.update(dt, worldState);

    sectorSimulation.getWeaponSystem().update(
      dt,
      playerShip.state,
      frame.weapons,
      worldState,
      playerWeaponTargetId
    );
    sectorSimulation.update(dt, { nowMs });

    const intensity = worldState.getRadiationIntensity();
    if (intensity > 0) {
      const damage = MAX_RADIATION_DAMAGE_PER_SECOND * intensity * dt;
      const newHP = Math.max(0, playerShip.state.currentHullHP - damage);
      playerShip.state = { ...playerShip.state, currentHullHP: newHP };
      worldState.updatePlayerShipState({ currentHullHP: newHP });
    }

    worldState.addPlayTime(dt);
    nowMs += dt * 1000;
  }

  return { worldState, playerShip, sectorSimulation };
}

import { describe, expect, it } from 'vitest';
import {
  AI_OUTPUT_THRESHOLD,
  NEURAL_LOADOUT_STALE_SECONDS,
  OUTPUT_VECTOR_SIZE
} from '../constants';
import { loadTestWorldFile, makeHeadlessSim } from '../sim/headlessSim';
import type { TimestampedControlFrame } from './controlFrameRecorder';
import { NeuralPilot } from './neuralPilot';
import {
  computeShipLoadoutFingerprint,
  decodeVectorToShipControlFrame,
  encodeShipControlFrameToFloat32Array,
  trainingLabelsFromRecording
} from './shipControlNeural';
import { emptyWeaponFireInputs, zeroThrusterInputs } from './shipControlFrame';

describe('shipControlNeural adapter', () => {
  it('OUTPUT_VECTOR_SIZE matches flattened ShipControlFrame slots', () => {
    expect(OUTPUT_VECTOR_SIZE).toBe(11);
  });

  it('encode → decode round-trip at default threshold', () => {
    const frame = {
      thrusters: {
        ...zeroThrusterInputs(),
        forward: true,
        reverse: false,
        rotateCW: true,
        rotateCCW: false,
        autoBrakeLinear: false,
        autoBrakeRotation: true
      },
      weapons: { ...emptyWeaponFireInputs(), Z: true, B: true }
    };
    const vec = encodeShipControlFrameToFloat32Array(frame);
    expect(vec.length).toBe(OUTPUT_VECTOR_SIZE);
    const back = decodeVectorToShipControlFrame(vec, AI_OUTPUT_THRESHOLD);
    expect(back.thrusters.forward).toBe(true);
    expect(back.thrusters.rotateCW).toBe(true);
    expect(back.thrusters.reverse).toBe(false);
    expect(back.weapons.Z).toBe(true);
    expect(back.weapons.B).toBe(true);
    expect(back.weapons.X).toBe(false);
  });

  it('threshold converts soft logits to booleans', () => {
    const raw = new Float32Array(OUTPUT_VECTOR_SIZE).fill(0);
    raw[0] = AI_OUTPUT_THRESHOLD - 0.01;
    raw[1] = AI_OUTPUT_THRESHOLD + 0.01;
    const low = decodeVectorToShipControlFrame(raw, AI_OUTPUT_THRESHOLD);
    expect(low.thrusters.forward).toBe(false);
    expect(low.thrusters.reverse).toBe(true);
  });

  it('trainingLabelsFromRecording packs row-major targets', () => {
    const frames: TimestampedControlFrame[] = [
      {
        timeSeconds: 0,
        frame: {
          thrusters: { ...zeroThrusterInputs(), forward: true },
          weapons: emptyWeaponFireInputs()
        }
      },
      {
        timeSeconds: 1,
        frame: {
          thrusters: zeroThrusterInputs(),
          weapons: { ...emptyWeaponFireInputs(), X: true }
        }
      }
    ];
    const m = trainingLabelsFromRecording(frames);
    expect(m.length).toBe(2 * OUTPUT_VECTOR_SIZE);
    expect(m[0]).toBe(1);
    const secondRow = OUTPUT_VECTOR_SIZE;
    expect(m[secondRow + 7]).toBe(1);
  });

  it('computeShipLoadoutFingerprint changes when weapon loadout changes', () => {
    const wf = loadTestWorldFile();
    const { worldState, playerShip } = makeHeadlessSim({ worldFile: wf });
    const a = computeShipLoadoutFingerprint(playerShip.state);
    const wl = structuredClone(playerShip.state.weaponLoadout);
    if (wl.length > 0) {
      wl[0] = { ...wl[0]!, stackCount: wl[0]!.stackCount + 1 };
    }
    worldState.updatePlayerShipState({ weaponLoadout: wl });
    playerShip.state = worldState.getPlayerShipState();
    const b = computeShipLoadoutFingerprint(playerShip.state);
    expect(b).not.toBe(a);
  });
});

describe('NeuralPilot loadout staleness', () => {
  it('zeros control briefly after loadout fingerprint change', () => {
    const wf = loadTestWorldFile();
    const { worldState, playerShip, sectorSimulation } = makeHeadlessSim({ worldFile: wf });
    const ctx = {
      player: playerShip,
      otherNPCs: sectorSimulation.getNPCShips(),
      landables: worldState.getLandablesInCurrentSector(),
      worldState
    };
    const ones = () => new Float32Array(OUTPUT_VECTOR_SIZE).fill(1);
    const pilot = new NeuralPilot({
      getRawOutput: () => ones(),
      staleCooldownSeconds: NEURAL_LOADOUT_STALE_SECONDS
    });

    let frame = pilot.getControlFrame(0.016, playerShip, ctx);
    expect(frame.thrusters.forward).toBe(true);

    const wl = structuredClone(playerShip.state.weaponLoadout);
    if (wl.length > 0) {
      wl[0] = { ...wl[0]!, stackCount: Math.max(1, wl[0]!.stackCount + 1) };
    }
    worldState.updatePlayerShipState({ weaponLoadout: wl });
    playerShip.state = worldState.getPlayerShipState();

    frame = pilot.getControlFrame(0.016, playerShip, ctx);
    expect(frame.thrusters.forward).toBe(false);

    worldState.addPlayTime(NEURAL_LOADOUT_STALE_SECONDS + 0.1);
    frame = pilot.getControlFrame(0.016, playerShip, ctx);
    expect(frame.thrusters.forward).toBe(true);
  });
});

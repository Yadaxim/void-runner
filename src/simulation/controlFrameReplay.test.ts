import { describe, expect, it } from 'vitest';
import {
  ControlFrameRecorder,
  parseTimestampedControlFrames,
  serializeTimestampedControlFrames,
  type TimestampedControlFrame
} from './controlFrameRecorder';
import {
  deltaSecondsForRecordedFrame,
  runHeadlessControlFrameReplay
} from './controlFrameReplay';
import { emptyWeaponFireInputs, zeroThrusterInputs } from './shipControlFrame';
import { loadTestWorldFile } from '../sim/headlessSim';
import type { WorldFile } from '../types';

function forwardFrame(): TimestampedControlFrame['frame'] {
  return {
    thrusters: {
      ...zeroThrusterInputs(),
      forward: true,
      reverse: false,
      rotateCW: false,
      rotateCCW: false
    },
    weapons: emptyWeaponFireInputs()
  };
}

function buildLinearPlayTimeFrames(
  count: number,
  dt: number
): TimestampedControlFrame[] {
  const out: TimestampedControlFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ timeSeconds: i * dt, frame: forwardFrame() });
  }
  return out;
}

describe('control frame record / replay', () => {
  it('headless replay is deterministic for identical inputs', () => {
    const wf: WorldFile = loadTestWorldFile();
    const frames = buildLinearPlayTimeFrames(40, 1 / 60);
    const a = runHeadlessControlFrameReplay({ worldFile: wf, frames });
    const b = runHeadlessControlFrameReplay({ worldFile: wf, frames });
    const pa = a.playerShip.state.position as { x: number; y: number };
    const pb = b.playerShip.state.position as { x: number; y: number };
    expect(pa.x).toBeCloseTo(pb.x, 6);
    expect(pa.y).toBeCloseTo(pb.y, 6);
  });

  it('JSON serialize ↔ parse round-trip preserves frames', () => {
    const frames = buildLinearPlayTimeFrames(5, 1 / 60);
    const json = serializeTimestampedControlFrames(frames);
    const back = parseTimestampedControlFrames(json);
    expect(back.length).toBe(frames.length);
    expect(back[2]?.timeSeconds).toBeCloseTo(frames[2]!.timeSeconds, 8);
    expect(back[2]?.frame.thrusters.forward).toBe(true);
  });

  it('JSON round-trip preserves optional sensor payloads', () => {
    const frames = [
      {
        timeSeconds: 0,
        frame: forwardFrame(),
        sensor: {
          position: { x: 1, y: -2 },
          velocity: { x: 3, y: 4 },
          angle: 0.5,
          angularVelocity: 0.01,
          hullFraction: 0.9,
          shieldFraction: 0.8,
          radiationIntensity: 0.1,
          nearestNpcDistanceMetres: 100 as number | null,
          nearestHostileDistanceMetres: null as number | null,
          landPressed: true,
          devRefuelPressed: false
        }
      }
    ];
    const back = parseTimestampedControlFrames(serializeTimestampedControlFrames(frames));
    expect(back[0]?.sensor?.nearestNpcDistanceMetres).toBe(100);
    expect(back[0]?.sensor?.landPressed).toBe(true);
    expect(back[0]?.sensor?.position.x).toBe(1);
  });

  it('ControlFrameRecorder ring buffer tail matches pushed order', () => {
    const rec = new ControlFrameRecorder(8);
    rec.setEnabled(true);
    for (let i = 0; i < 4; i += 1) {
      rec.push(i * 0.1, forwardFrame());
    }
    const tail = rec.snapshotTail();
    expect(tail).toHaveLength(4);
    expect(tail[0]?.timeSeconds).toBe(0);
    expect(tail[3]?.timeSeconds).toBeCloseTo(0.3, 5);
  });

  it('deltaSecondsForRecordedFrame uses consecutive timestamps', () => {
    const frames = buildLinearPlayTimeFrames(3, 0.02);
    expect(deltaSecondsForRecordedFrame(frames, 0, 1 / 60)).toBeCloseTo(0.02, 5);
    expect(deltaSecondsForRecordedFrame(frames, 2, 1 / 60)).toBeCloseTo(0.02, 5);
  });
});

import type { ControlFrameSensorSnapshot } from './controlFrameSensor';
import type { ShipControlFrame } from './shipControlFrame';

export interface TimestampedControlFrame {
  /** Monotonic or world time in seconds — caller chooses clock. */
  timeSeconds: number;
  frame: ShipControlFrame;
  /** Optional observation vector (e.g. pre-step state for imitation learning). */
  sensor?: ControlFrameSensorSnapshot;
}

/**
 * Ring buffer for (time, control frame) pairs — training data, replay, determinism checks.
 * Disabled by default; call {@link setEnabled} to start capturing.
 */
export class ControlFrameRecorder {
  private readonly capacity: number;
  private readonly buffer: TimestampedControlFrame[];
  private head = 0;
  private count = 0;
  private enabled = false;

  constructor(capacity = 4096) {
    this.capacity = Math.max(1, capacity);
    this.buffer = [];
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  clear(): void {
    this.buffer.length = 0;
    this.head = 0;
    this.count = 0;
  }

  /** Append one sample; drops oldest when full. */
  push(timeSeconds: number, frame: ShipControlFrame, sensor?: ControlFrameSensorSnapshot): void {
    if (!this.enabled) {
      return;
    }
    const sample: TimestampedControlFrame = {
      timeSeconds,
      frame: {
        thrusters: { ...frame.thrusters },
        weapons: { ...frame.weapons }
      },
      ...(sensor
        ? {
            sensor: {
              ...sensor,
              position: { ...sensor.position },
              velocity: { ...sensor.velocity }
            }
          }
        : {})
    };
    if (this.count < this.capacity) {
      this.buffer.push(sample);
      this.count += 1;
      return;
    }
    this.buffer[this.head] = sample;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Newest-last snapshot (up to `max` entries from the end; default = full buffer). */
  snapshotTail(max?: number): TimestampedControlFrame[] {
    if (this.count === 0) {
      return [];
    }
    const lim = max === undefined ? this.capacity : max;
    const n = Math.min(lim, this.count);
    if (this.count < this.capacity) {
      return this.buffer.slice(-n);
    }
    const out: TimestampedControlFrame[] = [];
    const start = (this.head - n + this.capacity) % this.capacity;
    for (let i = 0; i < n; i += 1) {
      out.push(this.buffer[(start + i) % this.capacity]!);
    }
    return out;
  }
}

/** JSON export for datasets / fixtures — {@link parseTimestampedControlFrames} reverses this. */
export function serializeTimestampedControlFrames(frames: TimestampedControlFrame[]): string {
  return JSON.stringify(frames);
}

export function parseTimestampedControlFrames(json: string): TimestampedControlFrame[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of timestamped control frames');
  }
  const out: TimestampedControlFrame[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (
      typeof row !== 'object' ||
      row === null ||
      typeof (row as TimestampedControlFrame).timeSeconds !== 'number' ||
      typeof (row as TimestampedControlFrame).frame !== 'object' ||
      (row as TimestampedControlFrame).frame === null
    ) {
      throw new Error(`Invalid timestamped frame at index ${i}`);
    }
    const fr = (row as TimestampedControlFrame).frame;
    const thr = fr.thrusters;
    const wpn = fr.weapons;
    if (
      typeof thr !== 'object' ||
      thr === null ||
      typeof wpn !== 'object' ||
      wpn === null
    ) {
      throw new Error(`Invalid control frame at index ${i}`);
    }
    let sensor: ControlFrameSensorSnapshot | undefined;
    if ('sensor' in row && (row as TimestampedControlFrame).sensor !== undefined) {
      const s = (row as TimestampedControlFrame).sensor;
      if (typeof s !== 'object' || s === null) {
        throw new Error(`Invalid sensor at index ${i}`);
      }
      const pos = s.position;
      const vel = s.velocity;
      if (
        typeof pos !== 'object' ||
        pos === null ||
        typeof (pos as { x?: unknown }).x !== 'number' ||
        typeof (pos as { y?: unknown }).y !== 'number' ||
        typeof vel !== 'object' ||
        vel === null ||
        typeof (vel as { x?: unknown }).x !== 'number' ||
        typeof (vel as { y?: unknown }).y !== 'number' ||
        typeof s.angle !== 'number' ||
        typeof s.angularVelocity !== 'number' ||
        typeof s.hullFraction !== 'number' ||
        typeof s.shieldFraction !== 'number' ||
        typeof s.radiationIntensity !== 'number'
      ) {
        throw new Error(`Invalid sensor fields at index ${i}`);
      }
      const nn = s.nearestNpcDistanceMetres;
      const nh = s.nearestHostileDistanceMetres;
      if (nn !== null && typeof nn !== 'number') {
        throw new Error(`Invalid nearestNpcDistanceMetres at index ${i}`);
      }
      if (nh !== null && typeof nh !== 'number') {
        throw new Error(`Invalid nearestHostileDistanceMetres at index ${i}`);
      }
      sensor = {
        position: { x: pos.x, y: pos.y },
        velocity: { x: vel.x, y: vel.y },
        angle: s.angle,
        angularVelocity: s.angularVelocity,
        hullFraction: s.hullFraction,
        shieldFraction: s.shieldFraction,
        radiationIntensity: s.radiationIntensity,
        nearestNpcDistanceMetres: nn ?? null,
        nearestHostileDistanceMetres: nh ?? null,
        landPressed: Boolean(s.landPressed),
        devRefuelPressed: Boolean(s.devRefuelPressed)
      };
    }

    out.push({
      timeSeconds: (row as TimestampedControlFrame).timeSeconds,
      frame: {
        thrusters: {
          forward: Boolean(thr.forward),
          reverse: Boolean(thr.reverse),
          rotateCW: Boolean(thr.rotateCW),
          rotateCCW: Boolean(thr.rotateCCW),
          autoBrakeLinear: Boolean(thr.autoBrakeLinear),
          autoBrakeRotation: Boolean(thr.autoBrakeRotation)
        },
        weapons: {
          Z: Boolean(wpn.Z),
          X: Boolean(wpn.X),
          C: Boolean(wpn.C),
          V: Boolean(wpn.V),
          B: Boolean(wpn.B)
        }
      },
      ...(sensor ? { sensor } : {})
    });
  }
  return out;
}

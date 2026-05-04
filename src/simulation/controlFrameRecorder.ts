import type { ShipControlFrame } from './shipControlFrame';

export interface TimestampedControlFrame {
  /** Monotonic or world time in seconds — caller chooses clock. */
  timeSeconds: number;
  frame: ShipControlFrame;
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
  push(timeSeconds: number, frame: ShipControlFrame): void {
    if (!this.enabled) {
      return;
    }
    const sample: TimestampedControlFrame = {
      timeSeconds,
      frame: {
        thrusters: { ...frame.thrusters },
        weapons: { ...frame.weapons }
      }
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

/**
 * Headless replay hook — feed recorded frames into {@link applyShipControlFrame} + integration
 * when a deterministic runner exists. Intentionally unimplemented.
 */
export function replayControlFramesHeadless(_frames: TimestampedControlFrame[]): void {
  // Reserved for Session D+: deterministic replay / dataset validation.
}

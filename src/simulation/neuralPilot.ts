import { AI_OUTPUT_THRESHOLD, NEURAL_LOADOUT_STALE_SECONDS, OUTPUT_VECTOR_SIZE } from '../constants';
import type { Pilot, FlightPilotContext } from './pilot';
import type { ShipEntity } from './shipEntity';
import type { ShipControlFrame } from './shipControlFrame';
import { zeroControlFrame } from './shipControlFrame';
import {
  computeShipLoadoutFingerprint,
  decodeVectorToShipControlFrame
} from './shipControlNeural';

export interface NeuralPilotOptions {
  /**
   * Returns `OUTPUT_VECTOR_SIZE` logits or probabilities (canonical order in `shipControlNeural.ts`).
   * Return null/undefined to coast with zero thrust / no weapons this tick.
   */
  getRawOutput: (
    dt: number,
    self: ShipEntity,
    context: FlightPilotContext
  ) => Float32Array | number[] | null | undefined;
  /** Threshold for converting scalar outputs to booleans (default {@link AI_OUTPUT_THRESHOLD}). */
  threshold?: number;
  /** Play-time seconds of zero output after loadout fingerprint changes (default global constant). */
  staleCooldownSeconds?: number;
}

/**
 * TF.js / custom policy head adapter: maps vector output to the same {@link ShipControlFrame}
 * as human and scripted pilots; suppresses outputs briefly after equipment changes.
 */
export class NeuralPilot implements Pilot {
  private initialized = false;
  private lastFingerprint = '';
  private staleUntilPlayTime = -1;

  constructor(private readonly options: NeuralPilotOptions) {}

  getControlFrame(dt: number, self: ShipEntity, context: FlightPilotContext): ShipControlFrame {
    const fp = computeShipLoadoutFingerprint(self.state);
    const t = context.worldState.getPlayTime();
    const cooldown = this.options.staleCooldownSeconds ?? NEURAL_LOADOUT_STALE_SECONDS;

    if (!this.initialized) {
      this.initialized = true;
      this.lastFingerprint = fp;
    } else if (fp !== this.lastFingerprint) {
      this.lastFingerprint = fp;
      this.staleUntilPlayTime = t + cooldown;
    }

    if (t < this.staleUntilPlayTime) {
      return zeroControlFrame();
    }

    const raw = this.options.getRawOutput(dt, self, context);
    if (raw == null) {
      return zeroControlFrame();
    }
    const len = raw.length;
    if (len !== OUTPUT_VECTOR_SIZE) {
      return zeroControlFrame();
    }

    return decodeVectorToShipControlFrame(raw, this.options.threshold ?? AI_OUTPUT_THRESHOLD);
  }
}

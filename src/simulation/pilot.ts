import type { WorldState } from '../core/worldState';
import type { Landable } from '../types';
import type { ShipEntity } from './shipEntity';
import type { ShipControlFrame } from './shipControlFrame';
import { zeroControlFrame } from './shipControlFrame';
import type { PlayerController } from './playerController';

/** Context needed to produce a control frame for a ship in the current sector. */
export interface FlightPilotContext {
  player: ShipEntity;
  otherNPCs: ShipEntity[];
  landables: Landable[];
  worldState: WorldState;
}

/** Anything that can produce a {@link ShipControlFrame} per tick (human, script, NN, replay). */
export interface Pilot {
  getControlFrame(dt: number, self: ShipEntity, context: FlightPilotContext): ShipControlFrame;
}

/**
 * Keyboard pilot: reads {@link PlayerController} buffered keys into a canonical frame.
 * Landing / dev refuel one-shots are exposed via getters after `getControlFrame`.
 */
export class HumanPilot implements Pilot {
  private landPressed = false;
  private devRefuelPressed = false;

  constructor(private readonly keys: PlayerController) {}

  getControlFrame(_dt: number, _self: ShipEntity, _context: FlightPilotContext): ShipControlFrame {
    const raw = this.keys.update();
    this.landPressed = raw.landPressed;
    this.devRefuelPressed = raw.devRefuelPressed;
    return {
      thrusters: {
        forward: raw.forward,
        reverse: raw.reverse,
        rotateCW: raw.rotateCW,
        rotateCCW: raw.rotateCCW,
        autoBrakeLinear: raw.autoBrakeLinear,
        autoBrakeRotation: raw.autoBrakeRotation
      },
      weapons: this.keys.getFireInputs()
    };
  }

  getLastLandPressed(): boolean {
    return this.landPressed;
  }

  getLastDevRefuelPressed(): boolean {
    return this.devRefuelPressed;
  }
}

/** Wraps {@link ShipEntity}'s attached {@link import('./npcController').NPCController}. */
export class ScriptedNPCPilot implements Pilot {
  getControlFrame(dt: number, self: ShipEntity, context: FlightPilotContext): ShipControlFrame {
    const controller = self.getNPCController();
    if (!controller || self.state.isPlayerControlled) {
      return zeroControlFrame();
    }
    return controller.update(dt, self, context.player, context.otherNPCs, context.landables, context.worldState);
  }
}

export const scriptedNpcPilot = new ScriptedNPCPilot();

/** Placeholder until TF.js outputs are wired into the same boolean frame. */
export class NeuralPilotStub implements Pilot {
  getControlFrame(_dt: number, _self: ShipEntity, _context: FlightPilotContext): ShipControlFrame {
    return zeroControlFrame();
  }
}

export { NeuralPilot, type NeuralPilotOptions } from './neuralPilot';

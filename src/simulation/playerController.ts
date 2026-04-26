import type { WeaponFireKey } from '../types';

interface ThrusterInputs {
  forward: boolean;
  reverse: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  autoBrakeLinear: boolean;
  autoBrakeRotation: boolean;
  landPressed: boolean;
  devRefuelPressed: boolean;
}

interface TargetInputs {
  cycleShipTarget: boolean;
  cycleLandableTarget: boolean;
}

export class PlayerController {
  private readonly pressedKeys = new Set<string>();
  private autoBrakeLinearEnabled = false;
  private autoBrakeRotationEnabled = false;
  private landPressedQueued = false;
  private devRefuelQueued = false;
  private cycleShipTargetQueued = false;
  private cycleLandableTargetQueued = false;
  private readonly controlledKeys = new Set<string>([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyQ',
    'KeyE',
    'KeyL',
    'KeyR',
    'Tab',
    'KeyG',
    'KeyZ',
    'KeyX',
    'KeyC',
    'KeyV',
    'KeyB'
  ]);

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.controlledKeys.has(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyQ') {
      this.autoBrakeLinearEnabled = !this.autoBrakeLinearEnabled;
    }
    if (!event.repeat && event.code === 'KeyE') {
      this.autoBrakeRotationEnabled = !this.autoBrakeRotationEnabled;
    }
    if (!event.repeat && event.code === 'KeyL') {
      this.landPressedQueued = true;
    }
    if (!event.repeat && event.code === 'KeyR') {
      this.devRefuelQueued = true;
    }
    if (!event.repeat && event.code === 'Tab') {
      this.cycleShipTargetQueued = true;
    }
    if (!event.repeat && event.code === 'KeyG') {
      this.cycleLandableTargetQueued = true;
    }
    this.pressedKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.controlledKeys.has(event.code)) {
      event.preventDefault();
    }
    this.pressedKeys.delete(event.code);
  };

  constructor(initialState?: { autoBrakeLinearEnabled: boolean; autoBrakeRotationEnabled: boolean }) {
    this.autoBrakeLinearEnabled = initialState?.autoBrakeLinearEnabled ?? false;
    this.autoBrakeRotationEnabled = initialState?.autoBrakeRotationEnabled ?? false;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  update(): ThrusterInputs {
    const landPressed = this.landPressedQueued;
    this.landPressedQueued = false;
    const devRefuelPressed = this.devRefuelQueued;
    this.devRefuelQueued = false;
    return {
      forward: this.pressedKeys.has('ArrowUp'),
      reverse: this.pressedKeys.has('ArrowDown'),
      rotateCW: this.pressedKeys.has('ArrowRight'),
      rotateCCW: this.pressedKeys.has('ArrowLeft'),
      autoBrakeLinear: this.autoBrakeLinearEnabled,
      autoBrakeRotation: this.autoBrakeRotationEnabled,
      landPressed,
      devRefuelPressed
    };
  }

  getLandPressed(): boolean {
    const landPressed = this.landPressedQueued;
    this.landPressedQueued = false;
    return landPressed;
  }

  getTargetInputs(): TargetInputs {
    const inputs = {
      cycleShipTarget: this.cycleShipTargetQueued,
      cycleLandableTarget: this.cycleLandableTargetQueued
    };
    this.cycleShipTargetQueued = false;
    this.cycleLandableTargetQueued = false;
    return inputs;
  }

  getFireInputs(): Record<WeaponFireKey, boolean> {
    return {
      Z: this.pressedKeys.has('KeyZ'),
      X: this.pressedKeys.has('KeyX'),
      C: this.pressedKeys.has('KeyC'),
      V: this.pressedKeys.has('KeyV'),
      B: this.pressedKeys.has('KeyB')
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pressedKeys.clear();
    this.autoBrakeLinearEnabled = false;
    this.autoBrakeRotationEnabled = false;
    this.landPressedQueued = false;
    this.devRefuelQueued = false;
    this.cycleShipTargetQueued = false;
    this.cycleLandableTargetQueued = false;
  }
}

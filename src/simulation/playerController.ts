interface ThrusterInputs {
  forward: boolean;
  reverse: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  autoBrakeLinear: boolean;
  autoBrakeRotation: boolean;
}

export class PlayerController {
  private readonly pressedKeys = new Set<string>();
  private autoBrakeLinearEnabled = false;
  private autoBrakeRotationEnabled = false;
  private readonly controlledKeys = new Set<string>([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'ShiftLeft',
    'ShiftRight'
  ]);

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.controlledKeys.has(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'Space') {
      this.autoBrakeLinearEnabled = !this.autoBrakeLinearEnabled;
    }
    if (
      !event.repeat &&
      (event.code === 'ShiftLeft' || event.code === 'ShiftRight') &&
      !this.pressedKeys.has('ShiftLeft') &&
      !this.pressedKeys.has('ShiftRight')
    ) {
      this.autoBrakeRotationEnabled = !this.autoBrakeRotationEnabled;
    }
    this.pressedKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.controlledKeys.has(event.code)) {
      event.preventDefault();
    }
    this.pressedKeys.delete(event.code);
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  update(): ThrusterInputs {
    return {
      forward: this.pressedKeys.has('ArrowUp'),
      reverse: this.pressedKeys.has('ArrowDown'),
      rotateCW: this.pressedKeys.has('ArrowRight'),
      rotateCCW: this.pressedKeys.has('ArrowLeft'),
      autoBrakeLinear: this.autoBrakeLinearEnabled,
      autoBrakeRotation: this.autoBrakeRotationEnabled
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pressedKeys.clear();
    this.autoBrakeLinearEnabled = false;
    this.autoBrakeRotationEnabled = false;
  }
}

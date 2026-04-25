import {
  PLACEHOLDER_ANGULAR_DAMPING,
  PLACEHOLDER_LINEAR_DAMPING,
  PLACEHOLDER_ROTATE_TORQUE,
  PLACEHOLDER_SHIP_MASS,
  PLACEHOLDER_THRUST_FORCE,
  PLACEHOLDER_TOP_ANGULAR_SPEED,
  PLACEHOLDER_TOP_SPEED
} from '../constants';
import type { ShipState } from '../types';
import {
  applyAngularDamping,
  applyAngularForce,
  applyLinearDamping,
  applyForce,
  clampAngularVelocity,
  clampVelocity,
  integrateAngle,
  integratePosition
} from '../physics/newtonian';
import { Vector2 } from '../physics/vector2';

export class ShipEntity {
  state: ShipState;

  private accumulatedForce: Vector2 = Vector2.zero();

  private accumulatedTorque = 0;
  private autoBrakeLinear = false;
  private autoBrakeRotation = false;
  private linearThrustersActive = false;
  private rotationThrustersActive = false;

  constructor(initialState: ShipState) {
    this.state = initialState;
  }

  isLinearAutoBrakeEnabled(): boolean {
    return this.autoBrakeLinear;
  }

  isRotationAutoBrakeEnabled(): boolean {
    return this.autoBrakeRotation;
  }

  applyThrusterInputs(inputs: {
    forward: boolean;
    reverse: boolean;
    rotateCW: boolean;
    rotateCCW: boolean;
    autoBrakeLinear: boolean;
    autoBrakeRotation: boolean;
  }): void {
    const forwardVector = Vector2.fromAngle(this.state.angle);
    if (inputs.forward) {
      this.accumulatedForce = this.accumulatedForce.add(forwardVector.scale(PLACEHOLDER_THRUST_FORCE));
    }
    if (inputs.reverse) {
      this.accumulatedForce = this.accumulatedForce.add(forwardVector.scale(-PLACEHOLDER_THRUST_FORCE));
    }
    if (inputs.rotateCW) {
      this.accumulatedTorque += PLACEHOLDER_ROTATE_TORQUE;
    }
    if (inputs.rotateCCW) {
      this.accumulatedTorque -= PLACEHOLDER_ROTATE_TORQUE;
    }
    this.autoBrakeLinear = inputs.autoBrakeLinear;
    this.autoBrakeRotation = inputs.autoBrakeRotation;
    this.linearThrustersActive = inputs.forward || inputs.reverse;
    this.rotationThrustersActive = inputs.rotateCW || inputs.rotateCCW;
  }

  applyExternalForce(force: Vector2): void {
    this.accumulatedForce = this.accumulatedForce.add(force);
  }

  update(dt: number): void {
    let nextVelocity = clampVelocity(
      applyForce(this.state.velocity as Vector2, this.accumulatedForce, PLACEHOLDER_SHIP_MASS, dt),
      PLACEHOLDER_TOP_SPEED
    );
    let nextAngularVelocity = applyAngularForce(
      this.state.angularVelocity,
      this.accumulatedTorque,
      PLACEHOLDER_SHIP_MASS,
      dt
    );
    nextAngularVelocity = clampAngularVelocity(nextAngularVelocity, PLACEHOLDER_TOP_ANGULAR_SPEED);

    if (this.autoBrakeLinear && !this.linearThrustersActive && !this.rotationThrustersActive) {
      nextVelocity = applyLinearDamping(nextVelocity, PLACEHOLDER_LINEAR_DAMPING, dt);
    }
    if (this.autoBrakeRotation && !this.rotationThrustersActive) {
      nextAngularVelocity = applyAngularDamping(nextAngularVelocity, PLACEHOLDER_ANGULAR_DAMPING, dt);
    }

    this.state = {
      ...this.state,
      velocity: nextVelocity,
      angularVelocity: nextAngularVelocity,
      position: integratePosition(this.state.position as Vector2, nextVelocity, dt),
      angle: integrateAngle(this.state.angle, nextAngularVelocity, dt)
    };

    this.accumulatedForce = Vector2.zero();
    this.accumulatedTorque = 0;
  }
}

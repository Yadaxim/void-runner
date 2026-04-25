import {
  FUEL_USE_LINEAR_THRUSTER_PER_SECOND,
  FUEL_USE_ROTATION_THRUSTER_PER_SECOND,
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
  private forwardThrusterRequested = false;
  private reverseThrusterRequested = false;
  private rotateCWThrusterRequested = false;
  private rotateCCWThrusterRequested = false;
  private linearThrustersActive = false;
  private rotationThrustersActive = false;

  constructor(initialState: ShipState) {
    this.state = initialState;
    this.autoBrakeLinear = initialState.autoBrakeLinearEnabled;
    this.autoBrakeRotation = initialState.autoBrakeRotationEnabled;
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
    this.autoBrakeLinear = inputs.autoBrakeLinear;
    this.autoBrakeRotation = inputs.autoBrakeRotation;
    this.forwardThrusterRequested = inputs.forward;
    this.reverseThrusterRequested = inputs.reverse;
    this.rotateCWThrusterRequested = inputs.rotateCW;
    this.rotateCCWThrusterRequested = inputs.rotateCCW;
  }

  applyExternalForce(force: Vector2): void {
    this.accumulatedForce = this.accumulatedForce.add(force);
  }

  update(dt: number): void {
    const activeLinearThrusters =
      (this.forwardThrusterRequested ? 1 : 0) + (this.reverseThrusterRequested ? 1 : 0);
    const activeRotationThrusters =
      (this.rotateCWThrusterRequested ? 1 : 0) + (this.rotateCCWThrusterRequested ? 1 : 0);
    const requestedFuel =
      activeLinearThrusters * FUEL_USE_LINEAR_THRUSTER_PER_SECOND * dt +
      activeRotationThrusters * FUEL_USE_ROTATION_THRUSTER_PER_SECOND * dt;
    const availableFuel = Math.max(0, this.state.fuel);
    const fuelScale = requestedFuel > 0 ? Math.min(1, availableFuel / requestedFuel) : 1;

    const forwardVector = Vector2.fromAngle(this.state.angle);
    if (this.forwardThrusterRequested && fuelScale > 0) {
      this.accumulatedForce = this.accumulatedForce.add(forwardVector.scale(PLACEHOLDER_THRUST_FORCE * fuelScale));
    }
    if (this.reverseThrusterRequested && fuelScale > 0) {
      this.accumulatedForce = this.accumulatedForce.add(forwardVector.scale(-PLACEHOLDER_THRUST_FORCE * fuelScale));
    }
    if (this.rotateCWThrusterRequested && fuelScale > 0) {
      this.accumulatedTorque += PLACEHOLDER_ROTATE_TORQUE * fuelScale;
    }
    if (this.rotateCCWThrusterRequested && fuelScale > 0) {
      this.accumulatedTorque -= PLACEHOLDER_ROTATE_TORQUE * fuelScale;
    }
    const fuelConsumed = requestedFuel * fuelScale;
    this.linearThrustersActive = fuelScale > 0 && activeLinearThrusters > 0;
    this.rotationThrustersActive = fuelScale > 0 && activeRotationThrusters > 0;

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
      angle: integrateAngle(this.state.angle, nextAngularVelocity, dt),
      fuel: Math.max(0, this.state.fuel - fuelConsumed),
      autoBrakeLinearEnabled: this.autoBrakeLinear,
      autoBrakeRotationEnabled: this.autoBrakeRotation
    };

    this.accumulatedForce = Vector2.zero();
    this.accumulatedTorque = 0;
    this.forwardThrusterRequested = false;
    this.reverseThrusterRequested = false;
    this.rotateCWThrusterRequested = false;
    this.rotateCCWThrusterRequested = false;
  }
}

export type BrainMode = 'follow' | 'combat' | 'flee';

export interface TrackedObject {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  type: 'planet' | 'station' | 'escort' | 'hostile' | 'bullet' | 'empty';
  hpRatio: number;
  isShipTarget: boolean;
  isLandableTarget: boolean;
}

export interface InputVector {
  shipVx: number;
  shipVy: number;
  shipAngle: number;
  shipAngularVelocity: number;
  hpRatio: number;
  fuelRatio: number;
  trackedObjects: TrackedObject[];
}

export interface OutputVector {
  thrustForward: number;
  thrustReverse: number;
  rotateCW: number;
  rotateCCW: number;
  autoBrake: number;
  fireWeapon_Z: number;
  fireWeapon_X: number;
  fireWeapon_C: number;
  fireWeapon_V: number;
  fireWeapon_B: number;
}

export interface TrainedNetwork {
  architecture: { layers: number; neuronsPerLayer: number };
  weights: number[][];
  trainedMode: BrainMode;
  equipmentSignature: string;
  trainedAt: number;
}

export interface MemoryCard {
  id: string;
  label: string;
  equipmentSignature: string;
  networks: Partial<Record<BrainMode, TrainedNetwork>>;
  isPreTrained: boolean;
  lore?: string;
}

export interface NeuralBrain {
  brainItemId: string;
  maxLayers: number;
  maxNeuronsPerLayer: number;
}

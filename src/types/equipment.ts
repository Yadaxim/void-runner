import type { BrainMode } from './ai';

export type EquipType =
  | 'thruster'
  | 'weapon'
  | 'armour'
  | 'fuelTank'
  | 'hyperspaceDrive'
  | 'autoBrake'
  | 'sensorArray'
  | 'neuralBrain'
  | 'memoryCard';

export type MountPosition = 'forward' | 'rear';

export interface BaseEquipment {
  id: string;
  type: EquipType;
  name: string;
  manufacturer?: string;
  description: string;
  mass: number;
  tier: number;
  factionAffinity: string;
}

export interface ThrusterItem extends BaseEquipment {
  type: 'thruster';
  force: number;
  energyPerSecond: number;
  mountPosition: MountPosition;
}

export interface WeaponItem extends BaseEquipment {
  type: 'weapon';
  bulletSpecId: string;
  fireRate: number;
  energyCost: number;
}

export interface ArmourItem extends BaseEquipment {
  type: 'armour';
  hpBonus: number;
}

export interface FuelTankItem extends BaseEquipment {
  type: 'fuelTank';
  fuelCapacity: number;
  fuelType: string;
}

export interface HyperspaceDriveItem extends BaseEquipment {
  type: 'hyperspaceDrive';
  jumpRange: number;
  fuelCostPerJump: number;
  cooldown: number;
}

export interface AutoBrakeItem extends BaseEquipment {
  type: 'autoBrake';
  dampingFactor: number;
  angularDampingFactor: number;
}

export interface SensorArrayItem extends BaseEquipment {
  type: 'sensorArray';
  range: number;
  resolution: number;
  trackedObjectSlots: number;
}

export interface NeuralBrainItem extends BaseEquipment {
  type: 'neuralBrain';
  maxLayers: number;
  maxNeuronsPerLayer: number;
}

export interface PreTrainedNetwork {
  architecture: { layers: number; neuronsPerLayer: number };
  weights: number[][];
  trainedMode: BrainMode;
  qualityTier: 'basic' | 'standard' | 'rich' | 'elite';
  episodeCount: number;
}

export interface MemoryCardItem extends BaseEquipment {
  type: 'memoryCard';
  storageSlots: number;
  isPreTrained: boolean;
  lore?: string;
  preTrainedNetworks?: Partial<Record<BrainMode, PreTrainedNetwork>>;
}

export type EquipmentItem =
  | ThrusterItem
  | WeaponItem
  | ArmourItem
  | FuelTankItem
  | HyperspaceDriveItem
  | AutoBrakeItem
  | SensorArrayItem
  | NeuralBrainItem
  | MemoryCardItem;

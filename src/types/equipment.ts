import type { BrainMode } from './ai';
import type { MatterType } from './bullet';
import type { EquipmentSlotType } from './ship';

export type EquipType =
  | 'thruster'
  | 'weapon'
  | 'armour'
  | 'reactor'
  | 'shield'
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
  /** New buy price in credits (data-driven; set in world `equipmentCatalog`). */
  price: number;
  factionAffinity: string;
  slotType?: EquipmentSlotType;
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
  reductions: ArmourReductionProfile;
}

export type ArmourReductionProfile = Record<MatterType, number>;

export function emptyReductionProfile(): ArmourReductionProfile {
  return {
    normal: 0,
    anti: 0,
    dark: 0,
    void: 0
  };
}

export interface FuelTankItem extends BaseEquipment {
  type: 'fuelTank';
  fuelCapacity: number;
  fuelType: string;
}

export interface ReactorItem extends BaseEquipment {
  type: 'reactor';
  capacityJoules: number;
  chargeRateJoulesPerSecond: number;
  fuelPerJoule: number;
  slotType: 'reactor';
}

export interface ShieldItem extends BaseEquipment {
  type: 'shield';
  shieldHP: number;
  regenRateHPPerSecond: number;
  joulesPerHPRegen: number;
  regenDelay: number;
  rebootTime: number;
  slotType: 'shield';
}

export interface HyperspaceDriveItem extends BaseEquipment {
  type: 'hyperspaceDrive';
  jumpRange: number;
  fuelCostPerJump: number;
  /** Seconds of career play time before another hyperspace jump is allowed (per drive). */
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
  | ReactorItem
  | ShieldItem
  | FuelTankItem
  | HyperspaceDriveItem
  | AutoBrakeItem
  | SensorArrayItem
  | NeuralBrainItem
  | MemoryCardItem;
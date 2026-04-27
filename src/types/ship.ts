import type { BrainMode, MemoryCard, NeuralBrain } from './ai';
import type { CargoItem, Mission } from './mission';
import type { Vector2 } from './physics';

export type FleetRole = 'lead' | 'escort';
export type WeaponFireKey = 'Z' | 'X' | 'C' | 'V' | 'B';

export interface TargetState {
  shipTargetId?: string;
  landableTargetId?: string;
}

export type EquipmentSlotType =
  | 'thruster_forward'
  | 'thruster_reverse'
  | 'thruster_rotate'
  | 'weapon'
  | 'armour'
  | 'reactor'
  | 'shield'
  | 'autoBrake'
  | 'fuelTank'
  | 'hyperspaceDrive'
  | 'sensorArray'
  | 'neuralBrain'
  | 'memoryCard';

export interface EquipmentSlot {
  slotType: EquipmentSlotType;
  itemId: string | null;
}

export interface WeaponSlot {
  fireKey: WeaponFireKey;
  itemId: string;
  stackCount: number;
  cooldownRemaining: number;
}

export interface ArmourLayerState {
  itemId: string;
  currentHP: number;
  maxHP: number;
}

export interface HullSpec {
  id: string;
  name: string;
  description: string;
  hullClass: 'fighter' | 'courier' | 'freighter' | 'heavy';
  hullMass: number;
  cargoCapacity: number;
  equipmentCapacity: number;
  topSpeed: number;
  topAngularSpeed: number;
  baseHP: number;
  weaponSlots: number;
  slotCounts?: Partial<Record<EquipmentSlot['slotType'], number>>;
  equipmentLoadout?: EquipmentSlot[];
}

export interface ShipState {
  id: string;
  hullSpecId: string;
  factionId: string | null;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  angularVelocity: number;
  currentHullHP: number;
  maxHullHP: number;
  armourLayers: ArmourLayerState[];
  currentShieldHP: number;
  maxShieldHP: number;
  shieldRebooting: boolean;
  shieldRebootTimer: number;
  lastHitTime: number;
  currentJoules: number;
  fuel: number;
  credits: number;
  cargo: CargoItem[];
  equipmentSlots: EquipmentSlot[];
  weaponLoadout: WeaponSlot[];
  activeMissions: Mission[];
  brain: NeuralBrain | null;
  memoryCards: MemoryCard[];
  activeCardId: string | null;
  activeMode: BrainMode | null;
  guardMode: boolean;
  autoBrakeLinearEnabled: boolean;
  autoBrakeRotationEnabled: boolean;
  fleetRole: FleetRole;
  targets: TargetState;
  isPlayerControlled: boolean;
  insuranceActive: boolean;
  lastLandedLandableId?: string | null;
}

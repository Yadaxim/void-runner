import type { BrainMode, MemoryCard, NeuralBrain } from './ai';
import type { EquipType } from './equipment';
import type { CargoItem, Mission } from './mission';
import type { Vector2 } from './physics';

export type FleetRole = 'lead' | 'escort';
export type WeaponFireKey = 'Z' | 'X' | 'C' | 'V' | 'B';

export interface TargetState {
  shipTargetId?: string;
  landableTargetId?: string;
}

export interface EquipmentSlot {
  slotType:
    | 'thruster_forward'
    | 'thruster_reverse'
    | 'thruster_rotateCW'
    | 'thruster_rotateCCW'
    | 'armour'
    | 'fuelTank'
    | 'hyperspaceDrive'
    | 'autoBrake'
    | 'sensorArray'
    | 'neuralBrain'
    | 'memoryCard';
  itemId: string | null;
}

export interface WeaponSlot {
  fireKey: WeaponFireKey;
  itemId: string;
  stackCount: number;
  cooldownRemaining: number;
}

export interface HullSpec {
  id: string;
  name: string;
  description: string;
  hullClass: 'fighter' | 'courier' | 'freighter' | 'heavy';
  hullMass: number;
  cargoCapacity: number;
  equipmentCapacity: number;
  equipmentWhitelist: EquipType[];
  baseTopSpeed: number;
  baseHP: number;
  weaponSlots: number;
  defaultWeaponLoadout?: WeaponSlot[];
}

export interface ShipState {
  id: string;
  hullSpecId: string;
  factionId: string | null;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  angularVelocity: number;
  currentHP: number;
  maxHP: number;
  fuel: number;
  maxFuel: number;
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

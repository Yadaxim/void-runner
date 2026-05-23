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

/** Equipment slot list for a hull (one entry per physical hardpoint, in ship UI order). */
export type SlotMap = EquipmentSlot[];

export type HullLoadoutVariantKey = 'raw' | 'basic' | 'advanced';

/** Screen-space / combat hitbox size for this hull (pixels in flight view). */
export interface HullDimensions {
  length: number;
  width: number;
}

export const DEFAULT_HULL_DIMENSIONS: HullDimensions = { length: 32, width: 16 };

export function hullMuzzleLength(dimensions: HullDimensions | undefined): number {
  return (dimensions ?? DEFAULT_HULL_DIMENSIONS).length;
}

export function hullHitRadius(dimensions: HullDimensions | undefined): number {
  return hullMuzzleLength(dimensions) / 2;
}

/** Canvas path family for flight rendering (`traceHullPath`). */
export type HullSilhouette =
  | 'fighter'
  | 'interceptor'
  | 'shuttle'
  | 'courier'
  | 'freighter'
  | 'heavy';

export const DEFAULT_HULL_SILHOUETTE: HullSilhouette = 'fighter';

export interface HullDefaultLoadouts {
  /** Only required slot types filled; cheapest viable items; no optional equipment. */
  raw: SlotMap;
  /** Required slots plus sensible essentials for the hull class. */
  basic: SlotMap;
  /** Premium fit for the hull. */
  advanced: SlotMap;
}

export interface HullSpec {
  id: string;
  name: string;
  description: string;
  silhouette: HullSilhouette;
  dimensions: HullDimensions;
  hullMass: number;
  cargoCapacity: number;
  equipmentCapacity: number;
  topSpeed: number;
  topAngularSpeed: number;
  baseHP: number;
  weaponSlots: number;
  /** New hull sticker price (credits), before hostile multiplier. */
  price: number;
  /** Base trade-in value when selling the bare hull at a shipyard (before hostile halving). */
  sellValue: number;
  slotCounts?: Partial<Record<EquipmentSlot['slotType'], number>>;
  defaultLoadouts: HullDefaultLoadouts;
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

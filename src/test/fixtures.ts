import type { BulletSpec, DamageCategory, MatterType, ShipState } from '../types';
import { emptyReductionProfile, type ArmourItem, type ArmourReductionProfile, type ReactorItem, type ShieldItem, type WeaponItem } from '../types';
import { Vector2 } from '../physics/vector2';

const BASE_SHIP: ShipState = {
  id: 'player',
  hullSpecId: '__fixture_hull__',
  factionId: null,
  position: new Vector2(0, 0),
  velocity: new Vector2(0, 0),
  angle: 0,
  angularVelocity: 0,
  currentHullHP: 100,
  maxHullHP: 100,
  armourLayers: [],
  currentShieldHP: 0,
  maxShieldHP: 0,
  shieldRebooting: false,
  shieldRebootTimer: 0,
  lastHitTime: 0,
  currentJoules: 500,
  fuel: 100,
  credits: 0,
  cargo: [],
  equipmentSlots: [],
  weaponLoadout: [],
  activeMissions: [],
  brain: null,
  memoryCards: [],
  activeCardId: null,
  activeMode: null,
  guardMode: false,
  autoBrakeLinearEnabled: false,
  autoBrakeRotationEnabled: false,
  fleetRole: 'lead',
  targets: {},
  isPlayerControlled: true,
  insuranceActive: true,
  lastLandedLandableId: null
};

export function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return {
    ...BASE_SHIP,
    ...overrides,
    position: (overrides.position as Vector2 | undefined) ?? new Vector2(0, 0),
    velocity: (overrides.velocity as Vector2 | undefined) ?? new Vector2(0, 0),
    equipmentSlots: overrides.equipmentSlots ?? [...BASE_SHIP.equipmentSlots],
    weaponLoadout: overrides.weaponLoadout ?? [...BASE_SHIP.weaponLoadout],
    armourLayers: overrides.armourLayers ?? [...BASE_SHIP.armourLayers],
    cargo: overrides.cargo ?? [...BASE_SHIP.cargo]
  };
}

export function makeArmour(overrides: {
  id?: string;
  layers?: Partial<ArmourReductionProfile>;
  hpBonus?: number;
}): ArmourItem {
  const reductions = { ...emptyReductionProfile(), ...(overrides.layers ?? {}) };
  return {
    id: overrides.id ?? 'test_armour',
    type: 'armour',
    name: 'Test Armour',
    description: '',
    mass: 10,
    tier: 1,
    factionAffinity: '__fixture_faction__',
    hpBonus: overrides.hpBonus ?? 50,
    reductions
  };
}

export function makeShield(overrides: {
  id?: string;
  /** Shield HP (matches `shieldHP` on item). */
  capacity?: number;
  regenDelay?: number;
  rebootTime?: number;
  joulesPerHPRegen?: number;
  regenRateHPPerSecond?: number;
}): ShieldItem {
  return {
    id: overrides.id ?? 'test_shield',
    type: 'shield',
    name: 'Test Shield',
    description: '',
    mass: 5,
    tier: 1,
    factionAffinity: '__fixture_faction__',
    shieldHP: overrides.capacity ?? 100,
    regenRateHPPerSecond: overrides.regenRateHPPerSecond ?? 10,
    joulesPerHPRegen: overrides.joulesPerHPRegen ?? 10,
    regenDelay: overrides.regenDelay ?? 2,
    rebootTime: overrides.rebootTime ?? 8,
    slotType: 'shield'
  };
}

export function makeReactor(overrides: {
  id?: string;
  chargeRate?: number;
  fuelPerJoule?: number;
  capacityJoules?: number;
}): ReactorItem {
  return {
    id: overrides.id ?? 'test_reactor',
    type: 'reactor',
    name: 'Test Reactor',
    description: '',
    mass: 10,
    tier: 1,
    factionAffinity: '__fixture_faction__',
    capacityJoules: overrides.capacityJoules ?? 500,
    chargeRateJoulesPerSecond: overrides.chargeRate ?? 20,
    fuelPerJoule: overrides.fuelPerJoule ?? 0.002,
    slotType: 'reactor'
  };
}

export function makeBullet(
  overrides: Partial<
    Pick<BulletSpec, 'damage' | 'dotDuration' | 'dotDamagePerSecond' | 'id' | 'name' | 'mass' | 'speed' | 'lifespan'>
  > & {
    damageType?: { category: DamageCategory; matter: MatterType };
  }
): BulletSpec {
  const cat = overrides.damageType?.category ?? 'kinetic';
  const matter = overrides.damageType?.matter ?? 'normal';
  return {
    id: overrides.id ?? 'test_bullet',
    name: overrides.name ?? 'Test',
    mass: overrides.mass ?? 0.1,
    speed: overrides.speed ?? 400,
    inheritShipVelocity: false,
    damage: overrides.damage ?? 10,
    damageCategory: cat,
    matterType: matter,
    attractedByGravity: false,
    seeking: false,
    infinite: false,
    lifespan: overrides.lifespan ?? 5,
    visualType: 'bolt',
    colour: '#fff',
    dotDuration: overrides.dotDuration,
    dotDamagePerSecond: overrides.dotDamagePerSecond
  };
}

export function makeWeaponFromBullet(bullet: BulletSpec, id = 'test_weapon'): WeaponItem {
  return {
    id,
    type: 'weapon',
    name: 'Test W',
    description: '',
    mass: 5,
    tier: 1,
    factionAffinity: '__fixture_faction__',
    bulletSpecId: bullet.id,
    fireRate: 1,
    energyCost: 0
  };
}

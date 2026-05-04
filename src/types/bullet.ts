import type { PhysicsBody, Vector2 } from './physics';

export type BulletVisualType = 'bolt' | 'beam_pulse' | 'orb' | 'missile' | 'mine';

export type DamageCategory = 'kinetic' | 'explosive' | 'laser' | 'plasma' | 'void';
export type MatterType = 'normal' | 'anti' | 'dark';

export type DamageTypeKey =
  | 'kinetic'
  | 'antimatter_kinetic'
  | 'darkmatter_kinetic'
  | 'explosive'
  | 'antimatter_explosive'
  | 'darkmatter_explosive'
  | 'laser'
  | 'anti_photon_laser'
  | 'dark_energy_laser'
  | 'plasma'
  | 'antimatter_plasma'
  | 'darkmatter_plasma'
  | 'void';

/** Homing toward the locked target; max turn rate in radians per second. */
export interface SeekingAbility {
  type: 'seeking';
  turnRatio: number;
}

/** Extensible bullet behaviours (stack multiple non-conflicting abilities later). */
export type BulletAbility = SeekingAbility;

export function getBulletSeekingAbility(spec: BulletSpec): SeekingAbility | undefined {
  return spec.abilities?.find((a): a is SeekingAbility => a.type === 'seeking');
}

export function getDamageTypeKey(category: DamageCategory, matter: MatterType): DamageTypeKey {
  if (category === 'void') {
    if (matter !== 'normal') {
      throw new Error(`Invalid damage type combination: ${matter}_${category}`);
    }
    return 'void';
  }
  if (matter === 'normal') return category as DamageTypeKey;

  if (category === 'laser') {
    if (matter === 'anti') return 'anti_photon_laser';
    if (matter === 'dark') return 'dark_energy_laser';
  }

  if (matter === 'anti') return `antimatter_${category}` as DamageTypeKey;
  if (matter === 'dark') return `darkmatter_${category}` as DamageTypeKey;
  throw new Error(`Invalid damage type combination: ${matter}_${category}`);
}

export interface BulletSpec {
  id: string;
  name: string;
  mass: number;
  speed: number;
  inheritShipVelocity: boolean;
  damage: number;
  damageCategory: DamageCategory;
  matterType: MatterType;
  dotDuration?: number;
  dotDamagePerSecond?: number;
  attractedByGravity: boolean;
  /** Optional combat modifiers (e.g. homing). */
  abilities?: BulletAbility[];
  infinite: boolean;
  lifespan: number;
  visualType: BulletVisualType;
  colour: string;
}

export interface BulletInstance {
  id: string;
  specId: string;
  body: PhysicsBody;
  ownerId: string;
  targetId?: string;
  age: number;
  trailPositions: Vector2[];
}

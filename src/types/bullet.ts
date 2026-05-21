import type { PhysicsBody, Vector2 } from './physics';

export type BulletVisualType = 'bolt' | 'beam_pulse' | 'orb' | 'missile' | 'mine';

export type MatterType = 'normal' | 'anti' | 'dark' | 'void';

export const MATTER_TYPES: readonly MatterType[] = ['normal', 'anti', 'dark', 'void'] as const;

/** Homing toward the locked target; max turn rate in radians per second. */
export interface SeekingAbility {
  type: 'seeking';
  turnRatio: number;
}

export interface DotAbility {
  type: 'dot';
  damagePerSecond: number;
  duration: number;
}

export interface KnockbackAbility {
  type: 'knockback';
  scale?: number;
}

export interface BallisticAbility {
  type: 'ballistic';
  scale?: number;
}

export interface ExplosiveAbility {
  type: 'explosive';
  radius: number;
  splashDamage: number;
  falloffExponent?: number;
}

export type BulletAbility =
  | SeekingAbility
  | DotAbility
  | KnockbackAbility
  | BallisticAbility
  | ExplosiveAbility;

export interface BulletSpec {
  id: string;
  name: string;
  mass: number;
  speed: number;
  inheritShipVelocity: boolean;
  damage: number;
  matterType: MatterType;
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

export interface MergedDotParams {
  damagePerSecond: number;
  duration: number;
}

function findAbility<T extends BulletAbility['type']>(
  spec: BulletSpec,
  type: T
): Extract<BulletAbility, { type: T }> | undefined {
  return spec.abilities?.find((a): a is Extract<BulletAbility, { type: T }> => a.type === type);
}

export function getBulletSeekingAbility(spec: BulletSpec): SeekingAbility | undefined {
  return findAbility(spec, 'seeking');
}

export function getBulletKnockbackAbility(spec: BulletSpec): KnockbackAbility | undefined {
  return findAbility(spec, 'knockback');
}

export function getBulletKnockbackScale(spec: BulletSpec): number | null {
  const kb = getBulletKnockbackAbility(spec);
  if (!kb) return null;
  const scale = kb.scale ?? 1;
  return Number.isFinite(scale) && scale >= 0 ? scale : null;
}

export function getBulletBallisticAbility(spec: BulletSpec): BallisticAbility | undefined {
  return findAbility(spec, 'ballistic');
}

export function getBulletBallisticScale(spec: BulletSpec): number {
  const b = getBulletBallisticAbility(spec);
  if (!b) return 0;
  const scale = b.scale ?? 1;
  return Number.isFinite(scale) && scale >= 0 ? scale : 0;
}

export function getBulletExplosiveAbility(spec: BulletSpec): ExplosiveAbility | undefined {
  return findAbility(spec, 'explosive');
}

/** Merge dot abilities on one spec (validation allows at most one; merge defensively). */
export function mergeDotAbilities(spec: BulletSpec): MergedDotParams | null {
  const dots = spec.abilities?.filter((a): a is DotAbility => a.type === 'dot') ?? [];
  if (dots.length === 0) return null;
  let damagePerSecond = 0;
  let duration = 0;
  for (const d of dots) {
    damagePerSecond = Math.max(damagePerSecond, d.damagePerSecond);
    duration = Math.max(duration, d.duration);
  }
  if (duration <= 0 || damagePerSecond < 0) return null;
  return { damagePerSecond, duration };
}

export function computeSplashDamage(
  splashDamage: number,
  distance: number,
  radius: number,
  falloffExponent: number
): number {
  if (radius <= 0 || distance > radius) return 0;
  const t = distance / radius;
  const multiplier = Math.max(0, 1 - t ** falloffExponent);
  return splashDamage * multiplier;
}

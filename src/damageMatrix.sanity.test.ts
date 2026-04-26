import { describe, expect, it } from 'vitest';
import { getDamageTypeKey, type BulletSpec, type DamageTypeKey } from './types';
import { type ArmourReductionProfile, emptyReductionProfile } from './types';

function computeEffectiveDamage(
  bulletSpec: Pick<BulletSpec, 'damage' | 'damageCategory' | 'matterType'>,
  profile: ArmourReductionProfile
): number {
  if (bulletSpec.damageCategory === 'void') {
    return bulletSpec.damage;
  }
  const key = getDamageTypeKey(bulletSpec.damageCategory, bulletSpec.matterType);
  const reduction = profile[key] ?? 0;
  return Math.max(0, bulletSpec.damage - reduction);
}

function withValues(values: Partial<Record<DamageTypeKey, number>>): ArmourReductionProfile {
  return { ...emptyReductionProfile(), ...values };
}

describe('damage matrix sanity', () => {
  it('resolves damage keys for defined combinations', () => {
    expect(getDamageTypeKey('laser', 'anti')).toBe('anti_photon_laser');
    expect(getDamageTypeKey('laser', 'dark')).toBe('dark_energy_laser');
    expect(getDamageTypeKey('kinetic', 'dark')).toBe('darkmatter_kinetic');
    expect(getDamageTypeKey('plasma', 'dark')).toBe('darkmatter_plasma');
    expect(getDamageTypeKey('void', 'normal')).toBe('void');
  });

  it('throws on invalid void + matter combinations', () => {
    expect(() => getDamageTypeKey('void', 'anti')).toThrow('Invalid damage type combination');
    expect(() => getDamageTypeKey('void', 'dark')).toThrow('Invalid damage type combination');
  });

  it('matches sanity numbers: pulse bolt vs ablative shield', () => {
    const ablativeProfile = withValues({
      laser: 10
    });
    const effective = computeEffectiveDamage(
      {
        damage: 12,
        damageCategory: 'laser',
        matterType: 'normal'
      },
      ablativeProfile
    );
    expect(effective).toBe(2);
  });

  it('matches sanity numbers: heavy slug vulnerability amplification', () => {
    const ablativeProfile = withValues({
      kinetic: -2
    });
    const effective = computeEffectiveDamage(
      {
        damage: 30,
        damageCategory: 'kinetic',
        matterType: 'normal'
      },
      ablativeProfile
    );
    expect(effective).toBe(32);
  });
});

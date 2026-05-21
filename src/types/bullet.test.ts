import { describe, expect, it } from 'vitest';
import {
  computeSplashDamage,
  getBulletKnockbackScale,
  getBulletSeekingAbility,
  mergeDotAbilities,
  type BulletSpec
} from './bullet';

function minimalSpec(overrides: Partial<BulletSpec>): BulletSpec {
  return {
    id: 'b',
    name: 'B',
    mass: 1,
    speed: 100,
    inheritShipVelocity: false,
    damage: 1,
    matterType: 'normal',
    infinite: false,
    lifespan: 1,
    visualType: 'bolt',
    colour: '#fff',
    ...overrides
  };
}

describe('getBulletSeekingAbility', () => {
  it('returns undefined when abilities absent or empty', () => {
    expect(getBulletSeekingAbility(minimalSpec({}))).toBeUndefined();
    expect(getBulletSeekingAbility(minimalSpec({ abilities: [] }))).toBeUndefined();
  });

  it('returns seeking entry when present', () => {
    const s = minimalSpec({
      abilities: [{ type: 'seeking', turnRatio: 2.5 }]
    });
    expect(getBulletSeekingAbility(s)).toEqual({ type: 'seeking', turnRatio: 2.5 });
  });
});

describe('knockback and dot helpers', () => {
  it('getBulletKnockbackScale returns null without knockback ability', () => {
    expect(getBulletKnockbackScale(minimalSpec({}))).toBeNull();
  });

  it('mergeDotAbilities returns null without dot', () => {
    expect(mergeDotAbilities(minimalSpec({}))).toBeNull();
  });

  it('mergeDotAbilities reads dot ability', () => {
    expect(
      mergeDotAbilities(
        minimalSpec({
          abilities: [{ type: 'dot', damagePerSecond: 4, duration: 3 }]
        })
      )
    ).toEqual({ damagePerSecond: 4, duration: 3 });
  });
});

describe('computeSplashDamage', () => {
  it('is full at center and zero at radius with linear falloff', () => {
    expect(computeSplashDamage(20, 0, 100, 1)).toBe(20);
    expect(computeSplashDamage(20, 100, 100, 1)).toBe(0);
    expect(computeSplashDamage(20, 50, 100, 1)).toBe(10);
  });
});

import { describe, expect, it } from 'vitest';
import { getBulletSeekingAbility, type BulletSpec } from './bullet';

function minimalSpec(overrides: Partial<BulletSpec>): BulletSpec {
  return {
    id: 'b',
    name: 'B',
    mass: 1,
    speed: 100,
    inheritShipVelocity: false,
    damage: 1,
    damageCategory: 'kinetic',
    matterType: 'normal',
    attractedByGravity: false,
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

  it('returns first seeking when multiple present (validator should forbid)', () => {
    const s = minimalSpec({
      abilities: [
        { type: 'seeking', turnRatio: 1 },
        { type: 'seeking', turnRatio: 99 }
      ]
    });
    expect(getBulletSeekingAbility(s)?.turnRatio).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { applyForce, clampAngularVelocity, clampVelocity } from './newtonian';
import { Vector2 } from './vector2';
import { childPRNG } from '../core/prng';

describe('newtonian helpers', () => {
  it('applyForce integrates v += (F/m)*dt', () => {
    const v0 = new Vector2(1, 0);
    const f = new Vector2(10, 0);
    const v1 = applyForce(v0, f, 2, 0.5);
    expect(v1.x).toBeCloseTo(3.5);
    expect(v1.y).toBe(0);
  });

  it('clampVelocity preserves direction when over limit', () => {
    const v = new Vector2(30, 40);
    const c = clampVelocity(v, 25);
    expect(c.magnitude()).toBeCloseTo(25);
    expect(c.x / c.y).toBeCloseTo(v.x / v.y);
  });

  it('clampVelocity is identity below limit', () => {
    const v = new Vector2(3, 4);
    const o = clampVelocity(v, 10);
    expect(o.x).toBeCloseTo(3);
    expect(o.y).toBeCloseTo(4);
  });

  it('clampAngularVelocity preserves sign and caps magnitude', () => {
    expect(clampAngularVelocity(5, 2)).toBe(2);
    expect(clampAngularVelocity(-5, 2)).toBe(-2);
    expect(clampAngularVelocity(1, 2)).toBe(1);
  });
});

describe('childPRNG', () => {
  it('different domains produce different first values', () => {
    const a = childPRNG(999, 'domain1').next();
    const b = childPRNG(999, 'domain2').next();
    expect(a).not.toBe(b);
  });

  it('same seed and domain yields same sequence', () => {
    const seq = () => {
      const r = childPRNG(42, 'domain');
      return [r.next(), r.next(), r.next()];
    };
    expect(seq()).toEqual(seq());
  });

  it('matches reference output for fixed seed/domain (deterministic)', () => {
    const r = childPRNG(12345, 'physics_ref');
    expect([
      r.next(),
      r.next(),
      r.next(),
      r.next(),
      r.next()
    ]).toEqual([
      0.263838976217456, 0.16113862098931442, 0.7502437870293518, 0.5688963323948197, 0.11081895266801478
    ]);
  });
});

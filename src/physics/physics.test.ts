import { describe, expect, it } from 'vitest';
import {
  applyAngularDamping,
  applyAngularForce,
  applyForce,
  applyLinearDamping,
  clampAngularVelocity,
  clampVelocity,
  integrateAngle,
  integratePosition
} from './newtonian';
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

  it('applyForce returns unchanged velocity when mass <= 0 or dt <= 0', () => {
    const v = new Vector2(3, 4);
    expect(applyForce(v, new Vector2(100, 0), 0, 1).x).toBe(3);
    expect(applyForce(v, new Vector2(100, 0), -1, 1).x).toBe(3);
    expect(applyForce(v, new Vector2(100, 0), 2, 0).x).toBe(3);
    expect(applyForce(v, new Vector2(100, 0), 2, -0.1).x).toBe(3);
  });

  it('integratePosition advances by v*dt', () => {
    const p0 = new Vector2(10, -5);
    const v = new Vector2(2, 3);
    const p1 = integratePosition(p0, v, 0.25);
    expect(p1.x).toBeCloseTo(10.5);
    expect(p1.y).toBeCloseTo(-4.25);
  });

  it('integratePosition is identity when dt <= 0', () => {
    const p = new Vector2(1, 2);
    const v = new Vector2(99, 99);
    const r0 = integratePosition(p, v, 0);
    expect(r0.x).toBe(1);
    expect(r0.y).toBe(2);
    const q = integratePosition(p, v, -1);
    expect(q.x).toBe(1);
    expect(q.y).toBe(2);
  });

  it('applyAngularForce integrates ω += (τ/m)*dt', () => {
    const w1 = applyAngularForce(0.5, 8, 2, 0.25);
    expect(w1).toBeCloseTo(1.5);
  });

  it('applyAngularForce leaves angular velocity unchanged when mass <= 0 or dt <= 0', () => {
    expect(applyAngularForce(2, 10, 0, 1)).toBe(2);
    expect(applyAngularForce(2, 10, -1, 1)).toBe(2);
    expect(applyAngularForce(2, 10, 2, 0)).toBe(2);
  });

  it('integrateAngle advances by ω*dt', () => {
    expect(integrateAngle(1, 2, 0.5)).toBeCloseTo(2);
  });

  it('integrateAngle is identity when dt <= 0', () => {
    expect(integrateAngle(Math.PI, 1, 0)).toBe(Math.PI);
    expect(integrateAngle(Math.PI, 1, -0.5)).toBe(Math.PI);
  });

  it('applyAngularDamping scales angular velocity toward zero', () => {
    const w = applyAngularDamping(4, 2, 0.5);
    expect(w).toBeCloseTo(0);
  });

  it('applyAngularDamping is identity when damping or dt is non-positive', () => {
    expect(applyAngularDamping(3, 0, 1)).toBe(3);
    expect(applyAngularDamping(3, 1, 0)).toBe(3);
  });

  it('applyLinearDamping scales velocity toward zero', () => {
    const v = new Vector2(10, 0);
    const d = applyLinearDamping(v, 1, 0.5);
    expect(d.x).toBeCloseTo(5);
    expect(d.y).toBe(0);
  });

  it('applyLinearDamping returns zero when dampingFactor >= 1', () => {
    const v = new Vector2(5, 5);
    const d = applyLinearDamping(v, 10, 1);
    expect(d.x).toBe(0);
    expect(d.y).toBe(0);
  });

  it('applyLinearDamping is identity when damping or dt is non-positive', () => {
    const v = new Vector2(1, 2);
    const a = applyLinearDamping(v, 0, 1);
    expect(a.x).toBe(1);
    expect(a.y).toBe(2);
    const b = applyLinearDamping(v, 1, 0);
    expect(b.x).toBe(1);
    expect(b.y).toBe(2);
  });

  it('clampVelocity returns zero when topSpeed <= 0', () => {
    const v = new Vector2(3, 4);
    expect(clampVelocity(v, 0).magnitude()).toBe(0);
    expect(clampVelocity(v, -1).magnitude()).toBe(0);
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

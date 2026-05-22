import { describe, expect, it } from 'vitest';
import { SplitMix64 } from '../../core/prng';
import { deriveRenderOpts } from './deriveOpts';
import { makeNoise } from './noise';
import type { Landable } from '../../types';

function makeLandable(partial: Partial<Landable> & Pick<Landable, 'type' | 'seed'>): Landable {
  return {
    id: 'test_body',
    name: 'Test',
    description: '',
    atmosphere: '',
    factionControl: [],
    controlState: 'sole',
    mass: 1000,
    radius: 40,
    position: { x: 0, y: 0 },
    services: [],
    rotationSpeed: 0,
    ...partial
  };
}

describe('deriveRenderOpts', () => {
  it('moon opts have no atmosphere or clouds by default', () => {
    const landable = makeLandable({ type: 'moon', seed: 99 });
    const opts = deriveRenderOpts(landable, 20);
    expect(opts.atmoThickness).toBeLessThan(0.05);
    expect(opts.cloudDensity).toBe(0);
    expect(opts.chaos).toBe(0);
  });

  it('honours proceduralBody overrides', () => {
    const landable = makeLandable({
      type: 'planet',
      seed: 1,
      proceduralBody: { rocky: 0.5, chaos: 0.3, forceRing: true }
    });
    const opts = deriveRenderOpts(landable);
    expect(opts.rocky).toBe(0.5);
    expect(opts.chaos).toBe(0.3);
    expect(opts.forceRing).toBe(true);
  });
});

describe('makeNoise', () => {
  it('is deterministic for SplitMix64 seed', () => {
    const a = makeNoise(12345);
    const b = makeNoise(12345);
    expect(a.n2(1.5, 2.5)).toBe(b.n2(1.5, 2.5));
    expect(a.fbm(0.5, 0.5, 4, 2, 0.5)).toBe(b.fbm(0.5, 0.5, 4, 2, 0.5));
  });

  it('differs across seeds', () => {
    const a = makeNoise(1);
    const b = makeNoise(2);
    const samples = [
      a.n2(3.7, 8.2),
      b.n2(3.7, 8.2),
      a.warp(1, 1, 4, 2, 0.5, 1),
      b.warp(1, 1, 4, 2, 0.5, 1)
    ];
    expect(samples[0]).not.toBe(samples[1]);
    expect(samples[2]).not.toBe(samples[3]);
  });
});

describe('SplitMix64 palette drain', () => {
  it('produces stable sequences for fixed seed', () => {
    const r1 = new SplitMix64(4242);
    const r2 = new SplitMix64(4242);
    const seq1 = Array.from({ length: 8 }, () => r1.next());
    const seq2 = Array.from({ length: 8 }, () => r2.next());
    expect(seq1).toEqual(seq2);
  });
});

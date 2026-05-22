import { SplitMix64 } from '../../core/prng';
import type { Landable } from '../../types';
import type { PlanetRenderOpts } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Deterministic render parameters from landable seed, type, and optional proceduralBody. */
export function deriveRenderOpts(landable: Landable, renderRadius?: number): PlanetRenderOpts {
  const body = landable.proceduralBody;
  const seed = (body?.paletteSeed ?? landable.seed) >>> 0;
  const radius = renderRadius ?? landable.radius;
  const rng = new SplitMix64(landable.seed >>> 0);

  if (landable.type === 'moon') {
    const rocky = body?.rocky ?? 0.88 + rng.next() * 0.07;
    const noiseScale = body?.noiseScale ?? 3.5 + rng.next() * 1.5;
    return {
      seed,
      radius,
      noiseScale: Math.max(1, Math.min(7, noiseScale)),
      rocky: clamp01(rocky),
      chaos: 0,
      cloudDensity: 0,
      atmoThickness: body?.atmoThickness ?? 0,
      forceRing: false
    };
  }

  const rocky = body?.rocky ?? rng.next();
  const chaos = body?.chaos ?? rng.next() * 0.85;
  const cloudDensity =
    body?.cloudDensity ?? (radius < 20 ? 0 : 0.15 + rng.next() * 0.65);
  const atmoThickness = body?.atmoThickness ?? 0.12 + rng.next() * 0.55;
  const noiseScale = body?.noiseScale ?? 1.5 + rng.next() * 4.5;

  return {
    seed,
    radius,
    noiseScale: Math.max(1, Math.min(7, noiseScale)),
    rocky: clamp01(rocky),
    chaos: clamp01(chaos),
    cloudDensity: clamp01(cloudDensity),
    atmoThickness: clamp01(atmoThickness),
    forceRing: body?.forceRing ?? false
  };
}

import { SplitMix64 } from '../../src/core/prng';
import type { PlanetRenderOpts } from '../../src/renderer/planets/types';

/** Surface classification matching `renderPlanet` / void_runner_planets.md */
export type SurfaceType = 'moon' | 'ocean' | 'continental' | 'dry' | 'gas';

export interface SurfaceRow {
  id: SurfaceType;
  label: string;
}

export const SURFACE_ROWS: readonly SurfaceRow[] = [
  { id: 'moon', label: 'Moon' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'continental', label: 'Continental' },
  { id: 'dry', label: 'Dry / barren' },
  { id: 'gas', label: 'Gas giant' }
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Classify rendered surface mode from procedural params (same rules as the renderer). */
export function classifySurface(opts: Pick<PlanetRenderOpts, 'rocky' | 'atmoThickness'>): SurfaceType {
  const { rocky, atmoThickness } = opts;
  if (atmoThickness < 0.05 || rocky > 0.85) {
    return 'moon';
  }
  if (rocky < 0.25 && atmoThickness > 0.1) {
    return 'ocean';
  }
  if (rocky >= 0.25 && rocky < 0.75) {
    return 'continental';
  }
  if (rocky > 0.75) {
    return 'dry';
  }
  return 'gas';
}

export function surfaceLabel(type: SurfaceType): string {
  return SURFACE_ROWS.find((r) => r.id === type)?.label ?? type;
}

function rngRange(rng: SplitMix64, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** Default editor params per surface row. */
export function defaultOptsForSurface(type: SurfaceType, radius: number): PlanetRenderOpts {
  switch (type) {
    case 'moon':
      return {
        seed: 1,
        radius,
        noiseScale: 4,
        rocky: 0.92,
        chaos: 0,
        cloudDensity: 0,
        atmoThickness: 0,
        forceRing: false
      };
    case 'ocean':
      return {
        seed: 1,
        radius,
        noiseScale: 2.5,
        rocky: 0.12,
        chaos: 0.25,
        cloudDensity: 0.55,
        atmoThickness: 0.45,
        forceRing: false
      };
    case 'continental':
      return {
        seed: 1,
        radius,
        noiseScale: 3,
        rocky: 0.48,
        chaos: 0.3,
        cloudDensity: 0.45,
        atmoThickness: 0.35,
        forceRing: false
      };
    case 'dry':
      return {
        seed: 1,
        radius,
        noiseScale: 4.5,
        rocky: 0.8,
        chaos: 0.1,
        cloudDensity: 0.05,
        atmoThickness: 0.15,
        forceRing: false
      };
    case 'gas':
      return {
        seed: 1,
        radius,
        noiseScale: 2.2,
        rocky: 0.12,
        chaos: 0.65,
        cloudDensity: 0.2,
        atmoThickness: 0.06,
        forceRing: false
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Seeded variant for gallery cells — params land in the target surface band. */
export function sampleOptsForSurface(
  type: SurfaceType,
  gallerySeed: number,
  variantIndex: number,
  radius: number
): PlanetRenderOpts {
  const rng = new SplitMix64((gallerySeed + variantIndex * 997 + type.charCodeAt(0) * 17) >>> 0);
  const paletteSeed = (gallerySeed + variantIndex * 31 + type.length * 101) >>> 0;

  let rocky: number;
  let atmoThickness: number;
  let chaos: number;
  let cloudDensity: number;
  let noiseScale: number;
  let forceRing: boolean;

  switch (type) {
    case 'moon':
      rocky = rngRange(rng, 0.86, 0.98);
      atmoThickness = 0;
      chaos = 0;
      cloudDensity = 0;
      noiseScale = rngRange(rng, 3, 5.5);
      forceRing = false;
      break;
    case 'ocean':
      rocky = rngRange(rng, 0.04, 0.22);
      atmoThickness = rngRange(rng, 0.15, 0.75);
      chaos = rngRange(rng, 0.05, 0.45);
      cloudDensity = rngRange(rng, 0.25, 0.85);
      noiseScale = rngRange(rng, 1.5, 4);
      forceRing = rng.next() < 0.22;
      break;
    case 'continental':
      rocky = rngRange(rng, 0.28, 0.72);
      atmoThickness = rngRange(rng, 0.12, 0.65);
      chaos = rngRange(rng, 0.08, 0.5);
      cloudDensity = rngRange(rng, 0.15, 0.75);
      noiseScale = rngRange(rng, 2, 5);
      forceRing = rng.next() < 0.28;
      break;
    case 'dry':
      rocky = rngRange(rng, 0.76, 0.84);
      atmoThickness = rngRange(rng, 0.06, 0.35);
      chaos = rngRange(rng, 0, 0.2);
      cloudDensity = rngRange(rng, 0, 0.15);
      noiseScale = rngRange(rng, 3.5, 6);
      forceRing = false;
      break;
    case 'gas':
      rocky = rngRange(rng, 0.02, 0.24);
      atmoThickness = rngRange(rng, 0.02, 0.09);
      chaos = rngRange(rng, 0.35, 0.95);
      cloudDensity = rngRange(rng, 0, 0.35);
      noiseScale = rngRange(rng, 1.2, 3.5);
      forceRing = rng.next() < 0.18;
      break;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }

  return {
    seed: paletteSeed,
    radius,
    noiseScale: Math.max(1, Math.min(7, noiseScale)),
    rocky: clamp01(rocky),
    chaos: clamp01(chaos),
    cloudDensity: clamp01(cloudDensity),
    atmoThickness: clamp01(atmoThickness),
    forceRing
  };
}

export function normalizeOpts(input: Partial<PlanetRenderOpts>, radius: number): PlanetRenderOpts {
  const rocky = clamp01(Number(input.rocky ?? 0.5));
  const atmoThickness = clamp01(Number(input.atmoThickness ?? 0.3));
  const isMoon = atmoThickness < 0.05 || rocky > 0.85;

  return {
    seed: (Number(input.seed) || 1) >>> 0,
    radius: Math.max(8, Number(input.radius) || radius),
    noiseScale: Math.max(1, Math.min(7, Number(input.noiseScale) || 3)),
    rocky,
    chaos: clamp01(Number(input.chaos) ?? 0),
    cloudDensity: isMoon ? 0 : clamp01(Number(input.cloudDensity) ?? 0),
    atmoThickness: isMoon ? Math.min(atmoThickness, 0.04) : atmoThickness,
    forceRing: isMoon ? false : !!input.forceRing
  };
}

import { childPRNG, SplitMix64 } from '../../core/prng';
import type { FactionType } from '../../types/faction';
import type { Species } from '../../types/species';
import type {
  FactionSkeleton,
  FactionSkeletonInput,
  FactionSkeletonOutput,
  SpeciesCompositionEntry
} from '../types/factionSkeleton';

export type {
  FactionSkeleton,
  FactionSkeletonInput,
  FactionSkeletonOutput,
  FactionTierTargets
} from '../types/factionSkeleton';
export { DEFAULT_FACTION_TIER_TARGETS } from '../types/factionSkeleton';

const MAJOR_COUNT_MIN = 2;
const MAJOR_COUNT_MAX = 5;

export function countGalaxyLandables(input: FactionSkeletonInput['galaxyStructure']): number {
  return input.sectors.reduce((n, sector) => n + sector.landables.length, 0);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pickDistinctSpeciesIds(rng: SplitMix64, speciesIds: string[], count: number): string[] {
  if (speciesIds.length === 0) {
    throw new Error('Cannot assign species composition: no species in input');
  }
  const pool = [...speciesIds];
  const picked: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = rng.nextInt(0, pool.length - 1);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
    if (pool.length === 0) {
      pool.push(...speciesIds);
    }
  }
  return picked;
}

function splitPercentages(rng: SplitMix64, count: number): number[] {
  if (count === 1) {
    return [100];
  }
  if (count === 2) {
    const major = rng.nextBool() ? 70 : 60;
    return [major, 100 - major];
  }
  if (count === 3) {
    if (rng.nextBool()) {
      return [40, 30, 30];
    }
    return [35, 33, 32];
  }
  throw new Error(`Unsupported composition size: ${count}`);
}

function rollCompositionCount(rng: SplitMix64, independent: boolean): number {
  const roll = rng.next();
  if (independent) {
    if (roll < 0.3) return 1;
    if (roll < 0.8) return 2;
    return 3;
  }
  if (roll < 0.7) return 1;
  if (roll < 0.95) return 2;
  return 3;
}

export function findHumanSpeciesId(species: Species[]): string {
  const humans = species.filter((s) => s.speciesRole === 'human');
  if (humans.length !== 1) {
    throw new Error(
      `Faction skeleton requires exactly one human species (speciesRole: human); got ${humans.length}`
    );
  }
  return humans[0].id;
}

function monoSpeciesComposition(speciesId: string): SpeciesCompositionEntry[] {
  return [{ speciesId, percentage: 100 }];
}

function buildSpeciesComposition(
  rng: SplitMix64,
  speciesIds: string[],
  independent: boolean
): SpeciesCompositionEntry[] {
  const count = Math.min(rollCompositionCount(rng, independent), speciesIds.length);
  const ids = pickDistinctSpeciesIds(rng, speciesIds, count);
  const percentages = splitPercentages(rng, count);
  return ids.map((speciesId, index) => ({
    speciesId,
    percentage: percentages[index]
  }));
}

export function validateFactionSkeletonOutput(
  output: FactionSkeletonOutput,
  species: Species[]
): string[] {
  const errors: string[] = [];
  const validIds = new Set(species.map((s) => s.id));
  const seenFactionIds = new Set<string>();

  for (const skeleton of output.factionSkeletons) {
    if (seenFactionIds.has(skeleton.id)) {
      errors.push(`duplicate faction id: ${skeleton.id}`);
    }
    seenFactionIds.add(skeleton.id);

    let total = 0;
    for (const entry of skeleton.speciesComposition) {
      if (!validIds.has(entry.speciesId)) {
        errors.push(`${skeleton.id}: unknown speciesId ${entry.speciesId}`);
      }
      if (entry.percentage <= 0 || entry.percentage > 100) {
        errors.push(`${skeleton.id}: invalid percentage ${entry.percentage}`);
      }
      total += entry.percentage;
    }
    if (Math.abs(total - 100) > 0.001) {
      errors.push(`${skeleton.id}: speciesComposition sums to ${total}, expected 100`);
    }
  }

  let humanId: string | undefined;
  try {
    humanId = findHumanSpeciesId(species);
  } catch {
    return errors;
  }

  const hasHumanMonoMajor = output.factionSkeletons.some(
    (f) =>
      f.type === 'major_nation' &&
      f.speciesComposition.length === 1 &&
      f.speciesComposition[0].speciesId === humanId &&
      f.speciesComposition[0].percentage === 100
  );
  if (!hasHumanMonoMajor) {
    errors.push('expected at least one major_nation with 100% human speciesComposition');
  }

  return errors;
}

export function generateFactionSkeleton(input: FactionSkeletonInput): FactionSkeletonOutput {
  const speciesIds = input.species.map((s) => s.id);
  if (speciesIds.length === 0) {
    throw new Error('At least one species is required for faction skeleton generation');
  }

  const landableCount = countGalaxyLandables(input.galaxyStructure);
  const rng = childPRNG(input.seed, 'faction_skeleton');
  const { tierTargets } = input;

  const majorCount = clampInt(
    landableCount * tierTargets.majorPerLandables,
    MAJOR_COUNT_MIN,
    MAJOR_COUNT_MAX
  );

  let minorCount = 0;
  for (let m = 0; m < majorCount; m += 1) {
    minorCount += rng.nextInt(tierTargets.minorPerMajor[0], tierTargets.minorPerMajor[1]);
  }

  const [indMin, indMax] = tierTargets.independentCount;
  const independentCount = rng.nextInt(Math.min(indMin, indMax), Math.max(indMin, indMax));

  const humanSpeciesId = findHumanSpeciesId(input.species);
  const factionSkeletons: FactionSkeleton[] = [];

  for (let i = 0; i < majorCount; i += 1) {
    factionSkeletons.push({
      id: `faction_major_${i}`,
      type: 'major_nation',
      speciesComposition:
        i === 0
          ? monoSpeciesComposition(humanSpeciesId)
          : buildSpeciesComposition(rng, speciesIds, false)
    });
  }

  for (let i = 0; i < minorCount; i += 1) {
    factionSkeletons.push({
      id: `faction_minor_${i}`,
      type: 'minor_nation',
      speciesComposition: buildSpeciesComposition(rng, speciesIds, false)
    });
  }

  for (let i = 0; i < independentCount; i += 1) {
    factionSkeletons.push({
      id: `faction_independent_${i}`,
      type: 'independent',
      speciesComposition: buildSpeciesComposition(rng, speciesIds, true)
    });
  }

  const output: FactionSkeletonOutput = {
    galaxyLandableCount: landableCount,
    factionSkeletons
  };

  const errors = validateFactionSkeletonOutput(output, input.species);
  if (errors.length > 0) {
    throw new Error(`Faction skeleton validation failed: ${errors.join('; ')}`);
  }

  return output;
}

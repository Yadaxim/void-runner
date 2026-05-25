import type { FactionType } from '../../types/faction';
import type { Species } from '../../types/species';
import type { GalaxyStructureOutput } from './galaxyStructure';

export interface SpeciesCompositionEntry {
  speciesId: string;
  percentage: number;
}

export interface FactionSkeleton {
  id: string;
  type: FactionType;
  speciesComposition: SpeciesCompositionEntry[];
}

export interface FactionTierTargets {
  /** Landables × this rate → major count (clamped 2–5). */
  majorPerLandables: number;
  /** Min/max minors rolled per major nation. */
  minorPerMajor: [number, number];
  /** Inclusive range for independent faction count. */
  independentCount: [number, number];
}

export interface FactionSkeletonInput {
  species: Species[];
  galaxyStructure: GalaxyStructureOutput;
  seed: number;
  tierTargets: FactionTierTargets;
}

export interface FactionSkeletonOutput {
  galaxyLandableCount: number;
  factionSkeletons: FactionSkeleton[];
}

export const DEFAULT_FACTION_TIER_TARGETS: FactionTierTargets = {
  majorPerLandables: 0.025,
  minorPerMajor: [1, 2],
  independentCount: [3, 7]
};

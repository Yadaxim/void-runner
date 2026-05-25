import type { GalaxyStructureOutput } from './galaxyStructure';

export interface SectorOverrideProperties {
  radiation?: { intensity: number };
  nebula?: { color: string; density: number };
  ruins?: { detectionRequirement: number; salvageTier: 1 | 2 | 3 };
  shimmer?: boolean;
}

export interface SectorOverride {
  sectorCoord: [number, number];
  properties: SectorOverrideProperties;
}

export interface SpecialSectorSeedsTuning {
  nebulaClusterCountMin?: number;
  nebulaClusterCountMax?: number;
  nebulaClusterSizeMin?: number;
  nebulaClusterSizeMax?: number;
  shimmerFractionMin?: number;
  shimmerFractionMax?: number;
}

export interface SpecialSectorSeedsInput {
  /** Step 1 output. */
  galaxyStructure: GalaxyStructureOutput;
  seed: number;
  tuning?: SpecialSectorSeedsTuning;
}

export interface SpecialSectorSeedsOutput {
  sectorOverrides: SectorOverride[];
}

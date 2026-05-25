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

export interface SpecialSectorSeedsInput {
  /** Step 1 output. */
  galaxyStructure: GalaxyStructureOutput;
  seed: number;
}

export interface SpecialSectorSeedsOutput {
  sectorOverrides: SectorOverride[];
}

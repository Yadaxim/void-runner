import type { GalaxyShape } from './types';

/** Shared across steps (world label + master RNG seed). */
export interface ExplorerGlobalConfig {
  worldName: string;
  seed: number;
}

export interface Step1Params {
  sizeX: number;
  sizeY: number;
  sectorSize: number;
  shape: GalaxyShape;
  planetDensity: number;
  moonProbability: number;
  moonsPerPlanetRange: [number, number];
}

export interface Step2Params {
  nebulaClusterCountMin: number;
  nebulaClusterCountMax: number;
  nebulaClusterSizeMin: number;
  nebulaClusterSizeMax: number;
  shimmerFractionMin: number;
  shimmerFractionMax: number;
}

export interface Step3Params {
  speciesCount: number;
  useLlmMock: boolean;
  anthropicApiKey: string;
  maxRetries: number;
}

export interface Step4Params {
  majorPerLandables: number;
  minorPerMajorMin: number;
  minorPerMajorMax: number;
  independentCountMin: number;
  independentCountMax: number;
}

export type StepParamsById = {
  '01_galaxy_structure': Step1Params;
  '02_special_sectors': Step2Params;
  '03_species': Step3Params;
  '04_faction_skeleton': Step4Params;
};

export type StepConfigId = keyof StepParamsById;

export interface ExplorerConfig {
  global: ExplorerGlobalConfig;
  steps: StepParamsById;
}

export const DEFAULT_STEP1: Step1Params = {
  sizeX: 40,
  sizeY: 40,
  sectorSize: 10000,
  shape: 'spiral',
  planetDensity: 0.5,
  moonProbability: 0.3,
  moonsPerPlanetRange: [1, 3]
};

export const DEFAULT_STEP2: Step2Params = {
  nebulaClusterCountMin: 3,
  nebulaClusterCountMax: 6,
  nebulaClusterSizeMin: 10,
  nebulaClusterSizeMax: 24,
  shimmerFractionMin: 0.02,
  shimmerFractionMax: 0.05
};

export const DEFAULT_STEP3: Step3Params = {
  speciesCount: 5,
  useLlmMock: true,
  anthropicApiKey: '',
  maxRetries: 3
};

export const DEFAULT_STEP4: Step4Params = {
  majorPerLandables: 0.025,
  minorPerMajorMin: 1,
  minorPerMajorMax: 2,
  independentCountMin: 3,
  independentCountMax: 7
};

export const DEFAULT_EXPLORER_CONFIG: ExplorerConfig = {
  global: { worldName: 'Generated World', seed: 424242 },
  steps: {
    '01_galaxy_structure': { ...DEFAULT_STEP1 },
    '02_special_sectors': { ...DEFAULT_STEP2 },
    '03_species': { ...DEFAULT_STEP3 },
    '04_faction_skeleton': { ...DEFAULT_STEP4 }
  }
};

/** @deprecated Flat checkpoint shape — migrated on import. */
export interface LegacyWorldGenConfig {
  sizeX?: number;
  sizeY?: number;
  sectorSize?: number;
  shape?: GalaxyShape;
  planetDensity?: number;
  moonProbability?: number;
  moonsPerPlanetRange?: [number, number];
  seed?: number;
  speciesCount?: number;
  worldName?: string;
  useLlmMock?: boolean;
  anthropicApiKey?: string;
}

export function mergeExplorerConfig(
  base: ExplorerConfig,
  patch?: Partial<ExplorerConfig> & LegacyWorldGenConfig
): ExplorerConfig {
  if (!patch) {
    return structuredClone(base);
  }
  if ('global' in patch && patch.global) {
    return {
      global: { ...base.global, ...patch.global },
      steps: {
        '01_galaxy_structure': {
          ...base.steps['01_galaxy_structure'],
          ...patch.steps?.['01_galaxy_structure']
        },
        '02_special_sectors': {
          ...base.steps['02_special_sectors'],
          ...patch.steps?.['02_special_sectors']
        },
        '03_species': { ...base.steps['03_species'], ...patch.steps?.['03_species'] },
        '04_faction_skeleton': {
          ...base.steps['04_faction_skeleton'],
          ...patch.steps?.['04_faction_skeleton']
        }
      }
    };
  }
  const legacy = patch as LegacyWorldGenConfig;
  return {
    global: {
      worldName: legacy.worldName ?? base.global.worldName,
      seed: legacy.seed ?? base.global.seed
    },
    steps: {
      '01_galaxy_structure': {
        ...base.steps['01_galaxy_structure'],
        sizeX: legacy.sizeX ?? base.steps['01_galaxy_structure'].sizeX,
        sizeY: legacy.sizeY ?? base.steps['01_galaxy_structure'].sizeY,
        sectorSize: legacy.sectorSize ?? base.steps['01_galaxy_structure'].sectorSize,
        shape: legacy.shape ?? base.steps['01_galaxy_structure'].shape,
        planetDensity: legacy.planetDensity ?? base.steps['01_galaxy_structure'].planetDensity,
        moonProbability: legacy.moonProbability ?? base.steps['01_galaxy_structure'].moonProbability,
        moonsPerPlanetRange:
          legacy.moonsPerPlanetRange ?? base.steps['01_galaxy_structure'].moonsPerPlanetRange
      },
      '02_special_sectors': { ...base.steps['02_special_sectors'] },
      '03_species': {
        ...base.steps['03_species'],
        speciesCount: legacy.speciesCount ?? base.steps['03_species'].speciesCount,
        useLlmMock: legacy.useLlmMock ?? base.steps['03_species'].useLlmMock,
        anthropicApiKey: legacy.anthropicApiKey ?? base.steps['03_species'].anthropicApiKey
      },
      '04_faction_skeleton': { ...base.steps['04_faction_skeleton'] }
    }
  };
}

export function stepConfigTitle(stepId: string, index: number, name: string): string {
  return `Step ${index} — ${name}`;
}

import { SECTOR_SIZE } from '../../constants';

export type GalaxyShape = 'disc' | 'ring' | 'spiral' | 'heterogeneous';

export interface GalaxyStructureInput {
  sizeX: number;
  sizeY: number;
  /** World-unit extent of each sector (width and height). Defaults to {@link SECTOR_SIZE}. */
  sectorSize: number;
  shape: GalaxyShape;
  /** Fraction of in-mask sectors that receive a planet (0..1). */
  planetDensity: number;
  /** Chance a planet receives at least one moon (0..1). */
  moonProbability: number;
  moonsPerPlanetRange: [number, number];
  seed: number;
}

/** Step 1 fragment — grows into a full {@link WorldFile} across later pipeline steps. */
export interface GalaxyStructureOutput {
  galaxy: {
    gridWidth: number;
    gridHeight: number;
    sectorSize: number;
  };
  sectors: import('../../types/world').SectorMetadata[];
}

export function defaultGalaxyStructureInput(
  partial?: Partial<GalaxyStructureInput>
): GalaxyStructureInput {
  return {
    sizeX: 40,
    sizeY: 40,
    sectorSize: SECTOR_SIZE,
    shape: 'spiral',
    planetDensity: 0.5,
    moonProbability: 0.3,
    moonsPerPlanetRange: [1, 3],
    seed: 424242,
    ...partial
  };
}

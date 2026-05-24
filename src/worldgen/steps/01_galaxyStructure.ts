import { childPRNG, SplitMix64 } from '../../core/prng';
import {
  WORLDGEN_MASS_RANGE_MOON,
  WORLDGEN_MASS_RANGE_PLANET,
  WORLDGEN_RADIUS_RANGE_MOON,
  WORLDGEN_RADIUS_RANGE_PLANET
} from '../../constants';
import type { Landable } from '../../types/landable';
import type { GridCoord, SectorMetadata } from '../../types/world';
import { galaxyShapeWeight } from '../galaxyShapeMask';
import type { GalaxyStructureInput, GalaxyStructureOutput } from '../types/galaxyStructure';
import { defaultGalaxyStructureInput } from '../types/galaxyStructure';

const PLANET_PLACEMENT_INSET_FRACTION = 0.12;
const MOON_OFFSET_FRACTION = 0.06;

export { defaultGalaxyStructureInput };
export type { GalaxyStructureInput, GalaxyStructureOutput };

/** Enumerate every sector coord on the torus grid (game convention). */
export function buildAllSectorCoords(sizeX: number, sizeY: number): GridCoord[] {
  const hw = Math.floor(sizeX / 2);
  const hh = Math.floor(sizeY / 2);
  const coords: GridCoord[] = [];
  for (let row = 0; row < sizeY; row += 1) {
    const y = hh - 1 - row;
    for (let col = 0; col < sizeX; col += 1) {
      coords.push({ x: col - hw, y });
    }
  }
  return coords;
}

function gridIndices(
  coord: GridCoord,
  sizeX: number,
  sizeY: number
): { col: number; row: number } {
  const hw = Math.floor(sizeX / 2);
  const hh = Math.floor(sizeY / 2);
  return {
    col: coord.x + hw,
    row: hh - 1 - coord.y
  };
}

function randomSectorPosition(rng: SplitMix64, sectorSize: number): [number, number] {
  const inset = sectorSize * PLANET_PLACEMENT_INSET_FRACTION;
  const half = sectorSize / 2 - inset;
  return [(rng.next() * 2 - 1) * half, (rng.next() * 2 - 1) * half];
}

function moonOffset(rng: SplitMix64, sectorSize: number): [number, number] {
  const max = sectorSize * MOON_OFFSET_FRACTION;
  return [(rng.next() * 2 - 1) * max, (rng.next() * 2 - 1) * max];
}

function clampPosition(position: [number, number], sectorSize: number): [number, number] {
  const limit = sectorSize / 2;
  return [
    Math.max(-limit, Math.min(limit, position[0])),
    Math.max(-limit, Math.min(limit, position[1]))
  ];
}

function createSectorStub(coord: GridCoord, worldSeed: number, shapeWeight: number): SectorMetadata {
  return {
    coord: { ...coord },
    regionType: shapeWeight > 0 ? 'frontier' : 'void',
    factionId: null,
    npcSpawnRules: [],
    inRadiationZone: false,
    radiationFringeIntensity: 0,
    ambientVisuals: {
      hasNebula: false,
      nebulaHue: 0,
      nebulaIntensity: 0,
      starDensityMultiplier: shapeWeight > 0 ? 1 : 0.5
    },
    seed: childPRNG(worldSeed, `sector:${coord.x}:${coord.y}`).nextInt(0, 999999),
    landables: []
  };
}

function createLandableStub(type: 'planet' | 'moon', id: string, position: [number, number], rng: SplitMix64): Landable {
  const [rMin, rMax] = type === 'planet' ? WORLDGEN_RADIUS_RANGE_PLANET : WORLDGEN_RADIUS_RANGE_MOON;
  const [mMin, mMax] = type === 'planet' ? WORLDGEN_MASS_RANGE_PLANET : WORLDGEN_MASS_RANGE_MOON;
  const radius = rMin + rng.nextInt(0, rMax - rMin);
  const mass = mMin + rng.nextInt(0, mMax - mMin);
  return {
    id,
    name: '',
    type,
    description: '',
    atmosphere: '',
    factionControl: [],
    controlState: 'sole',
    mass,
    radius,
    position: { x: position[0], y: position[1] },
    services: [],
    rotationSpeed: 0,
    seed: rng.nextInt(0, 999999)
  };
}

export function validateGalaxyStructureInput(input: GalaxyStructureInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(input.sizeX) || input.sizeX < 4) {
    errors.push('sizeX must be an integer >= 4');
  }
  if (!Number.isInteger(input.sizeY) || input.sizeY < 4) {
    errors.push('sizeY must be an integer >= 4');
  }
  if (!Number.isFinite(input.sectorSize) || input.sectorSize <= 0) {
    errors.push('sectorSize must be a positive number');
  }
  if (input.planetDensity < 0 || input.planetDensity > 1) {
    errors.push('planetDensity must be in [0, 1]');
  }
  if (input.moonProbability < 0 || input.moonProbability > 1) {
    errors.push('moonProbability must be in [0, 1]');
  }
  const [moonMin, moonMax] = input.moonsPerPlanetRange;
  if (!Number.isInteger(moonMin) || !Number.isInteger(moonMax) || moonMin < 0 || moonMax < moonMin) {
    errors.push('moonsPerPlanetRange must be [min, max] with 0 <= min <= max');
  }
  if (!Number.isFinite(input.seed)) {
    errors.push('seed must be a finite number');
  }
  return errors;
}

export function validateGalaxyStructureOutput(
  output: GalaxyStructureOutput,
  input: GalaxyStructureInput
): string[] {
  const errors: string[] = [];
  const expectedCount = input.sizeX * input.sizeY;
  if (output.sectors.length !== expectedCount) {
    errors.push(`sectors length ${output.sectors.length} !== ${expectedCount}`);
  }
  if (output.galaxy.gridWidth !== input.sizeX || output.galaxy.gridHeight !== input.sizeY) {
    errors.push('galaxy gridWidth/gridHeight must match input sizeX/sizeY');
  }
  if (output.galaxy.sectorSize !== input.sectorSize) {
    errors.push('galaxy.sectorSize must match input sectorSize');
  }

  const coordSet = new Set<string>();
  const half = output.galaxy.sectorSize / 2;

  for (const sector of output.sectors) {
    const key = `${sector.coord.x},${sector.coord.y}`;
    if (coordSet.has(key)) {
      errors.push(`duplicate sector coord ${key}`);
    }
    coordSet.add(key);

    let planetCount = 0;
    let moonCount = 0;
    for (const landable of sector.landables) {
      if (Math.abs(landable.position.x) > half || Math.abs(landable.position.y) > half) {
        errors.push(`landable ${landable.id} position out of sector bounds`);
      }
      if (landable.type === 'planet') {
        planetCount += 1;
      } else if (landable.type === 'moon') {
        moonCount += 1;
      }
    }
    if (moonCount > 0 && planetCount === 0) {
      errors.push(`sector ${key} has moons but no planet`);
    }
  }

  return errors;
}

export function generateGalaxyStructure(input: GalaxyStructureInput): GalaxyStructureOutput {
  const inputErrors = validateGalaxyStructureInput(input);
  if (inputErrors.length > 0) {
    throw new Error(`Invalid galaxy structure input: ${inputErrors.join('; ')}`);
  }

  const rng = childPRNG(input.seed, 'galaxy_structure');
  const sectors: SectorMetadata[] = [];
  let planetIndex = 0;

  for (const coord of buildAllSectorCoords(input.sizeX, input.sizeY)) {
    const { col, row } = gridIndices(coord, input.sizeX, input.sizeY);
    const weight = galaxyShapeWeight(input.shape, col, row, input.sizeX, input.sizeY, input.seed);
    const sector = createSectorStub(coord, input.seed, weight);

    const effectiveDensity = input.planetDensity * weight;
    if (weight > 0 && rng.next() < effectiveDensity) {
      const planetId = `wg_planet_${planetIndex}`;
      planetIndex += 1;
      const planetPos = randomSectorPosition(rng, input.sectorSize);
      sector.landables.push(createLandableStub('planet', planetId, planetPos, rng));

      if (rng.next() < input.moonProbability) {
        const [moonMin, moonMax] = input.moonsPerPlanetRange;
        const moonCount = moonMin + rng.nextInt(0, moonMax - moonMin);
        for (let m = 0; m < moonCount; m += 1) {
          const [ox, oy] = moonOffset(rng, input.sectorSize);
          const moonPos = clampPosition([planetPos[0] + ox, planetPos[1] + oy], input.sectorSize);
          sector.landables.push(createLandableStub('moon', `${planetId}_moon_${m}`, moonPos, rng));
        }
      }
    }

    sectors.push(sector);
  }

  const output: GalaxyStructureOutput = {
    galaxy: {
      gridWidth: input.sizeX,
      gridHeight: input.sizeY,
      sectorSize: input.sectorSize
    },
    sectors
  };

  const outputErrors = validateGalaxyStructureOutput(output, input);
  if (outputErrors.length > 0) {
    throw new Error(`Galaxy structure validation failed: ${outputErrors.join('; ')}`);
  }

  return output;
}

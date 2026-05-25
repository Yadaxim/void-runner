import { childPRNG, SplitMix64 } from '../../core/prng';
import type { GridCoord } from '../../types/world';
import { coordFromGridIndices, gridIndices, torusNeighbours, torusSeamWeight } from '../gridCoords';
import { radiationIntensityAtCoord } from '../radiationIntensity';
import type { GalaxyStructureOutput } from '../types/galaxyStructure';
import type {
  SectorOverride,
  SectorOverrideProperties,
  SpecialSectorSeedsInput,
  SpecialSectorSeedsOutput
} from '../types/specialSectorSeeds';

const SHIMMER_FRACTION_MIN = 0.02;
const SHIMMER_FRACTION_MAX = 0.05;
const SHIMMER_EDGE_WEIGHT = 3;
const SHIMMER_BASE_WEIGHT = 0.12;

export type { SpecialSectorSeedsInput, SpecialSectorSeedsOutput };

function coordKey(coord: GridCoord): string {
  return `${coord.x},${coord.y}`;
}

function mergeOverride(
  map: Map<string, SectorOverride>,
  coord: GridCoord,
  patch: SectorOverrideProperties
): void {
  const key = coordKey(coord);
  const existing = map.get(key);
  if (existing) {
    existing.properties = { ...existing.properties, ...patch };
    return;
  }
  map.set(key, { sectorCoord: [coord.x, coord.y], properties: patch });
}

function growNebulaCluster(
  startCol: number,
  startRow: number,
  targetSize: number,
  sizeX: number,
  sizeY: number,
  occupied: Set<string>,
  rng: SplitMix64
): GridCoord[] {
  const cells: [number, number][] = [[startCol, startRow]];
  const clusterKeys = new Set<string>([`${startCol},${startRow}`]);
  const frontier: [number, number][] = [[startCol, startRow]];

  while (cells.length < targetSize && frontier.length > 0) {
    const pick = rng.nextInt(0, frontier.length - 1);
    const [col, row] = frontier[pick];
    const neighbours = torusNeighbours(col, row, sizeX, sizeY);
    let grew = false;

    for (let attempt = 0; attempt < neighbours.length; attempt += 1) {
      const [nextCol, nextRow] = neighbours[rng.nextInt(0, neighbours.length - 1)];
      const key = `${nextCol},${nextRow}`;
      if (clusterKeys.has(key) || occupied.has(key)) {
        continue;
      }
      clusterKeys.add(key);
      cells.push([nextCol, nextRow]);
      frontier.push([nextCol, nextRow]);
      grew = true;
      break;
    }

    if (!grew) {
      frontier.splice(pick, 1);
    }
  }

  return cells.map(([col, row]) => coordFromGridIndices(col, row, sizeX, sizeY));
}

function weightedSampleWithoutReplacement(
  items: GridCoord[],
  weights: number[],
  count: number,
  rng: SplitMix64
): GridCoord[] {
  const pool = items.map((item, index) => ({ item, weight: Math.max(0, weights[index]) }));
  const selected: GridCoord[] = [];

  for (let n = 0; n < count && pool.length > 0; n += 1) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) {
      break;
    }
    let roll = rng.next() * total;
    let pickIndex = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= pool[i].weight;
      if (roll <= 0) {
        pickIndex = i;
        break;
      }
    }
    selected.push(pool[pickIndex].item);
    pool.splice(pickIndex, 1);
  }

  return selected;
}

function shimmerSelectionWeight(col: number, row: number, sizeX: number, sizeY: number): number {
  const seam = torusSeamWeight(col, row, sizeX, sizeY);
  return SHIMMER_BASE_WEIGHT + SHIMMER_EDGE_WEIGHT * seam;
}

export function validateSpecialSectorSeedsOutput(output: SpecialSectorSeedsOutput): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const override of output.sectorOverrides) {
    const key = `${override.sectorCoord[0]},${override.sectorCoord[1]}`;
    if (seen.has(key)) {
      errors.push(`duplicate sector override ${key}`);
    }
    seen.add(key);

    const props = override.properties;
    if (props.radiation) {
      const { intensity } = props.radiation;
      if (intensity < 0 || intensity > 1) {
        errors.push(`radiation intensity out of range for ${key}`);
      }
    }
    if (props.nebula) {
      const { density } = props.nebula;
      if (density < 0 || density > 1) {
        errors.push(`nebula density out of range for ${key}`);
      }
    }
    if (props.ruins) {
      errors.push(`ruins not supported in step 2 v1 (${key})`);
    }
  }

  return errors;
}

export function generateSpecialSectorSeeds(input: SpecialSectorSeedsInput): SpecialSectorSeedsOutput {
  const { galaxyStructure, seed, tuning } = input;
  const { gridWidth: sizeX, gridHeight: sizeY } = galaxyStructure.galaxy;
  const rng = childPRNG(seed, 'special_sector_seeds');
  const overrides = new Map<string, SectorOverride>();

  const nebulaCountMin = tuning?.nebulaClusterCountMin ?? 3;
  const nebulaCountMax = tuning?.nebulaClusterCountMax ?? 6;
  const nebulaSizeMin = tuning?.nebulaClusterSizeMin ?? 10;
  const nebulaSizeMax = tuning?.nebulaClusterSizeMax ?? 24;
  const shimmerMin = tuning?.shimmerFractionMin ?? SHIMMER_FRACTION_MIN;
  const shimmerMax = tuning?.shimmerFractionMax ?? SHIMMER_FRACTION_MAX;

  for (const sector of galaxyStructure.sectors) {
    const intensity = radiationIntensityAtCoord(sector.coord, sizeX, sizeY);
    if (intensity > 0) {
      mergeOverride(overrides, sector.coord, { radiation: { intensity } });
    }
  }

  const nebulaOccupied = new Set<string>();
  const clusterCount =
    nebulaCountMin + rng.nextInt(0, Math.max(0, nebulaCountMax - nebulaCountMin));
  for (let c = 0; c < clusterCount; c += 1) {
    const startCol = rng.nextInt(0, sizeX - 1);
    const startRow = rng.nextInt(0, sizeY - 1);
    const startKey = `${startCol},${startRow}`;
    if (nebulaOccupied.has(startKey)) {
      continue;
    }

    const clusterSize = nebulaSizeMin + rng.nextInt(0, Math.max(0, nebulaSizeMax - nebulaSizeMin));
    const hue = rng.nextInt(240, 320);
    const density = 0.55 + rng.next() * 0.35;
    const color = `hsla(${hue}, 82%, 58%, 1)`;
    const cluster = growNebulaCluster(startCol, startRow, clusterSize, sizeX, sizeY, nebulaOccupied, rng);

    for (const coord of cluster) {
      const { col, row } = gridIndices(coord, sizeX, sizeY);
      nebulaOccupied.add(`${col},${row}`);
      mergeOverride(overrides, coord, { nebula: { color, density } });
    }
  }

  const shimmerCoords = galaxyStructure.sectors.map((s) => s.coord);
  const shimmerWeights = shimmerCoords.map((coord) => {
    const { col, row } = gridIndices(coord, sizeX, sizeY);
    return shimmerSelectionWeight(col, row, sizeX, sizeY);
  });
  const shimmerFraction = shimmerMin + rng.next() * Math.max(0, shimmerMax - shimmerMin);
  const shimmerCount = Math.max(1, Math.floor(shimmerCoords.length * shimmerFraction));
  const shimmerSectors = weightedSampleWithoutReplacement(shimmerCoords, shimmerWeights, shimmerCount, rng);

  for (const coord of shimmerSectors) {
    mergeOverride(overrides, coord, { shimmer: true });
  }

  const output: SpecialSectorSeedsOutput = {
    sectorOverrides: [...overrides.values()]
  };

  const errors = validateSpecialSectorSeedsOutput(output);
  if (errors.length > 0) {
    throw new Error(`Special sector seeds validation failed: ${errors.join('; ')}`);
  }

  return output;
}

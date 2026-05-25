import { galaxyShapeWeight } from '../../src/worldgen/galaxyShapeMask';
import type { GalaxyStructureOutput } from '../../src/worldgen/types/galaxyStructure';
import type { ExplorerConfig } from './stepConfigs';
import type {
  GridCoord,
  MapSectorView,
  MapViewData,
  SectorOverride,
  Step2Output,
  WorldFileSlice
} from './types';
import { coordKey, hslToCss } from './types';

function sectorShapeWeight(config: ExplorerConfig, coord: GridCoord): number {
  const p = config.steps['01_galaxy_structure'];
  const hw = Math.floor(p.sizeX / 2);
  const hh = Math.floor(p.sizeY / 2);
  const col = coord.x + hw;
  const row = hh - 1 - coord.y;
  return galaxyShapeWeight(p.shape, col, row, p.sizeX, p.sizeY, config.global.seed);
}

function mapSectorFromWorld(
  sector: WorldFileSlice['sectors'][number],
  factionColours: Map<string, string>
): MapSectorView {
  const factionColour = sector.factionId ? (factionColours.get(sector.factionId) ?? null) : null;
  return {
    coord: sector.coord,
    inGalaxy: true,
    shapeWeight: 1,
    factionId: sector.factionId,
    factionColour,
    landableCount: sector.landables.length,
    landables: sector.landables.map((l) => ({
      id: l.id,
      type: l.type as 'planet' | 'moon' | 'station',
      sectorCoord: [sector.coord.x, sector.coord.y] as [number, number],
      position: [0, 0],
      name: l.name
    })),
    radiation: sector.inRadiationZone ? Math.max(0.2, sector.radiationFringeIntensity ?? 0.5) : 0,
    hasNebula: sector.ambientVisuals?.hasNebula ?? false,
    hasRuins: false,
    hasShimmer: sector.inShimmerZone ?? false,
    regionType: sector.regionType
  };
}

function buildMapFromStep1(output: GalaxyStructureOutput, config: ExplorerConfig): MapViewData {
  const sectors = new Map<string, MapSectorView>();
  for (const sector of output.sectors) {
    const weight = sectorShapeWeight(config, sector.coord);
    sectors.set(coordKey(sector.coord), {
      coord: sector.coord,
      inGalaxy: true,
      shapeWeight: weight,
      factionId: sector.factionId,
      factionColour: null,
      landableCount: sector.landables.length,
      landables: sector.landables.map((l) => ({
        id: l.id,
        type: l.type as 'planet' | 'moon' | 'station',
        sectorCoord: [sector.coord.x, sector.coord.y] as [number, number],
        position: [l.position.x, l.position.y],
        name: l.name || undefined
      })),
      radiation: sector.inRadiationZone ? sector.radiationFringeIntensity : 0,
      hasNebula: sector.ambientVisuals.hasNebula,
      hasRuins: false,
      hasShimmer: sector.inShimmerZone ?? false,
      regionType: sector.regionType
    });
  }
  return {
    gridWidth: output.galaxy.gridWidth,
    gridHeight: output.galaxy.gridHeight,
    sectors,
    factions: [],
    source: 'step',
    sourceLabel: `Step 1 — ${output.sectors.length} sectors, ${output.galaxy.sectorSize} u/sector`
  };
}

function emptyMap(config: ExplorerConfig): MapViewData {
  const p = config.steps['01_galaxy_structure'];
  const sectors = new Map<string, MapSectorView>();
  const hw = Math.floor(p.sizeX / 2);
  const hh = Math.floor(p.sizeY / 2);
  for (let row = 0; row < p.sizeY; row += 1) {
    for (let col = 0; col < p.sizeX; col += 1) {
      const coord: GridCoord = { x: col - hw, y: hh - 1 - row };
      sectors.set(coordKey(coord), {
        coord,
        inGalaxy: true,
        shapeWeight: sectorShapeWeight(config, coord),
        factionId: null,
        factionColour: null,
        landableCount: 0,
        landables: [],
        radiation: 0,
        hasNebula: false,
        hasRuins: false,
        hasShimmer: false
      });
    }
  }
  return {
    gridWidth: p.sizeX,
    gridHeight: p.sizeY,
    sectors,
    factions: [],
    source: 'empty',
    sourceLabel: 'No data loaded'
  };
}

function applyStep2(base: MapViewData, step2: Step2Output): MapViewData {
  const sectors = new Map(base.sectors);
  for (const override of step2.sectorOverrides) {
    const coord: GridCoord = { x: override.sectorCoord[0], y: override.sectorCoord[1] };
    const key = coordKey(coord);
    const sector = sectors.get(key);
    if (!sector) continue;
    if (override.properties.radiation) {
      sector.radiation = override.properties.radiation.intensity;
    }
    if (override.properties.nebula) {
      sector.hasNebula = true;
      sector.nebulaColor = override.properties.nebula.color;
      sector.nebulaDensity = override.properties.nebula.density;
    }
    if (override.properties.ruins) {
      sector.hasRuins = true;
    }
    if (override.properties.shimmer) {
      sector.hasShimmer = true;
    }
  }
  return { ...base, sourceLabel: `${base.sourceLabel} + Step 2 overrides` };
}

export function buildMapFromWorld(world: WorldFileSlice): MapViewData {
  const factionColours = new Map<string, string>();
  const factions = world.factions.map((f) => {
    const colour = hslToCss(f.primaryColour);
    factionColours.set(f.id, colour);
    return { id: f.id, name: f.name, colour };
  });

  const sectors = new Map<string, MapSectorView>();
  const hw = Math.floor(world.galaxy.gridWidth / 2);
  const hh = Math.floor(world.galaxy.gridHeight / 2);

  for (let row = 0; row < world.galaxy.gridHeight; row += 1) {
    for (let col = 0; col < world.galaxy.gridWidth; col += 1) {
      const coord: GridCoord = { x: col - hw, y: hh - 1 - row };
      sectors.set(coordKey(coord), {
        coord,
        inGalaxy: true,
        shapeWeight: 1,
        factionId: null,
        factionColour: null,
        landableCount: 0,
        landables: [],
        radiation: 0,
        hasNebula: false,
        hasRuins: false,
        hasShimmer: false
      });
    }
  }

  for (const s of world.sectors) {
    sectors.set(coordKey(s.coord), mapSectorFromWorld(s, factionColours));
  }

  return {
    gridWidth: world.galaxy.gridWidth,
    gridHeight: world.galaxy.gridHeight,
    sectors,
    factions,
    source: 'world',
    sourceLabel: `${world.metadata.name} (seed ${world.metadata.seed})`
  };
}

export function buildMapView(
  config: ExplorerConfig,
  stepOutputs: Record<string, unknown>,
  loadedWorld: WorldFileSlice | null
): MapViewData {
  if (loadedWorld) {
    let map = buildMapFromWorld(loadedWorld);
    const step2 = stepOutputs['02_special_sectors'] as Step2Output | undefined;
    if (step2?.sectorOverrides) {
      map = applyStep2(map, step2);
    }
    return map;
  }

  const step1 = stepOutputs['01_galaxy_structure'] as GalaxyStructureOutput | undefined;
  if (step1?.sectors) {
    let map = buildMapFromStep1(step1, config);
    const step2 = stepOutputs['02_special_sectors'] as Step2Output | undefined;
    if (step2?.sectorOverrides) {
      map = applyStep2(map, step2);
    }
    return map;
  }

  return emptyMap(config);
}

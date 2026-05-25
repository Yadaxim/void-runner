import type { GridCoord, SectorMetadata } from '../types/world';
import type { SectorOverride, SpecialSectorSeedsOutput } from './types/specialSectorSeeds';

function overrideKey(coord: GridCoord): string {
  return `${coord.x},${coord.y}`;
}

function parseHueFromNebulaColor(color: string): number {
  const match = /hsl\(\s*([\d.]+)/i.exec(color);
  if (match) {
    return Number.parseFloat(match[1]);
  }
  return 0;
}

/** Merge step-2 overrides into sector metadata (for assembly / preview). */
export function applySpecialSectorSeeds(
  sectors: SectorMetadata[],
  output: SpecialSectorSeedsOutput
): SectorMetadata[] {
  const byCoord = new Map<string, SectorOverride>();
  for (const override of output.sectorOverrides) {
    byCoord.set(`${override.sectorCoord[0]},${override.sectorCoord[1]}`, override);
  }

  return sectors.map((sector) => {
    const override = byCoord.get(overrideKey(sector.coord));
    if (!override) {
      return sector;
    }

    const next: SectorMetadata = { ...sector, ambientVisuals: { ...sector.ambientVisuals } };

    if (override.properties.radiation) {
      const intensity = override.properties.radiation.intensity;
      next.inRadiationZone = intensity > 0;
      next.radiationFringeIntensity = intensity;
      if (intensity > 0 && next.regionType === 'frontier') {
        next.regionType = 'radiation_fringe';
      }
    }

    if (override.properties.nebula) {
      next.ambientVisuals.hasNebula = true;
      next.ambientVisuals.nebulaHue = parseHueFromNebulaColor(override.properties.nebula.color);
      next.ambientVisuals.nebulaIntensity = override.properties.nebula.density;
    }

    if (override.properties.shimmer) {
      next.inShimmerZone = true;
    }

    return next;
  });
}

import { torusSeamWeight } from '../gridCoords';
import { radiationIntensityAtCoord } from '../radiationIntensity';
import { defaultGalaxyStructureInput } from '../types/galaxyStructure';
import { generateGalaxyStructure } from './01_galaxyStructure';
import {
  generateSpecialSectorSeeds,
  validateSpecialSectorSeedsOutput
} from './02_specialSectorSeeds';
import { gridIndices } from '../gridCoords';

describe('generateSpecialSectorSeeds', () => {
  const galaxyStructure = generateGalaxyStructure(
    defaultGalaxyStructureInput({
      sizeX: 40,
      sizeY: 40,
      shape: 'spiral',
      seed: 424242
    })
  );

  it('is deterministic for the same seed', () => {
    const input = { galaxyStructure, seed: 424242 };
    expect(generateSpecialSectorSeeds(input)).toEqual(generateSpecialSectorSeeds(input));
  });

  it('assigns radiation intensity using torus distance from centre', () => {
    const output = generateSpecialSectorSeeds({ galaxyStructure, seed: 424242 });
    expect(radiationIntensityAtCoord({ x: 0, y: 0 }, 40, 40)).toBe(1);

    const withRadiation = output.sectorOverrides.filter((o) => (o.properties.radiation?.intensity ?? 0) > 0);
    expect(withRadiation.length).toBeGreaterThan(0);
    for (const override of withRadiation) {
      const [x, y] = override.sectorCoord;
      const expected = radiationIntensityAtCoord({ x, y }, 40, 40);
      expect(override.properties.radiation?.intensity).toBeCloseTo(expected, 5);
    }

    const far = output.sectorOverrides.find((o) => o.sectorCoord[0] === 19 && o.sectorCoord[1] === 19);
    expect(far?.properties.radiation?.intensity ?? 0).toBe(0);
  });

  it('seeds nebula clusters without duplicate sector entries', () => {
    const output = generateSpecialSectorSeeds({ galaxyStructure, seed: 99 });
    const nebulaOverrides = output.sectorOverrides.filter((o) => o.properties.nebula);
    expect(nebulaOverrides.length).toBeGreaterThanOrEqual(24);
    expect(validateSpecialSectorSeedsOutput(output)).toEqual([]);

    const coords = new Set(output.sectorOverrides.map((o) => o.sectorCoord.join(',')));
    expect(coords.size).toBe(output.sectorOverrides.length);
  });

  it('places shimmer on 2–5% of sectors', () => {
    const output = generateSpecialSectorSeeds({ galaxyStructure, seed: 424242 });
    const shimmerCount = output.sectorOverrides.filter((o) => o.properties.shimmer).length;
    const total = galaxyStructure.sectors.length;
    expect(shimmerCount / total).toBeGreaterThanOrEqual(0.02);
    expect(shimmerCount / total).toBeLessThanOrEqual(0.05);
  });

  it('biases shimmer toward torus seam sectors at the grid edge', () => {
    const output = generateSpecialSectorSeeds({ galaxyStructure, seed: 424242 });
    const shimmerKeys = new Set(
      output.sectorOverrides.filter((o) => o.properties.shimmer).map((o) => o.sectorCoord.join(','))
    );

    let shimmerSeam = 0;
    let otherSeam = 0;
    let shimmerN = 0;
    let otherN = 0;

    for (const sector of galaxyStructure.sectors) {
      const { col, row } = gridIndices(sector.coord, 40, 40);
      const seam = torusSeamWeight(col, row, 40, 40);
      const key = `${sector.coord.x},${sector.coord.y}`;
      if (shimmerKeys.has(key)) {
        shimmerSeam += seam;
        shimmerN += 1;
      } else {
        otherSeam += seam;
        otherN += 1;
      }
    }

    expect(shimmerN).toBeGreaterThan(0);
    expect(shimmerSeam / shimmerN).toBeGreaterThan((otherSeam / otherN) * 1.4);
  });
});

describe('torusSeamWeight', () => {
  it('peaks on grid borders', () => {
    expect(torusSeamWeight(0, 10, 40, 40)).toBeGreaterThan(torusSeamWeight(20, 20, 40, 40));
    expect(torusSeamWeight(39, 10, 40, 40)).toBeCloseTo(torusSeamWeight(0, 10, 40, 40), 5);
  });
});

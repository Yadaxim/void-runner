import type { Species } from '../../types/species';
import { defaultGalaxyStructureInput } from '../types/galaxyStructure';
import { DEFAULT_FACTION_TIER_TARGETS } from '../types/factionSkeleton';
import { generateGalaxyStructure } from './01_galaxyStructure';
import { MOCK_SPECIES_DRAFTS } from '../fixtures/mockSpecies';
import { assignSpeciesIds } from './03_species';
import {
  countGalaxyLandables,
  generateFactionSkeleton,
  validateFactionSkeletonOutput
} from './04_factionSkeleton';

function mockSpecies(count: number): Species[] {
  return assignSpeciesIds(MOCK_SPECIES_DRAFTS.slice(0, count));
}

describe('generateFactionSkeleton', () => {
  const galaxyStructure = generateGalaxyStructure(
    defaultGalaxyStructureInput({ sizeX: 40, sizeY: 40, seed: 424242 })
  );
  const species = mockSpecies(5);

  it('is deterministic for the same seed', () => {
    const input = {
      species,
      galaxyStructure,
      seed: 424242,
      tierTargets: DEFAULT_FACTION_TIER_TARGETS
    };
    expect(generateFactionSkeleton(input)).toEqual(generateFactionSkeleton(input));
  });

  it('counts landables from step 1', () => {
    const landables = countGalaxyLandables(galaxyStructure);
    expect(landables).toBeGreaterThan(0);
    const output = generateFactionSkeleton({
      species,
      galaxyStructure,
      seed: 1,
      tierTargets: DEFAULT_FACTION_TIER_TARGETS
    });
    expect(output.galaxyLandableCount).toBe(landables);
  });

  it('produces majors, minors, and independents with valid composition', () => {
    const output = generateFactionSkeleton({
      species,
      galaxyStructure,
      seed: 99,
      tierTargets: DEFAULT_FACTION_TIER_TARGETS
    });

    const majors = output.factionSkeletons.filter((f) => f.type === 'major_nation');
    const minors = output.factionSkeletons.filter((f) => f.type === 'minor_nation');
    const independents = output.factionSkeletons.filter((f) => f.type === 'independent');

    expect(majors.length).toBeGreaterThanOrEqual(2);
    expect(majors.length).toBeLessThanOrEqual(5);
    expect(minors.length).toBeGreaterThanOrEqual(majors.length);
    expect(independents.length).toBeGreaterThanOrEqual(3);
    expect(independents.length).toBeLessThanOrEqual(7);

    expect(validateFactionSkeletonOutput(output, species)).toEqual([]);
    for (const faction of output.factionSkeletons) {
      const sum = faction.speciesComposition.reduce((n, e) => n + e.percentage, 0);
      expect(sum).toBe(100);
    }

    const humanMajor = majors.find((f) => f.id === 'faction_major_0');
    expect(humanMajor?.speciesComposition).toEqual([{ speciesId: 'species_0', percentage: 100 }]);
  });

  it('rejects duplicate species percentages that do not sum to 100', () => {
    const output = {
      galaxyLandableCount: 10,
      factionSkeletons: [
        {
          id: 'faction_major_0',
          type: 'major_nation' as const,
          speciesComposition: [{ speciesId: 'species_0', percentage: 50 }]
        }
      ]
    };
    expect(validateFactionSkeletonOutput(output, species).some((e) => e.includes('sums to'))).toBe(
      true
    );
  });
});

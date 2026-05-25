import { MOCK_SPECIES_DRAFTS } from './fixtures/mockSpecies';
import { assignSpeciesRolesForCount, speciesRoleTargets } from './speciesPlayability';
import { validateSpeciesDrafts } from './steps/03_species';

describe('speciesRoleTargets', () => {
  it('count 5 is 1h + 1p + 3n (void anchor included in npc)', () => {
    expect(speciesRoleTargets(5)).toEqual({ human: 1, playable: 1, npc: 3 });
  });
});

describe('assignSpeciesRolesForCount', () => {
  it('matches nation role targets for counts 3–8 on mock pool', () => {
    for (const count of [3, 4, 5, 6, 7, 8]) {
      const drafts = MOCK_SPECIES_DRAFTS.slice(0, count).map((d) => ({ ...d }));
      assignSpeciesRolesForCount(drafts);
      const targets = speciesRoleTargets(count);
      expect(drafts.filter((d) => d.speciesRole === 'human')).toHaveLength(targets.human);
      expect(drafts.filter((d) => d.speciesRole === 'playable')).toHaveLength(targets.playable);
      expect(drafts.filter((d) => d.speciesRole === 'npc')).toHaveLength(targets.npc);
      expect(validateSpeciesDrafts(drafts, count)).toEqual([]);
    }
  });
});

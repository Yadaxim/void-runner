import { MOCK_WILDLIFE_DRAFTS } from './fixtures/mockWildlife';
import { assignWildlifeIds, validateWildlifeDrafts } from './wildlife';

describe('wildlife roster', () => {
  it('validates all 11 mock wildlife species', () => {
    expect(validateWildlifeDrafts(MOCK_WILDLIFE_DRAFTS)).toEqual([]);
  });

  it('assigns wildlife_ ids and ship profiles', () => {
    const wildlife = assignWildlifeIds(MOCK_WILDLIFE_DRAFTS);
    expect(wildlife).toHaveLength(11);
    expect(wildlife[0].id).toBe('wildlife_0');
    expect(wildlife.every((w) => w.archetype === 'biotic')).toBe(true);
    expect(wildlife.every((w) => w.speciesRole === 'wildlife')).toBe(true);
  });
});

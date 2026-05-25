import { describe, expect, it } from 'vitest';
import { TECH_ARCHETYPE_VALUES, techArchetypeToStyleFilters } from './techArchetypeStyle';

describe('techArchetypeToStyleFilters', () => {
  it('maps singles and void without mixing void', () => {
    expect(techArchetypeToStyleFilters('organic')).toEqual({
      organic: true,
      inorganic: false,
      energy: false
    });
    expect(techArchetypeToStyleFilters('void')).toEqual({
      organic: false,
      inorganic: false,
      energy: false,
      void: true
    });
  });

  it('maps combination archetypes', () => {
    expect(techArchetypeToStyleFilters('hybrid')).toMatchObject({ organic: true, inorganic: true, energy: false });
    expect(techArchetypeToStyleFilters('robotic')).toMatchObject({
      organic: false,
      inorganic: true,
      energy: true
    });
    expect(techArchetypeToStyleFilters('biolume')).toMatchObject({ organic: true, inorganic: false, energy: true });
    expect(techArchetypeToStyleFilters('compound')).toMatchObject({
      organic: true,
      inorganic: true,
      energy: true
    });
  });

  it('covers every TechArchetype enum value', () => {
    for (const tech of TECH_ARCHETYPE_VALUES) {
      expect(() => techArchetypeToStyleFilters(tech)).not.toThrow();
    }
  });
});

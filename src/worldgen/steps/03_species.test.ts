import { loadBubbleLore } from '../lore/loadBubbleLore';
import { generateSpecies, validateSpeciesDrafts } from './03_species';

describe('generateSpecies', () => {
  it('returns deterministic mock species', async () => {
    const a = await generateSpecies({ count: 5, useMock: true });
    const b = await generateSpecies({ count: 5, useMock: true });
    expect(a).toEqual(b);
    expect(a.species).toHaveLength(5);
    expect(a.species.map((s) => s.id)).toEqual([
      'species_0',
      'species_1',
      'species_2',
      'species_3',
      'species_4'
    ]);
  });

  it('mock roster uses distinct archetypes and tech lines for count 5', async () => {
    const { species } = await generateSpecies({ count: 5, useMock: true });
    expect(new Set(species.map((s) => s.archetype)).size).toBe(4);
    expect(species.some((s) => s.techArchetype === 'void')).toBe(true);
    expect(new Set(species.map((s) => s.techArchetype)).size).toBe(5);
  });

  it('mock count 5 is 1 human, 1 playable, 3 npc including void anchor', async () => {
    const { species, wildlife } = await generateSpecies({ count: 5, useMock: true });
    expect(species[0].speciesRole).toBe('human');
    expect(species.filter((s) => s.speciesRole === 'playable')).toHaveLength(1);
    expect(species.filter((s) => s.speciesRole === 'npc')).toHaveLength(3);
    const voidAnchor = species.find((s) => s.archetype === 'shimmerborn' && s.techArchetype === 'void');
    expect(voidAnchor?.speciesRole).toBe('npc');
    expect(wildlife).toHaveLength(11);
    expect(wildlife.every((w) => w.archetype === 'biotic')).toBe(true);
  });

  it('loads bubble lore from plan file', () => {
    const lore = loadBubbleLore();
    expect(lore).toContain('impenetrable space-time bubble');
  });
});

const mockLong = {
  codex: 'c'.repeat(200),
  worldgenBrief: 'w'.repeat(200)
};

const mockVoidAnchor = {
  name: 'Void Anchor',
  archetype: 'shimmerborn',
  speciesRole: 'npc',
  physiology: 'v'.repeat(20),
  ethos: 'w'.repeat(20),
  ...mockLong,
  techArchetype: 'void'
};

describe('validateSpeciesDrafts', () => {
  it('rejects duplicate archetypes among non-human roles', () => {
    const drafts = [
      mockVoidAnchor,
      {
        name: 'Human',
        archetype: 'biotic',
        speciesRole: 'human',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'hybrid'
      },
      {
        name: 'A',
        archetype: 'amalgam',
        speciesRole: 'playable',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'organic'
      },
      {
        name: 'B',
        archetype: 'amalgam',
        speciesRole: 'playable',
        physiology: 'y'.repeat(20),
        ethos: 'z'.repeat(20),
        ...mockLong,
        techArchetype: 'inorganic'
      },
      {
        name: 'Swarm',
        archetype: 'collective',
        speciesRole: 'npc',
        physiology: 'a'.repeat(20),
        ethos: 'b'.repeat(20),
        ...mockLong,
        techArchetype: 'energy'
      }
    ];

    const errors = validateSpeciesDrafts(drafts, 5);
    expect(errors.some((e) => e.includes('duplicate archetype'))).toBe(true);
  });

  it('allows human plus playable biotic (same archetype, different roles)', () => {
    const drafts = [
      {
        name: 'Human',
        archetype: 'biotic',
        speciesRole: 'human',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'hybrid'
      },
      { ...mockVoidAnchor },
      {
        name: 'Rim',
        archetype: 'biotic',
        speciesRole: 'playable',
        physiology: 'y'.repeat(20),
        ethos: 'z'.repeat(20),
        ...mockLong,
        techArchetype: 'inorganic'
      },
      {
        name: 'Swarm',
        archetype: 'collective',
        speciesRole: 'npc',
        physiology: 'a'.repeat(20),
        ethos: 'b'.repeat(20),
        ...mockLong,
        techArchetype: 'organic'
      }
    ];

    expect(validateSpeciesDrafts(drafts, 4)).toEqual([]);
  });

  it('rejects collective as playable', () => {
    const drafts = [
      {
        name: 'Human',
        archetype: 'biotic',
        speciesRole: 'human',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'hybrid'
      },
      { ...mockVoidAnchor },
      {
        name: 'Swarm',
        archetype: 'collective',
        speciesRole: 'playable',
        physiology: 'y'.repeat(20),
        ethos: 'z'.repeat(20),
        ...mockLong,
        techArchetype: 'inorganic'
      }
    ];
    const errors = validateSpeciesDrafts(drafts, 3);
    expect(errors.some((e) => e.includes('NPC-only'))).toBe(true);
  });

  it('rejects void tech on playable species', () => {
    const drafts = [
      {
        name: 'Human',
        archetype: 'biotic',
        speciesRole: 'human',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'hybrid'
      },
      { ...mockVoidAnchor },
      {
        name: 'Cheater',
        archetype: 'amalgam',
        speciesRole: 'playable',
        physiology: 'y'.repeat(20),
        ethos: 'z'.repeat(20),
        ...mockLong,
        techArchetype: 'void'
      }
    ];
    const errors = validateSpeciesDrafts(drafts, 3);
    expect(errors.some((e) => e.includes('void'))).toBe(true);
  });

  it('requires human species to be named Human', () => {
    const drafts = [
      {
        name: 'Terran',
        archetype: 'biotic',
        speciesRole: 'human',
        physiology: 'x'.repeat(20),
        ethos: 'y'.repeat(20),
        ...mockLong,
        techArchetype: 'hybrid'
      },
      { ...mockVoidAnchor },
      {
        name: 'Swarm',
        archetype: 'collective',
        speciesRole: 'npc',
        physiology: 'a'.repeat(20),
        ethos: 'b'.repeat(20),
        ...mockLong,
        techArchetype: 'organic'
      }
    ];
    expect(validateSpeciesDrafts(drafts, 3).some((e) => e.includes('must be "Human"'))).toBe(true);
  });
});

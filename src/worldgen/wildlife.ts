import type { Species } from '../types/species';
import type { SpeciesDraft } from './types/speciesGeneration';
import {
  SPECIES_BLURB_MAX,
  SPECIES_BLURB_MIN,
  SPECIES_CODEX_MAX,
  SPECIES_CODEX_MIN,
  SPECIES_WORLDGEN_BRIEF_MAX,
  SPECIES_WORLDGEN_BRIEF_MIN
} from './speciesTextLimits';

/** Every galaxy includes this many wildlife species (mock fixture; LLM batch later). */
export const WILDLIFE_ROSTER_SIZE = 11;

/** All wildlife use organic creature-hull art (ship silhouettes deferred to a later step). */
export const WILDLIFE_TECH_ARCHETYPE = 'organic';

export function validateWildlifeDrafts(drafts: SpeciesDraft[]): string[] {
  const errors: string[] = [];

  if (drafts.length !== WILDLIFE_ROSTER_SIZE) {
    errors.push(`Expected ${WILDLIFE_ROSTER_SIZE} wildlife species, got ${drafts.length}`);
  }

  const names = new Set<string>();

  for (let i = 0; i < drafts.length; i += 1) {
    const s = drafts[i];
    const label = `wildlife[${i}]`;

    if (s.speciesRole !== 'wildlife') {
      errors.push(`${label} speciesRole must be wildlife`);
    }
    if (s.archetype !== 'biotic') {
      errors.push(`${label} wildlife must use archetype biotic`);
    }
    if (s.techArchetype !== WILDLIFE_TECH_ARCHETYPE) {
      errors.push(`${label} wildlife must use techArchetype ${WILDLIFE_TECH_ARCHETYPE}`);
    }
    if (s.physiology.length < SPECIES_BLURB_MIN || s.physiology.length > SPECIES_BLURB_MAX) {
      errors.push(`${label} physiology out of range`);
    }
    if (s.ethos.length < SPECIES_BLURB_MIN || s.ethos.length > SPECIES_BLURB_MAX) {
      errors.push(`${label} ethos out of range`);
    }
    if (s.codex.length < SPECIES_CODEX_MIN || s.codex.length > SPECIES_CODEX_MAX) {
      errors.push(`${label} codex out of range`);
    }
    if (s.worldgenBrief.length < SPECIES_WORLDGEN_BRIEF_MIN || s.worldgenBrief.length > SPECIES_WORLDGEN_BRIEF_MAX) {
      errors.push(`${label} worldgenBrief out of range`);
    }

    const nameKey = s.name.toLowerCase();
    if (names.has(nameKey)) {
      errors.push(`${label} duplicate name: ${s.name}`);
    }
    names.add(nameKey);
  }

  return errors;
}

export function assignWildlifeIds(drafts: SpeciesDraft[]): Species[] {
  return drafts.map((draft, index) => {
    const species: Species = {
      id: `wildlife_${index}`,
      name: draft.name,
      archetype: 'biotic',
      physiology: draft.physiology,
      ethos: draft.ethos,
      codex: draft.codex,
      worldgenBrief: draft.worldgenBrief,
      techArchetype: 'organic',
      speciesRole: 'wildlife'
    };
    if (draft.preferredHabitat) {
      species.preferredHabitat = draft.preferredHabitat as Species['preferredHabitat'];
    }
    return species;
  });
}

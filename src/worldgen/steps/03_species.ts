import type {
  HabitatPreference,
  Species,
  SpeciesArchetype,
  SpeciesRole,
  TechArchetype
} from '../../types/species';
import {
  assignSpeciesRolesForCount,
  HUMAN_ARCHETYPES,
  isArchetypeAllowedForRole,
  isTechArchetypeAllowedForRole,
  MIN_SPECIES_COUNT,
  speciesRoleTargets,
  validateVoidAnchorRules
} from '../speciesPlayability';
import { MOCK_SPECIES_DRAFTS } from '../fixtures/mockSpecies';
import { MOCK_WILDLIFE_DRAFTS } from '../fixtures/mockWildlife';
import { assignWildlifeIds, validateWildlifeDrafts } from '../wildlife';
import { anthropicComplete } from '../llm/anthropicClient';
import { parseJsonObject } from '../llm/jsonResponse';
import { buildSpeciesSystemPrompt, buildSpeciesUserPrompt } from '../llm/speciesPrompt';
import {
  SPECIES_BLURB_MAX,
  SPECIES_BLURB_MIN,
  SPECIES_CODEX_MAX,
  SPECIES_CODEX_MIN,
  SPECIES_WORLDGEN_BRIEF_MAX,
  SPECIES_WORLDGEN_BRIEF_MIN
} from '../speciesTextLimits';
import type {
  SpeciesDraft,
  SpeciesGenerationInput,
  SpeciesGenerationOutput
} from '../types/speciesGeneration';

const SPECIES_ARCHETYPES = new Set<SpeciesArchetype>([
  'biotic',
  'construct',
  'collective',
  'fieldborn',
  'shimmerborn',
  'amalgam'
]);

const TECH_ARCHETYPES = new Set<TechArchetype>([
  'organic',
  'inorganic',
  'energy',
  'void',
  'hybrid',
  'robotic',
  'biolume',
  'compound'
]);

const SPECIES_ROLES = new Set<SpeciesRole>(['human', 'playable', 'npc', 'wildlife']);

const HABITAT_PREFERENCES = new Set<HabitatPreference>([
  'core',
  'mid',
  'rim',
  'nebula',
  'radiation',
  'shimmer'
]);

const DEFAULT_MAX_RETRIES = 3;

export type { SpeciesGenerationInput, SpeciesGenerationOutput };

function resolveBubbleLore(input: SpeciesGenerationInput): string {
  const lore = input.bubbleLore?.trim();
  if (!lore) {
    throw new Error(
      'bubbleLore is required for live species generation (explorer: lore.md?raw; Node: loadBubbleLore())'
    );
  }
  return lore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickDraft(row: unknown): SpeciesDraft | null {
  if (!isRecord(row)) {
    return null;
  }
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const archetype = typeof row.archetype === 'string' ? row.archetype.trim() : '';
  const physiology = typeof row.physiology === 'string' ? row.physiology.trim() : '';
  const ethos = typeof row.ethos === 'string' ? row.ethos.trim() : '';
  const techArchetype = typeof row.techArchetype === 'string' ? row.techArchetype.trim() : '';
  const speciesRole = typeof row.speciesRole === 'string' ? row.speciesRole.trim() : '';
  const codex = typeof row.codex === 'string' ? row.codex.trim() : '';
  const worldgenBrief = typeof row.worldgenBrief === 'string' ? row.worldgenBrief.trim() : '';
  if (!name || !archetype || !physiology || !ethos || !codex || !worldgenBrief || !techArchetype || !speciesRole) {
    return null;
  }
  const draft: SpeciesDraft = {
    name,
    archetype,
    physiology,
    ethos,
    codex,
    worldgenBrief,
    techArchetype,
    speciesRole
  };
  if (row.preferredHabitat !== undefined && row.preferredHabitat !== null) {
    if (typeof row.preferredHabitat !== 'string') {
      return null;
    }
    draft.preferredHabitat = row.preferredHabitat.trim();
  }
  if (!draft.name) {
    return null;
  }
  return draft;
}

export function validateSpeciesDrafts(drafts: SpeciesDraft[], count: number): string[] {
  const errors: string[] = [];

  if (drafts.length !== count) {
    errors.push(`Expected ${count} species, got ${drafts.length}`);
  }

  if (count < MIN_SPECIES_COUNT) {
    errors.push(`count must be at least ${MIN_SPECIES_COUNT} (human + void anchor + others)`);
  }

  const names = new Set<string>();
  const archetypes = new Set<string>();
  const techLines = new Set<string>();
  const requireUniqueTech = count <= 8;

  for (let i = 0; i < drafts.length; i += 1) {
    const s = drafts[i];
    const label = `species[${i}]`;

    if (!SPECIES_ARCHETYPES.has(s.archetype as SpeciesArchetype)) {
      errors.push(`${label} invalid archetype: ${s.archetype}`);
    }
    if (!TECH_ARCHETYPES.has(s.techArchetype as TechArchetype)) {
      errors.push(`${label} invalid techArchetype: ${s.techArchetype}`);
    }
    if (!SPECIES_ROLES.has(s.speciesRole as SpeciesRole)) {
      errors.push(`${label} invalid speciesRole: ${s.speciesRole}`);
    } else if (s.speciesRole === 'wildlife') {
      errors.push(`${label} wildlife belongs in the wildlife roster, not the nation count`);
    } else {
      const role = s.speciesRole as SpeciesRole;
      const arch = s.archetype as SpeciesArchetype;
      if (!isArchetypeAllowedForRole(arch, role)) {
        errors.push(
          `${label} archetype "${arch}" is not valid for speciesRole "${role}" (collective, fieldborn, shimmerborn are NPC-only)`
        );
      }
      if (role === 'human') {
        if (!HUMAN_ARCHETYPES.has(arch)) {
          errors.push(`${label} human must use archetype biotic`);
        }
        if (s.name !== 'Human') {
          errors.push(`${label} human species name must be "Human" (got "${s.name}")`);
        }
      }
    }
    if (!isTechArchetypeAllowedForRole(s.techArchetype as TechArchetype, s.speciesRole as SpeciesRole)) {
      errors.push(`${label} techArchetype "${s.techArchetype}" is not allowed for speciesRole "${s.speciesRole}" (void is npc void-anchor only)`);
    }
    if (s.preferredHabitat !== undefined && !HABITAT_PREFERENCES.has(s.preferredHabitat as HabitatPreference)) {
      errors.push(`${label} invalid preferredHabitat: ${s.preferredHabitat}`);
    }
    if (s.physiology.length < SPECIES_BLURB_MIN || s.physiology.length > SPECIES_BLURB_MAX) {
      errors.push(
        `${label} physiology must be ${SPECIES_BLURB_MIN}-${SPECIES_BLURB_MAX} characters (got ${s.physiology.length})`
      );
    }
    if (s.ethos.length < SPECIES_BLURB_MIN || s.ethos.length > SPECIES_BLURB_MAX) {
      errors.push(
        `${label} ethos must be ${SPECIES_BLURB_MIN}-${SPECIES_BLURB_MAX} characters (got ${s.ethos.length})`
      );
    }
    if (s.codex.length < SPECIES_CODEX_MIN || s.codex.length > SPECIES_CODEX_MAX) {
      errors.push(
        `${label} codex must be ${SPECIES_CODEX_MIN}-${SPECIES_CODEX_MAX} characters (got ${s.codex.length})`
      );
    }
    if (s.worldgenBrief.length < SPECIES_WORLDGEN_BRIEF_MIN || s.worldgenBrief.length > SPECIES_WORLDGEN_BRIEF_MAX) {
      errors.push(
        `${label} worldgenBrief must be ${SPECIES_WORLDGEN_BRIEF_MIN}-${SPECIES_WORLDGEN_BRIEF_MAX} characters (got ${s.worldgenBrief.length})`
      );
    }

    const nameKey = s.name.toLowerCase();
    if (names.has(nameKey)) {
      errors.push(`${label} duplicate name: ${s.name}`);
    }
    names.add(nameKey);

    const archKey = s.archetype;
    if (archetypes.has(archKey)) {
      const humanPair =
        s.speciesRole === 'human' ||
        drafts.some(
          (other, j) => j !== i && other.archetype === archKey && other.speciesRole === 'human'
        );
      const allowDuplicate = count > 6 || humanPair;
      if (!allowDuplicate) {
        errors.push(`${label} duplicate archetype: ${s.archetype}`);
      }
    }
    archetypes.add(s.archetype);

    if (requireUniqueTech) {
      if (techLines.has(s.techArchetype)) {
        errors.push(`${label} duplicate techArchetype: ${s.techArchetype}`);
      }
      techLines.add(s.techArchetype);
    }
  }

  const targets = speciesRoleTargets(count);
  const roleCounts = { human: 0, playable: 0, npc: 0 };
  for (const s of drafts) {
    if (s.speciesRole === 'human') roleCounts.human += 1;
    else if (s.speciesRole === 'playable') roleCounts.playable += 1;
    else if (s.speciesRole === 'npc') roleCounts.npc += 1;
  }
  if (roleCounts.human !== targets.human) {
    errors.push(`Expected exactly ${targets.human} human species, got ${roleCounts.human}`);
  }
  if (roleCounts.playable !== targets.playable) {
    errors.push(`Expected ${targets.playable} playable species, got ${roleCounts.playable}`);
  }
  if (roleCounts.npc !== targets.npc) {
    errors.push(`Expected ${targets.npc} npc species, got ${roleCounts.npc}`);
  }

  errors.push(...validateVoidAnchorRules(drafts));

  return errors;
}

export function assignSpeciesIds(drafts: SpeciesDraft[]): Species[] {
  return drafts.map((draft, index) => {
    const species: Species = {
      id: `species_${index}`,
      name: draft.name,
      archetype: draft.archetype as SpeciesArchetype,
      physiology: draft.physiology,
      ethos: draft.ethos,
      codex: draft.codex,
      worldgenBrief: draft.worldgenBrief,
      techArchetype: draft.techArchetype as TechArchetype,
      speciesRole: draft.speciesRole as SpeciesRole
    };
    if (draft.preferredHabitat) {
      species.preferredHabitat = draft.preferredHabitat as HabitatPreference;
    }
    return species;
  });
}

function mockDrafts(count: number): SpeciesDraft[] {
  if (count > MOCK_SPECIES_DRAFTS.length) {
    throw new Error(`Mock species fixture has ${MOCK_SPECIES_DRAFTS.length} entries; requested ${count}`);
  }
  const drafts = MOCK_SPECIES_DRAFTS.slice(0, count).map((d) => ({ ...d }));
  assignSpeciesRolesForCount(drafts);
  return drafts;
}

function parseSpeciesDrafts(raw: unknown, count: number): { drafts: SpeciesDraft[]; errors: string[] } {
  if (!isRecord(raw) || !Array.isArray(raw.species)) {
    return { drafts: [], errors: ['Response must be { "species": [ ... ] }'] };
  }

  const drafts: SpeciesDraft[] = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < raw.species.length; i += 1) {
    const draft = pickDraft(raw.species[i]);
    if (draft) {
      drafts.push(draft);
    } else {
      parseErrors.push(`species[${i}] missing or invalid required fields`);
    }
  }

  const validationErrors = validateSpeciesDrafts(drafts, count);
  return { drafts, errors: [...parseErrors, ...validationErrors] };
}

async function callLlm(
  input: SpeciesGenerationInput,
  bubbleLore: string,
  validationErrors?: string[]
): Promise<string> {
  const useDevProxy = input.useDevProxy === true;
  const apiKey = input.apiKey?.trim();
  if (!useDevProxy && !apiKey) {
    throw new Error('apiKey is required when useMock is false');
  }

  return anthropicComplete({
    apiKey: apiKey || 'dev-proxy',
    useDevProxy,
    system: buildSpeciesSystemPrompt(bubbleLore, input.count),
    user: buildSpeciesUserPrompt(input.count, validationErrors)
  });
}

export async function generateSpecies(input: SpeciesGenerationInput): Promise<SpeciesGenerationOutput> {
  const count = Math.max(1, Math.floor(input.count));
  const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!Number.isFinite(count) || count < MIN_SPECIES_COUNT) {
    throw new Error(`count must be an integer >= ${MIN_SPECIES_COUNT}`);
  }

  if (input.useMock !== false) {
    const drafts = mockDrafts(count);
    const errors = validateSpeciesDrafts(drafts, count);
    if (errors.length > 0) {
      throw new Error(`Mock species validation failed: ${errors.join('; ')}`);
    }
    const wildlifeDrafts = MOCK_WILDLIFE_DRAFTS.map((d) => ({ ...d }));
    const wildlifeErrors = validateWildlifeDrafts(wildlifeDrafts);
    if (wildlifeErrors.length > 0) {
      throw new Error(`Mock wildlife validation failed: ${wildlifeErrors.join('; ')}`);
    }
    return {
      species: assignSpeciesIds(drafts),
      wildlife: assignWildlifeIds(wildlifeDrafts)
    };
  }

  const bubbleLore = resolveBubbleLore(input);
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const text = await callLlm(input, bubbleLore, attempt > 0 ? lastErrors : undefined);
    let parsed: unknown;
    try {
      parsed = parseJsonObject(text);
    } catch (e) {
      lastErrors = [`JSON parse error: ${e instanceof Error ? e.message : 'invalid JSON'}`];
      continue;
    }

    const { drafts, errors } = parseSpeciesDrafts(parsed, count);
    if (errors.length === 0) {
      const wildlifeDrafts = MOCK_WILDLIFE_DRAFTS.map((d) => ({ ...d }));
      const wildlifeErrors = validateWildlifeDrafts(wildlifeDrafts);
      if (wildlifeErrors.length > 0) {
        lastErrors = wildlifeErrors;
        continue;
      }
      return {
        species: assignSpeciesIds(drafts),
        wildlife: assignWildlifeIds(wildlifeDrafts)
      };
    }
    lastErrors = errors;
  }

  throw new Error(`Species generation failed after ${maxRetries} attempts: ${lastErrors.join('; ')}`);
}

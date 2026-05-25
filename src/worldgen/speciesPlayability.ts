import type { SpeciesArchetype, SpeciesRole, TechArchetype } from '../types/species';
import type { SpeciesDraft } from './types/speciesGeneration';

/** Minimum nation roster size: human + void anchor + at least one other species. */
export const MIN_SPECIES_COUNT = 3;

/** Archetypes that cannot be a singular playable character (hive, gestalt, disembodied). */
export const NPC_ONLY_ARCHETYPES = new Set<SpeciesArchetype>([
  'collective',
  'fieldborn',
  'shimmerborn'
]);

/** Human baseline is always biotic — near-human body, individual agency. */
export const HUMAN_ARCHETYPES = new Set<SpeciesArchetype>(['biotic']);

/** The galaxy's mandatory void/shimmer anchor (Void Runner tone). */
export const VOID_ANCHOR_ARCHETYPE: SpeciesArchetype = 'shimmerborn';
export const VOID_ANCHOR_TECH: TechArchetype = 'void';

export function isVoidAnchorDraft(draft: Pick<SpeciesDraft, 'archetype' | 'techArchetype'>): boolean {
  return draft.archetype === VOID_ANCHOR_ARCHETYPE && draft.techArchetype === VOID_ANCHOR_TECH;
}

/** Role counts for the nation roster only (`count` does not include wildlife). */
export function speciesRoleTargets(count: number): {
  human: number;
  playable: number;
  npc: number;
} {
  const human = 1;
  const voidAnchor = 1;
  const remaining = Math.max(0, count - human - voidAnchor);
  const playable = Math.floor(remaining / 2);
  const npc = voidAnchor + Math.max(0, remaining - playable);
  return { human, playable, npc };
}

export function isArchetypeAllowedForRole(
  archetype: SpeciesArchetype,
  role: SpeciesRole
): boolean {
  if (role === 'human') {
    return HUMAN_ARCHETYPES.has(archetype);
  }
  if (role === 'wildlife') {
    return false;
  }
  if (role === 'npc' && NPC_ONLY_ARCHETYPES.has(archetype)) {
    return true;
  }
  if (role === 'playable' && NPC_ONLY_ARCHETYPES.has(archetype)) {
    return false;
  }
  return true;
}

export function isTechArchetypeAllowedForRole(
  techArchetype: TechArchetype,
  role: SpeciesRole
): boolean {
  if (techArchetype === VOID_ANCHOR_TECH) {
    return role === 'npc';
  }
  return true;
}

/** Assign speciesRole on a sliced nation mock roster (human → void anchor → playable → npc). */
export function assignSpeciesRolesForCount(drafts: SpeciesDraft[]): void {
  if (drafts.length === 0) {
    return;
  }
  const targets = speciesRoleTargets(drafts.length);
  drafts[0].speciesRole = 'human';

  const voidAnchor = drafts.find((d) => isVoidAnchorDraft(d));
  if (voidAnchor) {
    voidAnchor.speciesRole = 'npc';
  }

  const tail = drafts.filter((d) => d !== drafts[0] && d !== voidAnchor);
  const npcOnly = tail.filter((d) => NPC_ONLY_ARCHETYPES.has(d.archetype as SpeciesArchetype));
  const playablePool = tail.filter((d) => !NPC_ONLY_ARCHETYPES.has(d.archetype as SpeciesArchetype));

  const extraNpc = Math.max(0, targets.npc - 1);
  const asPlayable = playablePool.slice(0, targets.playable);
  const asNpc = [...npcOnly, ...playablePool.slice(targets.playable)].slice(0, extraNpc);

  for (const d of asPlayable) {
    d.speciesRole = 'playable';
  }
  for (const d of asNpc) {
    d.speciesRole = 'npc';
  }
}

export function validateVoidAnchorRules(drafts: SpeciesDraft[]): string[] {
  const errors: string[] = [];
  const voidAnchors = drafts.filter((d) => isVoidAnchorDraft(d));
  if (voidAnchors.length !== 1) {
    errors.push(
      `Expected exactly one void anchor (archetype ${VOID_ANCHOR_ARCHETYPE} + techArchetype ${VOID_ANCHOR_TECH}), got ${voidAnchors.length}`
    );
  } else if (voidAnchors[0].speciesRole !== 'npc') {
    errors.push('Void anchor species must have speciesRole npc');
  }

  for (let i = 0; i < drafts.length; i += 1) {
    const s = drafts[i];
    const label = `species[${i}]`;
    if (isVoidAnchorDraft(s)) {
      continue;
    }
    if (s.techArchetype === VOID_ANCHOR_TECH) {
      errors.push(`${label} only the void anchor may use techArchetype ${VOID_ANCHOR_TECH}`);
    }
    if (s.archetype === VOID_ANCHOR_ARCHETYPE) {
      errors.push(`${label} only the void anchor may use archetype ${VOID_ANCHOR_ARCHETYPE}`);
    }
  }

  return errors;
}

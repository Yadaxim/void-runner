/** What a species *is* (biology/culture) — distinct from {@link TechArchetype} (ship-art style). */
export type SpeciesArchetype =
  | 'biotic'
  | 'construct'
  | 'collective'
  | 'fieldborn'
  | 'shimmerborn'
  | 'amalgam';

/**
 * Ship-art style line — maps to silhouette `organic` / `inorganic` / `energy` filters.
 * `void` is standalone and never combines; see `techArchetypeToStyleFilters`.
 */
export type TechArchetype =
  | 'organic'
  | 'inorganic'
  /** Conscious field-craft — orbs, halos, attentive nodes; allowed spiritual tone. */
  | 'energy'
  | 'void'
  | 'hybrid'
  | 'robotic'
  | 'biolume'
  | 'compound';

export type HabitatPreference = 'core' | 'mid' | 'rim' | 'nebula' | 'radiation' | 'shimmer';

/**
 * Player-facing role for worldgen step 3.
 * - human: mandatory Human species (exactly one per galaxy; name must be "Human")
 * - playable: other species the player may choose (solo body, individual agency)
 * - npc: factions and background (includes the mandatory void/shimmer anchor)
 * - wildlife: fixed fauna roster — not nations, not playable; see `wildlife` output array
 */
export type SpeciesRole = 'human' | 'playable' | 'npc' | 'wildlife';

export interface Species {
  id: string;
  name: string;
  archetype: SpeciesArchetype;
  /** Short hook (20–200 chars) for contrast checks and compact UI. */
  physiology: string;
  /** Short hook (20–200 chars) for values and tone. */
  ethos: string;
  /** Player codex / species screen (200–800 chars). */
  codex: string;
  /** Rich context for later worldgen LLM steps (200–600 chars). */
  worldgenBrief: string;
  techArchetype: TechArchetype;
  speciesRole: SpeciesRole;
  preferredHabitat?: HabitatPreference;
}

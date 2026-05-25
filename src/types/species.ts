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

export interface Species {
  id: string;
  name: string;
  archetype: SpeciesArchetype;
  physiology: string;
  ethos: string;
  techArchetype: TechArchetype;
  preferredHabitat?: HabitatPreference;
}

import type { TechArchetype } from '../types/species';

/**
 * Silhouette explorer style flags (`tools/ship-silhouette-explorer/silhouette-core.js`).
 * `void` maps to the standalone `ameba` hull family (no wings).
 */
export interface ShipStyleFilters {
  organic: boolean;
  inorganic: boolean;
  energy: boolean;
  void?: boolean;
}

/**
 * Maps species techArchetype → hull/wing style filters.
 * `void` never combines with other families; all other entries are explicit combinations.
 */
export function techArchetypeToStyleFilters(tech: TechArchetype): ShipStyleFilters {
  switch (tech) {
    case 'organic':
      return { organic: true, inorganic: false, energy: false };
    case 'inorganic':
      return { organic: false, inorganic: true, energy: false };
    case 'energy':
      return { organic: false, inorganic: false, energy: true };
    case 'void':
      return { organic: false, inorganic: false, energy: false, void: true };
    case 'hybrid':
      return { organic: true, inorganic: true, energy: false };
    case 'robotic':
      return { organic: false, inorganic: true, energy: true };
    case 'biolume':
      return { organic: true, inorganic: false, energy: true };
    case 'compound':
      return { organic: true, inorganic: true, energy: true };
    default: {
      const _exhaustive: never = tech;
      return _exhaustive;
    }
  }
}

export const TECH_ARCHETYPE_VALUES: readonly TechArchetype[] = [
  'organic',
  'inorganic',
  'energy',
  'void',
  'hybrid',
  'robotic',
  'biolume',
  'compound'
] as const;

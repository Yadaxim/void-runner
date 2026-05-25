import type { Species, SpeciesRole } from '../../types/species';

/** LLM row before code assigns stable ids. */
export interface SpeciesDraft {
  name: string;
  archetype: string;
  physiology: string;
  ethos: string;
  codex: string;
  worldgenBrief: string;
  techArchetype: string;
  speciesRole: string;
  preferredHabitat?: string;
}

export interface SpeciesGenerationInput {
  count: number;
  seed?: number;
  /** When true (default in tests), use fixture roster — no API call. */
  useMock?: boolean;
  /** Anthropic API key; required when useMock is false (unless useDevProxy). */
  apiKey?: string;
  /** Worldgen explorer: call via Vite dev proxy so the key stays server-side. */
  useDevProxy?: boolean;
  maxRetries?: number;
  /** Canonical bubble lore; required when useMock is false. */
  bubbleLore?: string;
}

export interface SpeciesGenerationOutput {
  /** Nation roster: human, playable, npc (includes void anchor). Used by faction skeleton. */
  species: Species[];
  /** Fixed fauna catalog — biotic only, no factions; step 7 spawns creature presence from this list. */
  wildlife: Species[];
}

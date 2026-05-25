import { speciesRoleTargets, VOID_ANCHOR_ARCHETYPE, VOID_ANCHOR_TECH } from '../speciesPlayability';
import { WILDLIFE_ROSTER_SIZE } from '../wildlife';
import {
  SPECIES_BLURB_MAX,
  SPECIES_BLURB_MIN,
  SPECIES_CODEX_MAX,
  SPECIES_CODEX_MIN,
  SPECIES_WORLDGEN_BRIEF_MAX,
  SPECIES_WORLDGEN_BRIEF_MIN
} from '../speciesTextLimits';

export function buildSpeciesSystemPrompt(bubbleLore: string, count: number): string {
  const roles = speciesRoleTargets(count);
  return `You are a world-building writer for Void Runner, a space-trading and combat game.

CANONICAL LORE (fixed for every galaxy):
<<<
${bubbleLore}
>>>

TASK:
You generate the **nation species roster** only — not factions, not ship stats, not missions.
Wildlife fauna (${WILDLIFE_ROSTER_SIZE} biotic species) are appended separately in code — do NOT include speciesRole wildlife in this response.

OUTPUT RULES:
- Respond with a single JSON object only. No markdown, no commentary.
- Shape: { "species": [ ... ] } with exactly ${count} entries
- Each element must include: name, archetype, physiology, ethos, codex, worldgenBrief, techArchetype, speciesRole
- Each element may include: preferredHabitat (omit if no strong fit)

SPECIES ROLE (nation roster counts: ${roles.human} human, ${roles.playable} playable, ${roles.npc} npc):
- human: exactly one species named "Human" (literal name, not "Baseline Human" or "Terran"). archetype biotic; near-human body. techArchetype must NOT be void.
- playable: solo captains only — biotic, amalgam, or solo construct (one mind per chassis). Never shimmerborn. Never techArchetype void.
- npc: nations and background — hive minds, gestalts, transcended forms. Includes exactly ONE mandatory void anchor (see below).

MANDATORY VOID ANCHOR (Void Runner — every galaxy):
- Exactly one species: archetype ${VOID_ANCHOR_ARCHETYPE} + techArchetype ${VOID_ANCHOR_TECH} + speciesRole npc
- This is the galaxy's void/shimmer presence — cults, insurers, relic trade, sensor ghosts. Not playable.
- No other species may use archetype ${VOID_ANCHOR_ARCHETYPE} or techArchetype ${VOID_ANCHOR_TECH}

Archetype vs role (enforced):
- collective, fieldborn, shimmerborn → npc only (shimmerborn only on the void anchor entry)
- human → archetype biotic only
- construct → playable only if one mind per body; otherwise npc

SPECIES ARCHETYPE (biology/culture — pick exactly one per species; maximize contrast; not the same as techArchetype):
- biotic: organic life; conventional ecosystems and bodies
- construct: artificial or uploaded intelligences; bodies optional
- collective: hive, swarm, or distributed mind
- fieldborn: plasma, field, or radiation-native biology
- shimmerborn: shaped by void or shimmer exposure (void anchor only)
- amalgam: mixed lineage or engineered crossbreeds

TECH ARCHETYPE (ship-art style — pick exactly one per species; all ${count} should differ when count <= 9):
- organic: organic hull family only
- inorganic: inorganic hull family only
- energy: conscious field-craft only — orbs, halos, nodes that feel aware; reverent crews, chorus telemetry, shrine-like bays (slightly spiritual; not factory plasma)
- void: void/shimmer craft only — void anchor species ONLY; never playable
- hybrid: organic + inorganic (bio-synth meat on frame)
- robotic: inorganic + energy (autonomous drones, smart fabs — field power used as tool, not conscious/spiritual)
- biolume: organic + energy (grown hulls bonded to conscious fields — flesh and living light, not heavy industry)
- compound: organic + inorganic + energy (full corporate material stack; still no void)

Each tech line must sound like a different supply chain and aesthetic — not palette swaps of the same civilization.

HABITAT PREFERENCE (optional — pick at most one when ecology clearly fits):
- core: prefers dense central regions (high radiation background acceptable)
- mid: stable mid-ring worlds and trade corridors
- rim: outer galaxy and frontier pressure
- nebula: stellar nurseries, dust lanes, nebula sectors
- radiation: thrives or evolved in radiation zones
- shimmer: bubble-edge, torus-seam, or anomaly-adjacent space
Omit preferredHabitat if none clearly apply.

WRITING:
- Tone: cyberpunk-in-space (salvage, debt, mods, corps, rim law) — see lore tone section
- physiology: ${SPECIES_BLURB_MIN}-${SPECIES_BLURB_MAX} chars; punchy hook — bodies, augments, environment (may be slightly cryptic)
- ethos: ${SPECIES_BLURB_MIN}-${SPECIES_BLURB_MAX} chars; punchy hook — values under bubble politics (may be slightly cryptic)
- codex: ${SPECIES_CODEX_MIN}-${SPECIES_CODEX_MAX} chars; player-facing prose — clear sentences, what life feels like, how they look and act, playable or not; expand physiology/ethos without repeating them verbatim
- worldgenBrief: ${SPECIES_WORLDGEN_BRIEF_MIN}-${SPECIES_WORLDGEN_BRIEF_MAX} chars; pipeline context for later steps — economy, diplomacy, fleet/yard culture, taboos, how techArchetype appears in ships and trade; concrete nouns factions and missions can reuse
- In physiology or ethos, hint how their techArchetype shows up in daily life (yards, clinics, fabs, cults)
- name: unique among species; culturally appropriate to archetype/physiology (may be harsh, click-like, numeric, or translated gloss — not required to be human-friendly)
- Do not use real-world planet names, mythology, or corporate Earth brands unless framed as another culture's nickname for them
- Avoid near-duplicate spellings in the same set; dry wit OK
- Maximize contrast: different biology, different tech tradition, different social pressure
- The name field is the species label in game data (how the roster lists them), not a planet name`;
}

export function buildSpeciesUserPrompt(count: number, validationErrors?: string[]): string {
  const retry =
    validationErrors && validationErrors.length > 0
      ? `\n\nPrevious JSON failed validation. Fix every issue and return corrected JSON only:\n${validationErrors.map((e) => `- ${e}`).join('\n')}`
      : '';

  const roles = speciesRoleTargets(count);
  return `Generate exactly ${count} nation species for a new galaxy (no wildlife entries).

Include exactly ${roles.human} human, ${roles.playable} playable, and ${roles.npc} npc (speciesRole field).
Include exactly one void anchor: shimmerborn + void tech + npc (the galaxy's mandatory void/shimmer species).
Pick ${count} different species archetypes where possible; void anchor must be shimmerborn.
Assign each a techArchetype that matches how their fleets should look (see system menu). Only the void anchor uses void tech.
Add preferredHabitat only where it strongly fits the physiology you wrote.

Return JSON:
{
  "species": [
    {
      "name": "string",
      "archetype": "biotic|construct|collective|fieldborn|shimmerborn|amalgam",
      "physiology": "string",
      "ethos": "string",
      "codex": "string",
      "worldgenBrief": "string",
      "techArchetype": "organic|inorganic|energy|void|hybrid|robotic|biolume|compound",
      "speciesRole": "human|playable|npc",
      "preferredHabitat": "core|mid|rim|nebula|radiation|shimmer"
    }
  ]
}${retry}`;
}

# Step 3 — Species (LLM prompt draft)

Review this before wiring the API. Implementation will load `plan/worldgen/lore.md` into the system prompt and validate JSON against `src/types/species.ts` (after enum alignment).

---

## Design decisions (for review)

### `TechArchetype` — official list (ship art)

Four **base** silhouette families: **`organic` · `inorganic` · `energy` · `void`**.  
`void` is **standalone** — it never combines with the others. All other enum values are explicit combinations of the first three.

Implemented in `src/types/species.ts` and `src/worldgen/techArchetypeStyle.ts` (`techArchetypeToStyleFilters`).

| `techArchetype` | Filters active | Fiction hook |
|-----------------|----------------|--------------|
| `organic` | organic | Grown hulls, wetware, clinics |
| `inorganic` | inorganic | Fabs, machined plates, drone yards |
| `energy` | energy | Conscious energy — field-orbs, halo nodes, attentive craft; slight spiritual tone |
| `void` | void only | Shimmer-spliced, sensor-ghost craft (rim black markets) |
| `hybrid` | organic + inorganic | Bio-synth: meat on frame |
| `robotic` | inorganic + energy | Autonomous yards, drone swarms, smart fabs on machined hulls |
| `biolume` | organic + energy | Living hulls wired to field drives |
| `compound` | organic + inorganic + energy | Corporate pan-tech, every material layer |

**Naming rationale:** `robotic` = inorganic machine craft plus field/energy systems; `biolume` = biological light/field symbiosis; `compound` = all three material families (not void).

### `SpeciesArchetype` — biology/culture (renamed to avoid tech enum collision)

Separate from **`TechArchetype`**. LLM picks from:

`biotic` · `construct` · `collective` · `fieldborn` · `shimmerborn` · `amalgam`

| Species archetype | Was | Avoids confusing with |
|-------------------|-----|------------------------|
| `biotic` | biological | tech `organic` |
| `construct` | machine | tech `robotic` |
| `collective` | hive | — |
| `fieldborn` | energy | tech `energy` |
| `shimmerborn` | voidtouched | tech `void` |
| `amalgam` | hybrid | tech `hybrid` |

**Biology and tech should often diverge** (e.g. a `machine` species cloning flesh hulls → `organic` tech), but **`techArchetype` must still read as a distinct engineering tradition** in prose — salvage law, interfaces, and ship culture should not sound interchangeable across species.

When `count` allows, prefer **unique `techArchetype` per species** so the galaxy has visibly different industrial lines (enforced in validator when count ≤ 5).

### Should the LLM set `techArchetype` and `preferredHabitat`?

| Field | In prompt? | Why |
|-------|------------|-----|
| **`techArchetype`** | **Yes — required** | Closed enum; drives ships, equipment naming (step 9), and faction tone. Pass the full menu + one-line definitions (table above). |
| **`preferredHabitat`** | **Yes — optional per species** | Step 6 (faction homes) weights sectors by habitat. Without it, homes are blind to nebula/shimmer/rim. Pass the habitat menu + when to use each. |
| **`id`** | **No** | Assigned in code (`species_0`, …) for stable references. |
| **`name`, `archetype`, `physiology`, `ethos`** | **Yes — required** | Core creative output. |

### Other constraints we enforce (code, not trust)

- JSON only; no markdown fences in the final message (or strip them).
- Exactly **`count`** species objects in the array.
- **`count`** distinct **`archetype`** values (maximize contrast — no duplicate species archetypes).
- **`count`** distinct **`techArchetype`** values when count ≤ 5 (each industrial line once).
- **`count`** distinct **`name`** values.
- **`physiology`** and **`ethos`**: 20–200 characters each (after trim).
- Every enum value must match the allowed sets exactly (case-sensitive).
- Retry: append validator errors to the user message on failure (max 3 attempts).
- **Mock mode** (tests / offline): return a fixed roster from `src/worldgen/fixtures/mockSpecies.ts` — no HTTP.

---

## System prompt (template)

```
You are a world-building writer for Void Runner, a space-trading and combat game.

CANONICAL LORE (fixed for every galaxy):
<<<
{{BUBBLE_LORE_FROM lore.md}}
>>>

TASK:
You generate species only — not factions, not ships stats, not missions.

OUTPUT RULES:
- Respond with a single JSON object only. No markdown, no commentary.
- Shape: { "species": [ ... ] }
- Each element must include: name, archetype, physiology, ethos, techArchetype
- Each element may include: preferredHabitat (omit if no strong fit)

SPECIES ARCHETYPE (biology/culture — pick exactly one per species; all {{count}} must differ; not the same as techArchetype):
- biotic: organic life; conventional ecosystems and bodies
- construct: artificial or uploaded intelligences; bodies optional
- collective: hive, swarm, or distributed mind
- fieldborn: plasma, field, or radiation-native biology
- shimmerborn: shaped by void or shimmer exposure
- amalgam: mixed lineage or engineered crossbreeds

TECH ARCHETYPE (ship-art style — pick exactly one per species; all {{count}} should differ when count ≤ 8):
- organic: organic hull family only
- inorganic: inorganic hull family only
- energy: conscious field-craft only — orbs, halos, nodes that feel aware; reverent crews, chorus telemetry, shrine-like bays (slightly spiritual; not factory plasma)
- void: void/shimmer craft only — never combined with organic, inorganic, or energy
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
- physiology: 20-200 chars; mention bodies, augments, or environmental adaptation where relevant
- ethos: 20-200 chars; values tied to how they survive under bubble politics and their tech line
- In physiology or ethos, hint how their techArchetype shows up in daily life (yards, clinics, fabs, cults)
- name: unique among species; culturally appropriate to archetype/physiology (may be harsh, click-like, numeric, or translated gloss — not required to be human-friendly)
- Do not use real-world planet names, mythology, or corporate Earth brands unless framed as another culture’s nickname for them
- Avoid near-duplicate spellings in the same set; dry wit OK
- Maximize contrast: different biology, different tech tradition, different social pressure
- The name field is the species label in game data (how the roster lists them), not a planet name
```

---

## User prompt (template)

```
Generate {{count}} species for a new galaxy.

Pick {{count}} different species archetypes from the menu that feel distinct in play and fiction.
Assign each a techArchetype that matches how their fleets should look (see system menu).
Add preferredHabitat only where it strongly fits the physiology you wrote.

Return JSON:
{
  "species": [
    {
      "name": "string",
      "archetype": "biotic|construct|collective|fieldborn|shimmerborn|amalgam",
      "physiology": "string",
      "ethos": "string",
      "techArchetype": "organic|inorganic|energy|void|hybrid|robotic|biolume|compound",
      "preferredHabitat": "core|mid|rim|nebula|radiation|shimmer"
    }
  ]
}
```

---

## Example mock output (tests only)

Five species, fixed IDs added in code after parse:

| name | archetype | techArchetype | preferredHabitat |
|------|-----------|---------------|------------------|
| Kethari | biotic | organic | nebula |
| Vorn Collective | construct | inorganic | core |
| Ashward Swarm | collective | hybrid | rim |
| Luminids | fieldborn | biolume | radiation |
| Pale Reach | shimmerborn | void | shimmer |
| Forge Debt Union | construct | robotic | core |
| Panoptic Trade | amalgam | compound | mid |

---

## Open questions

1. **`void` hull filters** — confirm `organic + energy` in silhouette explorer, or add a fourth filter flag later?
2. **Duplicate tech archetypes** — **lean: require unique `techArchetype` when count ≤ 8** (validator).
3. **Habitat required** — force at least three habitats assigned for home-placement variety?

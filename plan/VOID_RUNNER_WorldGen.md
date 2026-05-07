# VOID RUNNER — World Generation Design Document v2.0

Replaces and extends WorldGen v1.0. Defines the full pipeline for procedurally generating a Void Runner galaxy, with explicit schemas, validation, and procedural-vs-LLM split per step.

---

## Design principles

1. **Procedural for structure, LLM for flavor.** Code generates galaxy shape, faction territory, station placement, faction homes. LLM generates names, ideologies, mission text, equipment naming, faction identity.
2. **Strict schemas at every boundary.** Every step's input and output is JSON-schema validated. LLM outputs that fail validation are retried with the validation errors included in the retry prompt.
3. **Progressive save.** Each step's output is saved to disk as soon as it succeeds. A failed late step doesn't lose work from earlier steps. Generation can be resumed from the last completed step.
4. **Linear with one branching point.** Most steps run sequentially. Faction relationship matrix can be computed in parallel with station placement.
5. **Final assembly into one WorldFile.** All steps produce fragments that are assembled into a single `WorldFile` that passes `validateWorldFile`.

---

## Pipeline overview

| Step | Name | Type | Depends on |
|---|---|---|---|
| 1 | Galaxy structure | Procedural | User input |
| 2 | Special sector seeds | Procedural | 1 |
| 3 | Species | LLM | User input (count) |
| 4 | Faction skeleton | Procedural | 3 |
| 5 | Faction identity | LLM | 4 |
| 6 | Faction homes | Procedural | 1, 5 |
| 7 | Territorial growth | Procedural + LLM (anomalies) | 6 |
| 8a | Faction relationship matrix | Procedural + LLM (deviations) | 5 |
| 8b | Station placement | Procedural | 7 |
| 9 | Equipment catalog | LLM | 3 |
| 10 | Mission templates | LLM | 5, 9 |
| 11 | Mission tree templates | LLM | 5, 9, 10 |
| 12 | Faction projects | LLM | 5, 7 |
| 13 | Final assembly + validation | Procedural | All |

Step 8a and 8b can run in parallel.

---

## Step schemas

### 1. Galaxy structure (procedural)

**Input:**
```typescript
{
  sizeX: number              // 30..50 typical
  sizeY: number
  shape: 'disc' | 'ring' | 'spiral' | 'heterogeneous'
  planetDensity: number      // 0..1, fraction of sectors with a planet
  moonProbability: number    // 0..1, chance a planet has any moons
  moonsPerPlanetRange: [number, number]  // e.g. [1, 3]
  seed: number               // RNG seed for reproducibility
}
```

**Output:**
```typescript
{
  sectorCoords: [number, number][]
  landables: {
    id: string
    type: 'planet' | 'moon'
    sectorCoord: [number, number]
    parentId?: string         // moons reference their parent planet
    position: [number, number]  // local coords within sector
  }[]
}
```

**Algorithm:**
- Build a 2D grid of sectorCoords
- Apply shape mask (disc, ring, spiral arms, heterogeneous noise) to determine planet placement probability per sector
- Roll planet placement against `planetDensity`
- For each placed planet, roll moons against `moonProbability` and `moonsPerPlanetRange`
- Place moons within the same sector as their parent, near the parent's position
- Stations are NOT placed here — see step 8b

**Validation:** Every moon has a valid `parentId` resolving to a planet in the same sector.

---

### 2. Special sector seeds (procedural)

**Input:** Galaxy structure from step 1.

**Output:**
```typescript
{
  sectorOverrides: {
    sectorCoord: [number, number]
    properties: {
      radiation?: { intensity: number }
      nebula?: { color: string, density: number }
      ruins?: { detectionRequirement: number, salvageTier: 1 | 2 | 3 }
      shimmer?: boolean
    }
  }[]
}
```

**Algorithm:**
- Radiation zones: distance-from-center scaling (already implemented). Apply intensity.
- Nebulae: random clusters, 2-5 per galaxy, each spanning 3-8 contiguous sectors.
- Ruins: 5-10% of sectors, weighted toward unclaimed/border regions (decided after step 7).
  - **Note:** ruins can be seeded here as candidates, but final placement happens after territorial growth.
- Shimmer: 2-5% of sectors. Bias unclear; uniform random for v1.

For v1, seed shimmer and nebulae here. Defer ruin placement to step 7 (after territory).

**Validation:** No sector has conflicting overrides (e.g., shimmer + nebula simultaneously is allowed; shimmer + heavy radiation is allowed; flag combinations are not exclusive).

---

### 3. Species (LLM, constrained)

**Input:**
```typescript
{
  count: number              // typically 5
  archetypeMenu: SpeciesArchetype[]  // pre-defined menu, see GDD
  bubbleLore: string         // canonical lore passed to LLM for context
}
```

**LLM prompt structure:**
- System: explain the bubble lore and the design constraints
- User: "Generate {count} species. Pick {count} archetypes from this menu that maximize contrast: {menu}. For each, provide [name, archetype, physiology, ethos, techProfile]. Return JSON only."

**Output:**
```typescript
Species[]   // schema as defined in GDD section 3
```

**Validation:**
- All species have unique IDs and names
- All archetype values are from the menu
- All techProfile fields are non-empty strings
- All physiology and ethos strings are 20-200 characters

**Retry logic:** On validation failure, re-prompt with the specific error appended.

---

### 4. Faction skeleton (procedural)

**Input:**
```typescript
{
  species: Species[]
  galaxyLandableCount: number   // from step 1 + 2 output
  tierTargets: {
    majorPerLandables: number   // e.g. 0.025 -> 1 major per 40 landables
    minorPerMajor: [number, number]  // e.g. [1, 2]
    independentCount: [number, number]  // e.g. [3, 7]
  }
}
```

**Output:**
```typescript
{
  factionSkeletons: {
    id: string
    type: 'major_nation' | 'minor_nation' | 'independent'
    speciesComposition: { speciesId: string, percentage: number }[]
    // identity fields filled in step 5
  }[]
}
```

**Algorithm:**
- Compute majorCount = round(galaxyLandableCount x majorPerLandables), clamped to [2, 5]
- Compute minorCount = sum of per-major rolls in `minorPerMajor`
- Compute independentCount = uniform random in `independentCount` range
- Assign species composition per faction:
  - 70% chance: single-species (one species at 100%)
  - 25% chance: two-species (60/40 or 70/30 split)
  - 5% chance: three-species (40/30/30 or similar)
  - Independents bias toward multi-species (merchants, mercenaries)
  - Wildlife factions (added separately in step 7 anomaly pass) use a single species typically

**Validation:**
- All percentages sum to 100 per faction
- All speciesId values exist in input species

---

### 5. Faction identity (LLM)

**Input:**
```typescript
{
  factionSkeletons: FactionSkeleton[]
  species: Species[]
  bubbleLore: string
}
```

**LLM prompt structure:** For each skeleton, ask for `name`, `ideology`, `bubbleStance`, `flagColor`, `techArchetype`. Pass species composition so the LLM can produce coherent identities.

**Output:**
```typescript
Faction[]   // fully populated except home and faction-control data
```

**Validation:**
- All names unique across factions
- `bubbleStance` from enum
- `flagColor` is a valid hex string
- `ideology` 30-300 chars
- `techArchetype` references the dominant species' techProfile in some sensible way (validated by string length and presence, not semantically)

---

### 6. Faction homes (procedural)

**Input:**
```typescript
{
  homedFactions: Faction[]   // majors + minors only
  species: Species[]         // for habitat preferences
  landables: Landable[]      // planets only - moons not eligible as homes
  sectorOverrides: SectorOverride[]
}
```

**Algorithm:**
- For each homed faction, score each candidate planet by:
  - Habitat preference match (species' `preferredHabitat` vs sector's overrides) — strong weight
  - Distance from other already-assigned homes — moderate weight (avoid clustering)
  - Galaxy quadrant balance — light weight (encourage spread)
- Assign each faction the highest-scoring unclaimed planet
- Process majors first, then minors

**Output:**
```typescript
{
  homeAssignments: { factionId: string, landableId: string }[]
}
```

**Validation:** No two factions share a home. All homed factions get a home.

---

### 7. Territorial growth (procedural with LLM anomaly injection)

**Input:**
```typescript
{
  factions: Faction[]
  homeAssignments: HomeAssignment[]
  landables: Landable[]
  sectorOverrides: SectorOverride[]
  growthBiases: {
    [factionId: string]: {
      aggression: number       // 0..1, expansion drive
      density_preference: 'high' | 'low' | 'mixed'
      habitat_match_bonus: number
    }
  }
}
```

**Algorithm (procedural pass):**
- Each faction starts owning only its home landable
- Iterative spread: each tick, each faction can claim adjacent unclaimed landables based on its aggression and biases
- Two factions claiming the same landable in the same tick -> start as `dispute`
- Stop when no faction wants to expand further (or after N iterations)

**LLM anomaly pass:**
- Show the LLM the resulting territorial map and ask for 2-3 narrative anomalies, e.g.:
  - "Faction A has a lone outpost deep in Faction B's territory - what's the story?"
  - "These two majors share a key border landable - what's the relationship?"
  - "Faction C's territory has a strange empty sector - why?"
- LLM proposes: relocate or add specific multi-faction control entries, write short flavor text per anomaly
- Apply approved anomalies to the territorial map

**Output:**
```typescript
{
  landableControl: {
    landableId: string
    factionControl: { factionId: string, share: number }[]
    controlState: 'sole' | 'treaty' | 'cooperation' | 'dispute'
  }[]
  narrativeAnomalies: {
    description: string
    affectedLandables: string[]
  }[]
}
```

**Wildlife seeding:** Also during this step, add 1-3 wildlife factions and seed their territory in unclaimed regions (especially nebulae and border zones). Wildlife factions don't compete with nations; they fill gaps.

**Ruin placement:** Now that territory is settled, place the seeded ruin candidates from step 2. Bias placement toward border regions and unclaimed sectors.

**Validation:**
- Every landable has at least one controller (or is wildlife territory)
- All shares sum to 100 per landable
- `controlState` matches faction count rules

---

### 8a. Faction relationship matrix (procedural + LLM deviations)

**Input:**
```typescript
{
  factions: Faction[]
  species: Species[]
}
```

**Procedural baseline:**
- For each faction pair, compute baseline disposition from:
  - Ideology similarity (text-based heuristic or LLM-precomputed similarity score)
  - Bubble stance compatibility (reunifier-isolationist = hostile, etc.)
  - Species-archetype affinity (machine-biological often tense, biological-symbiotic compatible, etc.)
- Result: baseline matrix in [-100, 100]

**LLM deviation pass:**
- Show the LLM the baseline matrix + faction descriptions
- Ask for 2-3 narrative deviations: "These two should hate each other despite ideology because of historical event X." "These two should ally despite differences because of trade dependency Y."
- LLM produces deviation entries with flavor text
- Apply deviations to the matrix

**Output:**
```typescript
{
  dispositionMatrix: { [factionA: string]: { [factionB: string]: number } }
  historicalEvents: {
    name: string
    description: string
    affectedFactions: string[]
  }[]
}
```

**Validation:** Matrix is square and complete. All faction pairs have entries.

---

### 8b. Station placement (procedural)

**Input:**
```typescript
{
  factions: Faction[]
  landableControl: LandableControl[]
  factionBehaviorProfiles: FactionBehaviorProfile[]
  galaxy: GalaxyStructure
}
```

**Algorithm:**
- For each homed faction, place stations based on behavior profile:
  - **Militaristic:** stations on territorial borders (sectors adjacent to other factions)
  - **Trader:** stations at high-traffic intersections (compute trade route topology between homes)
  - **Reclusive:** stations only near home, 1-2 sectors out
  - **Frontier:** stations on the rim, far from home
- Independents (homeless) get stations placed at trade route intersections regardless of profile
- Each station gets a type: military, trade, refuel, research

**Output:**
```typescript
{
  stations: {
    id: string
    sectorCoord: [number, number]
    position: [number, number]
    factionId: string
    stationType: 'military' | 'trade' | 'refuel' | 'research'
  }[]
}
```

**Validation:** No two stations occupy the same sector position. All stations reference real factions.

---

### 9. Equipment catalog (LLM)

**Input:**
```typescript
{
  species: Species[]
  factions: Faction[]
  itemTemplates: {
    weapon: WeaponTemplate[]
    armor: ArmorTemplate[]
    reactor: ReactorTemplate[]
    shield: ShieldTemplate[]
    fuelTank: FuelTankTemplate[]
    sensorArray: SensorTemplate[]
    hyperspaceDrive: HyperspaceDriveTemplate[]
  }
  hullTemplates: HullTemplate[]
}
```

Templates carry stats; LLM provides naming and flavor only.

**LLM prompt structure:** For each species' tech profile, generate names, descriptions, and faction-affiliations for items derived from templates. Stats come from templates with light parametric variation per tier.

**Output:**
```typescript
{
  hullSpecs: HullSpec[]
  equipmentCatalog: EquipmentItem[]
  bulletSpecs: BulletSpec[]
}
```

Each item may reference a `manufacturerFactionId` and have flavor matching that faction's species.

**Validation:**
- Reference to existing validateWorldFile equipment rules
- Every weapon's `bulletSpecId` exists
- Every hull's `defaultLoadouts` (raw, basic, advanced) reference real items
- Sensible item count: at least one of each slot type per tier

---

### 10. Mission templates (LLM)

**Input:**
```typescript
{
  factions: Faction[]
  equipmentCatalog: EquipmentItem[]
  landables: Landable[]
  landableControl: LandableControl[]
}
```

**LLM prompt structure:** For each faction, generate ~5-10 mission templates. Each template references real landables, real factions (for delivery destinations, escort targets, combat targets), and real items (for cargo).

**Output:**
```typescript
MissionTemplate[]
```

Standard fields: title, description, prerequisites, payout, rep changes, faction restrictions.

**Validation:**
- All faction/landable/item references resolve
- Payouts non-negative
- Rep changes within bounds

---

### 11. Mission tree templates (LLM, with code-defined consequence schemas)

**Input:**
```typescript
{
  factions: Faction[]
  missionTemplates: MissionTemplate[]
  landables: Landable[]
  consequenceSchemas: ProjectEffect[]  // the schema only, not values
}
```

**LLM prompt structure:** Generate 1-3 mission trees per major faction. Each tree has a story arc and concrete final consequences chosen from the consequence schema menu. LLM picks consequences and fills in their parameters.

**Output:**
```typescript
MissionTreeTemplate[]
```

**Validation:**
- All node references and prerequisites resolve
- All `finalConsequences` use valid schema entries with valid parameter values
- No tree references missions that don't exist
- No circular prerequisites

---

### 12. Faction projects (LLM)

**Input:**
```typescript
{
  factions: Faction[]
  landableControl: LandableControl[]
  consequenceSchemas: ProjectEffect[]
}
```

**LLM prompt structure:** Generate 0-2 projects per major faction. Reference real landables and other factions. Pick effect from consequence schema.

**Output:**
```typescript
FactionProject[]
```

**Validation:** Effects use valid schema entries with valid parameter values.

---

### 13. Final assembly + validation (procedural)

**Input:** All step outputs.

**Algorithm:**
- Merge all fragments into a single `WorldFile` object
- Inject default starting conditions (player ship, starting credits, starting sector — pick a moderate-rep landable)
- Run `validateWorldFile` against the assembled file
- If validation fails, log all errors and abort with diagnostic output
- If validation passes, write to disk as the generated world

**Output:** A complete `WorldFile` that passes validation.

---

## Generation UI flow

1. User lands on the World Generator screen
2. Configures parameters (galaxy size, shape, density, species count, seed)
3. Clicks "Generate"
4. UI shows step-by-step progress:
   - Each step's name and status (pending, running, succeeded, failed)
   - Live log of LLM calls (token counts, retry attempts)
   - Per-step output preview (collapsible)
5. On completion, shows summary: faction count, landable count, mission template count, etc.
6. User can preview the world (galaxy map) before saving
7. User saves with a name; WorldFile is written to localStorage and added to the world list

If a step fails, user can:
- Retry the failed step (reuses earlier outputs)
- Edit the input for the failed step manually
- Abandon and start over

---

## LLM call accounting

Approximate LLM calls per generation, for a 50x50 galaxy:
- Step 3: 1 call (5 species)
- Step 5: 1-2 calls (~10 factions)
- Step 7: 1 call (anomalies)
- Step 8a: 1 call (relationship deviations)
- Step 9: 3-5 calls (equipment by species/tier)
- Step 10: 5-10 calls (missions per faction)
- Step 11: 3-5 calls (trees per major)
- Step 12: 1-2 calls (projects)

Total: ~15-25 LLM calls per generation. At Sonnet rates and ~2k tokens per call, this is a few minutes and a few cents per world.

---

## Out of scope for v1 of the gen pipeline

- Wildlife creature design beyond "uses a species archetype"
- Pre-trained AI cards for ship combat (Phase 7)
- Per-station service customization beyond station type
- Procedural faction language / glyphs
- Music or sound design generation
- Player-editable post-generation tweaking (just regenerate for now)

---

## Open questions for v2.0 freeze

- Should the user be able to mix LLM-generated content with hand-edited content in the same world? (Probably yes, post-MVP)
- Should generation cache LLM responses for re-use across worlds with the same seed? (Probably yes — saves API spend during testing)
- How much of the generation should happen client-side vs in a build step? (Lean client-side: lets users with their own API keys generate)
- Should faction projects already be in-progress at world start, or all start at 0%? (Lean: half-progress for some, 0% for others — feels lived-in)
# VOID RUNNER — World Generation Design Document v2.0

Replaces and extends WorldGen v1.0. Defines the full pipeline for procedurally generating a Void Runner galaxy, with explicit schemas, validation, and procedural-vs-LLM split per step.

---

## Design principles

1. **Procedural for structure, LLM for flavor.** Code generates galaxy shape, faction territory, station placement, faction homes. LLM generates names, ideologies, mission text, equipment naming, faction identity.
2. **Strict schemas at every boundary.** Every step's input and output is JSON-schema validated. LLM outputs that fail validation are retried with the validation errors included in the retry prompt.
3. **Progressive save.** Each step's output is saved to disk as soon as it succeeds. A failed late step doesn't lose work from earlier steps. Generation can be resumed from the last completed step.
4. **Linear with one branching point.** Most steps run sequentially. Faction relationship matrix can be computed in parallel with station placement.
5. **Final assembly into one WorldFile.** All steps produce fragments that are assembled into a single `WorldFile` that passes `validateWorldFile`.

---

## Pipeline overview

| Step | Name | Type | Depends on |
|---|---|---|---|
| 1 | Galaxy structure | Procedural | User input |
| 2 | Special sector seeds | Procedural | 1 |
| 3 | Species | LLM | User input (count) |
| 4 | Faction skeleton | Procedural | 3 |
| 5 | Faction identity | LLM | 4 |
| 6 | Faction homes | Procedural | 1, 5 |
| 7 | Territorial growth | Procedural + LLM (anomalies) | 6 |
| 8a | Faction relationship matrix | Procedural + LLM (deviations) | 5 |
| 8b | Station placement | Procedural | 7 |
| 9 | Equipment catalog | LLM | 3 |
| 10 | Mission templates | LLM | 5, 9 |
| 11 | Mission tree templates | LLM | 5, 9, 10 |
| 12 | Faction projects | LLM | 5, 7 |
| 13 | Final assembly + validation | Procedural | All |

Step 8a and 8b can run in parallel.

---

## Step schemas

### 1. Galaxy structure (procedural)

**Input:**
```typescript
{
  sizeX: number              // 30..50 typical
  sizeY: number
  shape: 'disc' | 'ring' | 'spiral' | 'heterogeneous'
  planetDensity: number      // 0..1, fraction of sectors with a planet
  moonProbability: number    // 0..1, chance a planet has any moons
  moonsPerPlanetRange: [number, number]  // e.g. [1, 3]
  seed: number               // RNG seed for reproducibility
}
```

**Output:**
```typescript
{
  sectorCoords: [number, number][]
  landables: {
    id: string
    type: 'planet' | 'moon'
    sectorCoord: [number, number]
    parentId?: string
    position: [number, number]
  }[]
}
```

**Algorithm:**
- Build a 2D grid of sectorCoords
- Apply shape mask (disc, ring, spiral arms, heterogeneous noise) to determine planet placement probability per sector
- Roll planet placement against `planetDensity`
- For each placed planet, roll moons against `moonProbability` and `moonsPerPlanetRange`
- Place moons within the same sector as their parent, near the parent's position
- Stations are NOT placed here — see step 8b

**Validation:** Every moon has a valid `parentId` resolving to a planet in the same sector.

---

### 2. Special sector seeds (procedural)

**Input:** Galaxy structure from step 1.

**Output:**
```typescript
{
  sectorOverrides: {
    sectorCoord: [number, number]
    properties: {
      radiation?: { intensity: number }
      nebula?: { color: string, density: number }
      ruins?: { detectionRequirement: number, salvageTier: 1 | 2 | 3 }
      shimmer?: boolean
    }
  }[]
}
```

---

### 3. Species (LLM, constrained)

**Input:**
```typescript
{
  count: number
  archetypeMenu: SpeciesArchetype[]
  bubbleLore: string
}
```

**Output:** `Species[]` per GDD schema.

---

### 4. Faction skeleton (procedural)

**Input:** `species`, `galaxyLandableCount`, `tierTargets`.

**Output:** `factionSkeletons[]` with type and species composition.

---

### 5. Faction identity (LLM)

**Input:** `factionSkeletons`, `species`, `bubbleLore`.

**Output:** full `Faction[]` except home/control ownership.

---

### 6. Faction homes (procedural)

Assign homes to majors/minors using habitat preference matching, spread balance, and no-overlap constraints.

---

### 7. Territorial growth (procedural with anomaly pass)

Grow faction control from homes, resolve conflicts into `controlState`, inject LLM narrative anomalies, then place ruins and wildlife.

---

### 8a. Relationship matrix

Procedural baseline from ideology + bubble stance + species affinity, then LLM deviations and historical events.

---

### 8b. Station placement

Place stations by behavior profile (militaristic/trader/reclusive/frontier) with faction-aware topology.

---

### 9. Equipment catalog (LLM + templates)

Templates provide stats; LLM provides names/descriptions/manufacturer flavor.

---

### 10. Mission templates (LLM)

Generate faction-bound templates with validated references to real landables/factions/items.

---

### 11. Mission trees (LLM + consequence schema)

Generate tree structures and validated `finalConsequences`.

---

### 12. Faction projects (LLM)

Generate 0-2 projects per major with schema-valid effects.

---

### 13. Final assembly + validation (procedural)

Merge all fragments into one `WorldFile`, apply `validateWorldFile`, and export.

---

## Generation UI flow

1. User opens World Generator
2. Configures parameters (size, shape, density, species count, seed)
3. Runs generation with per-step status
4. Sees logs, retries failed step if needed, previews output
5. Saves world to local storage list

---

## LLM call accounting

Typical 50x50 world: ~15-25 calls total across species/factions/anomalies/equipment/missions/trees/projects.

---

## Out of scope (v1 pipeline)

- Deep wildlife creature-content generation
- Pre-trained AI cards
- Per-station service customization beyond type
- Procedural language/glyph systems
- Audio/music generation
- Post-generation manual editor

---

## Open questions

- Allow mixed generated + hand-edited world content?
- Cache by seed/step/input hash to reduce spend?
- Should generation stay client-side with user API keys?
- Should some faction projects start in-progress?
# VOID RUNNER — World Generation Design Document v1.0

> This document defines the complete world generation pipeline: the sequence of operations, the algorithms, the Claude API prompt strategies, the headless simulation system for pre-trained cards, and the structure of the output World File. The world generator runs once, offline, before any gameplay begins.

---

## 1. Overview

World generation is a **sequential pipeline** driven by a single integer seed. Every random decision flows from that seed through a seeded PRNG, making the entire galaxy reproducible from the same seed + configuration inputs.

The pipeline has two kinds of steps:

- **Algorithmic steps** — pure computation, instant, no API calls
- **Claude API steps** — language model calls for names, descriptions, lore, and flavour

Claude API calls are **never made during gameplay**. All generated text is embedded in the World File at generation time.

### 1.1 Generation Inputs

```typescript
interface WorldGenConfig {
  seed: number;
  name: string;
  gridWidth: number;          // default 30
  gridHeight: number;         // default 30
  factionCount: number;       // default 6–8
  galaxyDensity: 'sparse' | 'standard' | 'dense';
}
```

### 1.2 Generation Output

A single `WorldFile` JSON object (see GDD §2.2). The generator writes this incrementally and can checkpoint progress — if the generator is interrupted, it can resume from the last completed stage.

### 1.3 Generation Stages (in order)

```
Stage 1:  PRNG initialisation
Stage 2:  Galaxy shape map (radiation zone, spiral arms, density field)
Stage 3:  Faction definitions (algorithmic)
Stage 4:  Faction lore (Claude API)
Stage 5:  Sector metadata (faction assignment, region type, density)
Stage 6:  Landable placement (algorithmic)
Stage 7:  Landable identity (Claude API)
Stage 8:  Hull specs (algorithmic)
Stage 9:  Hull lore (Claude API)
Stage 10: Equipment catalog (algorithmic)
Stage 11: Equipment lore (Claude API)
Stage 12: Mission templates (algorithmic)
Stage 13: Mission lore (Claude API)
Stage 14: Pre-trained memory card simulation + training
Stage 15: World File assembly and validation
```

Each stage is logged with progress. Stages 4, 7, 9, 11, 13 involve Claude API calls and dominate generation time.

---

## 2. PRNG System

All randomness flows from a single root seed using a **seeded splitmix64 PRNG**. Every subsystem derives a child PRNG by hashing its domain key with the root seed:

```typescript
function childPRNG(rootSeed: number, domain: string): PRNG {
  return new SplitMix64(hash(rootSeed, domain));
}

// Example usage:
const factionPRNG   = childPRNG(seed, 'factions');
const sectorPRNG    = childPRNG(seed, 'sectors');
const landablePRNG  = childPRNG(seed, 'landables');
const equipmentPRNG = childPRNG(seed, 'equipment');
```

Within each domain, further child PRNGs are derived per entity:

```typescript
const sector_5_3_PRNG = childPRNG(seed, 'sector:5:3');
```

This ensures that adding a new faction does not change the star positions in sector (12, 7). Subsystems are independent. The visual renderer uses the same scheme (see Art Guidelines §9).

---

## 3. Stage 1–2: Galaxy Shape

### 3.1 Radiation Zone

A circular exclusion zone is defined at world-gen time:

```typescript
const galaxyCentre = { x: gridWidth / 2, y: gridHeight / 2 };
const radiationOuterRadius = gridWidth * 0.15;   // fringe begins here
const radiationInnerRadius = gridWidth * 0.07;   // lethal zone begins here
```

Any sector whose centre falls within `radiationOuterRadius` of the galaxy centre is flagged `inRadiationZone: true`. Sectors within `radiationInnerRadius` are flagged `inaccessible: true` — they are not generated and appear as a blank void on the galaxy map.

Radiation damage at runtime:

```
damagePerSecond = MAX_RADIATION_DAMAGE * 
  clamp((radiationOuterRadius - distance) / 
        (radiationOuterRadius - radiationInnerRadius), 0, 1) ^ 2
```

Squared falloff makes the fringe tolerable and the inner zone lethal quickly.

### 3.2 Spiral Arms

The galaxy uses a **logarithmic spiral** density function to determine landable probability per sector. Two or three arms are generated:

```typescript
interface SpiralArm {
  startAngle: number;       // angle at which the arm begins (radians)
  tightness: number;        // how quickly the arm winds (0.3–0.6)
  width: number;            // angular half-width of the arm (radians)
}
```

For each non-radiation sector at `(x, y)`, convert to polar coordinates relative to galaxy centre, then compute **arm influence**:

```typescript
function armInfluence(polar: PolarCoord, arms: SpiralArm[]): number {
  let maxInfluence = 0;
  for (const arm of arms) {
    // Expected angle along this arm at this radius
    const expectedAngle = arm.startAngle + arm.tightness * Math.log(polar.r + 1);
    // Angular distance from arm centre
    const angularDist = Math.abs(angleDiff(polar.theta, expectedAngle));
    // Gaussian falloff across arm width
    const influence = Math.exp(-(angularDist ** 2) / (2 * arm.width ** 2));
    maxInfluence = Math.max(maxInfluence, influence);
  }
  return maxInfluence;
}
```

This produces a value 0–1 per sector. Combined with a radial falloff (fewer landables at the outer rim), this gives:

```typescript
sector.landableDensity = armInfluence(polar, arms) 
  * radialFalloff(polar.r, gridWidth)
  * galaxyDensityMultiplier;
```

`landableDensity` drives how many landables appear in that sector (0 = deep void, 1 = rich system).

### 3.3 Region Types

Each sector is assigned a `RegionType` based on its position:

| Region | Criteria | Character |
|---|---|---|
| `void` | armInfluence < 0.1 | Empty deep space, no landables |
| `frontier` | outer rim, low density | Sparse, lawless, few services |
| `midring` | mid-radius, moderate density | Mixed, transitional |
| `core_arm` | high arm influence, mid radius | Dense, civilised, full services |
| `contested` | border between two faction territories | Mixed factions, conflict missions |
| `radiation_fringe` | near radiation zone | Hazardous, rare exotic equipment |

---

## 4. Stage 3–4: Factions

### 4.1 Algorithmic Faction Definition

`factionCount` factions are generated (default 6–8, plus the special Pirate faction).

For each faction, the PRNG generates:

```typescript
interface FactionDefinition {
  id: string;                        // 'faction_0' ... 'faction_N'
  homeSector: GridCoord;             // randomly placed, not in void or radiation
  territoryRadius: number;           // sectors from home considered faction territory
  primaryColour: HSLColour;          // hue 0–360, sat 60–90%, light 55–70%
  secondaryColour: HSLColour;        // complementary or analogous to primary
  geometryBias: 'angular' | 'rounded';
  densityBias: 'sparse' | 'dense';
  disposition: Record<string, number>; // -1 to 1 toward each other faction
  missionTiers: number[];            // rep thresholds [20, 50, 80] for mission unlock
}
```

Faction territories are assigned to sectors using a **weighted Voronoi** approach: each sector belongs to the nearest faction home sector, with a noise perturbation to create organic borders rather than clean polygons. Contested sectors at borders are flagged.

**Pirates** are special:
- No home sector, no territory
- Appear in frontier and void sectors
- Colour: desaturated, mixed (see Art Guidelines §2.2)
- Rep derived at runtime (see GDD §11.5)

### 4.2 Claude API: Faction Lore

**One batched API call** generates all faction identities simultaneously to ensure they feel distinct and relationally coherent:

**System prompt:**
```
You are a world-building assistant for a 2D space game called Void Runner. 
You will generate faction identities that are distinct, internally consistent, 
and feel like they exist in the same universe. Keep descriptions concise — 
they appear in a game UI. Respond only in the specified JSON format.
```

**User prompt:**
```
Generate identities for {{factionCount}} space factions for a galaxy called "{{worldName}}".

Faction parameters (use these to inform the identity, do not contradict them):
{{factions.map(f => `
- Faction ${f.id}: home region is {{regionType}}, 
  geometry is {{f.geometryBias}}, 
  colour is {{hslToDescription(f.primaryColour)}},
  disposition toward others: {{dispositionSummary(f)}}
`).join('\n')}}

For each faction provide:
- name: short, memorable (1–3 words)
- demonym: what you call a member ("a Veth trader", "a Federation pilot")
- description: 2–3 sentences. Culture, values, what they do in the galaxy.
- shipStyle: 1 sentence describing how their ships look and feel.
- missionFlavour: 1 sentence describing the kinds of jobs they offer.

Respond with a JSON array, one object per faction, in the same order as input.
Do not include any text outside the JSON array.
```

**Response parsing:** Strip any markdown fences, parse JSON, validate required fields, merge into faction definitions.

---

## 5. Stage 5: Sector Metadata

Pure algorithmic pass. For each non-inaccessible sector:

```typescript
interface SectorMetadata {
  coord: GridCoord;
  regionType: RegionType;
  factionId: string | null;         // null in void/frontier
  landableDensity: number;          // 0–1 from spiral arm calc
  npcSpawnRules: NPCSpawnRule[];    // faction, behaviour type, count range
  inRadiationZone: boolean;
  radiationFringeIntensity: number; // 0 = safe, 1 = fringe edge
  ambientVisuals: {
    hasNebula: boolean;
    nebulaHue: number;
    nebulaIntensity: number;
    starDensityMultiplier: number;
  };
  seed: number;                     // child seed for this sector's PRNG
}
```

NPC spawn rules are drawn from the sector's faction definition and region type. Frontier sectors spawn more pirates and fewer faction ships. Core arm sectors spawn faction patrols and traders.

---

## 6. Stage 6–7: Landables

### 6.1 Landable Placement (Algorithmic)

For each sector, the number of landables is determined:

```typescript
const count = Math.round(
  sectorPRNG.random() * MAX_LANDABLES_PER_SECTOR * sector.landableDensity
);
// MAX_LANDABLES_PER_SECTOR = 4
// void sectors: 0, rich arm sectors: 2–4
```

For each landable, type is assigned by weighted probability per region:

| Type | Void | Frontier | Midring | Core arm |
|---|---|---|---|---|
| Planet | 0% | 30% | 40% | 35% |
| Moon | 0% | 40% | 35% | 30% |
| Station | 0% | 20% | 20% | 25% |
| Military Outpost | 0% | 5% | 3% | 5% |
| Shipyard Station | 0% | 5% | 2% | 5% |

Position within sector: random, but with minimum separation between landables (to avoid overlap), and weighted toward sector centre (landables cluster, open edges for travel).

Mass is assigned per type:
- Planet: 800–2000 (strong gravity)
- Moon: 100–400 (mild gravity)
- Station: 0 (no gravity — stations are too small)

Services are assigned based on type and a density roll:

```typescript
function assignServices(type: LandableType, regionType: RegionType, rng: PRNG): Service[] {
  const services: Service[] = ['refuel']; // always present
  if (type === 'planet' && rng.random() < serviceProbability('missionBoard', regionType))
    services.push('missionBoard');
  if (type === 'shipyard_station')
    services.push('shipyard', 'equipmentStore', 'trainingSimulator');
  // ... etc
  return services;
}
```

Training simulator tier is assigned based on landable type and region:
- Basic: frontier stations
- Mid: midring stations, military outposts
- Advanced: core arm military outposts
- Elite: rare roll (5% chance) on any advanced-tier landable

### 6.2 Claude API: Landable Identity

Landables are described in **batched calls grouped by sector**. Each sector's landables are described together so Claude can make them relationally coherent.

**One API call per sector that has landables.** Sectors are processed in parallel (Promise.all with rate limiting).

**System prompt:**
```
You are a world-building assistant for a 2D space game called Void Runner. 
Write concise, evocative descriptions for locations in a procedurally generated 
galaxy. Each location should feel unique but consistent with its neighbours and 
its faction's culture. Descriptions appear in a game UI — keep them tight.
Respond only in the specified JSON format.
```

**User prompt:**
```
Generate identities for the following locations in sector ({{x}}, {{y}}) 
of the galaxy "{{worldName}}".

Sector context:
- Region type: {{regionType}}
- Controlling faction: {{factionName}} — {{factionDescription}}
- Neighbouring sector factions: {{neighbourFactions.join(', ')}}

Locations to name and describe:
{{landables.map(l => `
- Type: {{l.type}}
  Services: {{l.services.join(', ')}}
  Mass: {{massDescription(l.mass)}}  
`).join('\n')}}

For each location provide:
- name: unique, fits the faction culture
- description: 2 sentences max. What is this place? Who lives here or uses it?
- atmosphere: one evocative word or short phrase (e.g. "tense trade hub", "abandoned quiet")

Respond with a JSON array in the same order as the input locations.
Do not include any text outside the JSON array.
```

**Rate limiting:** Claude API calls are made with a concurrency limit (e.g. 5 parallel calls). A progress counter updates the UI.

---

## 7. Stage 8–11: Equipment Catalog

### 7.1 Equipment Tiers

Equipment is generated in **tiers 1–5**. Higher tiers have proportionally better stats and are found in core arm sectors. Each tier has a fixed number of items per equipment type:

| Type | Items per tier | Total items |
|---|---|---|
| Thruster | 2 | 10 |
| Weapon | 3 | 15 |
| Armour | 2 | 10 |
| Fuel Tank | 2 | 10 |
| Hyperspace Drive | 1 | 5 |
| Auto-brake | 1 | 5 |
| Sensor Array | 2 | 10 |
| Neural Brain | 4 | 4 (one per tier, tier 5 = Experimental) |
| Memory Card | 2 | 10 |

Total: ~79 equipment items in the catalog. Enough variety for meaningful choice without overwhelming the player.

### 7.2 Algorithmic Stat Generation

Stats are generated per tier using scaling formulas with small PRNG variance (±15%) to make same-tier items feel slightly different:

**Thruster example:**
```typescript
function generateThruster(tier: number, rng: PRNG): ThrusterStats {
  const base = {
    force:             200 * (tier ** 1.4),
    mass:              20  * (tier ** 0.8),
    energyPerSecond:   10  * (tier ** 1.1),
  };
  return applyVariance(base, 0.15, rng);
}
```

**Weapon example:**
```typescript
function generateWeapon(tier: number, rng: PRNG): WeaponStats {
  const base = {
    fireRate:    0.5 + tier * 0.3,       // shots per second
    energyCost:  5   * tier,
    mass:        10  * tier,
  };
  // Bullet spec is selected from a pool of specs for this tier
  const bulletSpec = selectBulletSpec(tier, rng);
  return { ...applyVariance(base, 0.15, rng), bulletSpecId: bulletSpec.id };
}
```

Bullet specs are pre-defined (not generated) — a fixed set of ~20 projectile types covering all the `BulletSpec` variable combinations. Claude names them but does not define their stats.

### 7.3 Equipment Distribution

Each equipment item is assigned to a **faction affinity** (which faction tends to sell it) and a **minimum tier region** (which region type carries it). This is done algorithmically:
- Tier 1–2: available everywhere
- Tier 3: core arm and midring only
- Tier 4–5: core arm only, rare in midring
- Faction affinity: randomly assigned, biases which equipment stores carry the item

When a landable's equipment store is generated, its inventory is drawn from the catalog filtered by: region tier, faction affinity, and a random selection roll.

### 7.4 Claude API: Equipment Lore

**One batched API call** for all equipment items at once. This is feasible because the full list is ~79 items — well within a single Claude context.

**System prompt:**
```
You are a creative writer for a 2D space game called Void Runner. 
Name and describe spaceship equipment items. Names should be specific and 
memorable — not generic. Descriptions are 1 sentence shown in a store UI.
Respond only in the specified JSON format.
```

**User prompt:**
```
Name and describe the following spaceship equipment items for the galaxy "{{worldName}}".
The galaxy has these factions: {{factionSummaries}}.

Items to name (stats provided for context — do not reproduce stats in descriptions):

{{equipment.map(e => `
- id: {{e.id}}
  type: {{e.type}}
  tier: {{e.tier}} of 5
  faction affinity: {{e.factionAffinity}} ({{factionDescription}})
  key stats: {{statSummary(e)}}
`).join('\n')}}

For each item provide:
- id: (same as input, for matching)
- name: 2–4 words, specific and evocative
- manufacturer: optional short manufacturer name (can be faction-derived)
- description: 1 sentence. What does it do and what makes it distinctive?

Respond with a JSON array. Do not include any text outside the JSON array.
```

---

## 8. Stage 12–13: Mission Templates

### 8.1 Template Generation (Algorithmic)

Mission templates are generated per faction and region type combination. Each faction gets a set of templates at each reputation tier:

```typescript
// Per faction, per tier (3 tiers × ~6 factions = ~18 template groups)
// Each group gets 4–6 templates
// Total: ~90–108 mission templates
// Plus ~20 public (faction-neutral) templates
```

Template stats are generated algorithmically:
- `cargoWeightRange`: scales with region (frontier: light, core: heavy)
- `payoffPerDistanceUnit`: scales with tier and cargo weight
- `reputationReward`: higher tiers give more rep
- `factionRequirements`: tier 1 = low rep threshold, tier 3 = high rep + possible negative requirement toward enemy factions

Multi-faction requirement templates are generated for contested sectors and war-type scenarios — these require positive rep with one faction and negative rep with their disposition enemy.

### 8.2 Claude API: Mission Lore

**One batched API call** for all mission templates.

**System prompt:**
```
You are a writer for a 2D space game called Void Runner. 
Write mission titles and description templates for cargo delivery missions. 
Descriptions use {destination} and {cargo} as placeholder tokens.
Keep titles punchy (3–5 words). Descriptions are 1–2 sentences shown on a mission board.
Respond only in the specified JSON format.
```

**User prompt:**
```
Write titles and descriptions for the following mission templates 
in the galaxy "{{worldName}}".

{{templates.map(t => `
- id: {{t.id}}
  faction: {{t.factionName}} — {{t.factionDescription}}
  reputation tier: {{t.tier}} ({{tierDescription(t.tier)}})
  cargo weight: {{t.cargoWeightRange}} units
  multi-faction requirement: {{multiFactionDescription(t)}}
  mission flavour: {{t.factionMissionFlavour}}
`).join('\n')}}

For each template provide:
- id: (same as input)
- title: 3–5 words, punchy, faction-flavoured
- descriptionTemplate: 1–2 sentences using {destination} and {cargo} as placeholders

Respond with a JSON array. Do not include any text outside the JSON array.
```

---

## 9. Stage 14: Pre-Trained Memory Cards

This stage runs entirely in code — no Claude API calls. It produces trained TensorFlow.js model weights for pre-trained memory cards embedded in the equipment catalog.

### 9.1 Cards to Generate

The equipment catalog includes several memory card items flagged `isPreTrained: true`. Each defines which modes are pre-trained and at what quality tier:

| Card type | Modes | Sim quality | Rarity |
|---|---|---|---|
| Starter Follow Card | Follow only | Basic | Common (starter escort gift) |
| Combat Card Mk I | Combat only | Standard | Uncommon |
| Combat Card Mk II | Combat only | Rich | Rare |
| Evasion Card | Flee only | Standard | Uncommon |
| Full Pilot Card | Follow + Combat + Flee | Rich | Rare |
| Legendary Card (×3) | Follow + Combat + Flee | Elite | Very rare (loot/reward) |

Legendary cards have Claude-generated names and lore (included in the Stage 11 equipment lore call, not a separate call).

### 9.2 Headless Simulation Architecture

For each card and each mode it contains:

```
1. Initialise a headless physics world (no canvas, no rendering)
2. Construct a ScriptedPilot for this mode
3. Run N episodes of M steps each, collecting (inputVector, outputVector) pairs
4. Train a TensorFlow.js model on collected pairs
5. Serialize model weights to JSON
6. Store in the card's equipment definition
```

**Episode counts by quality tier:**
| Quality | Episodes | Steps per episode | Total pairs |
|---|---|---|---|
| Basic | 200 | 100 | 20,000 |
| Standard | 500 | 150 | 75,000 |
| Rich | 1,000 | 200 | 200,000 |
| Elite | 2,000 | 250 | 500,000 |

### 9.3 Scripted Pilots

Each mode has a deterministic rule-based pilot that produces training data:

**Follow pilot:**
```typescript
class FollowPilot {
  computeOutputs(input: InputVector): OutputVector {
    const toTarget = input.trackedObjects.find(o => o.isShipTarget);
    if (!toTarget) return allZero();
    
    const relativeAngle = angleTo(toTarget.dx, toTarget.dy) - input.shipAngle;
    const distance = Math.sqrt(toTarget.dx**2 + toTarget.dy**2);
    const closingSpeed = dot(input.shipVelocity, normalise(toTarget));

    return {
      rotateCW:      relativeAngle > ANGLE_THRESHOLD ? 1 : 0,
      rotateCCW:     relativeAngle < -ANGLE_THRESHOLD ? 1 : 0,
      thrustForward: distance > FOLLOW_DISTANCE && isAligned(relativeAngle) ? 1 : 0,
      autoBrake:     distance < FOLLOW_DISTANCE || closingSpeed > MAX_CLOSING_SPEED ? 1 : 0,
    };
  }
}
```

**Combat pilot:**
```typescript
class CombatPilot {
  computeOutputs(input: InputVector): OutputVector {
    const target = input.trackedObjects.find(o => o.isShipTarget);
    if (!target) return allZero();

    // Lead the target: aim where it will be, not where it is
    const leadPosition = leadTarget(target, BULLET_SPEED);
    const aimAngle = angleTo(leadPosition.dx, leadPosition.dy) - input.shipAngle;
    const distance = magnitude(target);
    const inRange = distance < OPTIMAL_COMBAT_RANGE;

    return {
      rotateCW:      aimAngle > ANGLE_THRESHOLD ? 1 : 0,
      rotateCCW:     aimAngle < -ANGLE_THRESHOLD ? 1 : 0,
      thrustForward: !inRange && isAligned(aimAngle) ? 1 : 0,
      thrustReverse: inRange && isAligned(aimAngle) ? 1 : 0,
      fireWeapon_Z:  isAligned(aimAngle) && inRange ? 1 : 0,
    };
  }
}
```

**Flee pilot:**
```typescript
class FleePilot {
  computeOutputs(input: InputVector): OutputVector {
    const threat = input.trackedObjects.find(o => o.isShipTarget);
    if (!threat) return allZero();

    // Point directly away from threat
    const awayAngle = angleTo(-threat.dx, -threat.dy) - input.shipAngle;

    return {
      rotateCW:      awayAngle > ANGLE_THRESHOLD ? 1 : 0,
      rotateCCW:     awayAngle < -ANGLE_THRESHOLD ? 1 : 0,
      thrustForward: isAligned(awayAngle) ? 1 : 0,
      autoBrake:     0,
    };
  }
}
```

### 9.4 Episode Scenario Generation

For each episode, a random starting scenario is generated to ensure the network learns from varied positions:

**Follow episodes:**
- Random relative position of lead ship (distance 50–400px, any angle)
- Random initial velocities for both ships (0–max speed)
- Some episodes with lead ship moving, some stationary
- Some episodes with lead ship changing direction mid-episode

**Combat episodes:**
- Random initial positions and velocities
- Target ship has scripted evasion behaviour (so the combat pilot learns to pursue)
- Some episodes start already aligned, some require significant rotation
- Higher quality tiers add: obstacles (static bodies), multiple fake targets, gravity wells

**Flee episodes:**
- Threat starts at various distances and approach angles
- Threat moves toward player at various speeds
- Higher quality tiers add: threat that leads the player (harder to flee)

### 9.5 Network Architecture

The TF.js model architecture matches the Neural Brain tier the card is designed for:

```typescript
const model = tf.sequential({
  layers: [
    tf.layers.dense({ units: neuronsPerLayer, activation: 'relu',
                      inputShape: [inputVectorSize] }),
    // ... repeat for layerCount
    tf.layers.dense({ units: OUTPUT_SIZE, activation: 'sigmoid' }),
  ]
});

model.compile({
  optimizer: tf.train.adam(0.001),
  loss: 'binaryCrossentropy',
});
```

Training runs for 50 epochs with early stopping if loss plateaus. Weights are serialized via `model.getWeights()` → array of typed arrays → JSON.

### 9.6 Serialized Weight Storage

```typescript
interface PreTrainedNetwork {
  architecture: { layers: number; neuronsPerLayer: number };
  weights: number[][];      // serialized from tf.Tensor.arraySync()
  trainedMode: BrainMode;
  qualityTier: 'basic' | 'standard' | 'rich' | 'elite';
  episodeCount: number;     // for transparency
}
```

At runtime, weights are loaded back via `tf.tensor()` and applied to a fresh model of the same architecture.

---

## 10. Stage 15: Assembly and Validation

### 10.1 World File Assembly

All generated data is collected into the `WorldFile` schema and serialized to JSON. A validation pass checks:

- All faction IDs referenced in sectors exist in the faction list
- All equipment IDs referenced in landable stores exist in the catalog
- All bullet spec IDs referenced in weapons exist in the bullet spec list
- All mission template destination landable IDs are resolvable
- All pre-trained card weight arrays have the correct shape for their architecture
- No two landables in the same sector share a name

Any validation failure is logged with detail and the generator offers to re-run the failed stage with a different sub-seed.

### 10.2 File Size Estimates

| Component | Estimated size |
|---|---|
| Sector metadata (900 sectors) | ~500 KB |
| Landable text content | ~300 KB |
| Equipment catalog + lore | ~100 KB |
| Mission templates + lore | ~150 KB |
| Faction definitions + lore | ~50 KB |
| Pre-trained card weights | ~2–8 MB |
| **Total** | **~3–9 MB** |

This is comfortably transferable as a shared file. For large galaxies or many legendary cards, compression (gzip) can be applied transparently.

### 10.3 Checkpointing

The generator saves a checkpoint after each completed stage to localStorage. If generation is interrupted (browser closed, API timeout), the next run detects the checkpoint and offers to resume from the last completed stage rather than restarting.

---

## 11. Claude API Call Summary

| Stage | Call type | Estimated tokens (out) | Notes |
|---|---|---|---|
| Faction lore | 1 batch call | ~800 | All factions together |
| Landable identity | 1 call per sector with landables (~200–400 calls) | ~200 per call | Parallel with rate limiting |
| Equipment lore | 1 batch call | ~2,000 | All ~79 items together |
| Mission lore | 1 batch call | ~3,000 | All ~100+ templates together |
| **Total output tokens** | | **~50,000–100,000** | Depends on galaxy size |

At standard API pricing this is well within reasonable range for a one-time world generation. The UI should display a cost estimate before the player starts generation, derived from galaxy size config.

---

## 12. World Generator UI Flow

```
Main Menu
  └── World Generator
        ├── [New World]
        │     ├── Enter name
        │     ├── Enter seed (or randomise)
        │     ├── Choose galaxy size (small / standard / large)
        │     ├── Enter Anthropic API key (stored in localStorage, never in World File)
        │     ├── [Estimated generation time and API cost shown]
        │     └── [Generate] → progress screen
        │           ├── Stage progress bar
        │           ├── Current stage label ("Generating landable descriptions...")
        │           ├── Log of completed stages with timestamps
        │           ├── [Pause / Resume] button
        │           └── On completion → [Play] or [Export World File]
        ├── [Load World]
        │     └── List of worlds in localStorage → [Play] or [Export]
        ├── [Import World File]
        │     └── File picker → validates → adds to localStorage
        └── [Back to Main Menu]
```

---

*World Generation Design Document v1.0 — Complete pipeline specification. Sequential stages, seeded PRNG, batched Claude API calls, headless simulation for pre-trained cards, checkpointing, and validation.*

# VOID RUNNER — World generation pipeline

Full procedural + LLM pipeline for generating a playable **`WorldFile`**: step input/output schemas, JSON-schema validation, progressive save between steps, procedural-vs-LLM split per step, generation UI flow, and final assembly. Supersedes earlier short-form generator notes.

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
  sectorSize: number         // world units per sector; default SECTOR_SIZE (10000)
  shape: 'disc' | 'ring' | 'spiral' | 'heterogeneous'
  planetDensity: number      // 0..1, fraction of in-mask sectors with a planet
  moonProbability: number    // 0..1, chance a planet has any moons
  moonsPerPlanetRange: [number, number]  // e.g. [1, 3]
  seed: number               // RNG seed for reproducibility
}
```

**Output:** WorldFile fragment — one `SectorMetadata` entry per grid cell (full torus), landables embedded per sector.

```typescript
{
  galaxy: { gridWidth: number, gridHeight: number, sectorSize: number }
  sectors: SectorMetadata[]   // length = gridWidth × gridHeight; empty landables[] where no body placed
}
```

Landable stubs use sector-local world-unit positions (origin at sector centre, ±sectorSize/2). Names, factions, and services are filled by later steps.

**Algorithm:**
- Build the full sizeX×sizeY sector grid (`SectorMetadata` per cell)
- Apply shape mask to scale planet placement probability per sector (mask does not remove sectors)
- Roll planet placement against `planetDensity × shapeWeight`
- For each placed planet, roll moons against `moonProbability` and `moonsPerPlanetRange`
- Place moons within the same sector as their parent, near the parent's position
- Stations are NOT placed here — see step 8b

**Validation:** Every sector with moons has at least one planet in the same sector. Landable positions within ±sectorSize/2.

**Removed:** `sectorCoords` flat list (redundant with `sectors[]`). `SectorMetadata.landableDensity` (unused — landables are explicit).

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
- Shimmer: 2–5% of sectors, weighted toward grid-edge torus seams (bubble rim).

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
- User: "Generate {count} species. Pick {count} archetypes from this menu that maximize contrast: {menu}. For each, provide [name, archetype, physiology, ethos, techArchetype]. Return JSON only."

**Output:**
```typescript
Species[]   // schema as defined in GDD section 3
```

**Validation:**
- All species have unique IDs and names
- All archetype values are from the menu
- All `techArchetype` values are from the `TechArchetype` enum (see GDD)
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
    majorPerLandables: number   // e.g. 0.025 → 1 major per 40 landables
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
- Compute majorCount = round(galaxyLandableCount × majorPerLandables), clamped to [2, 5]
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

**LLM prompt structure:** For each skeleton, ask for `name`, `description`, `shipStyle`, `missionFlavour`, `bubbleStance`, `primaryColour`, `secondaryColour`. Pass **`speciesComposition`** and the referenced **`Species`** rows so tone aligns with dominant species **`techArchetype`** (species-level only).

**Output:**
```typescript
Faction[]   // fully populated except home and faction-control data
```

**Validation:**
- All names unique across factions
- `bubbleStance` from enum
- `flagColor` is a valid hex string
- `description`, `shipStyle`, `missionFlavour` are non-empty strings
- Dominant species in `speciesComposition` must exist; tech tone inferred from their `techArchetype` enums (no faction tech field)

---

### 6. Faction homes (procedural)

**Input:**
```typescript
{
  homedFactions: Faction[]   // majors + minors only
  species: Species[]         // for habitat preferences
  landables: Landable[]      // planets only — moons not eligible as homes
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
- Two factions claiming the same landable in the same tick → start as `dispute`
- Stop when no faction wants to expand further (or after N iterations)

**LLM anomaly pass:**
- Show the LLM the resulting territorial map and ask for 2-3 narrative anomalies, e.g.:
  - "Faction A has a lone outpost deep in Faction B's territory — what's the story?"
  - "These two majors share a key border landable — what's the relationship?"
  - "Faction C's territory has a strange empty sector — why?"
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
  - Species-archetype affinity (construct–biotic often tense, fieldborn–shimmerborn odd, etc.)
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

**Weapon/bullet semantics (required reading for step 9):** **`plan/worldgen/WEAPONS_WORLDGEN.md`** — two-layer model (`bulletSpecs` + `type: "weapon"` launchers), per-field runtime meaning, variation axes, T1 numeric bands, validation, and generator recipes.

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

Approximate LLM calls per generation, for a 50×50 galaxy:
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
- Pre-trained AI cards for ship combat (Phase 12)
- Per-station service customization beyond station type
- Procedural faction language / glyphs
- Music or sound design generation
- Player-editable post-generation tweaking (just regenerate for now)

---

## Open questions (generator MVP)

- Should the user be able to mix LLM-generated content with hand-edited content in the same world? (Probably yes, post-MVP)
- Should generation cache LLM responses for re-use across worlds with the same seed? (Probably yes — saves API spend during testing)
- How much of the generation should happen client-side vs in a build step? (Lean client-side: lets users with their own API keys generate)
- Should faction projects already be in-progress at world start, or all start at 0%? (Lean: half-progress for some, 0% for others — feels lived-in)

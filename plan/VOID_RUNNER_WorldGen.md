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

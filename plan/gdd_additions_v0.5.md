# Void Runner GDD Additions — v0.5 notes

These are additions to be merged into GDD v0.5. Organized by concept layer.

---

## 1. Bubble Lore (canonical baseline)

Every Void Runner galaxy shares one piece of canonical fiction: the galaxy is sealed inside a space-time bubble.

**The story.** Long ago, a unified civilization spanned this galaxy. They came into conflict with an extragalactic enemy that became impossible to fight directly. As destruction loomed, the unified civilization's leadership and scientists isolated the galaxy inside a space-time bubble — permanent, impenetrable from outside, unbreakable from inside. The galaxy survived. The unified civilization fell anyway, fragmented over millennia. The bubble remains.

**Why it matters mechanically.**
- Justifies torus topology (sector edges wrap)
- Generates faction ideology axis: `bubbleStance: 'reunifier' | 'isolationist' | 'breaker' | 'indifferent'`
- Justifies ancient ruins scattered through the galaxy (legacy of unified civ)
- Justifies presence of unique/lost technology
- Justifies "shimmer zones" near the conceptual edge of the bubble (mechanically, the wrap line)
- Sets up long-term mystery: did something get inside the bubble? Did the enemy follow?

**Per-world variation.** Worlds differ in *what they reveal* about the bubble — which factions know the full history, which think it's myth, what evidence has surfaced this generation. The lore is fixed; the world's relationship to it varies.

---

## 2. Galaxy Topology — Torus

The galaxy boundary wraps. Crossing the right edge of the easternmost sector lands the player in the westernmost sector. Same for north/south. There is no boundary wall.

**Implications.**
- Distance calculations use shortest torus path (wrap-aware)
- Mini-map and galaxy map render with wrap visualization (subtle indicator at edge)
- Hyperspace route planning considers wrap shortcuts
- "Edge of galaxy" is not a position — it's a conceptual property of the bubble lore, not a place

**Shimmer zones.** A small number of sectors are flagged as `shimmer: true`. These are the conceptual edge of the bubble — sensor anomalies, ambient voidtype damage, ancient salvage opportunities, occasional unexplained NPC behavior. Generation seeds 2-5% of sectors as shimmer.

---

## 3. Species Layer

A new conceptual layer above factions. Galaxies contain a small number of species (target: 5). Factions are composed of one or more species; most are dominated by one but multi-species coalitions exist.

### Data model

```typescript
Species {
  id: string
  name: string                    // LLM-generated, evocative
  archetype: SpeciesArchetype     // constrained menu, see below
  physiology: string              // 1-2 sentence description
  ethos: string                   // 1 sentence value system
  techProfile: {
    weaponStyle: string           // e.g. "kinetic-heavy", "missile-swarm", "energy-focused"
    hullAesthetic: string         // e.g. "organic curves", "geometric crystal"
    namingConvention: string      // e.g. "Latin scientific terms"
  }
  preferredHabitat?: HabitatPreference  // affects home placement during gen
}

SpeciesArchetype =
  | 'biological'
  | 'machine'
  | 'hive'
  | 'energy'
  | 'hybrid'
  | 'ascended'
  | 'parasitic'
  | 'symbiotic'
  | 'voidtouched'

HabitatPreference =
  | 'core' | 'mid' | 'rim'
  | 'nebula' | 'radiation' | 'shimmer'
```

### World root

```typescript
WorldFile.species: Species[]
```

### Faction-species link

Each faction declares a species composition that sums to 100. See section 4.

---

## 4. Faction Extensions

Faction model is extended to support multi-species composition, optional home, ideology, and the bubble stance axis.

### Data model additions

```typescript
Faction {
  id: string
  name: string
  type: 'major_nation' | 'minor_nation' | 'independent'
  speciesComposition: { speciesId: string, percentage: number }[]  // sums to 100
  homeLandableId: string | null    // null for independents
  ideology: string                  // 1-2 sentence flavor
  bubbleStance: 'reunifier' | 'isolationist' | 'breaker' | 'indifferent'
  flagColor: string                 // hex
  techArchetype: string             // derived from species composition + flavor
  // existing fields: behaviour profile, default disposition, etc.
}
```

### Validation

- `speciesComposition` percentages sum to exactly 100
- All `speciesId` values exist in `world.species`
- `type === 'independent'` ↔ `homeLandableId === null` (mutually consistent)
- All major and minor nations must have a home

### Faction tier ratios

Generation targets are expressed as ratios scoped to galaxy size, not absolute counts. Suggested defaults:

- 1 major nation per ~30-50 landables
- 1-2 minor nations per major
- 3-7 independents per galaxy regardless of size

For a 30×30 galaxy with ~80 landables: ~2 majors, 2-4 minors, ~5 independents.
For a 50×50 galaxy with ~150 landables: ~3 majors, 4-6 minors, ~5-7 independents.

---

## 5. Multi-Faction Landable Control

Landables can be controlled by more than one faction simultaneously. Replaces single `factionId`.

### Data model

```typescript
Landable {
  // ... existing fields
  factionControl: { factionId: string, share: number }[]  // shares sum to 100
  controlState: 'sole' | 'treaty' | 'cooperation' | 'dispute'
}
```

### Control state semantics

| State | Faction count | NPC behavior on landable approach | Mission availability | Pricing |
|---|---|---|---|---|
| `sole` | 1 | Standard | Faction's full mission set | Standard |
| `treaty` | 2+ | All controlling factions present, ignore each other | Each faction offers reduced mission set | Standard |
| `cooperation` | 2+ | All present, friendly to each other, may escort jointly | Special joint missions available | Slight discount |
| `dispute` | 2+ | Open combat between controlling factions | Mission set per faction includes "drive out" missions targeting the other | Doubled (war economy) |

### NPC spawning at multi-faction landables

Spawn rules continue to be per-sector (not per-landable). For sectors containing a multi-faction landable, spawn rules can include multiple factions. NPC dispositions toward each other override the global disposition matrix locally based on `controlState`:

- `treaty`: same-target-faction NPCs treat each other as neutral regardless of faction matrix
- `cooperation`: same-target-faction NPCs treat each other as allied
- `dispute`: same-target-faction NPCs treat each other as hostile

### Validation

- All `factionId` values exist in `world.factions`
- `share` values sum to exactly 100
- `controlState === 'sole'` ↔ exactly 1 faction in `factionControl`
- All other states require ≥ 2 factions

---

## 6. Wildlife Factions

Wildlife (biological or robotic creatures) is implemented as a special faction type, not a parallel system.

### Data model

```typescript
Faction {
  type: 'major_nation' | 'minor_nation' | 'independent' | 'wildlife'
  // ... existing fields
}
```

Wildlife factions:
- Always have `homeLandableId: null`
- Always have `bubbleStance: 'indifferent'`
- Have hostile/neutral/friendly default disposition (one-time gen choice)
- Their "ships" are creature designs (organic-aesthetic hulls or robotic depending on archetype)
- Have no mission board, but rep with them changes via player actions and via mission consequences from other factions
- Have spawn rules like any faction (typically wandering or zone-defensive)

### Mission interaction

Mission trees from nation factions can affect wildlife reputation. Examples:
- "Drive out the [creature] infestation in Sector X" → completion tanks wildlife rep, creatures become hostile
- "Restore the [creature] sanctuary" → completion raises wildlife rep, creatures become neutral or friendly in the affected zone
- "Cull [creature] for research" → small per-mission rep hits

Wildlife rep gates and floors mirror nation faction rep, with per-creature-faction tuning.

---

## 7. Ancient Ruins

Some sectors contain ruins from the unified civilization. Mechanically, they are landables that don't appear on standard scanners.

### Data model

```typescript
Landable {
  type: 'planet' | 'moon' | 'station' | 'ruin'
  hidden: boolean             // ruins start hidden
  detectionRequirement?: number  // sensor array threshold to reveal
  // ... existing fields
}
```

### Detection rules

- Sensor array equipment has a `detectionRange` and `detectionStrength` value
- When player ship enters a sector containing a hidden landable, if `sensor.detectionStrength >= landable.detectionRequirement`, the landable is revealed (added to player's known landables, appears on minimap)
- Once revealed, stays revealed (per save)

### Ruin landables offer

- Salvage equipment (rare, possibly unique, possibly with `voidtype` damage profile)
- Lore fragments (text artifacts that build the bubble narrative)
- Occasional triggers for mission trees ("translate this glyph for...")
- No standard services (no fuel, no missions board, no shipyard)

Generation seeds 5-10% of sectors with ruins.

---

## 8. In-Game Time

WorldState gains a clock.

### Data model

```typescript
WorldState {
  // ... existing fields
  gameTime: {
    epoch: number      // ms since galaxy start, monotonic
    rate: number       // game seconds per real second, default 60 (1 real min = 1 game hour)
  }
}
```

### Display format

In-game time is shown as a stardate-style format, e.g., `Cycle 247.13.4`. The format is decorative; the underlying value is the millisecond epoch.

### What time gates

- **Faction projects** — tick forward at the configured rate
- **Mission expiry** — missions can have `expiresAt: gameTime` (deferred to later phase, but the clock supports it)
- **Mission board refresh** — landable mission boards regenerate available missions every N game hours
- **Faction relationship drift** — disposition matrix slowly drifts toward attractor states defined by ideology compatibility (slow, optional)

### Time during landable visits

Time advances during landing screens (not paused). Long browsing sessions can advance the clock noticeably.

### Time during pause

Time stops when the game is paused (escape menu open, save/load).

---

## 9. Faction Projects

Each faction has 0-2 visible long-term goals. These provide narrative texture, generate mission threads, and tick forward in game time independent of player action.

### Data model

```typescript
FactionProject {
  id: string
  factionId: string
  name: string
  description: string
  progress: number          // 0..100
  rate: number              // progress per game hour
  effectOnComplete: ProjectEffect
  playerInfluence: 'helpful' | 'hostile' | 'both' | 'none'
}

ProjectEffect =
  | { type: 'control_shift', sectorCoord, fromFactionId, toFactionId, share }
  | { type: 'unlock_equipment', equipmentItemId, atLandableId }
  | { type: 'spawn_landable', landable: LandableSpec }
  | { type: 'change_disposition', factionA, factionB, newDisposition }
  | { type: 'world_flag_set', flagId, value }
```

### Player interaction

If `playerInfluence === 'helpful'`, completing related missions accelerates the project. If `'hostile'`, missions can sabotage progress. If `'both'`, both options exist (helpful from the project's faction, hostile from rivals).

### Visibility

Visible to player from any controlling-faction landable's standing tab. Shows current progress and time-to-completion estimate.

---

## 10. Mission Trees

Missions can be linked into trees. A tree has a story arc and a final consequence that writes to world state.

### Data model

```typescript
MissionTreeTemplate {
  id: string
  name: string
  factionId: string                // which faction offers it
  rootMissionTemplateId: string
  nodes: MissionTreeNode[]
  finalConsequences: ProjectEffect[]  // applied on tree completion
}

MissionTreeNode {
  missionTemplateId: string
  prerequisites: NodeOutcome[]      // must hold true for this node to be offered
  outcomes: {
    onComplete: NodeOutcome[]       // what becomes true if completed
    onFail: NodeOutcome[]
  }
}

NodeOutcome =
  | { type: 'tree_node_completed', treeId, nodeId }
  | { type: 'tree_node_failed', treeId, nodeId }
  | { type: 'reputation_at_least', factionId, value }
  | { type: 'world_flag', flagId, value }
```

### State

```typescript
WorldState.missionTrees: {
  [treeId: string]: {
    started: boolean
    nodeStates: { [nodeId]: 'unavailable' | 'available' | 'active' | 'completed' | 'failed' }
  }
}
```

### Branching

Trees are not strictly linear. A node can have multiple children, each gated by different prerequisites. Players who fail a step can recover via alternate branches.

### Rewards

Per-mission rewards are normal (credits, rep, items). Tree completion rewards are bigger and applied as `finalConsequences` — typically world-state shifts (faction control changes, equipment unlocks, faction relationship updates).

---

## 11. Turrets

Weapons gain a `targetingMode`.

### Data model

```typescript
WeaponItem {
  // ... existing fields
  targetingMode: 'forward' | 'turret'
}
```

### Behavior

- `forward`: fires in the direction the ship is currently facing (current behavior)
- `turret`: fires toward the current target if one is selected; if no target, fires forward

### Slot type

Turrets and forward weapons share the existing `weapon` slot type. The mode is an item property, not a slot property. (Alternative considered: dedicated `turret` slot type that only some hulls have. Decision: keep slots flexible, let hull design vary by total weapon count and slot positioning instead.)

### Implications for combat

Slow heavy ships become more viable when they can fit turrets. Fast agile ships still benefit from forward weapons (higher damage and accuracy when keeping target in their nose). Build variety expands.

---

## 12. Smart Missiles

Bullets gain a targeting flag.

### Data model

```typescript
BulletSpec {
  // ... existing fields
  seekingMode: 'none' | 'simple' | 'lead'
  turnRate: number  // existing, applies to simple and lead
}
```

### Behavior

- `none`: straight-line trajectory (current behavior for slugs, bolts)
- `simple`: turns toward target's current position at `turnRate` (current behavior for missiles)
- `lead`: computes intercept point based on target position and velocity, turns toward intercept; recomputes each frame

### Implications

- Lead missiles hit fast-moving targets more reliably
- They are countered by erratic, unpredictable maneuvering (since they predict on linear extrapolation)
- Generation gives advanced/expensive missiles `lead` mode; basic missiles use `simple`

---

## 13. Sensor Arrays (revised)

Sensor arrays already exist as a slot type. Their role expands.

### Data model additions

```typescript
SensorArrayItem {
  // ... existing fields
  detectionStrength: number   // for revealing hidden landables
  targetLockSpeed: number     // optional: how fast lock acquires (existing)
  detectionRange: number      // sectors, for long-range detection (future)
}
```

Generation produces sensor variants at multiple strength levels. Cheap arrays detect nothing. Premium arrays reveal most ruins.

---

## 14. Game-time tick rate (mechanical rule)

Default: 60 game seconds per real second (1 real minute = 1 game hour). Rationale: a typical session of 1-2 real hours covers 1-2 game days, enough for project progress to feel meaningful but not so fast that players miss events.

Tunable per world for testing. Saved with WorldState.

---

## 15. Treaty / cooperation / dispute combat rules (mechanical detail)

When two factions share a landable in `dispute` state and both have NPCs in the sector:
- NPCs of opposing factions enter `hostile` state on spawn (ignoring global disposition)
- If the player has positive rep with one and is attacking the other, the friendly faction's NPCs do NOT alert allies (no friendly-fire-by-proxy aggro)
- Player rep changes apply only to the faction directly attacked

In `cooperation` state:
- NPCs of both factions treat each other as allied (escort behavior, ally alerts shared)
- Special joint missions reference both factions and grant rep to both on completion

In `treaty` state:
- NPCs of both factions ignore each other (no engagement, no escort)
- Mission boards from each faction are independent

---

## Open questions for v0.5 freeze

- Should ruins ever offer services beyond salvage? (Lean: no, keeps them mysterious)
- Should faction projects be visible to player from anywhere, or only from controlled landables? (Lean: only from controlled landables — encourages exploration)
- Should wildlife factions ever have cooperation or treaty states with nation factions? (Lean: yes, "protected sanctuary" arrangements are interesting)
- Time rate: 60x default — let player tune in settings? (Lean: yes, defer to settings phase)

# VOID RUNNER — Game design document (living)

> High-level design and player-facing rules. Runtime architecture: `plan/CONTEXT.md`. Delivery checklist: `plan/BACKLOG.md`. World generator: `plan/worldgen/WORLDGEN.md`.

This file is intentionally partial: expand sections as features ship. Sections below are authoritative when present.

---

## Persistence and saves (planned)

**Problem:** `localStorage` is per browser profile and origin; players lose progress when switching devices, clearing site data, or using strict privacy modes.

**Direction:** Treat the same logical snapshot the game already persists (`PersistedWorldState`) as the canonical save blob. Store it in two tiers:

1. `localStorage` — frequent writes for same-session resilience.
2. JSON on disk (portable) — same payload + small header (`formatVersion`, `seed`, optional world name, `savedAt`).

**Browser constraints:** Silent arbitrary disk writes are not available in standard web apps. Use explicit flows (`Export save`, `Import save`) and optionally File System Access API where supported.

**Disk vs localStorage frequency:**
- `localStorage`: unchanged philosophy, save often.
- file writes: coarser milestones (sector changes, landable enter/exit, credit/loadout mutations, hyperspace target changes, main menu exit, `beforeunload`/`visibilitychange` best effort, optional debounced flush if file handle exists).

**Load order (conceptual):** Prefer selected imported file if seed matches loaded world, else local save for that seed. Reconcile by `savedAt` if both exist.

**Non-goals for v1:** Cloud saves, multiplayer sync, encryption.

---

## 1. Bubble lore (canonical baseline)

Every Void Runner galaxy shares one piece of canonical fiction: the galaxy is sealed inside a space-time bubble.

**The story.** Long ago, a unified civilization spanned this galaxy. They came into conflict with an extragalactic enemy that became impossible to fight directly. As destruction loomed, the unified civilization's leadership and scientists isolated the galaxy inside a space-time bubble — permanent, impenetrable from outside, unbreakable from inside. The galaxy survived. The unified civilization fell anyway, fragmented over millennia. The bubble remains.

**Why it matters mechanically:**
- Justifies torus topology (sector edges wrap)
- Generates faction ideology axis: `bubbleStance: 'reunifier' | 'isolationist' | 'breaker' | 'indifferent'`
- Justifies ancient ruins scattered through the galaxy (legacy of unified civ)
- Justifies presence of unique/lost technology
- Justifies "shimmer zones" near the conceptual edge of the bubble (mechanically, the wrap line)
- Sets up long-term mystery: did something get inside the bubble? Did the enemy follow?

**Mechanical anchors (summary):** torus topology; `bubbleStance`; ruins and lost tech; shimmer zones near the conceptual bubble edge.

**Per-world variation.** Worlds differ in *what they reveal* about the bubble — which factions know the full history, which think it's myth, what evidence has surfaced this generation. The lore is fixed; the world's relationship to it varies.

---

## 2. Galaxy topology — torus

The galaxy boundary wraps on both axes. Crossing the right edge of the easternmost sector lands the player in the westernmost sector; same for north/south. There is no boundary wall.

**Implications:**
- Distance calculations use shortest torus path (wrap-aware)
- Mini-map and galaxy map render with wrap visualization (subtle indicator at edge / seam)
- Hyperspace route planning considers wrap shortcuts
- "Edge of galaxy" is not a position — it's a conceptual property of the bubble lore, not a place you fly to

**Shimmer zones.** A small number of sectors are flagged `shimmer: true`. These are the conceptual edge of the bubble — sensor anomalies, ambient voidtype damage, ancient salvage opportunities, occasional unexplained NPC behavior. Generation seeds roughly **2–5%** of sectors as shimmer.

---

## 3. Species layer

A conceptual layer above factions. Galaxies contain a small number of species (target: **5**). Factions are composed of one or more species; most are dominated by one but multi-species coalitions exist.

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
    hullAesthetic: string          // e.g. "organic curves", "geometric crystal"
    namingConvention: string       // e.g. "Latin scientific terms"
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

**World root:** `WorldFile.species: Species[]`

**Faction-species link:** each faction declares a species composition that sums to 100 — see §4.

---

## 4. Faction extensions

Faction model is extended to support multi-species composition, optional home, ideology, and the bubble stance axis.

### Data model

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

- `speciesComposition` percentages sum to exactly **100**
- All `speciesId` values exist in `world.species`
- `type === 'independent'` ↔ `homeLandableId === null` (mutually consistent)
- Major and minor nations must have a **non-null** home

### Faction tier ratios (generation targets)

Ratios are scoped to galaxy size, not absolute counts. Suggested defaults:

- ~1 major nation per **30–50** landables
- **1–2** minor nations per major
- **3–7** independents per galaxy regardless of size

Examples: a 30×30 galaxy with ~80 landables → ~2 majors, 2–4 minors, ~5 independents. A 50×50 galaxy with ~150 landables → ~3 majors, 4–6 minors, ~5–7 independents.

---

## 5. Multi-faction landable control

Landables can be controlled by more than one faction simultaneously. Replaces single `landable.factionId`.

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
|------|---------------|-------------------------------------|----------------------|---------|
| `sole` | 1 | Standard | Faction's full mission set | Standard |
| `treaty` | 2+ | All controlling factions present, ignore each other | Each faction offers reduced mission set | Standard |
| `cooperation` | 2+ | All present, friendly to each other, may escort jointly | Special joint missions available | Slight discount |
| `dispute` | 2+ | Open combat between controlling factions | Mission set per faction includes "drive out" missions targeting the other | Doubled (war economy) |

### NPC spawning at multi-faction landables

Spawn rules remain **per-sector** (not per-landable). For sectors containing a multi-faction landable, spawn rules can include multiple factions. NPC dispositions toward each other override the global disposition matrix locally based on `controlState`:

- `treaty`: same-target-faction NPCs treat each other as **neutral** regardless of faction matrix
- `cooperation`: same-target-faction NPCs treat each other as **allied**
- `dispute`: same-target-faction NPCs treat each other as **hostile**

### Validation

- All `factionId` values exist in `world.factions`
- `share` values sum to exactly **100**
- `controlState === 'sole'` ↔ exactly **1** faction in `factionControl`
- All other states require **≥ 2** factions

---

## 6. Wildlife factions

Wildlife (biological or robotic creatures) is implemented as a special **faction type**, not a parallel simulation system.

### Data model

```typescript
Faction {
  type: 'major_nation' | 'minor_nation' | 'independent' | 'wildlife'
  // ... existing fields
}
```

**Wildlife defaults and behaviour:**
- Always `homeLandableId: null`
- Always `bubbleStance: 'indifferent'`
- Hostile/neutral/friendly default disposition (one-time gen choice)
- "Ships" are creature designs (organic-aesthetic hulls or robotic per archetype)
- **No mission board**; reputation still tracked and affected by missions/events
- Spawn rules like any faction (typically wandering or zone-defensive)

### Mission interaction

Mission trees from nation factions can affect wildlife reputation. Examples:

- "Drive out the [creature] infestation in Sector X" → completion tanks wildlife rep; creatures become hostile
- "Restore the [creature] sanctuary" → completion raises wildlife rep; creatures become neutral or friendly in the affected zone
- "Cull [creature] for research" → small per-mission rep hits

Wildlife rep gates and floors mirror nation faction rep, with per-creature-faction tuning.

---

## 7. Ancient ruins

Some sectors contain ruins from the unified civilization. Mechanically, they are landables that do not appear on standard scanners until revealed.

### Data model

```typescript
Landable {
  type: 'planet' | 'moon' | 'station' | 'ruin'
  hidden: boolean                   // ruins start hidden
  detectionRequirement?: number      // sensor threshold to reveal
  // ... existing fields
}
```

### Detection rules

- Sensor array equipment has **`detectionStrength`** (and optionally range); see §13.
- When the player enters a sector containing a hidden landable, if `sensor.detectionStrength >= landable.detectionRequirement`, the landable is **revealed** (known landables / minimap).
- Once revealed, stays revealed for that save.

### Ruin landables offer

- Salvage equipment (rare, possibly unique, possibly voidtype damage profile)
- Lore fragments (text artifacts that build the bubble narrative)
- Occasional triggers for mission trees ("translate this glyph…")
- **No** standard services (no fuel, no mission board, no shipyard)

**Generation target:** ruins in roughly **5–10%** of sectors.

---

## 8. In-game time

```typescript
WorldState {
  // ... existing fields
  gameTime: {
    epoch: number      // ms since galaxy start, monotonic
    rate: number       // game seconds per real second
  }
}
```

### Default tick rate

**Default:** **60** game seconds per real second (1 real minute ≈ 1 game hour). Rationale: a typical session of 1–2 real hours covers ~1–2 game days — enough for project progress to feel meaningful without events rushing past. Tunable per world for testing; saved with `WorldState`.

### Display

In-game time can be shown in a stardate-style format (e.g. `Cycle 247.13.4`); format is decorative — underlying value is the epoch.

### What time gates

- **Faction projects** — tick forward at the configured rate
- **Mission expiry** — missions may use `expiresAt: gameTime` (later phase; clock supports it)
- **Mission board refresh** — landable boards regenerate every N game hours
- **Faction relationship drift** (optional) — disposition matrix slowly drifts toward attractors from ideology compatibility

### When time runs

- **Flight and hyperspace:** in-game time advances at `gameTime.rate` (career `playTimeSeconds` advances in parallel for cooldowns).
- **Landable screens (docked):** in-game time **does not** advance — browsing shops/missions does not pass time.
- **Galaxy map overlay, insurance screen, pause / save-load menus:** time **stops**.

---

## 9. Faction projects

Each faction may have **0–2** visible long-term goals: narrative texture, mission threads, progress in game time independent of the player.

### Data model

```typescript
FactionProject {
  id: string
  factionId: string
  name: string
  description: string
  progress: number              // 0..100
  rate: number                  // progress per game hour
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

- `playerInfluence === 'helpful'` — related missions **accelerate** the project
- `'hostile'` — missions can **sabotage** progress
- `'both'` — both paths exist (helpful from owning faction, hostile from rivals)

### Visibility

Shown from relevant faction landables (e.g. standing tab): progress and estimated time to completion.

---

## 10. Mission trees

Missions link into trees with story arcs and **final consequences** that write world state.

### Data model

```typescript
MissionTreeTemplate {
  id: string
  name: string
  factionId: string                // which faction offers it
  rootMissionTemplateId: string
  nodes: MissionTreeNode[]
  finalConsequences: ProjectEffect[]
}

MissionTreeNode {
  missionTemplateId: string
  prerequisites: NodeOutcome[]      // must hold for this node to be offered
  outcomes: {
    onComplete: NodeOutcome[]
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

### Branching and rewards

Trees are not strictly linear: nodes can have multiple children gated by different prerequisites; failed steps may recover via alternate branches. Per-mission rewards are normal (credits, rep, items). **Tree completion** applies **`finalConsequences`** — typically larger world shifts (control, unlocks, relationships).

---

## 11. Turrets

Weapons gain a **`targetingMode`**.

```typescript
WeaponItem {
  // ... existing fields
  targetingMode: 'forward' | 'turret'
}
```

**Behaviour:**
- **`forward`:** fires in the direction the ship faces (baseline)
- **`turret`:** fires toward the **current ship target** if one is selected; if none, fires forward

**Slots:** turrets and forward weapons share the existing **`weapon`** slot type; mode is an **item** property, not a separate slot type. (Alternative: dedicated `turret` slots on some hulls — deferred; keep slots flexible.)

**Implications:** slow heavy ships gain viability with turrets; fast ships still favour forward weapons for nose-on damage and accuracy. Expands build variety.

---

## 12. Smart missiles

```typescript
BulletSpec {
  // ... existing fields
  seekingMode: 'none' | 'simple' | 'lead'
  turnRate: number      // applies to simple and lead homing
}
```

**Behaviour:**
- **`none`:** straight-line (slugs, bolts)
- **`simple`:** turns toward target's **current** position at `turnRate`
- **`lead`:** computes **intercept** from position + velocity each frame; turns toward intercept

**Implications:** lead missiles hit fast movers more reliably; countered by erratic manoeuvres (prediction uses linear extrapolation). Generation: advanced/expensive missiles → `lead`; basics → `simple`.

---

## 13. Sensor arrays (expanded role)

Sensor arrays exist as equipment; role expands for ruins and (later) long-range detection.

```typescript
SensorArrayItem {
  // ... existing fields
  detectionStrength: number   // reveal hidden landables when ≥ landable.detectionRequirement
  targetLockSpeed?: number    // optional: lock acquisition speed
  detectionRange?: number      // sectors — long-range detection (future)
}
```

Cheap arrays detect nothing; premium arrays reveal most ruins. Generation produces tiers at multiple strength levels.

---

## 14. Treaty / cooperation / dispute — combat and diplomacy detail

When two factions share a landable in **`dispute`** and both have NPCs in the sector:

- Opposing factions' NPCs spawn **hostile** to each other (override global disposition)
- If the player has positive rep with one faction and attacks the other, the friendly faction's NPCs do **not** proxy-aggro allies (rep applies to the faction attacked)

**`cooperation`:**
- NPCs of both factions treat each other as **allied** (escort behaviour, shared ally alerts)
- Joint missions reference both factions; completion can grant rep to **both**

**`treaty`:**
- NPCs **ignore** each other (no engagement, no escort)
- Mission boards remain **independent** per faction

---

## Open questions (v0.5 freeze)

- Should ruins ever offer services beyond salvage? *(Lean: no — keeps them mysterious.)*
- Should faction projects be visible from anywhere, or only from controlling landables? *(Lean: only controlled landables — encourages exploration.)*
- Should wildlife factions ever have treaty or cooperation states with nation factions? *(Lean: yes — "protected sanctuary" arrangements.)*
- Should game-time rate be player-tunable in settings? *(Lean: yes — defer to settings phase.)*

# VOID RUNNER — Game design document (living)

> High-level design and player-facing rules. Runtime architecture and delivery order live in `plan/CONTEXT.md` and `plan/VOID_RUNNER_Roadmap.md`; the actionable checklist is `plan/VOID_RUNNER_Backlog.md`. World generator pipeline detail: `plan/VOID_RUNNER_WorldGen.md`.

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

Long ago, a unified civilization spanned the galaxy. Facing an extragalactic enemy, they isolated the galaxy inside a permanent, impenetrable bubble. The galaxy survived; the civilization fragmented over millennia.

**Mechanical anchors:**
- Torus topology (sector edges wrap)
- Bubble ideology axis (`bubbleStance`)
- Ancient ruins and lost technology
- Shimmer zones near conceptual bubble edge

Per world, the lore remains fixed but what factions know (or deny) varies.

---

## 2. Galaxy topology — torus

Galaxy boundary wraps on both axes. No hard wall.

**Implications:**
- Distance uses shortest torus path
- Mini-map and galaxy map show subtle wrap indication
- Hyperspace planning can use wrap shortcuts
- "Edge of galaxy" is conceptual lore, not a location

**Shimmer zones:** 2-5% of sectors flagged `shimmer: true`; intended for anomalies, ambient voidtype damage, salvage opportunities, and unusual NPC behavior.

---

## 3. Species layer

Galaxies contain a small species set (target: 5). Factions are composed of one or more species.

```typescript
Species {
  id: string
  name: string
  archetype: SpeciesArchetype
  physiology: string
  ethos: string
  techProfile: {
    weaponStyle: string
    hullAesthetic: string
    namingConvention: string
  }
  preferredHabitat?: HabitatPreference
}
```

`WorldFile.species: Species[]`

---

## 4. Faction extensions

```typescript
Faction {
  id: string
  name: string
  type: 'major_nation' | 'minor_nation' | 'independent'
  speciesComposition: { speciesId: string, percentage: number }[]
  homeLandableId: string | null
  ideology: string
  bubbleStance: 'reunifier' | 'isolationist' | 'breaker' | 'indifferent'
  flagColor: string
  techArchetype: string
}
```

**Validation:**
- composition sums to 100
- species ids resolve
- independents have null home; majors/minors have homes

---

## 5. Multi-faction landable control

Replaces single `landable.factionId`.

```typescript
Landable {
  factionControl: { factionId: string, share: number }[]
  controlState: 'sole' | 'treaty' | 'cooperation' | 'dispute'
}
```

**Validation:**
- share sums to 100
- ids resolve
- `sole` => exactly one faction
- other states => at least two factions

---

## 6. Wildlife factions

Wildlife is represented as a faction type, not a parallel simulation system.

```typescript
Faction {
  type: 'major_nation' | 'minor_nation' | 'independent' | 'wildlife'
}
```

Wildlife defaults:
- `homeLandableId: null`
- `bubbleStance: 'indifferent'`
- no mission board
- reputation still tracked and affected by missions/events

---

## 7. Ancient ruins

Ruins are hidden landables requiring sensor detection thresholds.

```typescript
Landable {
  type: 'planet' | 'moon' | 'station' | 'ruin'
  hidden: boolean
  detectionRequirement?: number
}
```

Generation target: ruins in ~5-10% of sectors.

---

## 8. In-game time

```typescript
WorldState {
  gameTime: {
    epoch: number
    rate: number
  }
}
```

Default rate: 60 game seconds per real second.

Time gates projects, mission board refresh, and future mission expiry. Time advances in landable screens, pauses in pause/save menus.

---

## 9. Faction projects

```typescript
FactionProject {
  id: string
  factionId: string
  name: string
  description: string
  progress: number
  rate: number
  effectOnComplete: ProjectEffect
  playerInfluence: 'helpful' | 'hostile' | 'both' | 'none'
}
```

Projects are visible from relevant faction landables and may be influenced by player missions.

---

## 10. Mission trees

```typescript
MissionTreeTemplate {
  id: string
  name: string
  factionId: string
  rootMissionTemplateId: string
  nodes: MissionTreeNode[]
  finalConsequences: ProjectEffect[]
}
```

```typescript
WorldState.missionTrees: {
  [treeId: string]: {
    started: boolean
    nodeStates: { [nodeId]: 'unavailable' | 'available' | 'active' | 'completed' | 'failed' }
  }
}
```

Trees branch and support recovery paths; final consequences apply world-level state changes.

---

## 11. Turrets

```typescript
WeaponItem {
  targetingMode: 'forward' | 'turret'
}
```

Turret mode fires at selected target when available, else forward.

---

## 12. Smart missiles

```typescript
BulletSpec {
  seekingMode: 'none' | 'simple' | 'lead'
  turnRate: number
}
```

`lead` mode predicts intercept point each frame.

---

## 13. Sensor arrays (expanded role)

```typescript
SensorArrayItem {
  detectionStrength: number
  targetLockSpeed: number
  detectionRange: number
}
```

Sensor tiers gate hidden ruin discovery.

---

## 14. Treaty/cooperation/dispute combat detail

- `dispute`: shared-landable factions spawn hostile to each other
- `cooperation`: allied behavior, joint missions, shared ally responses
- `treaty`: neutral coexistence, independent mission boards

---

## Open questions (v0.5 freeze)

- Should ruins ever offer services beyond salvage?
- Should faction projects be visible globally or only at controlled landables?
- Should wildlife factions support treaty/cooperation with nations?
- Should game-time rate be player-tunable in settings?

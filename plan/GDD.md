# VOID RUNNER — Game design document

> **Living design reference** — player intent, shipped rules, world fiction, and planned features.  
> **Not** the implementation handoff: see **`plan/CONTEXT.md`**. **Not** the schedule: see **`plan/BACKLOG.md`**.  
> **Controls primer:** **`PLAYER_GUIDE.md`** (repo root).

Canonical combat math and generator weapon bands: **`plan/worldgen/WEAPONS_WORLDGEN.md`**. Type definitions: **`src/types/`**.

---

## 0. How to read this document

| Part | Sections | Use when you need… |
|------|----------|-------------------|
| **A — Vision** | §1 | Pitch, pillars, design constraints |
| **B — Shipped** | §2–8 | What players experience **today** in the browser build |
| **C — Fiction** | §9 | Bubble lore and per-world variation |
| **D — World data** | §10 | Schema and validation for **`WorldFile`** (implemented) |
| **E — Planned** | §11 | Features by **BACKLOG phase** (not in game yet) |
| **F — Open questions** | §12 | Decisions still leaning one way |
| **Appendix** | §A | Portable saves (planned) |

**Status tags** in §11: `[Phase N]` = scheduled in **`plan/BACKLOG.md`**. No tag in §2–8 = shipped unless noted *partial*.

---

## 1. Vision and pillars

### Pitch

**Void Runner** is a 2D browser space trading and combat game inspired by *Escape Velocity* (1996). The player is a freelance pilot in a authored galaxy: take missions, manage reputation, upgrade equipment, fight when necessary, and cross the map via hyperspace. Story emerges from faction relationships, mission trees, and (later) generated worlds — not from a fixed campaign script.

### Design pillars

1. **Newtonian flight** — momentum matters; thrust, gravity, and deliberate braking define handling.  
2. **Equipment-driven ships** — mass, thrust, shields, weapons, and jump range come from **installed** catalog items, not hull stats alone.  
3. **Fair combat** — **same** damage, energy, and shield rules for player and NPC.  
4. **Faction memory** — reputation with floors/ceilings; prices and tone at ports react to standing.  
5. **Offline worlds** — gameplay reads a **`WorldFile`** JSON bundle; no network APIs during play.  
6. **Procedural presentation** — Canvas geometry, not sprite sheets; future **procedural imagery** params in JSON (Phase 6).  
7. **Emergent scope** — mission trees, multi-faction ports, and (later) faction projects and wildlife add depth without a separate “story mode.”

### Platform constraints

- TypeScript, Vite, HTML5 Canvas 2D, vanilla DOM.  
- Saves: **`localStorage`** per world seed today; portable JSON files planned (Appendix A).  
- World **text** generation (Claude API) only in the **offline** generator (Phase 9), never at runtime.

---

## 2. Core loop *(shipped)*

```text
Main menu → load WorldFile + career save
    → Flight in sector (combat, traffic, radiation)
    → Land at port (services gated by station)
    → Missions / shop / shipyard / repair / standing
    → Galaxy map (K) → set hyperspace target → jump (J) when ready
    → repeat across torus-wrapped sectors
```

**Career persistence:** credits, hull, loadout, reputation, visited sectors, hyperspace target, mission progress, mission tree state, insurance flags — keyed to world **`metadata.seed`**.

**Failure state:** hull destruction → **insurance** choice (reinstate ship at cost or payout + starter hull). Campaign continues.

**World fixture:** development uses **`public/testWorld.json`**; validation runs on load in DEV.

---

## 3. Flight and sectors *(shipped)*

### Newtonian motion

- No space drag; thrusters apply force; velocity persists.  
- **Auto-brake** modes (linear / angular) damp only when matching thrusters are **not** actively firing this frame.  
- **Gravity** from landable **`mass`**; minimum approach distance enforced.  
- **Landing:** proximity, low speed, alignment; confirm at prompt (**L**).

### Sector grid

- Fixed-size sectors; **edge crossing** transitions to adjacent sector coordinates.  
- **Torus wrap:** leaving the east edge enters the west edge (and likewise north/south). Distances and hyperspace hops use **shortest torus path**.  
- **Radiation zones:** sectors flagged in metadata; ambient damage while inside.

### Presentation

- Ship-centred camera; layered render pipeline (stars → bodies → ships → HUD).  
- Sector **grid backdrop** in flight for orientation.  
- *Planned:* always-visible **sector boundary** cue (Phase 7).

---

## 4. Combat and equipment *(shipped)*

### Layered damage (player + NPC)

No overflow between layers — excess damage on a layer is discarded:

```text
Hit → shield (if online; no per-matter resist on shield)
    → armour layers 0…N (per-matter reduction)
    → hull
```

**Matter types** on projectiles: `normal` | `anti` | `dark` | `void`. Armour **`reductions`** use the same four keys.

**Behaviours** via stackable **`abilities[]`** on **`BulletSpec`**: `seeking`, `dot`, `knockback`, `ballistic`, `explosive` (splash damage separate; splash does not apply reputation). Full field semantics: **`plan/worldgen/WEAPONS_WORLDGEN.md`**.

### Energy and shields

Per-frame tick for **player and every NPC**:

- Fuel → reactor → **Joules** → shield regen and weapon draw.  
- Shield **reboot** timer after collapse.  
- NPC spawns receive armour layers, shield HP, joules, and fuel from loadout resolution — same pipeline as the player.

### Equipment model

- Items install into **typed slots** on the hull; no separate inventory bag for gear.  
- **Required slots:** forward thruster, rotate thruster, fuel tank.  
- Representative slot types: weapons, armour, shield, reactor, auto-brake, hyperspace drive, sensor array; neural slots exist for future Phase 12.  
- Hull **`defaultLoadouts`** (`raw` / `basic` / `advanced`); **`slotCounts`** cap installations; shipyard listings reference catalog ids.  
- Buy/sell uses catalog **`price`**; sell returns a fraction of purchase price.

### Targeting and weapons

- **Tab** / **Shift+Tab** cycle or lock NPC ship targets; minimap highlights lock.  
- Multiple **weapon keys** fire separate banks; fire rate and energy cost per weapon item.  
- Muzzle offset and hit radius from **`HullSpec.dimensions`** (`length` / `width`). Flight silhouette from **`silhouette`**.

*Planned:* **turret** weapons that fire toward locked target (§11). *Not implemented:* legacy `seekingMode` / `targetingMode` fields from older docs.

### Insurance

On destruction, player chooses reinstatement (fee, retain progression) or cash payout + replacement hull — prevents hard campaign end.

---

## 5. Ports, missions, and cargo *(shipped)*

### Landable services

Tabbed UI per station: overview, reputation, supplies/repair, equipment store, shipyard (when listed), missions, etc. Services depend on **`landable.services`** and listing data — not every port has every tab.

**Pricing** scales with faction standing at that port. **Overview** copy prefers **`landable.description`**; pirate stations fall back to faction flavour text.

### Missions (freelance board)

- Primary type today: **cargo delivery** — accept → cargo added to hold by weight → fly to named landable → complete on dock.  
- **Mission board** refreshes on **game-time** buckets while docked rules apply to time (see §10).  
- Active missions visible in flight (**M**). Cancel returns cargo capacity.  
- Payoff and reputation consequences defined per template.

### Mission trees *(shipped runtime)*

- **`MissionTreeTemplate`** in world file; runtime **`missionTrees`** tracks node states.  
- **Prerequisites** and branch outcomes (`onComplete` / `onFail`).  
- **Final consequences** apply world effects when the tree completes (same effect vocabulary as planned faction projects).  
- UI shows **arc display name** on board (e.g. “Border Accord · …”), not internal tree ids.

*Planned:* kill targets, waypoints, `followUpMissions`, hidden payoffs — BACKLOG “after Phase 9.”

### Cargo

- Minimal **cargo** model tied to missions (weight in hold).  
- *Planned:* richer **`CargoItem`** and trade economy.

---

## 6. Reputation and diplomacy *(shipped)*

### Standing

- Per faction, roughly **−100…+100**.  
- **Floors and ceilings** by event kind (e.g. combat hits, kills, mission complete).  
- **Pirate** reputation derived from non-pirate standings.  
- HUD and landable **Standing** tab reflect state; store and landing costs react.

### Multi-faction landables

A port may list multiple controlling factions with **share** percentages and a **control state**:

| State | Factions | NPCs in sector | Missions | Pricing |
|-------|----------|----------------|----------|---------|
| `sole` | 1 | Standard disposition | Full set | Standard |
| `treaty` | 2+ | Coexisting; **neutral** to each other locally | Reduced set per faction | Standard |
| `cooperation` | 2+ | **Allied** locally; may joint-escort | Joint missions possible | Slight discount |
| `dispute` | 2+ | **Hostile** to each other locally | “Drive out” style missions | War economy (higher) |

**Spawn rules** remain sector-level. Local disposition **overrides** the global matrix for NPCs affiliated with the landable’s controlling factions.

**Player combat:** attacking one faction in a dispute does not cause the other controlling faction’s NPCs to proxy-aggro unless rep rules say otherwise.

Validation: shares sum to **100**; `sole` ↔ exactly one faction; other states require ≥2.

---

## 7. Galaxy map and hyperspace *(shipped)*

### Galaxy map

- Open in flight with **K**; square sector grid; visited vs unvisited styling.  
- **Cursor** + **Enter** sets **hyperspace target**; **Backspace** clears.  
- **Faction colours** on visited sectors; radiation overlay.  
- **Sector summary** pane for cursor cell (coords, controller, landable names).  
- **One-hop range** tint + ring when a **`hyperspaceDrive`** is fitted.

*Planned:* zoom; faction tint only after visit; grid coordinate labels (Phase 7).

### Hyperspace jump

Requires: drive installed, fuel, cooldown elapsed (career **`playTimeSeconds`**), speed below threshold, heading aligned to hop vector.

- Jump **snaps** heading and **zeros** velocity; streak animation.  
- Hops along **grid ray** toward target; **partial hops** if target farther than **`jumpRange`** (Euclidean sector units).  
- Flight HUD: edge **beacon** + **`[ J ]`** prompt when legal.

*Deferred:* fleet align-all-ships rules until Phase 11.

---

## 8. NPCs and traffic *(shipped)*

- **`npcSpawnRules`** per sector: faction, hull spec id, counts, behaviour.  
- **`NPCController`** + **`ScriptedNPCPilot`** feed the same **`ShipControlFrame`** as the player (pre-neural bus).  
- Disposition matrix: hostile / neutral / friendly / pirate; minimap colour cues.  
- Hostile aim deadband and weapon-range rotation tuning for readable dogfights.

**Control bus (foundation for Phase 12):** record/replay of control frames; neural encode/decode stub exists — escort autopilot not gameplay yet.

---

## 9. World fiction — the bubble

Every galaxy shares one canonical fact: civilization sealed itself inside an **impenetrable space-time bubble** to survive an unwinnable war. The old unified culture collapsed into today’s factions; the bubble remains.

**Why it matters:**

- Explains **torus** topology (no literal rim to fly off).  
- **`bubbleStance`** on factions: `reunifier` | `isolationist` | `breaker` | `indifferent`.  
- Justifies **ruins** (legacy tech) and **shimmer** sectors (conceptual bubble edge) — gameplay in Phase 10.  
- Long mystery hook: intruders, enemy follow-through, partial histories.

**Per-world variation:** lore is fixed; each **`WorldFile`** chooses what factions believe, what ruins reveal this generation, and how shimmer is treated in local myth.

---

## 10. World data reference *(shipped schema)*

Runtime loads **`WorldFile`** once; **`validateWorldFile`** enforces invariants. Generator (Phase 9) must output compatible JSON.

### Species

Conceptual layer above factions (~**5** species target per galaxy). Each species defines **biology/culture** (`archetype`, `physiology`, `ethos`) and **how they build** (`techArchetype`). Factions inherit technology flavor from their **`speciesComposition`** — there is no separate faction-level tech field.

```typescript
Species {
  id: string
  name: string
  archetype: SpeciesArchetype
  physiology: string      // 20–200 chars
  ethos: string           // 20–200 chars
  techArchetype: TechArchetype
  preferredHabitat?: HabitatPreference
}
```

**`SpeciesArchetype`** — what they are (validated enum):

| Value | Meaning |
|--------|---------|
| `biological` | Organic life; conventional ecosystems and bodies |
| `machine` | Fully artificial or uploaded machine intelligences |
| `hive` | Collective or swarm intelligence |
| `energy` | Plasma, field, or radiation-native beings |
| `voidtouched` | Shaped by void / shimmer exposure |
| `hybrid` | Mixed lineage or engineered crossbreeds |

**`TechArchetype`** — dominant engineering tradition (validated enum; drives world-gen equipment/hull flavor):

| Value | Meaning |
|--------|---------|
| `mechanical` | Gears, hydraulics, industrial fabrication |
| `robotic` | Autonomous drones, modular automata |
| `synthetic` | Designer materials, integrated bio-synth |
| `biological` | Grown hulls, organic systems |
| `energetic` | Field projectors, plasma conduits |
| `void` | Exotic void/shimmer-derived systems |

**`HabitatPreference`** (optional): `core` · `mid` · `rim` · `nebula` · `radiation` · `shimmer` — biases faction home scoring in world-gen.

`WorldFile.species: Species[]`. Factions reference species in **`speciesComposition`** (percentages sum to **100**).

### Factions

Political/military layer. Visual and mission tone use **`shipStyle`**, **`missionFlavour`**, and colors; technology tone comes from composed species' **`techArchetype`** values.

```typescript
Faction {
  id, name, demonym
  type: 'major_nation' | 'minor_nation' | 'independent'   // + 'wildlife' when Phase 10
  description: string
  shipStyle: string
  missionFlavour: string
  speciesComposition: { speciesId, percentage }[]
  homeSector: GridCoord
  homeLandableId: string | null    // null for independents
  territoryRadius: number
  bubbleStance: 'reunifier' | 'isolationist' | 'breaker' | 'indifferent'
  primaryColour, secondaryColour: { h, s, l }
  disposition: Record<factionId, number>
  isPirate: boolean
}
```

**Generation ratio targets** (landable-scoped, not absolute):

- ~1 major per **30–50** landables  
- **1–2** minors per major  
- **3–7** independents per galaxy  

`independent` ↔ `homeLandableId === null`; majors/minors require a home.

### Landables

```typescript
Landable {
  type: 'planet' | 'moon' | 'station'   // + 'ruin' Phase 10
  factionControl: { factionId, share }[]
  controlState: 'sole' | 'treaty' | 'cooperation' | 'dispute'
  // position, mass, services, shipyard listings, …
}
```

### In-game time *(shipped)*

```typescript
gameTime: { epoch: number, rate: number }   // default rate: 60 game-sec / real-sec
```

| Context | Time advances? |
|---------|----------------|
| Flight, hyperspace | Yes, at `rate` |
| Docked (landable UI) | **No** |
| Galaxy map, insurance, pause | **No** |

**Uses today:** mission board refresh buckets; stardate HUD; mission tree timing hooks.  
**Uses later:** faction project ticks, mission expiry (Phase 10+).

Display: decorative stardate string; authoritative value is **`epoch`**.

### Mission trees (templates)

```typescript
MissionTreeTemplate {
  id, name, factionId
  rootMissionTemplateId
  nodes: MissionTreeNode[]
  finalConsequences: ProjectEffect[]
}
```

**`ProjectEffect`** vocabulary (shared with planned faction projects): control shift, unlock equipment, spawn landable, change disposition, set world flag.

### Combat catalog

- **`bulletSpecs`** + weapon equipment entries — see WEAPONS_WORLDGEN.  
- **`hullSpecs`** with loadouts and slot counts — archetype tuning in **`plan/pre-worldgen/`**.

*Planned on `HullSpec`:* **`renderAnchors`** + procedural style params (Phase 6).

---

## 11. Planned systems (by phase)

Schedule detail and checkboxes: **`plan/BACKLOG.md`**.

### Phase 5 — Achievements *(shipped)*

- Landable **Achievements** tab; **`playerMeta`** + **`achievementProgress`** per career save.  
- Versatile conditions via dot-paths: `meta.*`, `derived.*`, `meta.counters.*`, `meta.flags.*` — see `src/achievements/`.  
- Catalog in `src/achievements/catalog.ts` (starter + completionist set).

### Phase 6 — Procedural imagery `[Phase 6]`

- Unified procedural draw from **`WorldFile`** params everywhere.  
- **Landables (flight):** **`plan/procedural/void_runner_planets.md`** — procedural planet/moon spheres (noise, atmosphere, rings); stations later.  
- Then UI/minimap landables, hulls/`renderAnchors`, equipment icons — **`plan/procedural/README.md`**.  
- Shield/armour look **TBD** (material vs item tint).

### Phase 7 — UI polish `[Phase 7]`

- Galaxy map **zoom**; faction colour **only after visit**; **grid coordinate** labels.  
- **Always-visible** sector edge boundary in flight.  
- Smaller **minimap** landable markers.

### Phase 8 — Pre–world-gen balance `[Phase 8]`

- Hand-tune **`testWorld.json`** + **`src/constants.ts`** per **`plan/pre-worldgen/`**.  
- Close archetype checklists (`interceptor` done, `shuttle` in progress, more hull classes).  
- Does not block generator but improves template quality for Phase 9.

### Phase 9 — World generator MVP `[Phase 9]`

- 13-step pipeline — **`plan/worldgen/WORLDGEN.md`**.  
- Procedural + LLM; progressive save; playable **`WorldFile`** export.  
- Emits species, factions, landables, catalog, bullets, missions, trees — including Phase 6 procedural fields when ready.

### After Phase 9 (unnumbered)

- **Portable JSON saves** (Appendix A).  
- **Economy depth:** `CargoItem`, kill/waypoint missions, trade.  
- **Combat flavour:** exotic gear, disabled ships, boarding.

### Phase 10 — World gen v2 `[Phase 10]`

**Wildlife factions** — faction `type: 'wildlife'`; creature “ships”; no mission board; rep still tracked; mission trees can affect wildlife standing.

**Ancient ruins** — `type: 'ruin'`, `hidden: true`, `detectionRequirement`; revealed by **sensor array** `detectionStrength` when entering sector; salvage + lore; no standard services. Target **5–10%** of sectors.

**Shimmer zones** — `shimmer: true` sectors (~**2–5%**); sensor anomalies, ambient void damage, salvage; bubble-edge fiction.

**Faction projects** — long-running goals per faction (0–2 visible); tick with game time; player missions accelerate or sabotage.

```typescript
FactionProject {
  id, factionId, name, description
  progress: 0..100
  rate: number              // per game hour
  effectOnComplete: ProjectEffect
  playerInfluence: 'helpful' | 'hostile' | 'both' | 'none'
}
```

Visibility lean: controlling landables only (Standing / news tab).

### Phase 11 — Fleet `[Phase 11]`

- Multi-ship ownership (~5), fleet landing, hyperspace weakest-drive rule, guard mode, escort insurance.

### Phase 12 — Neural AI gameplay `[Phase 12]`

- Sensor **`detectionRange`** (optional); **neural brain** + **memory card**; training simulator landable; autopilot modes; pre-trained cards in worlds.

### Phase 13 — Presentation polish `[Phase 13]`

- Web Audio; engine glow / damage VFX beyond procedural hulls; **settings** (incl. game-time rate); world sharing UX.

### Parked / design-only (no phase commitment)

| Topic | Notes |
|-------|--------|
| **Turret weapons** | `targetingMode: 'forward' \| 'turret'` on weapon items; fire toward locked target. Same `weapon` slot type. |
| **Lead missiles** | Use `seeking` ability with intercept logic — specify in WEAPONS_WORLDGEN when added, not separate `seekingMode` field. |
| **Reputation decay** | Out of scope unless design revisits. |
| **Multiplayer** | Out of scope. |

Longer “when to pull” notes: **`plan/PARKED_IDEAS_DETAIL.md`**.

---

## 12. Open questions

| Question | Current lean |
|----------|----------------|
| Ruins offer services beyond salvage? | **No** — keep mysterious. |
| Faction projects visible from non-controlling landables? | **No** — only controlling factions’ ports. |
| Wildlife ↔ nation `treaty` / `cooperation`? | **Yes** — sanctuaries and protected zones. |
| Game-time rate player-tunable? | **Yes** — Phase 13 settings. |
| Achievement “met another faction” rule? | TBD — first positive standing vs first dock at foreign faction. |
| Shield/armour: material vs item colour? | TBD — Phase 6 design pass. |

---

## Appendix A — Persistence and saves *(planned)*

**Problem:** `localStorage` is per browser profile; progress is lost when switching devices or clearing site data.

**Direction:** Same canonical blob as today’s **`PersistedWorldState`**, plus a small header (`formatVersion`, `seed`, optional world name, `savedAt`).

| Tier | When |
|------|------|
| `localStorage` | Frequent — same-session resilience |
| JSON file | Coarser milestones — sector change, landable enter/exit, credit/loadout/fuel/hull mutations, hyperspace target set/clear, menu exit, `beforeunload` / `visibilitychange` best effort |

**UX:** explicit **Export save** / **Import save**; optional File System Access API where supported. No silent arbitrary disk writes in a normal browser.

**Load policy (conceptual):** imported file if seed matches loaded world; else local save for that seed; reconcile by **`savedAt`** if both exist.

**v1 non-goals:** cloud saves, multiplayer sync, encryption.

**Schedule:** after Phase 9 world generator MVP — **`plan/BACKLOG.md`**.

---

*Last updated **2026-05-09** — full restructure: shipped §2–8, world data §10, planned §11 by phase.*

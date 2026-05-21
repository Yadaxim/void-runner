# VOID RUNNER — Delivery checklist

> **Single source of truth** for what is shipped vs what is next. Update this file when priorities change; add a short bullet to **`plan/CONTEXT.md` → Last changes** for notable behaviour shifts. Design detail: **`plan/GDD.md`**. Runtime handoff: **`plan/CONTEXT.md`**.

---

## Status snapshot

**Playable today:** flight, combat (player/NPC parity), sectors, landables, missions, reputation, insurance, equipment store, shipyard, galaxy map, hyperspace jumps, torus wrap, saves via `localStorage`, Vitest coverage, `validateWorldFile`.

**Done through Phase 4.5** — core loop, navigation, species/factions data, multi-faction landables, game time + mission trees, NPC combat parity, AI control bus, ability-based bullets.

**Current focus:** **Phase 5 — Achievements** (then 6 → 7 → 8 → 9).

**Hygiene:** When `public/testWorld.json` hull lists change, keep `simulation.test.ts` / fixtures aligned with `shipyardListings` and `startingConditions`.

---

## Delivery order

| Phase | Theme | Doc focus |
|-------|--------|-----------|
| 1–3 | Core loop | — (done) |
| 4 | Navigation + tests | — (done) |
| 4.5 | Pre-gen foundation (data model) | — (done) |
| **5** | **Achievements** | This file § Phase 5 |
| **6** | **Procedural imagery** | `WorldFile` params + runtime draw |
| **7** | **UI polish** | Galaxy map, flight HUD, minimap |
| **8** | **Pre–world-gen balance** | `plan/pre-worldgen/` |
| **9** | **World generator MVP** | `plan/worldgen/WORLDGEN.md` |
| — | Portable saves, economy depth | After Phase 9 |
| 10 | World gen v2 | Ruins, shimmer, wildlife, caching |
| 11 | Fleet | Multi-ship, guard mode |
| 12 | Neural AI gameplay | Training, autopilot, memory cards |
| 13 | Presentation polish | Audio, VFX, settings, world sharing UX |

---

## Done — Phases 1–3 (core loop)

- [x] Newtonian flight, landing, sector transitions, minimap, radiation zones  
- [x] Combat, NPCs, reputation, insurance, layered damage (shield → armour → hull)  
- [x] Missions + cargo (minimal model), equipment store, shipyard purchase/customize  
- [x] Main menu, starting conditions from `WorldFile`, world validation plumbing  

---

## Done — Phase 4 (navigation + tests)

- [x] Automated tests: damage, energy/shield, physics, world validation (extend when schema changes)  
- [x] Galaxy map screen (visited state, faction colours, radiation overlay, hyperspace target, sector summary, flight HUD target strip)  
- [x] Hyperspace drive: partial hops, fuel, cooldown, range ring on map, jump animation, alignment rules  
- [x] Targeting: Tab / Shift+Tab ship lock; minimap marker  
- [x] Flight sector grid backdrop; minimap landable rings; auto-brake damping rule  
- [x] **Torus wrap** — sector exit re-enters opposite edge; shortest-path hyperspace hops  

---

## Done — Phase 4.5 (pre-gen foundation)

### Session A — NPC battle parity
- [x] NPC shields, armour, reactor/joules, spawn loadouts, shared damage resolution  

### Session B — Torus topology
- [x] Sector wrap, torus distance/hops, minimap seam cue  

### Session C — Galaxy map + hyperspace (data/UI baseline)
- [x] Covered under Phase 4  

### Session D — Species + faction extensions
- [x] `WorldFile.species`, faction `type` / composition / home / bubble / tech archetype; validation + `testWorld`  

### Session E — Multi-faction landables
- [x] `factionControl[]`, `controlState` (sole/treaty/cooperation/dispute); UI, economy, NPC local rules  

### Session F — Game time + mission trees
- [x] `gameTime` (frozen while docked); stardate HUD; `MissionTreeTemplate` runtime; example tree in `testWorld`  

### AI control bus (pre-neural)
- [x] `ShipControlFrame`, `applyShipControlFrame`, pilots, record/replay, neural encode/decode stub  

### Combat data model
- [x] Bullet **`matterType`** + **`abilities[]`**; armour four matter reductions — **`plan/worldgen/WEAPONS_WORLDGEN.md`**  

---

## Next — Phase 5: Achievements

**Surface:** dedicated **Achievements** tab/screen at landables. **Scope:** per **player career** (not per ship); progress in **player metadata** persisted with saves.

**Tone:** discovery and milestones — no kill-count ladders. Odd or humorous copy OK.

### Data model

- [ ] Achievement **definition catalog** (ids, titles, descriptions, tiers, hidden flag)  
- [ ] **Player progress** map: `achievementId → { unlockedAt?, progress? }`  
- [ ] Hooks from gameplay events (landing, hyperspace, combat, missions, map visit, faction standing, …)  
- [ ] Landable UI: list locked/unlocked, progress bars where partial (e.g. % galaxy explored)  

### Starter set (ship first)

- [ ] **First landing**  
- [ ] **First hyperspace jump**  
- [ ] **First kill** (hostile ship destroyed)  
- [ ] **First mission** completed  
- [ ] **Explored N%** of galaxy (configurable thresholds, e.g. 25 / 50 / 75)  
- [ ] **Met another faction** (standing or first-contact rule TBD)  

### Hard / completionist

- [ ] **Visit every sector** in the galaxy  
- [ ] **Meet every faction** (non-pirate roster TBD)  

---

## Next — Phase 6: Procedural imagery

**Goal:** One procedural drawing system **everywhere** images appear. Parameters in **`WorldFile`** (`testWorld.json` first; Phase 9 generator emits the same fields). Replaces today’s placeholder landable and hull drawing.

**Principle:** Runtime reads JSON + seed only; `validateWorldFile` enforces params and anchor counts vs `slotCounts`.

### Schema and validation

- [ ] Shared procedural param types on `Landable`, `HullSpec`, equipment catalog entries, etc.  
- [ ] `validateWorldFile` rules (ranges, anchor counts vs slots)  
- [ ] Example params in **`public/testWorld.json`** (≥1 hull, landable, equipment item)  

### `HullSpec` — world JSON

- [ ] **`renderAnchors`** per slot kind (weapons, armour, shield) — positions/angles; count matches `slotCounts`  
- [ ] Procedural **hull silhouette** params on `HullSpec`  
- [ ] **Equipped weapons** at weapon anchors (player + NPC)  
- [ ] **Shield / armour on hull** at armour/shield anchors  

### Shield and armour look *(TBD)*

- [ ] Design: **material** → texture/pattern; **per-item** → tint colour; **resistances** → stat UI vs on-sprite hint  
- [ ] Implement on hull layers + equipment inspect/shop UI  

### Landables — replace current renderer

- [ ] Procedural **planet / moon / station** body (replaces current render)  
- [ ] **Flight sector** — body at world position  
- [ ] **Landable screen** — portrait / banner from same params  
- [ ] **Minimap** — small icon from same params (coordinate with Phase 7 minimap scale)  

### Equipment imagery — all surfaces

- [ ] **On ship in flight** — weapons at anchors; other gear per design  
- [ ] **Equipment store** — list/detail icon per catalog item  
- [ ] **Shipyard + customize** — hull + per-slot previews  
- [ ] **Cargo / inventory** when shown  
- [ ] **Landable UI** — service/room imagery  
- [ ] **Missions / HUD** — equipment or faction pictograms  

### Phase 9 handoff

- [ ] Document procedural fields in **`plan/worldgen/WORLDGEN.md`** (step 9 + landable steps)  
- [ ] Generator outputs same param shapes as hand-authored JSON  

---

## Next — Phase 7: UI polish

Does not require world generator.

### Galaxy map

- [ ] **Zoom** — pan/zoom or stepped zoom on the sector grid  
- [ ] **Faction colours on visit only** — unvisited neutral/veiled; tint after first visit  
- [ ] **Grid coordinates** — axis labels on grid lines  

### Flight HUD and minimap

- [ ] **Sector edge cue** — **always-visible** sector boundary (wrap edges readable at all times)  
- [ ] **Minimap landable scale** — smaller dots/rings so ports do not dominate  

---

## Next — Phase 8: Pre–world-gen balance

Hand-tune **`public/testWorld.json`** and **`src/constants.ts`** before procedural catalogs. Trackers: **`plan/pre-worldgen/ARCHETYPE_CHECKLIST.md`**, **`plan/pre-worldgen/CONSTANTS_BALANCE_TREE.md`**.

### Constants (`CONSTANTS_BALANCE_TREE` order)

- [x] **1. Sector scale** — `SECTOR_SIZE`, edge threshold  
- [ ] **2. Gravity** — `GRAVITY_CONSTANT`, landable mass tiers  
- [ ] **3–N.** Remaining tree (fuel, reactor, shields, weapons, NPC spawn, …) per balance doc  

### Hull archetypes (`ARCHETYPE_CHECKLIST`)

- [x] **Interceptor (`interceptor_mk1`)** — raw/basic/advanced; mass-cap snapshot **2026-05**  
- [ ] **Shuttle (`shuttle_mk1`)** — starter hull; close `raw/basic/advanced`  
- [ ] **Dogfighter** and further combat/civilian/cargo archetypes per checklist  
- [ ] Align **`testWorld`** shipyard listings and NPC spawn hull ids with tuned hulls  

---

## Next — Phase 9: World generator MVP

Pipeline: **`plan/worldgen/WORLDGEN.md`**. Weapons step 9: **`plan/worldgen/WEAPONS_WORLDGEN.md`**.

> **Note:** `src/worldgen/pipeline.ts` has **15 stub stages** vs **13-step** doc — reconcile when implementing.

### Session G — Shell + procedural galaxy
- [x] Main menu entry + **`WorldGenScreen`** (seed, name, progress UI)  
- [ ] Pipeline **step 1** (galaxy structure) and **step 2** (special sectors)  
- [ ] Galaxy-map **preview mode** (no commit required)  

### Session H — Claude API + species + factions
- [ ] LLM infrastructure (schema validation, retry, progressive save)  
- [ ] Steps **3–5**: species, faction skeleton, faction identity  

### Session I — Homes, territory, stations
- [ ] Steps **6–7**, **8a–8b**: homes, territorial growth, relationships, station placement  

### Session J — Equipment catalog
- [ ] Step **9**: hull specs (incl. **`renderAnchors`** + procedural params), equipment, **`bulletSpecs`**  

### Session K — Missions + trees + projects
- [ ] Steps **10–12**: mission templates, mission trees, faction projects  

### Session L — Assembly + export
- [ ] Step **13**: assemble `WorldFile`, `validateWorldFile`, save to world list / export  

---

## After Phase 9 (ordered, unnumbered)

### Portable saves (world-linked)
- [ ] Single serializer for `localStorage` + file export/import  
- [ ] Export/import UI; seed match; conflict policy  
- [ ] Coarser disk writes; round-trip tests  

### Economy and missions (depth)
- [ ] `CargoItem` model; kill / waypoint mission types  
- [ ] Equipment shop UI units (`t`, `kTU`)  
- [ ] Mission tree depth; trade economy (after cargo)  

### Equipment and combat flavour
- [ ] Exotic equipment (cloak, ECM, drones, …)  
- [ ] Disabled ship state + boarding  

---

## Future — Phase 10 (world gen v2)

- [ ] Wildlife factions  
- [ ] Ancient ruins (hidden landables, sensor-gated)  
- [ ] Shimmer zones (ambient damage, salvage)  
- [ ] Faction projects at varied start progress  
- [ ] LLM response caching by seed/step  

---

## Future — Phase 11 (fleet)

- [ ] Fleet ownership (~5 ships), persistence  
- [ ] Fleet landing + hyperspace (weakest drive, align all ships)  
- [ ] Guard mode; escort customize/insurance  

---

## Future — Phase 12 (neural AI gameplay)

- [ ] Sensor array stats; neural brain + memory cards in play  
- [ ] Training simulator landable service; autopilot modes  
- [ ] Pre-trained cards in generated worlds (Phase 10+)  

---

## Future — Phase 13 (presentation polish)

- [ ] Sound (Web Audio)  
- [ ] Engine glow / damage VFX (beyond procedural hull layers)  
- [ ] Settings (incl. game-time rate)  
- [ ] World sharing UX  

*Procedural drawing is Phase 6; galaxy/HUD tweaks are Phase 7.*

---

## Cross-cutting (any phase)

- [ ] Coverage reporting in CI  
- [ ] E2E tests (Playwright)  
- [ ] Performance profiling (busy sectors / fleet)  
- [ ] Save format versioning  
- [ ] Accessibility pass  

---

## Out of scope

- Multiplayer  
- Mobile / VR  
- Real-money transactions  
- NPC **fleets** (single-ship NPCs until Phase 11)  
- Reputation decay (unless design revisits)  

---

## Parked ideas

Not scheduled. Long form: **`plan/PARKED_IDEAS_DETAIL.md`**.

---

*Last updated **2026-05-09** — phases 5–13 renumbered (achievements → procedural → UI → balance → worldgen).*

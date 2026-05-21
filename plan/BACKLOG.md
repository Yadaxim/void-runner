# VOID RUNNER — Delivery checklist

> **Single source of truth** for what is shipped vs what is next. Update this file when priorities change; add a short bullet to **`plan/CONTEXT.md` → Last changes** for notable behaviour shifts. Design detail: **`plan/GDD.md`**. Runtime handoff: **`plan/CONTEXT.md`**.

---

## Status snapshot

**Playable today:** flight, combat (player/NPC parity), sectors, landables, missions, reputation, insurance, equipment store, shipyard, galaxy map, hyperspace jumps, torus wrap, saves via `localStorage`, Vitest coverage, `validateWorldFile`.

**Pre-gen foundation (Phase 4.5 A–F):** complete — species/factions data, multi-faction landables, game time + mission trees, NPC combat parity, map + hyperspace.

**Current focus:** **Phase 5** — offline world generator MVP (`plan/worldgen/` docs).

**Hygiene:** When `public/testWorld.json` hull lists change, keep `simulation.test.ts` / fixtures aligned with `shipyardListings` and `startingConditions`.

---

## Delivery order (future stages)

| Order | Phase | Theme |
|-------|--------|--------|
| **Now** | **5** | World generator MVP (procedural + LLM pipeline → playable `WorldFile`) |
| Next | — | Portable JSON saves (after gen MVP; see below) |
| Then | **6** | World gen v2 (ruins, shimmer, wildlife, gen caching, …) |
| Then | **7** | Fleet (multi-ship, guard mode, fleet hyperspace) |
| Then | **8** | Neural AI gameplay (escort brains, training simulator, autopilot) |
| Then | **9** | Polish (audio, hull silhouettes, settings, world sharing UX) |

Parallel work that does not block Phase 5: **ship/archetype tuning** (`plan/ARCHETYPE_CHECKLIST.md`), **combat/economy depth** (cargo, kill missions, …).

---

## Done — core loop (Phases 1–3)

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

---

## Done — Phase 4.5 (pre-gen foundation)

### Session A — NPC battle parity
- [x] NPC shields, armour, reactor/joules, spawn loadouts, shared damage resolution  

### Session B — Torus topology
- [x] Sector wrap, torus distance/hops, minimap seam cue  

### Session C — Galaxy map + hyperspace (data/UI baseline)
- [x] Covered under Phase 4 above  

### Session D — Species + faction extensions
- [x] `WorldFile.species`, faction `type` / composition / home / bubble / tech archetype; validation + `testWorld`  

### Session E — Multi-faction landables
- [x] `factionControl[]`, `controlState` (sole/treaty/cooperation/dispute); UI, economy, NPC local rules  

### Session F — Game time + mission trees
- [x] `gameTime` (frozen while docked); stardate HUD; `MissionTreeTemplate` runtime; example tree in `testWorld`  

### AI control bus (pre-neural)
- [x] `ShipControlFrame`, `applyShipControlFrame`, pilots, record/replay, neural encode/decode stub (`shipControlNeural.ts`, `NeuralPilot`)  

### Combat data model
- [x] Bullet **`matterType`** + stackable **`abilities`** (`seeking`, `dot`, `knockback`, `ballistic`, `explosive`); armour four matter reductions — see **`plan/worldgen/WEAPONS_WORLDGEN.md`**  

### Ship archetypes (partial)
- [x] **Interceptor (`interceptor_mk1`)** — raw/basic/advanced in `testWorld`; documented in **`plan/ARCHETYPE_CHECKLIST.md`**  
- [x] **Shuttle (`shuttle_mk1`)** — in `testWorld` as starter hull; archetype checklist not closed  

---

## Next — Phase 5: World generator MVP

Pipeline design: **`plan/worldgen/WORLDGEN.md`**. Weapons/bullets for step 9: **`plan/worldgen/WEAPONS_WORLDGEN.md`**.

> **Note:** `src/worldgen/pipeline.ts` still has **15 stub stages**; roadmap sessions **G–L** map to the **13-step** doc — reconcile when implementing.

### Session G — Shell + procedural galaxy
- [x] Main menu entry + **`WorldGenScreen`** (seed, name, progress UI)  
- [ ] Implement pipeline **step 1** (galaxy structure) and **step 2** (special sectors)  
- [ ] Galaxy-map **preview mode** for generated structure (no commit required)  

### Session H — Claude API + species + factions
- [ ] LLM infrastructure (schema validation, retry, progressive save)  
- [ ] Steps **3–5**: species, faction skeleton, faction identity  

### Session I — Homes, territory, stations
- [ ] Steps **6–7**, **8a–8b**: homes, territorial growth, relationship matrix, station placement  

### Session J — Equipment catalog
- [ ] Step **9**: hull specs, equipment catalog, **`bulletSpecs`** (templates + `WEAPONS_WORLDGEN` rules)  

### Session K — Missions + trees + projects
- [ ] Steps **10–12**: mission templates, mission trees, faction projects  

### Session L — Assembly + export
- [ ] Step **13**: assemble `WorldFile`, `validateWorldFile`, save to world list / export  

---

## Next — after Phase 5 (ordered)

### Portable saves (world-linked)
- [ ] Single serializer for `localStorage` + file export/import  
- [ ] Export/import UI; seed match; conflict policy  
- [ ] Coarser disk writes (sector, landable, loadout mutations, menu exit)  
- [ ] Round-trip tests  

### Economy and missions (depth)
- [ ] `CargoItem` model; kill / waypoint mission types  
- [ ] Equipment shop UI units (`t`, `kTU`)  
- [ ] Mission tree depth (`followUpMissions`, `priceHidden`, …)  
- [ ] Trade economy (after cargo)  

### Equipment and combat flavour
- [ ] Exotic equipment (cloak, ECM, drones, …)  
- [ ] Disabled ship state + boarding  
- [ ] More hull archetypes per **`plan/ARCHETYPE_CHECKLIST.md`**  

---

## Future — Phase 6 (world gen v2)

- [ ] Wildlife factions  
- [ ] Ancient ruins (hidden landables, sensor-gated)  
- [ ] Shimmer zones (ambient damage, salvage)  
- [ ] Faction projects at varied start progress  
- [ ] LLM response caching by seed/step  

---

## Future — Phase 7 (fleet)

- [ ] Fleet ownership (~5 ships), persistence  
- [ ] Fleet landing + hyperspace (weakest drive, align all ships) — *partial rule deferred in Session 6*  
- [ ] Guard mode; escort customize/insurance  

---

## Future — Phase 8 (neural AI gameplay)

- [ ] Sensor array stats; neural brain + memory cards in play  
- [ ] Training simulator landable service; autopilot modes  
- [ ] Pre-trained cards in generated worlds (generator step / Phase 6)  

---

## Future — Phase 9 (polish)

- [ ] Sound (Web Audio)  
- [ ] Distinct hull silhouettes (`plan/ART_GUIDELINES_V1.0.md`)  
- [ ] Engine glow / damage VFX  
- [ ] Settings (incl. game-time rate)  
- [ ] World sharing UX  

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
- NPC **fleets** (single-ship NPCs until Phase 7)  
- Reputation decay (unless design revisits)  

---

## Parked ideas

Not scheduled. Long form: **`plan/PARKED_IDEAS_DETAIL.md`**.

Promote when triggers are met — revisit wording for **matter-based weapons** (anti/dark/void matter exists; “energy weapons” means more catalog variety).

---

*Last updated **2026-05-09**.*

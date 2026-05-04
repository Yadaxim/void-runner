# VOID RUNNER — Backlog checklist

> Actionable checkboxes derived from **`plan/CONTEXT.md`** and **`plan/VOID_RUNNER_Roadmap.md`**. Check items off as you ship; keep this file in sync when priorities move. Detailed design stays in the GDD, WorldGen doc, art guidelines, and roadmap appendices.

---

## Phase 4 Session 4 — automated tests (complete)

Shipped checklist from roadmap **Now**; extend these tests again when combat, energy, physics, or world schema changes land in the same PR.

- [x] Extend **`damage.test.ts`** (layered damage, plasma DoT) as combat rules grow  
- [x] Extend **`shipEnergyShield.test.ts`** as reactor/shield rules grow  
- [x] Extend **`physics.test.ts`** (Newtonian / PRNG) as physics touchpoints grow  
- [x] Keep **`validateWorldFile`** and **`world-validation*.test.ts`** aligned with schema changes (including **`bulletSpecs.abilities`**)  

---

## Phase 4 Session 5 — Galaxy map

From roadmap **Navigation slice** and context **Session 5**.

- [x] Galaxy map screen (full-sector view)  
- [x] Visited-sector state on the map  
- [x] Faction colouring on the map  
- [x] Radiation zone overlay  
- [x] Hyperspace **target selection** UI (jump rules may stay stubbed until Session 6)  

---

## Galaxy map — UI polish (complete)

Derived from **`plan/RandomToughts.md`** (local notes; file gitignored). Shipped in **`GalaxyMapScreen`** / **`HudRenderer`**.

- [x] **Square cells** — keep sector tiles square (letterbox or pad the map region so grid cells are not stretched rectangles).  
- [x] **Visited + landables** — when visited, visually separate sectors **with** vs **without** landables; optional **per-landable dots** inside the cell so corridor density reads at a glance.  
- [x] **Legend: current / cursor / target** — show **current sector**, **cursor**, and **hyperspace target** coordinates explicitly in the legend (not only outlines on the grid).  
- [x] **Right pane: sector summary** — for the **selected** (cursor) sector, show a short summary: coordinates, controlling faction, list of **landable names** (scroll if needed).  
- [x] **Flight HUD: hyperspace near targets** — show hyperspace target alongside **ship target** and **landable target** in the main flight UI (target strip / HUD), not only in the sector telemetry line.  
- [x] **Visited sectors + landable dots** — every visited sector **with** landables shows one dot per port (up to nine); single port is centered; none when count is zero.  
- [x] **Color legend — left pane** — **left** pane **map key**: neutral tile, unvisited veil, visited empty, radiation overlay, landable dots, sample faction tints, outline meanings (you / cursor / hyperspace target).  
- [x] **Layout — map centered, two side panes** — **center column** grid with **left** (color key) and **right** (controls + positions + sector summary); narrow canvas trims pane widths to keep a minimum map width.  
- [x] **Right pane — keybinds vs positions** — **CONTROLS** block separate from **POSITIONS** block; **SELECTED SECTOR** remains below.  

---

## Phase 4 Session 6 — Hyperspace drive

From roadmap **Navigation slice** and context **Session 6**.

- [x] Jump toward galaxy-map target along grid ray; **partial hops** when target farther than drive **range** (Euclidean sector units); otherwise land on target sector  
- [x] Fuel cost per jump (from equipped **`hyperspaceDrive`**)  
- [x] Cooldown between jumps (career **`playTimeSeconds`**, persisted)  
- [x] Jump **range** from drive spec (`jumpRange`); **no drive → no jump**  
- [x] Jump **animation** (camera streak out + arrival streak in + radial flash); no separate alignment gate  
- [ ] **Fleet:** all ships align heading before jump; weakest drive limits range — *deferred until fleet ownership exists*  

---

## AI control bus (keypress / pre-neural)

Roadmap steps A–E; aligns with context **AI / control bus**.

- [ ] **Step A —** Canonical **`ShipControlFrame`** (or rename **`NPCInputs`**); **`NPCController.update`** return type; **`FlightScreen`** maps keys → same struct  
- [ ] **Step B —** **`applyShipControlFrame(ship, frame, worldState, dt)`** for player and NPC paths  
- [ ] **Step C —** **`Pilot` / `getControlFrame`**: **`HumanPilot`**, **`ScriptedNPCPilot`** (wraps NPC controller); stub path for future **`NeuralPilot`**  
- [ ] **Step D —** Record/replay: ring buffer or export **`(timestamp, frame[, sensor])`**; headless replay for determinism / datasets  
- [ ] **Step E —** Neural adapter: output dim = control frame; threshold to booleans; loadout staleness; training simulator uses same frame format  

---

## Economy and missions (depth)

Roadmap **Economy and missions**; Appendix A sketches when implementing.

- [ ] **Cargo:** replace minimal mission cargo with **`CargoItem`** model (Appendix A)  
- [ ] **Missions:** kill-target type; sector **`missionSpawnRules`** / temporary NPCs; extend **`MissionTargetType`** with **`'kill'`** (and later **`'waypoint_visit'`**)  
- [ ] **Mission chains/trees:** **`followUpMissions`**, branch copy; **`priceHidden`** on templates + UI payoff **`???`** until complete  
- [ ] **Waypoints:** fly-close/slow visit targets; ring + label + “waypoint reached”; **`SectorMetadata.waypoints`** or mission-spawned temporary waypoints  
- [ ] **Trade economy:** speculative cargo (supply/demand) **after** **`CargoItem`**  

---

## Equipment and combat flavour

Roadmap **Equipment and combat flavour**.

- [ ] Exotic equipment mechanics as ready (thruster enhancer, electric drive, solar panels, H₂ scoop, extra cargo slot, ECM, repair drone, cloak, tractor beam)  
- [ ] **Disabled ship state** (hull 0 → disabled buffer, coast, no weapons, VFX; then explosion) — **`disabledHP`**, **`isDisabled`** on **`ShipState`**  
- [ ] **Boarding** (after disabled ships + short design pass): proximity, loot/capture/intel, timers, rep  
- [ ] **Trophies:** zero-weight **`cargoType: 'trophy'`**; collection tab when ship status UI exists  

---

## Fleet and escorts

Roadmap **Fleet and escorts**.

- [ ] Fleet ownership (cap ~5), multi-ship persistence  
- [ ] Fleet landing (all slow/close)  
- [ ] Hyperspace confirmation with fleet rules (ties Session 6)  
- [ ] Escort **guard mode** (follow + combat handoff)  
- [ ] Escort insurance (parallel to player where sensible)  

---

## World generator (offline)

Roadmap **World generator**; pipeline detail in **`plan/VOID_RUNNER_WorldGen.md`**.

- [ ] Generator entry from main menu: new / load / import / export world JSON; progress UI for long runs  
- [ ] Implement pipeline (spiral density, text passes, validation, export) per WorldGen doc  
- [ ] Pre-trained memory cards: headless sim + TF.js in generator; embed weights in world file  

---

## Persistence — portable JSON saves (world-linked)

From roadmap **Persistence and portable saves** and **`plan/VOID_RUNNER_GDD.md`**. Same logical data as **`PersistedWorldState`** + today’s **`SaveMetadata`** fields; keyed to world **`metadata.seed`**.

- [ ] **Single serializer** — one code path builds the save JSON object (and parses/validates on load) used by both **`localStorage`** and file I/O; avoid drift between formats.  
- [ ] **Export save** — main menu or load-game UI: download a **`.json`** (envelope + `PersistedWorldState`); filename encodes seed (and optional pilot/world name).  
- [ ] **Import save** — file picker: validate JSON, **seed matches** loaded / selected world, then **`WorldState`** hydrate + write **`localStorage`** so the existing resume path keeps working.  
- [ ] **Conflict policy** — define behaviour when both imported file and **`localStorage`** exist (e.g. compare envelope **`savedAt`**, or “import overwrites”). Document in code comment + GDD.  
- [ ] **Coarser disk writes** — when user has granted a **File System Access** file handle (or after export path TBD), flush file on: **sector transition**, **landable `onEnter` / exit to flight**, **credits / equipment / fuel / repair / insurance** mutations that already call save, **galaxy map hyperspace target** set/clear, **exit to main menu**, **`beforeunload`** / **`visibilitychange`** (best-effort); **not** every `localStorage` call.  
- [ ] **Tests** — round-trip fixture: serialize → parse → `loadFromLocalStorage`-equivalent apply; reject wrong-seed import.  

---

## Neural AI (gameplay)

Roadmap **Neural AI**.

- [ ] Sensor array input resolution/range as equipment stats  
- [ ] Neural brain + memory card equipment; swappable weights; worker-based training  
- [ ] Training simulator landable service: record sessions; Follow / Combat / Flee; staleness on loadout change  
- [ ] Autopilot toggle and mode switching (player + escorts)  
- [ ] **AI developer sandbox:** separate entry, AI vs AI, balance tooling, imitation-learning path, optional tournament mode  

---

## Polish and presentation

Roadmap **Polish and presentation**.

- [ ] Sound — Web Audio API (engines, weapons, UI)  
- [ ] Visual variety — distinct hull silhouettes per class (**`plan/VOID_RUNNER_Art_Guidelines_v1.0.md`**)  
- [ ] Engine glow and damage VFX for readability  
- [ ] World sharing UX — export/import discoverability  

---

## Explicit non-goals (reminder)

From roadmap; **not** backlog tasks — do not implement unless design explicitly revisits.

- Multiplayer  
- NPC fleets (until fleet tech)  
- Reputation decay (unless design revisits)  
- Energy/void exotic **content** (types exist; content when balancing needs it)  

---

*Last aligned with **`plan/CONTEXT.md`** and **`plan/VOID_RUNNER_Roadmap.md`**. Update both those files and this checklist when delivery order changes.*

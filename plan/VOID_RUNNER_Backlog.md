# VOID RUNNER — Backlog checklist

> Actionable checkboxes derived from **`plan/CONTEXT.md`** and **`plan/VOID_RUNNER_Roadmap.md`**. Check items off as you ship; keep this file in sync when priorities move. Detailed design stays in the GDD, WorldGen doc, art guidelines, and roadmap appendices.

---

## Ongoing (Phase 4 Session 4+)

Maintenance and expansion called out in context and roadmap **Now** section.

- [ ] Extend **`damage.test.ts`** (layered damage, plasma DoT) as combat rules grow  
- [ ] Extend **`shipEnergyShield.test.ts`** as reactor/shield rules grow  
- [ ] Extend **`physics.test.ts`** (Newtonian / PRNG) as physics touchpoints grow  
- [ ] Keep **`validateWorldFile`** and **`world-validation*.test.ts`** aligned with schema changes (including **`bulletSpecs.abilities`**)  

---

## Phase 4 Session 5 — Galaxy map

From roadmap **Navigation slice** and context **Session 5**.

- [ ] Galaxy map screen (full-sector view)  
- [ ] Visited-sector state on the map  
- [ ] Faction colouring on the map  
- [ ] Radiation zone overlay  
- [ ] Hyperspace **target selection** UI (jump rules may stay stubbed until Session 6)  

---

## Phase 4 Session 6 — Hyperspace drive

From roadmap **Navigation slice** and context **Session 6**.

- [ ] Jump only to **visible** sectors on the galaxy map (skip intermediates)  
- [ ] Fuel cost per jump  
- [ ] Cooldown between jumps  
- [ ] Jump range by drive tier  
- [ ] Alignment requirement + jump animation  
- [ ] **Fleet:** all ships align heading before jump; weakest drive limits range  

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

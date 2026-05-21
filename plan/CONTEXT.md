# VOID RUNNER — Project context

> Single handoff document for new sessions (`plan/CONTEXT.md`). Detailed design lives in `plan/GDD.md`, `plan/WORLDGEN.md`, and **`plan/ART_GUIDELINES_V1.0.md`** (visual / renderer spec). Optional session prompts live in repo-root **`claudePrompts/`** (gitignored — keep a local copy; not authoritative for “what’s done”).

---

## What this is

A 2D browser-based space trading and combat game inspired by Escape Velocity (Ambrosia Games, 1996). The player is a freelance pilot in a procedurally authored galaxy: emergent story through missions, reputation, combat, and (later) fleet and trainable ship AI.

**Defining features**

- Newtonian physics — momentum, thruster forces, gravity  
- Equipment-driven ship behaviour — physics and combat read live from installed items  
- Layered damage — shield → armour layers → hull (**same rules for player and NPC**; see **Ships: damage & resources** below)  
- Energy economy — fuel → reactor → Joules → shields (and future energy weapons); **NPCs use the same tick and equipment rules**  
- World file at runtime — no API calls during play; optional Claude API **only** in the offline world generator  
- Faction reputation with per-action floors and ceilings  
- **Future:** trainable escort AI (TensorFlow.js), fleet command, hyperspace, trade economy  

**Target platform:** browser — TypeScript, HTML5 Canvas 2D, Vite. No game engine, no UI framework, no raster art assets (procedural drawing).

---

## Tech stack

| Area | Choice |
|------|--------|
| Language / build | TypeScript (strict), Vite |
| Rendering | HTML5 Canvas 2D, layered pipeline |
| Physics | Custom Newtonian (`src/physics/newtonian.ts`) |
| Persistence | `localStorage` (frequent); **planned:** same snapshot as JSON file (portable / device change) with coarser disk writes — see **Persistence (two-tier)** below |
| Neural net (planned) | TensorFlow.js |
| World text generation (planned) | Claude API in generator only |

Vanilla DOM — no React/Vue.

---

## Where to read more

| File | Contents |
|------|----------|
| `plan/README.md` | Directory index for **`plan/`** (canonical vs supplementary docs) |
| `plan/CONTEXT.md` | This document — paste for new sessions; runtime architecture and priorities |
| `plan/GDD.md` | Game design (persistence section live; expand other topics as needed) |
| `plan/WORLDGEN.md` | Full generator pipeline — schemas per step, procedural vs LLM, progressive save, assembly into `WorldFile` |
| `plan/ART_GUIDELINES_V1.0.md` | Visual design, renderer spec |
| `plan/ROADMAP.md` | Delivery order, deferred type sketches, and world-gen guidelines |
| **`plan/BACKLOG.md`** | **Checklist** of planned work (kept in sync with this file and the roadmap) |
| **`plan/PARKED_IDEAS_DETAIL.md`** | Long-form **parked** ideas (What/Trigger); summary in **`plan/BACKLOG.md`** § Parked ideas |
| **`PLAYER_GUIDE.md`** (repo root) | Pilot-facing primer (controls, map, hyperspace, missions); not a design spec |
| `claudePrompts/` (repo root, gitignored) | Optional per-task prompts and notes; not committed |

---

## Last changes

Short dated bullets when behaviour or priorities shift — complements **`plan/BACKLOG.md`** checkboxes.

- **2026-05-09** — **Bullet model refactor:** `damageCategory` removed; `BulletSpec` uses `matterType` + stackable `abilities` (`seeking`, `dot`, `knockback`, `ballistic`, `explosive`); armour `reductions` are four matter keys only; explosive splash with separate `splashDamage`; see **`plan/WEAPONS_WORLDGEN.md`**.  
- **2026-05-09** — **Phase 4.5 Session F shipped:** in-game **`gameTime`** (`epoch` + `rate`, default 60:1) via **`tickTime`** in flight/hyperspace only — **paused while docked**; stardate on flight HUD + landable header. **`MissionTreeTemplate`** / **`missionTrees`** with prerequisites, completion, and **`finalConsequences`**; mission board refresh uses game-time; example tree **`tree_fed_border_accord`** (“Border Accord”) in **`testWorld.json`**. Landable UI: mission titles show arc name not tree id; header/mission-list layout fixes.  
- **2026-05-09** — **Phase 4.5 Session E shipped:** landables use **`factionControl[]`** + **`controlState`** (`sole` / `treaty` / `cooperation` / `dispute`) instead of **`factionId`**; validation + **`testWorld.json`** examples; UI/economy/mission weighting/minimap/station tint; local NPC hostility overrides per control state.  
- **2026-05-09** — **Phase 4.5 Session D shipped:** added **`WorldFile.species`** / **`Species`** model and faction extensions (**`type`**, **`speciesComposition`**, **`homeLandableId`**, **`bubbleStance`**, **`techArchetype`**). **`validateWorldFile`** now checks species IDs, species archetypes / habitats, faction composition totals and references, bubble stance / faction type enums, and home-landable rules. **`testWorld.json`** contains example species + updated factions; validation tests cover the new invariants.  
- **2026-05-09** — **Targeting:** Tab cycles NPC ships by distance; **Shift+Tab** locks closest NPC hostile to the player, else closest non-threat (`none` / `toOther`). **Minimap:** accent ring + crosshair on the locked ship target (`minimapRenderer`, `TargetingSystem`). **NPC combat:** hostile aim deadband + weapon-range rotation pulse tuning (`NPC_HOSTILE_AIM_*`, `npcController`). **Galaxy:** torus wrap + shortest-path hop math (`hyperspaceJump`, `sectorNav`); **`testWorld.json`** tuned for interceptor combat visibility (edge start / hub spawns).  
- **2026-05-09** — **Docs:** removed `VOID_RUNNER_` filename prefix from core plan files (`GDD.md`, `ROADMAP.md`, `BACKLOG.md`, `WORLDGEN.md`, `ART_GUIDELINES_V1.0.md`); **`plan/RandomToughts.md`** unchanged (gitignored local notes).  
- **2026-05-09** — **`plan/GDD.md`:** merged full content from former **`gdd_additions_v0.5.md`** (expanded §§1–14 + open questions); additions file removed.  
- **2026-05-09** — **`plan/WORLDGEN.md`:** canonical generator doc is the former **`worldgen_pipeline_v2.0.md`** (570-line pipeline); removed duplicate bloated **`WORLDGEN.md`** (~1500 lines, accidental repeat). Filename **`worldgen_pipeline_v2.0.md`** dropped — use **`WORLDGEN.md`** only.

---

## Architecture (runtime)

- **`WorldState`** — single source of truth for runtime data. Screens and systems read/write through it; nothing should read the raw world JSON except loaders/validation.  
- **`WorldFile`** — full galaxy JSON loaded at startup (`public/testWorld.json` in development).  
- **Persistence (two-tier — planned)** — today, `WorldState.saveToLocalStorage` / `loadFromLocalStorage` persist **`PersistedWorldState`** keyed by world **`metadata.seed`**. **Roadmap / GDD / backlog:** add **JSON file** export/import (and optionally **File System Access** file-handle writes) using the **same blob**, with **disk** flushed on **fewer** events than `localStorage` (sector change, landable enter/exit, credit/equipment/fuel/hull–changing actions, hyperspace target on map, menu/quit best-effort). See **`plan/GDD.md`** (Persistence and saves) and **`plan/BACKLOG.md`**.  
- **`SectorSimulation`** — current sector entities, physics integration, bullets, NPCs, burns, **per-frame energy/shield/reactor tick for the player and every NPC** (`tickShipEnergyAndShield`).  
- **`ShipEntity`** — wraps `ShipState`; equipment drives effective masses, thrust, fuel use, etc. NPC flight uses **`NPCController`** via **`ScriptedNPCPilot`** into the shared **`ShipControlFrame`** (thrusters + weapon keys), same shape as **`HumanPilot`** for the player (see **AI / control bus**).  
- **`ScreenManager`** — stack-based screens (main menu, flight, landable, …).  
- **`RenderPipeline`** — ordered Canvas layers (see below).  
- **Camera** — ship-centred; `worldToScreen()` in `src/renderer/camera.ts`.

### Core invariants (do not casually break)

- **Ship-centred camera** — player ship stays at screen centre; everything else moves in world space.  
- **Newtonian motion** — no space drag; forces change velocity.  
- **Seeded PRNG** — `childPRNG(seed, domain)` from `src/core/prng.ts`; do not use `Math.random()` for gameplay.  
- **Procedural visuals** — geometric Canvas drawing, no image sprites.  
- **Layer render order** — nebulae → stars (four parallax layers) → landable glows → landables → bullet trails → bullets → engine glows → ship hulls → damage particles → explosions → HUD → UI panels.

### Equipment model

Items install into **typed slots** on the hull. No separate inventory: buying installs (subject to capacity and rules).

**Slot types** (representative): `thruster_forward`, `thruster_reverse`, `thruster_rotate`, `weapon`, `armour`, `fuelTank`, `reactor`, `shield`, `autoBrake`, `hyperspaceDrive`, `sensorArray`, `neuralBrain`, `memoryCard` (some are future-facing).

**Required slots:** `thruster_forward`, `thruster_rotate`, `fuelTank`.

Hull specs use **`defaultLoadouts`** (`raw` / `basic` / `advanced`) and optional **`slotCounts`**. Shipyard uses global **`shipyardListings`** and per-landable **`shipyard.listingIds`**.

### Ships: damage and resources (player + NPC)

Layered damage — **no carry-over** between layers; excess damage on a layer is discarded:

```text
Hit → shield (if online; no resistances on shield)
    → armour layer 0 … → armour layer N (per-type reduction profile)
    → hull
```

Damage typing: **`matterType`** (`normal` | `anti` | `dark` | `void`) on **`BulletSpec`**; armour **`reductions`** use the same four keys. Behaviours are **`abilities[]`** (`seeking`, `dot`, `knockback`, `ballistic`, `explosive`). Instant hits and DoT use **`resolveShipBulletDamage`** / **`applyMatterDotToShip`** in `src/combat/damage.ts`; **`WeaponSystem`** handles splash (no rep on splash), owner-only projectile skip. See **`plan/BULLET_MODEL_REFACTOR.md`**.

**Fuel, reactor, battery, shields:** **`tickShipEnergyAndShield`** in `src/sim/shipEnergyShield.ts` runs each frame in **`SectorSimulation.update`** for the **player ship and every NPC** (reactor charges from fuel, shield reboot timer, shield HP regen from joules — same rules as each other). NPC spawn fills **`armourLayers`**, shield HP, **`currentJoules`**, and **full fuel** from the NPC loadout via **`WorldState.getCombatStateFromEquipmentSlots`**.

**`FlightScreen`** syncs **`currentJoules`**, **`currentShieldHP` / `maxShieldHP`**, **`shieldRebooting` / `shieldRebootTimer`**, **`lastHitTime`**, and **`armourLayers`** into **`WorldState`** each tick so landables/HUD/save see the same values as the live **`ShipEntity`**.

### AI / control bus (keypress parity, pre-neural)

**Design rule:** Any pilot — human, hand-authored NPC, or future trained net — should ultimately drive the ship **only** through the same **boolean control frame** (forward/reverse/rotate/auto-brake + per-weapon fire keys). Canonical type: **`ShipControlFrame`** in `src/simulation/shipControlFrame.ts` (`thrusters` + `weapons`); **`NPCController.update`** returns that type; **`applyShipControlFrame`** applies thrusters; **`WeaponSystem`** consumes `frame.weapons`. **`HumanPilot`** / **`ScriptedNPCPilot`** implement **`Pilot`** (`src/simulation/pilot.ts`); **`NeuralPilotStub`** returns a zero frame until TF.js wiring lands.

Roadmap section **“AI control bus (keypress / pre-neural)”** lists concrete steps: canonical shared type, single apply entry, record/replay, NN adapter. Steps A–C are implemented; **D** has a **`ControlFrameRecorder`** ring buffer + stub **`replayControlFramesHeadless`** (`src/simulation/controlFrameRecorder.ts`). That path supports imitation learning and escort brains without a second physics stack.

---

## World authoring and code hygiene

These rules avoid brittle coupling to `testWorld.json`:

- **`npcSpawnRules`** must set **`hullSpecId`** present in **`hullSpecs`** (`validateWorldFile` enforces this). Sector NPC build does not infer hull from `factionId` alone.  
- Pirate landable/mission UI uses **`FactionDefinition.isPirate`** and the station’s real **`factionId`**.  
- Bullet muzzle offset uses **`HullSpec.hullClass`** via **`hullLengthForHullClass`** in `constants.ts`, not string hacks on `hullSpecId`.  
- **`bulletSpecs`:** homing uses **`abilities`** with **`{ "type": "seeking", "turnRatio": <rad/s> }`** (optional **`"abilities": []`** when none). Runtime reads homing only from **`abilities`**.  
- Tests should use ids from a loaded **`WorldFile`** or synthetic **`__fixture_*`** ids.

**Equipment catalog:** every catalog item needs a positive **`price`** (credits). Buy/sell use that field; sell uses **`Math.round(price × EQUIPMENT_SELL_FRACTION)`**.

**Copy:** landable Overview prefers **`landable.description`**; pirate stations fall back to faction **`description`** / **`missionFlavour`** from the world file — avoid hardcoded faction names in `landableScreen.ts`.

**Shipyard / equipment UI:** list panels use clipped viewport + wheel/keyboard scroll and hit-testing for visible rows only (same pattern as equipment store). Tab order in the main render path should match the tab strip (shipyard before equipment). **`hasService('shipyard')`** is true when **`shipyard.listingIds`** and/or **`services`** contains `{ type: 'shipyard' }`. Training simulator uses distinct placeholder copy so it is not mistaken for shipyard content.

**World validation:** shared UI for validation messages (`src/world/validation-ui.ts`); tests include boundary cases; in DEV, bundled `testWorld.json` should fail fast if invalid.

---

## Reputation (summary)

Per faction, roughly −100 … +100. Floors/ceilings by event kind (e.g. combat hit floor, combat kill floor, mission complete ceiling). Pirate reputation is derived from non-pirate factions. Stores and landing prices react to standing; Standing tab + HUD show state.

---

## Implemented vs remaining (high level)

Authoritative detail lives in the checklist below (historical handoff content from older context docs was merged into this file; keep this section current as you ship).

**Done (abbreviated):** Phase 1 flight + landing; Phase 2 world/sector transitions, minimap, radiation core, saves; Phase 3 combat, NPCs, reputation, insurance, armour typing; **player/NPC parity on damage, armour layers, shields, reactor/joules, fuel, and per-tick energy shield regen**; **unified bullet + plasma DoT resolution**; missions + cargo, equipment store, shipyard purchase/customize, main menu, starting conditions from JSON, validation plumbing, many combat/NPC/traffic fixes; **bullet `abilities`** (e.g. **`SeekingAbility`** on `BulletSpec`) with runtime in **`getBulletSeekingAbility`** / **`BulletEntity`**; **world validation** for bullet **`abilities`** shape; **Phase 4 Session 4 Vitest pass** — expanded **`damage.test.ts`**, **`shipEnergyShield.test.ts`**, **`physics.test.ts`**, **`world-validation.test.ts`**; **Phase 4 Session 5 galaxy map** — **`GalaxyMapScreen`** (**K** in flight, Esc/K closes), square grid, visited dimming + visited-empty vs ports (interior dots), faction colours, radiation tint, legend **You/Cursor/Target**, **sector summary** pane for cursor, persisted **`hyperspaceTargetCoord`**, flight **target strip** third row for hyperspace; **Phase 4 Session 6 hyperspace jump** — **`hyperspaceDrive`** equipment + hull **`slotCounts`**, **`hyperdrive_basic`** in **`testWorld.json`**, hop along grid ray with **partial hops** when target exceeds **`jumpRange`** (Euclidean sector units), **fuel** and **cooldown** on career **`playTimeSeconds`** (persisted), **J** in **`FlightScreen`** when aligned; **galaxy map** shows **one-hop range** tint + ring; **HUD** edge beacon + **`[ J ]`** prompt; jump start **snaps hull** to bearing and **zeros velocity**; **`computeHyperspaceLandingSector`** / **`getHyperspaceHopWorldDirection`** in **`src/sim/hyperspaceJump.ts`**. **Phase 4.5 foundation complete:** through **Session F** (species/faction data, multi-faction landables, game time + mission trees). **Next:** Phase 5 world generator MVP. Ongoing **NPC pilot** parity (rotation pulse, aim deadband).

**Remaining near-term (from live checklist):**

- **Session 6 (fleet extension):** multi-ship hyperspace rules (align fleet, weakest drive) when **fleet ownership** exists — **`plan/BACKLOG.md`**.  
- **World generator (offline):** main-menu entry, pipeline per WorldGen doc, pre-trained memory cards — **`plan/BACKLOG.md`**.  
- **Portable saves (JSON file, world-linked):** backlog order is **after** world generator; export/import and optional file-handle autosave — roadmap, GDD persistence section, **`plan/BACKLOG.md`**.  
- **Ongoing:** when behaviour changes, extend the Session 4 test files and **`validateWorldFile`** in the same change. **`validateWorldFile`** also ensures ship loadouts (hull **`defaultLoadouts`**, **`startingConditions`**, **`shipyardListings`**, named **`defaultLoadouts`**) match **`slotCounts`**, reference real catalog items, fill required slot types, and keep Σ equipped **`mass`** ≤ hull **`equipmentCapacity`** after **`expandSlotsToFullHull`**.

See **`plan/ROADMAP.md`** for delivery order and deferred design appendices; use **`plan/BACKLOG.md`** for the actionable checklist.

---

## Key type locations

Primary definitions under `src/types/`: `WorldFile`, `SectorMetadata`, `ShipState`, `HullSpec`, equipment unions, **`BulletSpec`** (optional **`abilities`**: **`SeekingAbility`** and future **`BulletAbility`** variants), **`BulletInstance`**, mission/cargo types, `TargetState`, faction types, etc.

---

## Historical merge note (nothing dropped)

Earlier handoff docs contributed the following, all folded into sections above: **render layer order**; **PRNG** rule; **world vs hardcoded IDs**; **equipment `price`** and sell formula; **pirate overview** copy rule; **shipyard** UI/service notes; **validation** / DEV hard-fail; **tab order**; **NPC spawn `hullSpecId`** validation; **Phase 4** session checklist granularity; **defining features**; **document map** under `plan/`; **`SectorSimulation` / `ShipEntity` / `ScreenManager`**; **slot-type list**; **damage and energy** behaviour; **shield reboot**; **spawn rule fields**; **reputation caps**; **Phase 3 extras** (traffic, minimap hostility colours, etc.).

---

*Use this file as the single live project handoff; update it when behaviour or priorities change.*

# VOID RUNNER — Project context

> Single handoff document for new sessions (`plan/CONTEXT.md`). Detailed design lives in `plan/VOID_RUNNER_GDD.md` and `plan/VOID_RUNNER_WorldGen.md`. Optional session prompts live in repo-root **`claudePrompts/`** (gitignored — keep a local copy; not authoritative for “what’s done”).

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
| Persistence | `localStorage` (save + world selection) |
| Neural net (planned) | TensorFlow.js |
| World text generation (planned) | Claude API in generator only |

Vanilla DOM — no React/Vue.

---

## Where to read more

| File | Contents |
|------|----------|
| `plan/CONTEXT.md` | This document — paste for new sessions; runtime architecture and priorities |
| `plan/VOID_RUNNER_GDD.md` | Full game design |
| `plan/VOID_RUNNER_WorldGen.md` | Generator pipeline, PRNG domains, export format |
| `plan/VOID_RUNNER_Art_Guidelines_v1.0.md` | Visual design, renderer spec |
| `plan/VOID_RUNNER_Roadmap.md` | Delivery order, backlog, deferred type sketches, and world-gen guidelines |
| `claudePrompts/` (repo root, gitignored) | Optional per-task prompts and notes; not committed |

---

## Architecture (runtime)

- **`WorldState`** — single source of truth for runtime data. Screens and systems read/write through it; nothing should read the raw world JSON except loaders/validation.  
- **`WorldFile`** — full galaxy JSON loaded at startup (`public/testWorld.json` in development).  
- **`SectorSimulation`** — current sector entities, physics integration, bullets, NPCs, burns, **per-frame energy/shield/reactor tick for the player and every NPC** (`tickShipEnergyAndShield`).  
- **`ShipEntity`** — wraps `ShipState`; equipment drives effective masses, thrust, fuel use, etc. NPC flight uses **`NPCController`** output as a **boolean control frame** (thrusters + weapon keys), same shape the player uses conceptually (see **AI / control bus**).  
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

Damage typing: `DamageCategory` × `MatterType` → **`DamageTypeKey`** (13 keys + `void`; see types under `src/types/`). Armour holds per-key flat reduction (negative = vulnerability). Instant hits and plasma DoT use **`resolveShipBulletDamage`** and **`applyPlasmaDotToShip`** in `src/combat/damage.ts`, invoked from **`WeaponSystem`**. Shield absorption gating uses **`WorldState.isShieldOnlineForShip(ship)`**.

**Fuel, reactor, battery, shields:** **`tickShipEnergyAndShield`** in `src/sim/shipEnergyShield.ts` runs each frame in **`SectorSimulation.update`** for the **player ship and every NPC** (reactor charges from fuel, shield reboot timer, shield HP regen from joules — same rules as each other). NPC spawn fills **`armourLayers`**, shield HP, **`currentJoules`**, and **full fuel** from the NPC loadout via **`WorldState.getCombatStateFromEquipmentSlots`**.

**`FlightScreen`** syncs **`currentJoules`**, **`currentShieldHP` / `maxShieldHP`**, **`shieldRebooting` / `shieldRebootTimer`**, **`lastHitTime`**, and **`armourLayers`** into **`WorldState`** each tick so landables/HUD/save see the same values as the live **`ShipEntity`**.

### AI / control bus (keypress parity, pre-neural)

**Design rule:** Any pilot — human, hand-authored NPC, or future trained net — should ultimately drive the ship **only** through the same **boolean control frame** (forward/reverse/rotate/auto-brake + per-weapon fire keys). **`NPCInputs`** in `src/simulation/npcController.ts` is documented as that interchange format; **`ShipEntity.applyThrusterInputs`** already consumes the thruster subset; sector weapon updates consume the fire-key subset.

Roadmap section **“AI control bus (keypress / pre-neural)”** lists concrete steps: canonical shared type, single apply entry, record/replay, NN adapter. That path supports imitation learning and escort brains without a second physics stack.

---

## World authoring and code hygiene

These rules avoid brittle coupling to `testWorld.json`:

- **`npcSpawnRules`** must set **`hullSpecId`** present in **`hullSpecs`** (`validateWorldFile` enforces this). Sector NPC build does not infer hull from `factionId` alone.  
- Pirate landable/mission UI uses **`FactionDefinition.isPirate`** and the station’s real **`factionId`**.  
- Bullet muzzle offset uses **`HullSpec.hullClass`** via **`hullLengthForHullClass`** in `constants.ts`, not string hacks on `hullSpecId`.  
- Tests should use ids from a loaded **`WorldFile`** or synthetic **`__fixture_*`** ids.

**Equipment catalog:** every catalog item needs a positive **`price`** (credits). Buy/sell use that field; sell uses **`Math.round(price × EQUIPMENT_SELL_FRACTION)`** — legacy mass×tier formulas were removed from constants.

**Copy:** landable Overview prefers **`landable.description`**; pirate stations fall back to faction **`description`** / **`missionFlavour`** from the world file — avoid hardcoded faction names in `landableScreen.ts`.

**Shipyard / equipment UI:** list panels use clipped viewport + wheel/keyboard scroll and hit-testing for visible rows only (same pattern as equipment store). Tab order in the main render path should match the tab strip (shipyard before equipment). **`hasService('shipyard')`** is true when **`shipyard.listingIds`** and/or **`services`** contains `{ type: 'shipyard' }`. Training simulator uses distinct placeholder copy so it is not mistaken for shipyard content.

**World validation:** shared UI for validation messages (`src/world/validation-ui.ts`); tests include boundary cases; in DEV, bundled `testWorld.json` should fail fast if invalid.

---

## Reputation (summary)

Per faction, roughly −100 … +100. Floors/ceilings by event kind (e.g. combat hit floor, combat kill floor, mission complete ceiling). Pirate reputation is derived from non-pirate factions. Stores and landing prices react to standing; Standing tab + HUD show state.

---

## Implemented vs remaining (high level)

Authoritative detail lives in the checklist below (historical handoff content from older context docs was merged into this file; keep this section current as you ship).

**Done (abbreviated):** Phase 1 flight + landing; Phase 2 world/sector transitions, minimap, radiation core, saves; Phase 3 combat, NPCs, reputation, insurance, armour typing; **player/NPC parity on damage, armour layers, shields, reactor/joules, fuel, and per-tick energy shield regen**; **unified bullet + plasma DoT resolution**; missions + cargo, equipment store, shipyard purchase/customize, main menu, starting conditions from JSON, validation plumbing, many combat/NPC/traffic fixes.

**Remaining near-term (from live checklist):**

- Phase 4 Session 4 **remaining:** physics unit tests (Vitest); extend damage / energy tests as systems grow.  
- **Session 5:** galaxy map — visited sectors, factions, radiation zone, hyperspace target selection UI.  
- **Session 6:** hyperspace drive — jump cost, cooldown, alignment, animation.

See **`plan/VOID_RUNNER_Roadmap.md`** for delivery order, backlog, and deferred design appendices.

---

## Key type locations

Primary definitions under `src/types/`: `WorldFile`, `SectorMetadata`, `ShipState`, `HullSpec`, equipment unions, `BulletSpec` / `BulletInstance`, mission/cargo types, `TargetState`, faction types, etc.

---

## Historical merge note (nothing dropped)

Earlier handoff docs contributed the following, all folded into sections above: **render layer order**; **PRNG** rule; **world vs hardcoded IDs**; **equipment `price`** and sell formula; **pirate overview** copy rule; **shipyard** UI/service notes; **validation** / DEV hard-fail; **tab order**; **NPC spawn `hullSpecId`** validation; **Phase 4** session checklist granularity; **defining features**; **document map** under `plan/`; **`SectorSimulation` / `ShipEntity` / `ScreenManager`**; **slot-type list**; **damage and energy** behaviour; **shield reboot**; **spawn rule fields**; **reputation caps**; **Phase 3 extras** (traffic, minimap hostility colours, etc.).

---

*Use this file as the single live project handoff; update it when behaviour or priorities change.*

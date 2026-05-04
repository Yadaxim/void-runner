# VOID RUNNER — Roadmap

> Single delivery document: **priority-ordered work**, **AI control pre-wiring**, and **deferred design** (including type sketches and world-generator guidelines formerly in a separate “future plans” file). Runtime handoff and architecture live in **`plan/CONTEXT.md`**. The actionable **checklist** lives in **`plan/VOID_RUNNER_Backlog.md`** — update it when you ship or reprioritize.

---

## Now (complete before large new features)

**Phase 4 Session 4 — automated tests (shipped)**  
Coverage passes are in **`damage.test.ts`**, **`shipEnergyShield.test.ts`** (reactor cap, fuel gate, regen delay, joule cost gate, `maxShieldHP` sync, offline shield clamp, `updated` return), **`physics.test.ts`** (angular clamp edge, damping at ω=0, diagonal `applyForce`, **`SplitMix64`** `nextInt` / `nextBool`), and **`world-validation.test.ts`** (bullet **`abilities`** array shape, unknown type, negative `turnRatio`, invalid entries, missing `type`). Extend these files again when combat, energy, physics, or world schema behaviour changes.

---

**Next default engineering focus:** Phase 4 Session 6 — hyperspace drive execution (see **Navigation slice** below and **`plan/VOID_RUNNER_Backlog.md`**).

---

*Recently shipped:* Session 4 test pass above; seeking homing is **`SeekingAbility`** on **`BulletSpec.abilities`**; **`validateWorldFile`** rejects legacy `seeking` / `turnRatio` on bullet specs. **Session 5:** **`GalaxyMapScreen`** (K in flight), full grid, visited dimming, faction cell colours, radiation tint via **`getRadiationIntensityAtCoord`** + sector flags, persisted **`hyperspaceTargetCoord`**, HUD **`HS→x:y`** hint; jump mechanics deferred to Session 6.

## AI control bus (keypress / pre-neural)

**Goal:** Human, scripted NPC, and future TensorFlow.js autopilot all drive ships through the **same boolean control frame** (thrusters + `WeaponFireKey` booleans). No parallel “NPC physics” or direct velocity hacks. Baseline today: `NPCInputs` + `ShipEntity.applyThrusterInputs` + sector `WeaponSystem.update` for NPCs; `tickShipEnergyAndShield` for all ships in `SectorSimulation`.

**Step A — Canonical type**  
Export a single **`ShipControlFrame`** (or rename `NPCInputs`) in one module: thruster booleans + `Record<WeaponFireKey, boolean>`. `NPCController.update` return type becomes that type; keyboard handling in `FlightScreen` maps DOM keys → the same struct (adapter only at the edge).

**Step B — Single apply entry**  
Introduce **`applyShipControlFrame(ship, frame, worldState, dt)`** (on `ShipEntity` or a tiny helper) used by both player and NPC paths so `ShipEntity.update` does not special-case “NPC branch” beyond “who produces `frame`”.

**Step C — Pilot interface**  
Define **`Pilot` / `getControlFrame(dt, context)`** with implementations: `HumanPilot` (reads buffered keys), `ScriptedNPCPilot` (wraps `NPCController`), later `NeuralPilot` (TF.js → thresholds → frame). `SectorSimulation` asks the pilot for a frame then applies it.

**Step D — Record / replay**  
Append `(timestamp, frame[, optional sensor vector])` to a ring buffer or export for training; headless runner replays frames on a ship with no keyboard to validate determinism and for dataset generation.

**Step E — Neural adapter**  
Output layer dimension = `ShipControlFrame`; debounce/threshold to booleans; equipment-change staleness as in GDD; training simulator records the same frame format the game consumes.

---

## Navigation slice (galaxy + hyperspace)

**Galaxy map screen (Phase 4 Session 5)** — *shipped*  
Full-sector map: visited dimming, faction cell colours, radiation overlay, hyperspace target selection + save (**`GalaxyMapScreen`**, **`WorldState.hyperspaceTargetCoord`**). Hyperspace **jump execution** is Session 6.

**Galaxy map — UI polish (queued)**  
Square grid cells, visited + landable density (dots in cell), clearer legend for current/cursor/target coords, right-hand **sector summary** pane for selection, hyperspace target surfaced next to ship/landable targets in flight HUD. Checklist: **`plan/VOID_RUNNER_Backlog.md`** → *Galaxy map — UI polish*.

**Hyperspace drive (Phase 4 Session 6)**  
Jump to any **visible** sector on the galaxy map, skipping intermediate sectors. Fuel cost, cooldown between jumps, jump range by drive tier, alignment / jump animation. **Fleet:** all ships align heading before jump; weakest drive limits range (see Fleet section).

---

## Economy and missions (depth)

**Cargo model upgrade (prerequisite for trade and richer missions)**  
Replace minimal `{ missionId, description, weight }` with a richer `CargoItem` (full sketch in **Appendix A**).

**Mission: kill targets**  
Destroy a specific NPC or group. Requires sector-level **temporary** NPC spawns when a mission is active and the player enters / lands in the target sector; extend `SectorMetadata` with `missionSpawnRules?: MissionSpawnRule[]` gated by active missions; extend `MissionTargetType` with `'kill'` (and later `'waypoint_visit'`).

**Mission chains and trees**  
Chains: completing A unlocks B (accept/decline with flavour). Trees: completing A offers a branch between B and C. Data shape in **Appendix A** (`followUpMissions`, `priceHidden`).

**Waypoints**  
Landable-like **visit** targets: fly close and slow (proximity + speed like landing), no full landing screen — pulsing ring, label, “WAYPOINT REACHED” notification, mission progress. `SectorMetadata.waypoints[]` or mission-spawned temporary waypoints (see **Appendix A**).

**Trade economy**  
Speculative cargo between landables (supply/demand, buy low / sell high). **Requires** the proper `CargoItem` model first.

**Mission price hiding**  
`priceHidden` on `MissionTemplate`: payoff shows `???` until delivery; revealed on completion (trivial once mission UI matures).

---

## Equipment and combat flavour

**Exotic equipment catalog** (world generator names variants; add mechanics as ready)  
- **Thruster enhancer** — higher top speed, higher fuel use  
- **Electric drive** — extra thrust from Joules, not fuel  
- **Solar panels** — passive energy, slow, no fuel  
- **Ambient H2 scoop** — slow fuel replenish in space  
- **Extra cargo container** — uses a weapon slot, adds cargo capacity  
- **ECM** — breaks seeking missile locks  
- **Repair drone** — slow in-flight armour regen, uses energy  
- **Cloak** — brief invisibility, high energy, tactical  
- **Tractor beam** — pull targets; pairs with slow heavy weapons  

**Disabled ship state**  
When hull HP hits 0, enter **disabled** instead of instant explosion: small extra buffer (e.g. 10–15% of max hull); stop thrusting (coast), no weapons; flicker / vent / dim VFX; further damage through buffer → explosion; optional boarding / drift. Add `disabledHP`, `isDisabled` to `ShipState`; trigger on hull 0 instead of immediate `markDestroyed()`.

**Boarding**  
After **disabled ships**: fly close to board; outcomes — loot cargo, capture ship (fleet), intel; time window before drift / ally rescue; rep penalty for hostile factions. Rules TBD — short design pass before implementation.

**Trophies / collectables**  
Zero-weight `cargoType: 'trophy'`; mission rewards, rare drops, events; flavour only; dedicated collection tab on ship status when that UI exists.

---

## Fleet and escorts

**Fleet ownership** (cap ~5)  
Multi-ship persistence; fleet landing (all slow and close); hyperspace confirmation.

**Escort behaviour — guard mode**  
Follow + combat handoff; ties to neural brain later.

**Escort insurance**  
Parallel to player insurance where it makes sense.

---

## World generator (offline tool)

**Generator UI from main menu**  
New / load / import / export world JSON; progress during long runs.

**Pipeline implementation per `VOID_RUNNER_WorldGen.md`**  
Spiral density, faction/landable/equipment/mission text passes, validation, export.

**Pre-trained memory cards**  
Headless sim + TF.js training in generator; embed weights in world file.

---

## Neural AI (gameplay)

**Sensor array + I/O vectors**  
Input resolution and range as equipment stats.

**Neural brain + memory card equipment**  
Swappable trained weights; worker-based training.

**Training simulator landable service**  
Record sessions; modes Follow / Combat / Flee; staleness when loadout changes.

**Autopilot toggle and mode switching**  
Deploy trained behaviour on player or escorts.

**AI developer sandbox (research / tooling)**  
Separate entry point: single combat sector, no transitions / landing / player ship. Load two+ brain configs for **AI vs AI**; watch fights for balance; automated equipment/pricing tests; research: RL (combat reward), genetic algorithms, **imitation learning** from recorded sessions, tournament mode. Treat as design tool as much as game feature; optional dedicated doc when NN stack is mature.

---

## Polish and presentation

- **Sound** — Web Audio API (engines, weapons, UI).  
- **Visual variety** — distinct hull silhouettes per class (per art guidelines).  
- **Engine glow / damage VFX** — readability.  
- **World sharing UX** — export/import discoverability.

---

## Explicit non-goals (for now)

- **Multiplayer** — out of scope.  
- **NPC fleets** — single NPC ships until fleet tech exists.  
- **Reputation decay** — backlog unless design revisits.  
- **Energy / void exotic weapons** — type system ready; content when balancing demands.

---

## Appendix A — Type sketches (deferred data model)

**Richer cargo**

```typescript
interface CargoItem {
  id: string;
  name: string; // e.g. "Federation Medical Supplies", "Illegal Weapons Cache"
  description: string;
  weight: number;
  cargoType: 'mission' | 'trade' | 'contraband' | 'trophy';
  missionId?: string;
  value?: number; // trade cargo
  illegal?: boolean; // factions may attack / fine
}
```

**Mission template extensions**

```typescript
interface MissionTemplate {
  // ... existing fields ...
  followUpMissions?: {
    condition: 'complete' | 'fail';
    options: { templateId: string; choiceText: string }[];
  };
  priceHidden?: boolean; // payoff as ??? until delivery
}
```

**Waypoint**

```typescript
interface Waypoint {
  id: string;
  name: string;
  description: string;
  position: Vector2;
  visitRadius: number;
  temporary?: boolean;
}
```

---

## Appendix B — World generator guidelines (not enforced in code)

**Bullets (typical behaviour; bend for exotic weapons)**  
- **kinetic** — mass, inherits ship velocity, gravity, baseline  
- **explosive** — mass, often `splash`  
- **laser** — no mass (speed 600+), often `shield_pierce`  
- **plasma** — often `dot`, slow or zero speed  
- **voidtype** — no fixed pattern; defined by armour profiles in data  

**Exotic examples:** shield-tuned laser (no pierce); impact laser (gravity-affected); sticky shrapnel (kinetic + dot); guided laser (laser + seeking); kinetic plasma (kinetic + dot + splash).

**Armour**  
Normal matter: weak to antimatter, often neutral to dark. Heavy physical: resists kinetic/explosive, weak to laser/energy. Energy shielding: resists laser/plasma, weak to kinetic. All: slightly weak to voidtype (negative reduction). Exceptions: “void protector” (resists void, weak to all else); “universal composite” (small resist to all).

**Damage type matrix (category × matter → key)**

```text
              normal    anti        dark
kinetic       kinetic   antimatter_ darkmatter_
                        kinetic     kinetic
explosive     explosive antimatter_ darkmatter_
                        explosive   explosive
laser         laser     anti_photon dark_energy_
                        _laser      laser
plasma        plasma    antimatter_ darkmatter_
                        plasma      plasma
void(type)    voidtype  —           —
```

---

## How to use this file

- **Engineering priority** defaults to top-to-bottom within a section, then section order as listed.  
- **Appendices** are reference for design and world-gen; promote items into the main sections when they get a release anchor.  
- After major milestones, update **`plan/CONTEXT.md`** (“implemented vs remaining”), refresh **`plan/VOID_RUNNER_Backlog.md`** (check off shipped items, add new rows), and trim this roadmap so **Now** stays honest.

---

*Keep this file as the single plan for delivery, backlog, and deferred specs.*

# VOID RUNNER — Roadmap

Replaces the rough roadmap from the original handoff. Reflects the decision to prioritize world generation before fleet, with a pre-gen foundation phase to make rich generation possible.

---

## Status snapshot

Authoritative **session notes:** **`plan/CONTEXT.md` → Last changes**. Routine checklist: **`plan/BACKLOG.md`**.

**In the codebase today:** Vitest + broad coverage; **`validateWorldFile`** at load/export boundaries in principle (portable **file** import/export still backlog); **shipyard** + equipment store + customize-on-buy; player/NPC combat parity; **galaxy map + hyperspace**; **torus** wrap and wrap-aware distances.

**Phase 4.5 foundation:** Sessions **A–F** are shipped (through game time + mission trees). Next: **Phase 5** world generator MVP.

**Hygiene:** When **`testWorld.json`** hull lists change, align **`simulation.test.ts`** / fixtures so starter hull ids still resolve (`shipyardListings` / `startingConditions`).

---

## Phase 4.5 — Pre-gen Foundation

Six sessions establishing the conceptual layers and infrastructure the generation pipeline depends on. None of these add LLM calls — they are pure code work.

### Session A — NPC battle parity
- [x] **Shipped** — layered damage, shields, reactor/joules tick for NPCs; spawn loadouts carry combat state; entity-agnostic resolution.

### Session B — Torus galaxy topology
- [x] **Shipped** — sector transitions wrap; torus distance / hop direction; minimap visited-grid seam cue; **`testWorld`** torus-shaped galaxy bounds.

### Session C — Galaxy map screen + hyperspace
- [x] **Shipped** — **`GalaxyMapScreen`**, hyperspace drive equipment, map target, partial hops, fuel/cooldown, jump animation, visited reveal.

### Session D — Species layer + faction extensions
- [x] **Shipped** — `world.species` array and `Species` data model; factions now carry `type`, `speciesComposition`, `homeLandableId`, `bubbleStance`, and `techArchetype`; validation and `testWorld` fixtures cover the new invariants. No gameplay change yet — purely data model expansion.

### Session E — Multi-faction landable control + treaty system
- [x] **Shipped** — replaced `landable.factionId` with `landable.factionControl[]` and `controlState`; validation enforces control shares and state/faction counts; stores, mission weighting, standing/UI, minimap/station visuals, and local NPC hostility now resolve multi-faction control. `testWorld` includes treaty, cooperation, and dispute examples.

### Session F — In-game time + mission tree data model
- [x] **Shipped** — `gameTime` epoch + rate (default 60:1), `tickTime` during flight/hyperspace only (frozen while docked), stardate HUD, `MissionTreeTemplate` / runtime `missionTrees`, prerequisite gating, completion branching, `finalConsequences`, mission-board integration + arc display titles, `testWorld` example tree (`tree_fed_border_accord`).

---

## Phase 5 — World Generation MVP

The generation pipeline. Six sessions to a working world generator producing playable worlds.

### Session G — Generator screen shell + procedural galaxy structure
Standalone Gen screen accessible from main menu. UI for parameter input (size, shape, density, seed). Implement step 1 (galaxy structure) and step 2 (special sectors). Show step-by-step progress. Generated structure is previewable on the existing galaxy map (in a "preview mode" that doesn't require committing the world).

### Session H — Claude API integration + species + factions
Plumb Claude API into the gen pipeline. Implement steps 3 (species), 4 (faction skeleton), 5 (faction identity). LLM call infrastructure: schema validation, retry on failure, progressive save per step.

### Session I — Faction homes + territorial growth + station placement
Implement steps 6, 7, 8a, 8b. Procedural territorial growth with the LLM anomaly injection pass. Faction relationship matrix. Station placement based on faction behavior profiles.

### Session J — Equipment catalog generation
Implement step 9. Item templates for stats. LLM names, descriptions, faction affiliations. Hull specs with all three loadout variants generated. Bullet specs.

### Session K — Mission templates + mission trees + faction projects
Implement steps 10, 11, 12. Mission templates per faction. Mission trees with consequences. Faction projects with effects.

### Session L — Final assembly + validation + export + preview
Implement step 13. Assemble all fragments into a `WorldFile`. Run `validateWorldFile`. Generation UI shows summary stats and lets the user preview the world before saving. Save flow writes the world to localStorage and the world list.

---

## Phase 6 — World Generation v2

Adds the richer features deferred from MVP.

- Wildlife factions (with creature aesthetics generated alongside)
- Ancient ruins as hidden landables (with sensor-array-gated discovery)
- Shimmer zones with ambient voidtype damage and salvage
- Faction projects starting at varied progress levels
- Generation caching (re-use LLM responses across same-seed runs)

---

## Phase 7 — Fleet System (was Phase 5)

Multi-ship ownership and fleet behavior. Now built on top of generated worlds, NPC battle parity, and hyperspace.

- Multi-ship ownership data model (cap: 5)
- Fleet management screen
- Fleet hyperspace and landing sequencing
- Guard mode behavior (follow + auto-engage)
- Escort ship customization (reuses shipyard customize patterns)
- Escort ship insurance

---

## Phase 8 — Neural Net AI (was Phase 7)

Trainable ship AI for escort ships.

- Sensor array input vector
- Full output vector (thrusters + weapons + auto-brake)
- Neural Brain + Memory Card equipment
- TF.js model + web worker training pipeline
- Training simulator landable service
- Escort training from lead ship perspective
- Equipment-change staleness detection
- Autopilot toggle, mode switching

---

## Phase 9 — Polish (was Phase 8)

- Multiple hull sprites (distinct per class)
- Engine glow, damage visual effects
- Hyperspace jump animation refinement
- Sound design (Web Audio API)
- World sharing UI
- Settings screen with tunable game-time rate

---

## Cross-cutting work

These can happen in any phase as warranted:

- Coverage reporting for tests
- E2E test infrastructure
- Performance profiling (sector simulation tick cost as ships scale)
- Save format versioning + migration
- Settings screen
- Accessibility pass

---

## Out of scope (firm)

- Multiplayer
- Mobile UI
- VR
- Real-money transactions of any kind
- NPC fleets (NPCs remain single ships)

---

## Notes on sequencing

The pre-gen phase (4.5) is six sessions of unglamorous foundation work. It's tempting to skip ahead to gen, but every gen step depends on at least one of these foundations:

- Gen produces big galaxies -> torus + hyperspace + galaxy map needed (B, C)
- Gen produces multi-species factions -> species layer needed (D)
- Gen produces shared landables -> multi-faction control needed (E)
- Gen produces mission trees with consequences -> tree data model and time clock needed (F)
- Gen produces NPC ships with full equipment -> NPC battle parity needed (A)

Skipping any of these means the generated worlds wouldn't actually express the features they're supposed to.

The gen MVP itself is six more sessions. Total to first generated world: ~12 sessions. Each session is contained and produces a working game state — even if you stop midway, the codebase is shippable at every step.

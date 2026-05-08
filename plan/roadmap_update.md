# Void Runner Roadmap — Update

Replaces the rough roadmap from the original handoff. Reflects the decision to prioritize world generation before fleet, with a pre-gen foundation phase to make rich generation possible.

---

## Currently in flight

- [x] Energy / shield / armour layered system (player)
- [ ] Tests: Vitest setup, world validation, damage system, reputation, simulation integration
- [ ] World validation boundaries (export, import, load)
- [ ] Shipyard system

When these land, the codebase has: full damage stack, validated worlds at every boundary, ship purchase flow with the customize-on-buy screen, and tests for everything below the gameplay layer.

---

## Phase 4.5 — Pre-gen Foundation

Six sessions establishing the conceptual layers and infrastructure the generation pipeline depends on. None of these add LLM calls — they are pure code work.

### Session A — NPC battle parity
Apply shield, reactor, and layered armour to NPCs. Update spawn loadouts to include reactors and shields where appropriate. Make damage resolution entity-agnostic. Tests cover NPC battle scenarios. Closes the hanging gap from the energy system implementation.

### Session B — Torus galaxy topology
Sector edge transitions wrap. Remove the boundary wall. Distance calculations use shortest torus path. Mini-map handles wrap with a subtle visual indicator. Update existing testWorld for torus topology.

### Session C — Galaxy map screen + hyperspace
Full galaxy map UI: zoom, pan, click to select destination. Hyperspace drive equipment becomes functional. Hyperspace target selection from galaxy map. Jump animation and transition. Fuel cost per parsec. Visited sector reveal (only see what you've explored). Without this, generated 50×50 worlds are unplayable.

### Session D — Species layer + faction extensions
Add `world.species` array and `Species` data model. Extend `Faction` with `speciesComposition`, `homeLandableId: string | null`, `bubbleStance`, and `techArchetype`. Update validation. Update testWorld with example species and updated factions. No gameplay change yet — purely data model expansion.

### Session E — Multi-faction landable control + treaty system
Replace `landable.factionId` with `landable.factionControl[]` and `controlState`. Implement NPC behavior changes for treaty / cooperation / dispute states. Update store, mission board, and standing screens to handle multi-faction landables. Update validation. Update testWorld with at least one multi-faction landable per state to verify behavior.

### Session F — In-game time + mission tree data model
Add `WorldState.gameTime` clock. Tick during gameplay. Add `MissionTreeTemplate` and `WorldState.missionTrees` state. Implement basic tree node progression: prerequisites, completion, branching. Apply `finalConsequences` on tree completion (faction control shifts, equipment unlocks, world-state flags). Update testWorld with one example tree end-to-end.

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

- Gen produces big galaxies → torus + hyperspace + galaxy map needed (B, C)
- Gen produces multi-species factions → species layer needed (D)
- Gen produces shared landables → multi-faction control needed (E)
- Gen produces mission trees with consequences → tree data model and time clock needed (F)
- Gen produces NPC ships with full equipment → NPC battle parity needed (A)

Skipping any of these means the generated worlds wouldn't actually express the features they're supposed to.

The gen MVP itself is six more sessions. Total to first generated world: ~12 sessions. Each session is contained and produces a working game state — even if you stop midway, the codebase is shippable at every step.

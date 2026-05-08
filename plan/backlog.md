# Void Runner Backlog

Ideas parked for later. Not in any active phase. Each entry notes what would trigger pulling it into the active roadmap.

---

## Combat and ship systems

### Creature ecology
**What:** Wildlife factions have inter-creature predator/prey relationships. Killing too many of species A causes species B's behavior to shift.
**Trigger to pull in:** After wildlife factions exist and the basic disposition system is shipping. Adds depth, requires noticeable extra simulation cost.

### Pre-trained AI cards as loot
**What:** Rare NPC drops or ruin loot. Pre-trained neural brain cards with quirky personalities — "aggressive trader", "paranoid escort", "alpha hunter". Players collect and slot them into escort ships.
**Trigger to pull in:** After Phase 8 (neural net AI) is stable and players are training their own.

### Energy weapons (separate from kinetic/missile)
**What:** Currently the damage type system supports laser and plasma but no equipment uses them as primary energy weapons. Add laser turrets and plasma launchers that consume battery rather than fuel.
**Trigger to pull in:** Anytime — the underlying systems already support it. Pull in when equipment variety feels thin.

### Anti-matter and dark-matter weapons
**What:** Ships can mount AM/DM-flavored weapons. Their bullets do `antimatter_X` and `darkmatter_X` damage. Counters specialized armor profiles.
**Trigger to pull in:** When armor design feels too uniform. Probably a world-gen feature unlocked by faction tech archetype.

### Voidtype weapons
**What:** Voidtype damage exists in code but no items use it. Reserve for ancient/exotic equipment found in ruins or shimmer zones.
**Trigger to pull in:** With ruins (Phase 6).

### Equipment-only inventory
**What:** Currently equipment is bound to ships. Allow a player-side equipment locker so the player can buy without installing immediately, transfer between fleet ships, etc.
**Trigger to pull in:** When fleet management is shipping and the friction of forced-install is felt.

### Active mission expiry
**What:** Missions have a deadline expressed in game time. Failing to deliver in time triggers `mission_fail` outcomes.
**Trigger to pull in:** When the in-game clock is shipping and real time pressure feels desirable.

### Reputation decay
**What:** Reputation slowly drifts toward neutral over game time. Requires repeat engagement to maintain high rep.
**Trigger to pull in:** When players have established a high rep and never need to interact with that faction again. Adds replay friction.

---

## World and worldgen

### Faction language / glyphs
**What:** Each species gets a procedurally generated written form. Used in ruins, faction logos, dialog flavor.
**Trigger to pull in:** When ruins have actual lore artifacts to display.

### Cultural drift over time
**What:** Faction ideology slowly shifts based on events and projects. Long-running games see factions evolve.
**Trigger to pull in:** Late-game depth feature, when worlds are persistent across long sessions.

### Trade economy
**What:** Speculative cargo buying and selling between landables. Prices vary by supply/demand. Trade routes emerge.
**Trigger to pull in:** When the player has cash but nothing meaningful to buy. Or as a Phase 6+ flavor pass after worldgen produces named goods.

### Player-editable post-generation
**What:** UI to edit a generated world after the fact. Add/rename factions, edit faction relationships, place new landables manually.
**Trigger to pull in:** When the user (the creator) wants to tweak generated worlds rather than regenerate. Probably late.

### LLM response caching
**What:** During worldgen, cache LLM responses keyed on (seed, step, input hash). Re-running with the same seed reuses cached calls.
**Trigger to pull in:** As soon as gen exists and you start iterating. Saves API spend.

### Gen on shared seeds
**What:** Worlds with the same seed produce the same galaxy. Players can share seeds for known worlds.
**Trigger to pull in:** With the world sharing UI in Phase 9.

### Multi-shape galaxies
**What:** Compound shapes — disc with a ring around it, twin spirals, etc.
**Trigger to pull in:** When galaxy variety feels thin. Low priority.

### Faction projects with player-driven completion
**What:** Some projects only complete if the player participates (positively or negatively). Without player action, they stall.
**Trigger to pull in:** With faction projects.

### Procedural ship hull aesthetics
**What:** Hull rendering varies by faction tech archetype. Biological hulls render with curves, machine hulls with geometric panels, etc. Procedural Canvas variation.
**Trigger to pull in:** When art guidelines refresh in Phase 9.

---

## UI / UX

### Settings screen
**What:** Tunable preferences — game-time rate, control bindings, audio levels, text size.
**Trigger to pull in:** Polish phase.

### Save format versioning + migration
**What:** When the schema changes, old saves auto-upgrade.
**Trigger to pull in:** First time a schema change breaks an existing save and the user is angry about it.

### Photo mode
**What:** Pause flight, pose ship, capture screenshot with HUD off.
**Trigger to pull in:** When the visuals are pretty enough to be worth sharing.

### Codex / encyclopedia screen
**What:** In-game reference of discovered species, factions, equipment, ruins. Built up as the player explores.
**Trigger to pull in:** With ruins. The codex is where lore fragments accrue.

### Tutorial / onboarding
**What:** First-time player experience explains controls, fuel, landing, combat.
**Trigger to pull in:** Before anyone other than the creator plays.

### Accessibility pass
**What:** Colorblind palettes, screen-reader hints, keyboard alternatives for click-to-target, font size scaling.
**Trigger to pull in:** Polish phase.

---

## Tech debt and infra

### Coverage reporting
**What:** Track test coverage, fail CI on regressions.
**Trigger to pull in:** When the test suite is stable enough that coverage is a useful signal.

### E2E tests with Playwright
**What:** Browser-driven tests of full game flows (new game, fly, land, buy ship, save, reload).
**Trigger to pull in:** When unit tests are no longer catching enough regressions.

### Performance profiling
**What:** Measure simulation tick cost as ship/bullet count scales. Identify hot paths.
**Trigger to pull in:** When framerate drops in busy sectors. Probably with fleet system.

### Renderer optimization
**What:** Off-screen culling, layer caching, dirty-rect updates.
**Trigger to pull in:** With perf profiling, if rendering is the bottleneck.

### Build pipeline
**What:** Production build, asset hashing, deploy targets (web, electron, mobile?).
**Trigger to pull in:** When sharing the game with anyone other than the creator.

---

## Far future / blue sky

These probably won't happen but are noted so they're not lost.

- VR support
- Mobile touch controls
- Procedural music generation per sector / faction
- Voice lines for NPC chatter (TTS-generated)
- Shareable mod kits for custom worldgen prompts
- Live-service mode where multiple players share a generated world (still single-player but world state shared)
- Roguelike mode: permadeath, persistent meta-progression across runs
- AI-driven faction dialogue (LLM generates faction comms in real time during gameplay — explicitly out of scope per the "no API calls during gameplay" constraint, but worth considering as an offline-batch feature for occasional set-piece moments)

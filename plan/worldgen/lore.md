# Void Runner — canonical bubble lore

**Use this text verbatim** (or as the system-prompt lore block) for every world-generation LLM step that needs setting context: species, faction identity, mission flavor, relationship deviations, territorial anomalies, etc.

Per-world variation is *interpretation* inside the bubble — not a different cosmology. Each `WorldFile` chooses what factions believe, what ruins imply this generation, and how shimmer sectors are mythologized locally.

---

## The bubble (fixed fact)

Civilization survived an unwinnable war by sealing itself inside an **impenetrable space-time bubble**. The old unified culture shattered into the factions and species of the present age. The bubble still holds.

No one has crossed the boundary in living memory. Maps use a **torus** topology: space wraps; there is no literal “edge of the universe” to fly off, only **shimmer sectors** at the grid rim where instruments fail and void exposure is highest — the conceptual **bubble membrane**.

---

## What players see in the galaxy

- **Ruins** — pre-collapse or wartime infrastructure; salvage and contradictory histories.
- **Shimmer** — mostly rim-adjacent anomalies, sensor ghosts, void-touched phenomena; some cultures treat them as sacred, others as contamination.
- **Radiation** — dense core-adjacent zones (high background flux), not the same as shimmer.
- **Nebulae** — stellar nurseries and dust lanes; habitation and trade routes thread through them.

---

## Faction attitudes (`bubbleStance`)

Factions take a stance on the bubble’s meaning (assigned in world-gen, not in this doc):

| Stance | Typical belief |
|--------|----------------|
| `reunifier` | The bubble is a temporary shelter; unity must be restored. |
| `isolationist` | The seal was correct; outside contact is death or delusion. |
| `breaker` | The bubble must be pierced or dismantled — at any cost. |
| `indifferent` | Practical power matters more than metaphysics. |

---

## Tone for generated prose

- **Cyberpunk-in-space**: salvage economies, black markets, corporate choke points, obsolete hulls beside bleeding-edge mods, surveillance and debt, rim law that pretends not to exist.
- **Concrete** detail over purple prose: named substances, interfaces, scars, tariffs, firmware locks, cults around shimmer salvage — not generic “advanced technology.”
- **Tech traditions must feel incompatible.** A species’ **`techArchetype`** is how their civilization *builds* (organic grown hulls vs machined plates vs conscious field-craft vs void-touched hulls). Factions inherit that look through **`speciesComposition`**; do not describe all species as sharing the same industrial base.
- **`techArchetype: energy`** is **conscious energy** — field-orbs, halos, nodes that read as aware or reverent. A slightly **spiritual** tone is intended (chorus telemetry, shrine bays, vows to the drive). Species biology uses **`fieldborn`**, not `energy`, so the two enums do not collide.
- No Earth references, no modern real-world nations.
- Species describe **biology and culture**; factions describe **politics and ships**. There is no separate faction-level tech field — visual and equipment flavor comes from species tech lines.
- Comedy is fine when **smart and discrete** — dry asides, grim irony, in-world jargon; not skit comedy, slapstick, or winks at the player.
- No parody of real franchises, celebrities, or meme formats; no fourth-wall breaks.
- **Names** (species, and later factions / ports / gear) are invented each generation — **not** from a preset list. They should **fit the species’ biology and culture**: a hive might use cadence or registry strings; machines might use designation codes; insects or aliens should **not** default to human myth or astronomy (`Mercury`, `Titan`, Greek gods) unless the text explicitly says that’s human spacer slang for them.
- Names do **not** need to be human-pronounceable or “friendly.” They **do** need to be **distinct from one another** in writing (no five species all looking like `Keth` / `Kethari` / `Keth Reach` in the same roster).
- Landable and planet names come in **later** world-gen steps; apply the same rule — name worlds the way **that culture** would, not as if every species is naming like 21st-century Earth.

---

## Species vs factions (generator discipline)

- **Species** (~5 per galaxy): what they *are* (archetype, body, values) and how they *engineer* (`techArchetype` → hull/equipment silhouette family).
- **Factions**: who rules, fights, and trades; composed of one or more species with percentages.

Do not conflate species names with faction names. A faction may be multi-species; a species may appear in several factions.

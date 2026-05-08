# Design docs (`plan/`)

Read **`plan/CONTEXT.md` first** — single handoff for new sessions (architecture, invariants, pointers).

## Canonical

| File | Role |
|------|------|
| **`plan/CONTEXT.md`** | Runtime architecture, document map, **Last changes** |
| **`plan/GDD.md`** | Game design (living): persistence + lore/torus/species/factions through treaty combat §§1–14 |
| **`plan/ROADMAP.md`** | Phases, sequencing, deferred appendices |
| **`plan/BACKLOG.md`** | Actionable checklist + short **Parked ideas** |

## World generation

| File | Role |
|------|------|
| **`plan/WORLDGEN.md`** | Full pipeline — step schemas, procedural vs LLM, UI flow, validation, assembly |

## Balance & art

| File | Role |
|------|------|
| **`plan/ARCHETYPE_CHECKLIST.md`** | Hull/loadout tuning checklist (`testWorld.json`) |
| **`plan/CONSTANTS_BALANCE_TREE.md`** | Tunables tree vs systems |
| **`plan/ART_GUIDELINES_V1.0.md`** | Visual design / renderer spec |

## Parked ideas (not active roadmap)

| File | Role |
|------|------|
| **`plan/BACKLOG.md`** → § Parked ideas | Short bullets |
| **`plan/PARKED_IDEAS_DETAIL.md`** | Same topics — **What / Trigger** long form |

## Maintenance

- After shipping behaviour, update **`plan/CONTEXT.md` → Last changes** and tick **`plan/BACKLOG.md`**.
- Keep roadmap phase text aligned with reality (see **`plan/ROADMAP.md`** **Status snapshot**).
- Avoid duplicate roadmap files — **`plan/ROADMAP.md`** is the only roadmap source.

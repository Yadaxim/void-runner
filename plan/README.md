# Design docs (`plan/`)

Read **`plan/CONTEXT.md` first** — runtime architecture, invariants, and session handoff.

---

## Delivery (one checklist)

| File | Role |
|------|------|
| **`plan/BACKLOG.md`** | **Shipped vs next** — phases, sessions, checkboxes, future stages 6–9 |

When behaviour ships, tick **BACKLOG** and add a dated line under **CONTEXT → Last changes**.

---

## Game design and runtime

| File | Role |
|------|------|
| **`plan/CONTEXT.md`** | Architecture, invariants, document map, changelog bullets |
| **`plan/GDD.md`** | Game design — vision, **shipped** rules (§2–8), world data (§10), **planned** by phase (§11) |

---

## World generator (`plan/worldgen/`)

Offline pipeline and weapon data — separate from gameplay docs above.

| File | Role |
|------|------|
| **`plan/worldgen/WORLDGEN.md`** | 13-step pipeline — procedural vs LLM, schemas, assembly, UI flow |
| **`plan/worldgen/WEAPONS_WORLDGEN.md`** | `bulletSpecs` + weapons — `matterType`, `abilities[]`, validation bands |

Implementation: `src/worldgen/` (15 stub stages today — align with WORLDGEN doc in **Phase 9**).

---

## Pre–world-gen balancing (`plan/pre-worldgen/`)

Hand-tune fixture world and constants in **Phase 8**, after procedural imagery and UI polish.

| File | Role |
|------|------|
| **`plan/pre-worldgen/ARCHETYPE_CHECKLIST.md`** | Hull/loadout archetypes (`raw` / `basic` / `advanced`) |
| **`plan/pre-worldgen/CONSTANTS_BALANCE_TREE.md`** | Constants vs world JSON tuning order |

---

## Art

| File | Role |
|------|------|
| **`plan/ART_GUIDELINES_V1.0.md`** | Visual / renderer spec |

---

## Parked ideas

| File | Role |
|------|------|
| **`plan/BACKLOG.md`** → § Parked ideas | Short bullets |
| **`plan/PARKED_IDEAS_DETAIL.md`** | What / trigger long form |

---

## Maintenance rules

1. **One checklist** — `plan/BACKLOG.md` only (no duplicate phase lists elsewhere).  
2. **CONTEXT** — architecture + short changelog; trim long “done” walls.  
3. **GDD** — design intent; mark sections not in code as forward-looking.  
4. **Worldgen** — keep under `plan/worldgen/`; step 9 weapon stats follow **WEAPONS_WORLDGEN.md**.  
5. **Pre-worldgen balance** — archetypes and constants tuning under `plan/pre-worldgen/`.

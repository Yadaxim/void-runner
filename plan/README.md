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
| **`plan/GDD.md`** | Player-facing rules and long-term vision (§§8+ partly forward-looking) |

---

## World generator (`plan/worldgen/`)

Offline pipeline and weapon data — separate from gameplay docs above.

| File | Role |
|------|------|
| **`plan/worldgen/WORLDGEN.md`** | 13-step pipeline — procedural vs LLM, schemas, assembly, UI flow |
| **`plan/worldgen/WEAPONS_WORLDGEN.md`** | `bulletSpecs` + weapons — `matterType`, `abilities[]`, validation bands |

Implementation: `src/worldgen/` (15 stub stages today — align with WORLDGEN doc when building Phase 5).

---

## Balance and art

| File | Role |
|------|------|
| **`plan/ARCHETYPE_CHECKLIST.md`** | Hull/loadout tuning before/at alongside procedural catalogs |
| **`plan/CONSTANTS_BALANCE_TREE.md`** | Constants vs world JSON tuning order |
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

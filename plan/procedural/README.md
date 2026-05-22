# Procedural imagery (Phase 6)

Design for **Canvas 2D procedural drawing** from **`WorldFile`** parameters. Runtime: `src/renderer/planets/`, `src/renderer/landables/`, `src/renderer/layers/landableLayer.ts`.

Visual principles shared with **`plan/ART_GUIDELINES_V1.0.md`** §5 — this folder adds **JSON params**, **flight vs UI surfaces**, and implementation checklists.

| Doc | Scope |
|-----|--------|
| **`void_runner_planets.md`** | **Planet / moon** noise-based sphere renderer (`SplitMix64`, texture cache) |
| *(later)* `LANDABLES_UI.md` | Landable screen portrait (reuses planet cache) |
| *(later)* `STATIONS_FLIGHT.md` | Station tier modules at world position |
| *(later)* `HULLS_FLIGHT.md` | Hull silhouettes, `renderAnchors`, on-ship weapons |
| *(later)* `EQUIPMENT_IMAGERY.md` | Store, shipyard, cargo icons |

**Implementation note:** The reference code in `void_runner_planets.md` uses mulberry32; the game uses **`SplitMix64`** from `src/core/prng.ts` for the same algorithms. No faction tint on planet/moon bodies.

**Backlog:** **`plan/BACKLOG.md`** § Phase 6.

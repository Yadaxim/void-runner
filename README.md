# Void Runner

2D browser space trading and combat (Escape Velocity–inspired), built with **Vite + TypeScript** and **HTML5 Canvas 2D**.

**Playable today:** Newtonian flight, combat, sectors, landables, missions, reputation, equipment store, shipyard, galaxy map, hyperspace, torus galaxy wrap, `localStorage` saves. Fixture world: `public/testWorld.json`.

## Quick start

```bash
npm install
npm run dev              # game dev server
npm run dev:worldgen     # worldgen explorer (standalone debug UI)
npm run typecheck
npm test         # Vitest
npm run build
```

Node 18+ recommended.

## Repo layout

```text
public/testWorld.json     # dev world fixture
src/
  types/                  # canonical interfaces
  core/                   # loop, PRNG, WorldState, events
  simulation/             # ships, weapons, sectors, pilots
  combat/                 # damage resolution
  world/                  # load + validate WorldFile
  worldgen/               # offline generator pipeline (stubs)
  renderer/, screens/     # Canvas + UI flow
plan/                     # design docs — start at plan/README.md
PLAYER_GUIDE.md           # pilot-facing controls (repo root)
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [`plan/README.md`](plan/README.md) | Index for all design files |
| [`plan/CONTEXT.md`](plan/CONTEXT.md) | Architecture handoff for new sessions |
| [`plan/BACKLOG.md`](plan/BACKLOG.md) | **What’s done / what’s next** (single checklist) |
| [`plan/worldgen/`](plan/worldgen/) | World generator pipeline + weapon rules |

## Notes

- Types in `src/types/` are the source of truth for cross-module contracts.
- `validateWorldFile` runs on bundled worlds in development.
- World generation UI exists (`WorldGenScreen`); pipeline stages in `src/worldgen/` are not implemented yet — see **Phase 9** in `plan/BACKLOG.md` (after phases 5–8).

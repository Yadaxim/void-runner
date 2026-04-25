# Void Runner

`Void Runner` is a 2D browser-based space trading and combat game scaffold built with Vite + TypeScript.

This repository currently contains **project structure and typed module skeletons only**. Gameplay, rendering behavior, physics integration, AI behavior, and world generation logic are intentionally left as stubs for incremental implementation.

## Tech Stack

- `Vite`
- `TypeScript` (strict mode)
- `HTML5 Canvas 2D`
- `@tensorflow/tfjs`

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm 9+ (recommended)

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

### Type Check

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Layout

```text
.
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
└── src/
    ├── main.ts
    ├── constants.ts
    ├── types/                  # canonical interfaces and type unions
    ├── core/                   # loop, PRNG, world/save state, event bus
    ├── physics/                # vector math and physics helpers
    ├── simulation/             # runtime entity/controller layer
    ├── ai/                     # input/output vectors, pilot + model stubs
    ├── worldgen/               # stage pipeline and generators
    ├── renderer/               # camera, layer pipeline, ship/landable/UI renderers
    ├── screens/                # menu/game/UI screen modules and screen manager
    └── workers/                # typed TF.js training worker protocol
```

## Important Notes

- `src/types/` is the canonical type source for cross-module imports.
- Most modules currently throw `Error('not implemented')` by design.
- `src/core/prng.ts` includes a SplitMix64 implementation and `childPRNG`.
- `src/core/gameLoop.ts` includes delta-time capping (`100ms`) and RAF loop control.
- `src/renderer/renderPipeline.ts` enforces fixed layer ordering.
- `src/worldgen/pipeline.ts` is stage-based with checkpoint persistence and progress events.

## Next Implementation Steps

- Replace stubbed functions in `physics`, `simulation`, and `renderer` modules.
- Wire `main.ts` into screen routing and game boot flow.
- Implement world generation stages and validation.
- Implement training worker logic and model manager bridge.


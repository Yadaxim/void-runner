import { generateGalaxyStructure } from '../../src/worldgen/steps/01_galaxyStructure';
import { generateSpecialSectorSeeds } from '../../src/worldgen/steps/02_specialSectorSeeds';
import type { GalaxyStructureOutput } from '../../src/worldgen/types/galaxyStructure';
import type { ExplorerState } from './state';
import type { WorldGenConfig } from './types';

export type StepRunner = (config: WorldGenConfig, outputs: Record<string, unknown>) => Promise<unknown>;

function configToStep1Input(config: WorldGenConfig) {
  return {
    sizeX: config.sizeX,
    sizeY: config.sizeY,
    sectorSize: config.sectorSize,
    shape: config.shape,
    planetDensity: config.planetDensity,
    moonProbability: config.moonProbability,
    moonsPerPlanetRange: config.moonsPerPlanetRange,
    seed: config.seed
  };
}

/** Step runners — wire in src/worldgen as each step is implemented. */
const STEP_RUNNERS: Partial<Record<string, StepRunner>> = {
  '01_galaxy_structure': async (config) => generateGalaxyStructure(configToStep1Input(config)),
  '02_special_sectors': async (config, outputs) => {
    const step1 = outputs['01_galaxy_structure'] as GalaxyStructureOutput | undefined;
    if (!step1?.sectors) {
      throw new Error('Step 1 output required before special sector seeds');
    }
    return generateSpecialSectorSeeds({ galaxyStructure: step1, seed: config.seed });
  }
};

export async function runPipeline(state: ExplorerState, fromStepId?: string): Promise<void> {
  if (state.generating) return;
  state.generating = true;
  state.loadedWorld = null;

  const startIdx = fromStepId ? state.steps.findIndex((s) => s.def.id === fromStepId) : 0;
  if (startIdx < 0) {
    state.generating = false;
    return;
  }

  state.appendLog('info', `Starting pipeline from step ${startIdx + 1}`);

  for (let i = startIdx; i < state.steps.length; i += 1) {
    const step = state.steps[i];
    const runner = STEP_RUNNERS[step.def.id];

    state.setStepStatus(step.def.id, 'running');
    state.appendLog('info', `Running: ${step.def.name}`, step.def.id);
    state.notify();

    if (!runner) {
      state.setStepStatus(step.def.id, 'failed', 'Not implemented yet');
      state.appendLog('warn', `${step.def.name} — not implemented. Stop here.`, step.def.id);
      state.generating = false;
      state.notify();
      return;
    }

    try {
      const output = await runner(state.config, state.stepOutputs);
      state.setStepStatus(step.def.id, 'succeeded', undefined, output);
      state.appendLog('info', `${step.def.name} — succeeded`, step.def.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      state.setStepStatus(step.def.id, 'failed', msg);
      state.appendLog('error', `${step.def.name} — ${msg}`, step.def.id);
      state.generating = false;
      state.notify();
      return;
    }

    state.notify();
  }

  state.appendLog('info', 'Pipeline complete');
  state.generating = false;
  state.notify();
}

export async function retryStep(state: ExplorerState, stepId: string): Promise<void> {
  const idx = state.steps.findIndex((s) => s.def.id === stepId);
  if (idx < 0) return;
  for (let i = idx; i < state.steps.length; i += 1) {
    state.steps[i].status = 'pending';
    state.steps[i].error = undefined;
    state.steps[i].output = undefined;
    delete state.stepOutputs[state.steps[i].def.id];
  }
  await runPipeline(state, stepId);
}

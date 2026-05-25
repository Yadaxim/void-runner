import bubbleLore from '../../plan/worldgen/lore.md?raw';
import { generateGalaxyStructure } from '../../src/worldgen/steps/01_galaxyStructure';
import { generateSpecialSectorSeeds } from '../../src/worldgen/steps/02_specialSectorSeeds';
import { generateSpecies } from '../../src/worldgen/steps/03_species';
import { generateFactionSkeleton } from '../../src/worldgen/steps/04_factionSkeleton';
import type { SpeciesGenerationOutput } from '../../src/worldgen/types/speciesGeneration';
import type { GalaxyStructureOutput } from '../../src/worldgen/types/galaxyStructure';
import { getManualAnthropicApiKey, useAnthropicDevProxy } from './apiKey';
import type { ExplorerState } from './state';
import type { ExplorerConfig } from './stepConfigs';

export type StepRunner = (
  config: ExplorerConfig,
  outputs: Record<string, unknown>,
  state: ExplorerState
) => Promise<unknown>;

function configToStep1Input(config: ExplorerConfig) {
  const p = config.steps['01_galaxy_structure'];
  return {
    sizeX: p.sizeX,
    sizeY: p.sizeY,
    sectorSize: p.sectorSize,
    shape: p.shape,
    planetDensity: p.planetDensity,
    moonProbability: p.moonProbability,
    moonsPerPlanetRange: p.moonsPerPlanetRange,
    seed: config.global.seed
  };
}

/** Step runners — wire in src/worldgen as each step is implemented. */
const STEP_RUNNERS: Partial<Record<string, StepRunner>> = {
  '01_galaxy_structure': async (config) => generateGalaxyStructure(configToStep1Input(config)),
  '02_special_sectors': async (config, outputs, _state) => {
    const step1 = outputs['01_galaxy_structure'] as GalaxyStructureOutput | undefined;
    if (!step1?.sectors) {
      throw new Error('Step 1 output required before special sector seeds');
    }
    const p2 = config.steps['02_special_sectors'];
    return generateSpecialSectorSeeds({
      galaxyStructure: step1,
      seed: config.global.seed,
      tuning: {
        nebulaClusterCountMin: p2.nebulaClusterCountMin,
        nebulaClusterCountMax: p2.nebulaClusterCountMax,
        nebulaClusterSizeMin: p2.nebulaClusterSizeMin,
        nebulaClusterSizeMax: p2.nebulaClusterSizeMax,
        shimmerFractionMin: p2.shimmerFractionMin,
        shimmerFractionMax: p2.shimmerFractionMax
      }
    });
  },
  '03_species': async (config, _outputs, state) => {
    const p3 = config.steps['03_species'];
    const source = state.anthropicApiKeySource;
    const viaProxy = useAnthropicDevProxy(source);
    return generateSpecies({
      count: p3.speciesCount,
      seed: config.global.seed,
      useMock: p3.useLlmMock,
      apiKey: viaProxy ? 'dev-proxy' : getManualAnthropicApiKey(p3.anthropicApiKey),
      useDevProxy: viaProxy,
      maxRetries: p3.maxRetries,
      bubbleLore
    });
  },
  '04_faction_skeleton': async (config, outputs) => {
    const step1 = outputs['01_galaxy_structure'] as GalaxyStructureOutput | undefined;
    const step3 = outputs['03_species'] as SpeciesGenerationOutput | undefined;
    if (!step1?.sectors) {
      throw new Error('Step 1 output required before faction skeleton');
    }
    if (!step3?.species?.length) {
      throw new Error('Step 3 output required before faction skeleton');
    }
    const p4 = config.steps['04_faction_skeleton'];
    return generateFactionSkeleton({
      species: step3.species,
      galaxyStructure: step1,
      seed: config.global.seed,
      tierTargets: {
        majorPerLandables: p4.majorPerLandables,
        minorPerMajor: [p4.minorPerMajorMin, p4.minorPerMajorMax],
        independentCount: [p4.independentCountMin, p4.independentCountMax]
      }
    });
  }
};

export interface StepRunCheck {
  ok: boolean;
  reason?: string;
}

/** Whether a step can run now (runner exists, dependencies satisfied). */
export function canRunStep(state: ExplorerState, stepId: string): StepRunCheck {
  const step = state.steps.find((s) => s.def.id === stepId);
  if (!step) {
    return { ok: false, reason: 'Unknown step' };
  }
  if (state.generating) {
    return { ok: false, reason: 'Pipeline busy' };
  }
  if (!STEP_RUNNERS[stepId]) {
    return { ok: false, reason: 'Not implemented yet' };
  }
  for (const depId of step.def.dependsOn) {
    if (state.stepOutputs[depId] === undefined) {
      const dep = state.steps.find((s) => s.def.id === depId);
      const label = dep ? `${dep.def.index}. ${dep.def.name}` : depId;
      return { ok: false, reason: `Requires step ${label} first` };
    }
  }
  return { ok: true };
}

/** Index of the first pending or failed step; length if all succeeded. */
export function findResumeStepIndex(state: ExplorerState): number {
  for (let i = 0; i < state.steps.length; i += 1) {
    const status = state.steps[i].status;
    if (status === 'pending' || status === 'failed') {
      return i;
    }
  }
  return state.steps.length;
}

/** First pending/failed step in pipeline order that can run now. */
export function findNextRunnableStepId(state: ExplorerState): string | null {
  for (const step of state.steps) {
    if (step.status !== 'pending' && step.status !== 'failed') continue;
    if (canRunStep(state, step.def.id).ok) {
      return step.def.id;
    }
  }
  return null;
}

/** Run one pipeline step without clearing other outputs. */
export async function runSingleStep(state: ExplorerState, stepId: string): Promise<void> {
  const check = canRunStep(state, stepId);
  if (!check.ok) {
    state.appendLog('warn', check.reason ?? 'Cannot run step', stepId);
    state.notify();
    return;
  }

  const step = state.steps.find((s) => s.def.id === stepId);
  const runner = STEP_RUNNERS[stepId];
  if (!step || !runner) {
    return;
  }

  if (step.status === 'succeeded' || step.status === 'failed') {
    state.invalidateFromStep(stepId);
  }

  state.generating = true;
  state.loadedWorld = null;
  state.setStepStatus(stepId, 'running');
  state.appendLog('info', `Running: ${step.def.name}`, stepId);
  state.notify();

  try {
    const output = await runner(state.config, state.stepOutputs, state);
    state.setStepStatus(stepId, 'succeeded', undefined, output);
    state.appendLog('info', `${step.def.name} — succeeded`, stepId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    state.setStepStatus(stepId, 'failed', msg);
    state.appendLog('error', `${step.def.name} — ${msg}`, stepId);
  }

  state.generating = false;
  state.notify();
}

export async function runPipeline(state: ExplorerState, fromStepId?: string): Promise<void> {
  if (state.generating) return;
  state.generating = true;
  state.loadedWorld = null;

  const startIdx = fromStepId
    ? state.steps.findIndex((s) => s.def.id === fromStepId)
    : findResumeStepIndex(state);
  if (startIdx < 0) {
    state.generating = false;
    return;
  }
  if (!fromStepId && startIdx >= state.steps.length) {
    state.appendLog('info', 'All steps already succeeded — select a step and use Run selected to redo');
    state.generating = false;
    state.notify();
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
      const output = await runner(state.config, state.stepOutputs, state);
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

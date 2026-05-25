import {
  detectAnthropicApiKeySource,
  type AnthropicApiKeySource
} from './apiKey';
import { PIPELINE_STEPS } from './steps';
import type { ExplorerConfig } from './stepConfigs';
import { DEFAULT_EXPLORER_CONFIG, mergeExplorerConfig } from './stepConfigs';
import type { LogEntry, MapLayerFlags, StepState, WorldFileSlice } from './types';
import { DEFAULT_LAYERS } from './types';
import { buildMapView } from './mapData';
import { generateGalaxyStructure } from '../../src/worldgen/steps/01_galaxyStructure';

type Listener = () => void;

export class ExplorerState {
  config: ExplorerConfig = structuredClone(DEFAULT_EXPLORER_CONFIG);
  /** Where step 3 API key came from (env, secrets file, or typed in UI). */
  anthropicApiKeySource: AnthropicApiKeySource = 'none';
  selectedStepId: string | null = '01_galaxy_structure';
  steps: StepState[] = PIPELINE_STEPS.map((def) => ({ def, status: 'pending' as const }));
  log: LogEntry[] = [];
  stepOutputs: Record<string, unknown> = {};
  loadedWorld: WorldFileSlice | null = null;
  layers: MapLayerFlags = { ...DEFAULT_LAYERS };
  generating = false;
  private listeners = new Set<Listener>();

  constructor() {
    this.applyInitialAnthropicApiKey();
  }

  /** Detect external key; never store env/secrets value in config or UI state. */
  applyInitialAnthropicApiKey(): void {
    if (this.anthropicApiKeySource === 'manual') {
      return;
    }
    this.config.steps['03_species'].anthropicApiKey = '';
    this.anthropicApiKeySource = detectAnthropicApiKeySource();
  }

  /** Re-check .env / secrets flags (e.g. when opening step 3 panel). */
  refreshAnthropicApiKeyDetection(): void {
    this.applyInitialAnthropicApiKey();
  }

  setAnthropicApiKey(key: string): void {
    const trimmed = key.trim();
    if (trimmed) {
      this.config.steps['03_species'].anthropicApiKey = trimmed;
      this.anthropicApiKeySource = 'manual';
      return;
    }
    this.config.steps['03_species'].anthropicApiKey = '';
    this.applyInitialAnthropicApiKey();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  getMapData() {
    return buildMapView(this.config, this.stepOutputs, this.loadedWorld);
  }

  appendLog(level: LogEntry['level'], message: string, stepId?: string): void {
    this.log.push({ ts: Date.now(), level, message, stepId });
    if (this.log.length > 500) {
      this.log = this.log.slice(-400);
    }
  }

  resetPipeline(): void {
    this.steps = PIPELINE_STEPS.map((def) => ({ def, status: 'pending' }));
    this.stepOutputs = {};
    this.loadedWorld = null;
    this.selectedStepId = '01_galaxy_structure';
    this.log = [];
  }

  setStepStatus(stepId: string, status: StepState['status'], error?: string, output?: unknown): void {
    const step = this.steps.find((s) => s.def.id === stepId);
    if (!step) return;
    step.status = status;
    step.error = error;
    if (output !== undefined) {
      step.output = output;
      this.stepOutputs[stepId] = output;
    }
    if (status === 'running') {
      step.startedAt = Date.now();
    }
    if (status === 'succeeded' || status === 'failed') {
      step.finishedAt = Date.now();
    }
  }

  loadWorld(world: WorldFileSlice): void {
    this.loadedWorld = world;
    this.config.steps['01_galaxy_structure'].sizeX = world.galaxy.gridWidth;
    this.config.steps['01_galaxy_structure'].sizeY = world.galaxy.gridHeight;
    this.config.global.seed = world.metadata.seed;
    this.config.global.worldName = world.metadata.name;
    this.appendLog('info', `Loaded world "${world.metadata.name}" (${world.sectors.length} sector entries)`);
  }

  applyPreview(): void {
    this.loadedWorld = null;
    const p = this.config.steps['01_galaxy_structure'];
    const output = generateGalaxyStructure({
      sizeX: p.sizeX,
      sizeY: p.sizeY,
      sectorSize: p.sectorSize,
      shape: p.shape,
      planetDensity: p.planetDensity,
      moonProbability: p.moonProbability,
      moonsPerPlanetRange: p.moonsPerPlanetRange,
      seed: this.config.global.seed
    });
    this.stepOutputs['01_galaxy_structure'] = output;
    this.setStepStatus('01_galaxy_structure', 'succeeded', undefined, output);
    this.invalidateFromStep('01_galaxy_structure');
    this.appendLog(
      'info',
      `Step 1: ${output.sectors.length} sectors, ${output.sectors.reduce((n, s) => n + s.landables.length, 0)} landables`
    );
    this.notify();
  }

  /** Clear outputs and status for steps that depend on stepId (directly or transitively). */
  invalidateFromStep(stepId: string): void {
    const toClear = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const step of this.steps) {
        if (step.def.id === stepId || toClear.has(step.def.id)) continue;
        if (step.def.dependsOn.some((dep) => dep === stepId || toClear.has(dep))) {
          toClear.add(step.def.id);
          grew = true;
        }
      }
    }
    for (const id of toClear) {
      const step = this.steps.find((s) => s.def.id === id);
      if (!step) continue;
      step.status = 'pending';
      step.error = undefined;
      step.output = undefined;
      step.startedAt = undefined;
      step.finishedAt = undefined;
      delete this.stepOutputs[id];
    }
  }

  exportCheckpoint(): string {
    const config = structuredClone(this.config);
    config.steps['03_species'].anthropicApiKey = '';
    return JSON.stringify(
      {
        config,
        anthropicApiKeySource: this.anthropicApiKeySource,
        stepOutputs: this.stepOutputs,
        steps: this.steps.map((s) => ({
          id: s.def.id,
          status: s.status,
          error: s.error
        })),
        exportedAt: new Date().toISOString()
      },
      null,
      2
    );
  }

  importCheckpoint(json: unknown): boolean {
    if (!json || typeof json !== 'object') return false;
    const data = json as {
      config?: Partial<ExplorerConfig>;
      anthropicApiKeySource?: AnthropicApiKeySource;
      stepOutputs?: Record<string, unknown>;
    };
    if (data.config) {
      this.config = mergeExplorerConfig(DEFAULT_EXPLORER_CONFIG, data.config);
      this.config.steps['03_species'].anthropicApiKey = '';
      this.anthropicApiKeySource = data.anthropicApiKeySource ?? 'none';
      if (this.anthropicApiKeySource === 'manual') {
        this.anthropicApiKeySource = 'none';
      }
      this.applyInitialAnthropicApiKey();
    }
    if (data.stepOutputs) {
      this.stepOutputs = data.stepOutputs;
      for (const step of this.steps) {
        const output = this.stepOutputs[step.def.id];
        if (output !== undefined) {
          step.status = 'succeeded';
          step.output = output;
        } else {
          step.status = 'pending';
          step.output = undefined;
          step.error = undefined;
        }
      }
    }
    this.loadedWorld = null;
    this.appendLog('info', 'Imported generation checkpoint');
    return true;
  }
}

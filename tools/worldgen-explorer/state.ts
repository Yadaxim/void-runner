import { PIPELINE_STEPS } from './steps';
import type {
  LogEntry,
  MapLayerFlags,
  StepState,
  WorldFileSlice,
  WorldGenConfig
} from './types';
import { DEFAULT_CONFIG, DEFAULT_LAYERS } from './types';
import { buildMapView } from './mapData';
import { generateGalaxyStructure } from '../../src/worldgen/steps/01_galaxyStructure';

type Listener = () => void;

export class ExplorerState {
  config: WorldGenConfig = { ...DEFAULT_CONFIG };
  steps: StepState[] = PIPELINE_STEPS.map((def) => ({ def, status: 'pending' as const }));
  log: LogEntry[] = [];
  stepOutputs: Record<string, unknown> = {};
  loadedWorld: WorldFileSlice | null = null;
  layers: MapLayerFlags = { ...DEFAULT_LAYERS };
  generating = false;
  selectedStepId: string | null = null;

  private listeners = new Set<Listener>();

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
    this.selectedStepId = null;
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
    this.config.sizeX = world.galaxy.gridWidth;
    this.config.sizeY = world.galaxy.gridHeight;
    this.config.seed = world.metadata.seed;
    this.config.worldName = world.metadata.name;
    this.appendLog('info', `Loaded world "${world.metadata.name}" (${world.sectors.length} sector entries)`);
  }

  applyPreview(): void {
    this.loadedWorld = null;
    const output = generateGalaxyStructure({
      sizeX: this.config.sizeX,
      sizeY: this.config.sizeY,
      sectorSize: this.config.sectorSize,
      shape: this.config.shape,
      planetDensity: this.config.planetDensity,
      moonProbability: this.config.moonProbability,
      moonsPerPlanetRange: this.config.moonsPerPlanetRange,
      seed: this.config.seed
    });
    this.stepOutputs = { '01_galaxy_structure': output };
    this.setStepStatus('01_galaxy_structure', 'succeeded', undefined, output);
    this.appendLog(
      'info',
      `Step 1: ${output.sectors.length} sectors, ${output.sectors.reduce((n, s) => n + s.landables.length, 0)} landables`
    );
  }

  exportCheckpoint(): string {
    return JSON.stringify(
      {
        config: this.config,
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
      config?: WorldGenConfig;
      stepOutputs?: Record<string, unknown>;
    };
    if (data.config) {
      this.config = { ...DEFAULT_CONFIG, ...data.config };
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

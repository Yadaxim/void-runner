import { EventBus } from '../core/eventBus';
import type { WorldFile } from '../types';
import { stage01_prngInit } from './stages/01_prngInit';
import { stage02_galaxyShape } from './stages/02_galaxyShape';
import { stage03_factionAlgo } from './stages/03_factionAlgo';
import { stage04_factionLore } from './stages/04_factionLore';
import { stage05_sectorMeta } from './stages/05_sectorMeta';
import { stage06_landablePlacement } from './stages/06_landablePlacement';
import { stage07_landableLore } from './stages/07_landableLore';
import { stage08_hullSpecs } from './stages/08_hullSpecs';
import { stage09_hullLore } from './stages/09_hullLore';
import { stage10_equipmentCatalog } from './stages/10_equipmentCatalog';
import { stage11_equipmentLore } from './stages/11_equipmentLore';
import { stage12_missionTemplates } from './stages/12_missionTemplates';
import { stage13_missionLore } from './stages/13_missionLore';
import { stage14_pretrainedCards } from './stages/14_pretrainedCards';
import { stage15_assembly } from './stages/15_assembly';

export interface WorldGenConfig {
  seed: number;
  worldName: string;
}

type WorldGenEvents = {
  progress: { stage: number; stageName: string; total: 15 };
};

const stages = [
  ['01_prngInit', stage01_prngInit],
  ['02_galaxyShape', stage02_galaxyShape],
  ['03_factionAlgo', stage03_factionAlgo],
  ['04_factionLore', stage04_factionLore],
  ['05_sectorMeta', stage05_sectorMeta],
  ['06_landablePlacement', stage06_landablePlacement],
  ['07_landableLore', stage07_landableLore],
  ['08_hullSpecs', stage08_hullSpecs],
  ['09_hullLore', stage09_hullLore],
  ['10_equipmentCatalog', stage10_equipmentCatalog],
  ['11_equipmentLore', stage11_equipmentLore],
  ['12_missionTemplates', stage12_missionTemplates],
  ['13_missionLore', stage13_missionLore],
  ['14_pretrainedCards', stage14_pretrainedCards]
] as const;

export class WorldGenPipeline {
  private readonly eventBus = new EventBus<WorldGenEvents>();

  onProgress(listener: (event: WorldGenEvents['progress']) => void): () => void {
    return this.eventBus.on('progress', listener);
  }

  async run(config: WorldGenConfig): Promise<WorldFile> {
    const checkpointKey = `worldgen_checkpoint_${config.seed}`;
    localStorage.getItem(checkpointKey);

    for (let i = 0; i < stages.length; i += 1) {
      const [stageName, stage] = stages[i];
      await stage();
      localStorage.setItem(checkpointKey, JSON.stringify({ stage: i + 1, stageName }));
      this.eventBus.emit('progress', { stage: i + 1, stageName, total: 15 });
    }

    const worldFile = await stage15_assembly();
    localStorage.setItem(checkpointKey, JSON.stringify({ stage: 15, stageName: '15_assembly' }));
    this.eventBus.emit('progress', { stage: 15, stageName: '15_assembly', total: 15 });
    return worldFile;
  }
}

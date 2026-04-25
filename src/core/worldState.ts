import type { WorldFile } from '../types';

export class WorldState {
  private worldFile: WorldFile | null = null;

  load(worldFile: WorldFile): void {
    this.worldFile = worldFile;
  }

  getWorldFile(): WorldFile | null {
    return this.worldFile;
  }
}

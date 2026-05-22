import type { Landable } from '../../types';
import { deriveRenderOpts } from './deriveOpts';
import { renderPlanet } from './renderPlanet';

function canvasSizeForRadius(radius: number): number {
  return Math.max(32, Math.ceil(radius * 2.7));
}

export class PlanetTextureCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  get(landable: Landable, radius: number): HTMLCanvasElement {
    const key = `${landable.id}:${Math.ceil(radius)}`;
    let canvas = this.cache.get(key);
    if (!canvas) {
      const size = canvasSizeForRadius(radius);
      canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const opts = deriveRenderOpts(landable, radius);
      renderPlanet(canvas, opts);
      this.cache.set(key, canvas);
    }
    return canvas;
  }

  warm(landables: Landable[]): void {
    for (const landable of landables) {
      if (landable.type === 'planet' || landable.type === 'moon') {
        this.get(landable, landable.radius);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const sharedPlanetTextureCache = new PlanetTextureCache();

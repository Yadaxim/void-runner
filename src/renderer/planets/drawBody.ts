import type { Landable } from '../../types';
import { sharedPlanetTextureCache, type PlanetTextureCache } from './textureCache';

export function drawLandableBody(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  landable: Landable,
  radius?: number,
  cache: PlanetTextureCache = sharedPlanetTextureCache
): void {
  if (landable.type !== 'planet' && landable.type !== 'moon') {
    return;
  }
  const drawRadius = radius ?? landable.radius;
  const texture = cache.get(landable, drawRadius);
  const half = texture.width / 2;
  ctx.drawImage(texture, centreX - half, centreY - half);
}

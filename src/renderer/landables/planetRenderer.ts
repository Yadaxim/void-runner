import type { Landable } from '../../types';
import { drawLandableBody } from '../planets/drawBody';
import type { PlanetTextureCache } from '../planets/textureCache';

export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  landable: Landable,
  radius?: number,
  cache?: PlanetTextureCache
): void {
  drawLandableBody(ctx, centreX, centreY, landable, radius, cache);
}

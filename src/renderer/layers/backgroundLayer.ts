import { COLOURS, STAR_COLOURS, STAR_LAYER_COUNTS, STAR_SCROLL_FACTORS } from '../../constants';
import { childPRNG } from '../../core/prng';
import type { Vector2 } from '../../types';

interface Star {
  x: number;
  y: number;
  radius: number;
}

export class BackgroundLayer {
  private readonly starsByLayer: Star[][] = [];

  private readonly layerTileSize: number;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvasWidth: number,
    private readonly canvasHeight: number,
    sectorSeed: number
  ) {
    this.layerTileSize = Math.max(canvasWidth, canvasHeight) * 3;

    for (let layerIndex = 0; layerIndex < STAR_LAYER_COUNTS.length; layerIndex += 1) {
      const prng = childPRNG(sectorSeed, `stars_layer_${layerIndex}`);
      const stars: Star[] = [];
      for (let i = 0; i < STAR_LAYER_COUNTS[layerIndex]; i += 1) {
        stars.push({
          x: prng.next() * this.layerTileSize,
          y: prng.next() * this.layerTileSize,
          radius: 0.7 + prng.next() * 1.6
        });
      }
      this.starsByLayer.push(stars);
    }
  }

  render(playerWorldPos: Vector2): void {
    for (let layerIndex = 0; layerIndex < this.starsByLayer.length; layerIndex += 1) {
      const stars = this.starsByLayer[layerIndex];
      const scrollFactor = STAR_SCROLL_FACTORS[layerIndex];
      const colour = STAR_COLOURS[layerIndex] ?? COLOURS.STAR_BRIGHT;
      const offsetX = ((playerWorldPos.x * scrollFactor) % this.layerTileSize + this.layerTileSize) % this.layerTileSize;
      const offsetY = ((playerWorldPos.y * scrollFactor) % this.layerTileSize + this.layerTileSize) % this.layerTileSize;

      this.ctx.fillStyle = colour;
      for (const star of stars) {
        const screenX = (star.x - offsetX + this.layerTileSize) % this.layerTileSize;
        const screenY = (star.y - offsetY + this.layerTileSize) % this.layerTileSize;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, star.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }
}

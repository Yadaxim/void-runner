import { COLOURS, STAR_COLOURS, STAR_LAYER_COUNTS, STAR_SCROLL_FACTORS } from '../../constants';
import { childPRNG } from '../../core/prng';
import type { Vector2 } from '../../types';

interface Star {
  x: number;
  y: number;
  radius: number;
}

interface NebulaBlob {
  x: number;
  y: number;
  radius: number;
}

interface AmbientConfig {
  hasNebula: boolean;
  nebulaHue: number;
  nebulaIntensity: number;
  starDensityMultiplier: number;
}

export class BackgroundLayer {
  private readonly starsByLayer: Star[][] = [];
  private readonly layerTileSize: number;
  private readonly nebulaBlobs: NebulaBlob[] = [];
  private readonly hasNebula: boolean;
  private readonly nebulaHue: number;
  private readonly nebulaIntensity: number;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvasWidth: number,
    private readonly canvasHeight: number,
    sectorSeed: number,
    nebulaConfig: AmbientConfig
  ) {
    this.layerTileSize = Math.max(canvasWidth, canvasHeight) * 3;
    this.hasNebula = nebulaConfig.hasNebula;
    this.nebulaHue = nebulaConfig.nebulaHue;
    this.nebulaIntensity = nebulaConfig.nebulaIntensity;
    const starDensityMultiplier = Math.max(0.1, nebulaConfig.starDensityMultiplier);

    for (let layerIndex = 0; layerIndex < STAR_LAYER_COUNTS.length; layerIndex += 1) {
      const prng = childPRNG(sectorSeed, `stars_layer_${layerIndex}`);
      const stars: Star[] = [];
      const layerCount = Math.max(1, Math.round(STAR_LAYER_COUNTS[layerIndex] * starDensityMultiplier));
      for (let i = 0; i < layerCount; i += 1) {
        stars.push({
          x: prng.next() * this.layerTileSize,
          y: prng.next() * this.layerTileSize,
          radius: 0.7 + prng.next() * 1.6
        });
      }
      this.starsByLayer.push(stars);
    }

    if (this.hasNebula) {
      const prng = childPRNG(sectorSeed, 'nebula_layer');
      const blobCount = 3 + Math.floor(prng.next() * 2);
      const maxRadius = Math.max(this.canvasWidth, this.canvasHeight) * 0.5;
      for (let i = 0; i < blobCount; i += 1) {
        this.nebulaBlobs.push({
          x: prng.next() * this.canvasWidth,
          y: prng.next() * this.canvasHeight,
          radius: maxRadius * (0.55 + prng.next() * 0.45)
        });
      }
    }
  }

  render(playerWorldPos: Vector2): void {
    if (this.hasNebula) {
      const nebulaOffsetX = playerWorldPos.x * 0.01;
      const nebulaOffsetY = playerWorldPos.y * 0.01;
      for (const blob of this.nebulaBlobs) {
        const x = blob.x - nebulaOffsetX;
        const y = blob.y - nebulaOffsetY;
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, blob.radius);
        gradient.addColorStop(0, `hsla(${this.nebulaHue}, 60%, 30%, ${this.nebulaIntensity})`);
        gradient.addColorStop(1, `hsla(${this.nebulaHue}, 60%, 30%, 0)`);
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, blob.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

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

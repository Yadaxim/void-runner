import type { Particle } from '../../simulation/particleSystem';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';

export class EffectsLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(particles: Particle[], camera: Camera): void {
    for (const particle of particles) {
      const screenPos = worldToScreen(particle.position, camera);
      this.ctx.save();
      this.ctx.globalAlpha = particle.opacity;
      this.ctx.fillStyle = particle.colour;
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }
}

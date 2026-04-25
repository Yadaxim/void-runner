import type { Landable } from '../../types';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';

export class LandableLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(landables: Landable[], camera: Camera): void {
    for (const landable of landables) {
      const pos = worldToScreen(landable.position, camera);
      const glow = this.ctx.createRadialGradient(pos.x, pos.y, landable.radius * 0.75, pos.x, pos.y, landable.radius * 1.6);
      glow.addColorStop(0, 'rgba(120, 180, 255, 0.25)');
      glow.addColorStop(1, 'rgba(120, 180, 255, 0)');
      this.ctx.fillStyle = glow;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, landable.radius * 1.6, 0, Math.PI * 2);
      this.ctx.fill();

      const fill = this.ctx.createRadialGradient(
        pos.x - landable.radius * 0.25,
        pos.y - landable.radius * 0.25,
        landable.radius * 0.2,
        pos.x,
        pos.y,
        landable.radius
      );
      fill.addColorStop(0, '#6fa2d8');
      fill.addColorStop(1, '#2d5a8a');

      this.ctx.fillStyle = fill;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, landable.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

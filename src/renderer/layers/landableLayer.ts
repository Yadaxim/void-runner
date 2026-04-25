import type { Landable } from '../../types';
import { LANDING_RADIUS_MULTIPLIER, COLOURS } from '../../constants';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawPlanet } from '../landables/planetRenderer';

export class LandableLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(landables: Landable[], camera: Camera, landingCandidate: Landable | null): void {
    for (const landable of landables) {
      const pos = worldToScreen(landable.position, camera);
      drawPlanet(this.ctx, pos.x, pos.y, landable.radius, landable.seed);

      if (landingCandidate?.id === landable.id) {
        this.ctx.save();
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeStyle = COLOURS.UI_ACCENT;
        this.ctx.globalAlpha = 0.7;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, landable.radius * LANDING_RADIUS_MULTIPLIER, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
    }
  }
}

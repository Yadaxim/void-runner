import type { WorldState } from '../../core/worldState';
import { getLandablePrimaryFactionId, type Landable } from '../../types';
import { LANDING_RADIUS_MULTIPLIER, COLOURS } from '../../constants';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawPlanet } from '../landables/planetRenderer';
import { drawMoon } from '../landables/moonRenderer';
import { drawStation } from '../landables/stationRenderer';

export class LandableLayer {
  private readonly stationAngles = new Map<string, number>();

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    landables: Landable[],
    camera: Camera,
    landingCandidate: Landable | null,
    landableTargetId: string | null,
    worldState: WorldState,
    dt: number
  ): void {
    for (const landable of landables) {
      const pos = worldToScreen(landable.position, camera);
      if (landable.type === 'planet') {
        drawPlanet(this.ctx, pos.x, pos.y, landable.radius, landable.seed);
      } else if (landable.type === 'moon') {
        drawMoon(this.ctx, pos.x, pos.y, landable.radius, landable.seed);
      } else if (
        landable.type === 'station' ||
        landable.type === 'military_outpost' ||
        landable.type === 'shipyard_station'
      ) {
        const currentAngle = (this.stationAngles.get(landable.id) ?? 0) + landable.rotationSpeed * dt;
        this.stationAngles.set(landable.id, currentAngle);
        drawStation(
          this.ctx,
          pos.x,
          pos.y,
          landable.radius,
          landable.seed,
          worldState.getFactionVisual(getLandablePrimaryFactionId(landable) ?? ''),
          currentAngle
        );
      }

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

      if (landableTargetId === landable.id) {
        const pulse = 0.6 + (Math.sin(performance.now() * 0.006) + 1) * 0.2;
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.strokeStyle = COLOURS.UI_ACCENT;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, landable.radius * 1.15, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
  }
}

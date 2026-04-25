import { COLOURS, DEFAULT_FACTION_VISUAL, HULL_DIMENSIONS } from '../../constants';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawHull } from '../ships/hullBuilder';
import type { ShipEntity } from '../../simulation/shipEntity';

export class ShipLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(ships: ShipEntity[], camera: Camera, shipTargetId: string | null): void {
    for (const ship of ships) {
      const screenPos = worldToScreen(ship.state.position, camera);
      this.ctx.save();
      this.ctx.translate(screenPos.x, screenPos.y);
      this.ctx.rotate(ship.state.angle);
      drawHull(this.ctx, 'fighter', HULL_DIMENSIONS.fighter, DEFAULT_FACTION_VISUAL);
      this.ctx.restore();
      if (ship.state.id === shipTargetId) {
        this.drawTargetBracket(screenPos, 12);
      }
    }
  }

  drawTargetBracket(screenPos: { x: number; y: number }, size: number): void {
    const r = size;
    const arm = 5;
    this.ctx.save();
    this.ctx.strokeStyle = COLOURS.UI_ACCENT;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(screenPos.x - r, screenPos.y - r + arm);
    this.ctx.lineTo(screenPos.x - r, screenPos.y - r);
    this.ctx.lineTo(screenPos.x - r + arm, screenPos.y - r);
    this.ctx.moveTo(screenPos.x + r - arm, screenPos.y - r);
    this.ctx.lineTo(screenPos.x + r, screenPos.y - r);
    this.ctx.lineTo(screenPos.x + r, screenPos.y - r + arm);
    this.ctx.moveTo(screenPos.x - r, screenPos.y + r - arm);
    this.ctx.lineTo(screenPos.x - r, screenPos.y + r);
    this.ctx.lineTo(screenPos.x - r + arm, screenPos.y + r);
    this.ctx.moveTo(screenPos.x + r - arm, screenPos.y + r);
    this.ctx.lineTo(screenPos.x + r, screenPos.y + r);
    this.ctx.lineTo(screenPos.x + r, screenPos.y + r - arm);
    this.ctx.stroke();
    this.ctx.restore();
  }
}

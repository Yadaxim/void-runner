import { DEFAULT_FACTION_VISUAL, HULL_DIMENSIONS } from '../../constants';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawHull } from '../ships/hullBuilder';
import type { ShipEntity } from '../../simulation/shipEntity';

export class ShipLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(ships: ShipEntity[], camera: Camera): void {
    for (const ship of ships) {
      const screenPos = worldToScreen(ship.state.position, camera);
      this.ctx.save();
      this.ctx.translate(screenPos.x, screenPos.y);
      this.ctx.rotate(ship.state.angle);
      drawHull(this.ctx, 'fighter', HULL_DIMENSIONS.fighter, DEFAULT_FACTION_VISUAL);
      this.ctx.restore();
    }
  }
}

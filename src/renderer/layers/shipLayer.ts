import { COLOURS, DEFAULT_FACTION_VISUAL, HULL_DIMENSIONS } from '../../constants';
import type { WorldState } from '../../core/worldState';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawShip } from '../ships/shipRenderer';
import type { ShipEntity } from '../../simulation/shipEntity';

function hpBarColour(ratio: number): string {
  if (ratio > 0.6) return COLOURS.SAFE;
  if (ratio > 0.3) return COLOURS.WARNING;
  return COLOURS.DANGER;
}

export class ShipLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    ships: ShipEntity[],
    camera: Camera,
    shipTargetId: string | null,
    worldState: WorldState
  ): void {
    for (const ship of ships) {
      const screenPos = worldToScreen(ship.state.position, camera);
      const hullSpec = worldState.getHullSpec(ship.state.hullSpecId);
      const hullClass = hullSpec?.hullClass ?? 'fighter';
      const dimensions = HULL_DIMENSIONS[hullClass];
      const factionVisual = ship.state.factionId
        ? worldState.getFactionVisual(ship.state.factionId)
        : DEFAULT_FACTION_VISUAL;
      this.ctx.save();
      this.ctx.globalAlpha = ship.getOpacity();
      this.ctx.translate(screenPos.x, screenPos.y);
      this.ctx.rotate(ship.state.angle);
      const armourMass = ship.getTotalArmourMass(worldState);
      drawShip(this.ctx, hullClass, dimensions, factionVisual, armourMass);
      this.ctx.restore();
      this.drawWorldHpBar(ship, screenPos);
      if (ship.state.id === shipTargetId) {
        this.drawTargetBracket(screenPos, dimensions.length / 2 + 6);
      }
    }
  }

  private drawWorldHpBar(ship: ShipEntity, screenPos: { x: number; y: number }): void {
    if (ship.state.maxHP <= 0 || ship.state.currentHP >= ship.state.maxHP) {
      return;
    }
    const width = 20;
    const height = 3;
    const ratio = Math.max(0, Math.min(1, ship.state.currentHP / ship.state.maxHP));
    const x = screenPos.x - width / 2;
    const y = screenPos.y + 8;
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.9)';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = hpBarColour(ratio);
    this.ctx.fillRect(x, y, width * ratio, height);
    this.ctx.restore();
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

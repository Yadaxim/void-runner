import { COLOURS, DEFAULT_FACTION_VISUAL } from '../../constants';
import { DEFAULT_HULL_DIMENSIONS, DEFAULT_HULL_SILHOUETTE } from '../../types';
import type { WorldState } from '../../core/worldState';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawShip } from '../ships/shipRenderer';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { BurnEffect } from '../../simulation/weaponSystem';

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
    worldState: WorldState,
    activeBurns: BurnEffect[]
  ): void {
    for (const ship of ships) {
      const screenPos = worldToScreen(ship.state.position, camera);
      const hullSpec = worldState.getHullSpec(ship.state.hullSpecId);
      const silhouette = hullSpec?.silhouette ?? DEFAULT_HULL_SILHOUETTE;
      const dimensions = hullSpec?.dimensions ?? DEFAULT_HULL_DIMENSIONS;
      const factionVisual = ship.state.factionId
        ? worldState.getFactionVisual(ship.state.factionId)
        : DEFAULT_FACTION_VISUAL;
      this.ctx.save();
      this.ctx.globalAlpha = ship.getOpacity();
      this.ctx.translate(screenPos.x, screenPos.y);
      this.ctx.rotate(ship.state.angle);
      const armourMass = ship.getTotalArmourMass(worldState);
      drawShip(this.ctx, silhouette, dimensions, factionVisual, armourMass);
      const burn = activeBurns.find((effect) => effect.targetId === ship.state.id);
      if (burn) {
        const opacity = Math.min(0.35, Math.max(0, (burn.remainingDuration / burn.totalDuration) * 0.35));
        if (opacity > 0) {
          this.ctx.globalAlpha = opacity;
          this.ctx.fillStyle = '#80ff40';
          drawShip(this.ctx, silhouette, dimensions, factionVisual, armourMass);
        }
      }
      this.ctx.restore();
      this.drawWorldHpBar(ship, screenPos);
      if (ship.state.id === shipTargetId) {
        this.drawTargetBracket(screenPos, dimensions.length / 2 + 6);
      }
    }
  }

  private drawWorldHpBar(ship: ShipEntity, screenPos: { x: number; y: number }): void {
    if (ship.state.maxHullHP <= 0 || ship.state.currentHullHP >= ship.state.maxHullHP) {
      return;
    }
    const width = 20;
    const height = 3;
    const ratio = Math.max(0, Math.min(1, ship.state.currentHullHP / ship.state.maxHullHP));
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

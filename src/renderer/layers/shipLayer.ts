import { COLOURS, DEFAULT_FACTION_VISUAL, HULL_DIMENSIONS } from '../../constants';
import type { WorldState } from '../../core/worldState';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';
import { drawShip } from '../ships/shipRenderer';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { BurnEffect } from '../../simulation/weaponSystem';

function renderHintForHullName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (n.includes('shuttle')) return 'shuttle';
  if (n.includes('interceptor')) return 'interceptor';
  if (n.includes('dogfighter')) return 'dogfighter';
  if (n.includes('courier')) return 'courier';
  if (n.includes('freighter')) return 'freighter';
  return undefined;
}

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
      const hullClass = hullSpec?.hullClass ?? 'fighter';
      const dimensions = HULL_DIMENSIONS[hullClass];
      const renderHint = renderHintForHullName(hullSpec?.name);
      const factionVisual = ship.state.factionId
        ? worldState.getFactionVisual(ship.state.factionId)
        : DEFAULT_FACTION_VISUAL;
      this.ctx.save();
      this.ctx.globalAlpha = ship.getOpacity();
      this.ctx.translate(screenPos.x, screenPos.y);
      this.ctx.rotate(ship.state.angle);
      const armourMass = ship.getTotalArmourMass(worldState);
      drawShip(this.ctx, hullClass, dimensions, factionVisual, armourMass, renderHint);
      const burn = activeBurns.find((effect) => effect.targetId === ship.state.id);
      if (burn) {
        const opacity = Math.min(0.35, Math.max(0, (burn.remainingDuration / burn.totalDuration) * 0.35));
        if (opacity > 0) {
          this.ctx.globalAlpha = opacity;
          this.ctx.fillStyle = '#80ff40';
          drawShip(this.ctx, hullClass, dimensions, factionVisual, armourMass, renderHint);
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

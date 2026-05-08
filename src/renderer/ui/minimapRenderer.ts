import {
  COLOURS,
  MINIMAP_SIZE,
  SECTOR_SIZE
} from '../../constants';
import type { WorldState } from '../../core/worldState';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { Landable, Mission, Vector2 } from '../../types';

const MIN_LANDABLE_DOT_SIZE = 3;
const MAX_LANDABLE_DOT_SIZE = 8;
/** Pixels beyond filled landable disc for the port identification ring. */
const LANDABLE_MINIMAP_RING_OUTSET = 1.35;
const LANDABLE_MINIMAP_RING_LINE = 1.2;
const PANEL_MARGIN = 16;
const NPC_DOT_RADIUS = 2.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class MinimapRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    worldState: WorldState,
    playerPosition: Vector2,
    landingCandidate: Landable | null,
    npcShips: ShipEntity[],
    activeMissions: Mission[],
    shipTargetId: string | null
  ): void {
    const mapX = this.ctx.canvas.width - MINIMAP_SIZE - PANEL_MARGIN;
    const mapY = this.ctx.canvas.height - MINIMAP_SIZE - PANEL_MARGIN;

    this.ctx.save();
    this.ctx.globalAlpha = 0.8;
    this.ctx.fillStyle = COLOURS.SPACE_BLACK;
    this.ctx.fillRect(mapX, mapY, MINIMAP_SIZE, MINIMAP_SIZE);
    this.ctx.restore();

    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(mapX, mapY, MINIMAP_SIZE, MINIMAP_SIZE);

    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    const sectorCoord = worldState.getCurrentSectorCoord();
    this.ctx.fillText(`SECTOR  ${sectorCoord.x} : ${sectorCoord.y}`, mapX + 6, mapY + 6);

    const currentSector = worldState.getCurrentSector();
    const missionDestinationIds = new Set(
      activeMissions
        .filter(
          (mission) =>
            mission.destinationSectorCoord.x === currentSector.coord.x &&
            mission.destinationSectorCoord.y === currentSector.coord.y
        )
        .map((mission) => mission.destinationLandableId)
    );
    for (const landable of currentSector.landables) {
      const relativeX = (landable.position.x + SECTOR_SIZE / 2) / SECTOR_SIZE;
      const relativeY = (landable.position.y + SECTOR_SIZE / 2) / SECTOR_SIZE;
      const dotX = mapX + clamp(relativeX, 0, 1) * MINIMAP_SIZE;
      const dotY = mapY + clamp(relativeY, 0, 1) * MINIMAP_SIZE;
      const dotRadius = clamp(landable.radius / 10, MIN_LANDABLE_DOT_SIZE, MAX_LANDABLE_DOT_SIZE);

      const factionVisual = landable.factionId
        ? worldState.getFactionVisual(landable.factionId)
        : null;
      this.ctx.fillStyle = factionVisual?.primaryColour ?? COLOURS.UI_SECONDARY;
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.strokeStyle = factionVisual?.secondaryColour ?? 'rgba(210, 214, 235, 0.55)';
      this.ctx.lineWidth = LANDABLE_MINIMAP_RING_LINE;
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, dotRadius + LANDABLE_MINIMAP_RING_OUTSET, 0, Math.PI * 2);
      this.ctx.stroke();

      if (missionDestinationIds.has(landable.id)) {
        const pulse = 0.45 + (Math.sin(performance.now() * (Math.PI * 2 / 750)) + 1) * 0.25;
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.fillStyle = COLOURS.CREDITS;
        this.ctx.beginPath();
        this.ctx.arc(dotX, dotY, dotRadius + 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }

      if (landingCandidate?.id === landable.id) {
        const pulse = 0.55 + (Math.sin(performance.now() * (Math.PI * 2 / 1000)) + 1) * 0.225;
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.strokeStyle = COLOURS.UI_ACCENT;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(dotX, dotY, dotRadius + 3, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    for (const npc of npcShips) {
      const relativeX = (npc.state.position.x + SECTOR_SIZE / 2) / SECTOR_SIZE;
      const relativeY = (npc.state.position.y + SECTOR_SIZE / 2) / SECTOR_SIZE;
      const dotX = mapX + clamp(relativeX, 0, 1) * MINIMAP_SIZE;
      const dotY = mapY + clamp(relativeY, 0, 1) * MINIMAP_SIZE;
      const hostility = npc.getNPCHostilityState();
      this.ctx.save();
      this.ctx.globalAlpha = npc.getOpacity();

      // Inner dot keeps faction identity; disposition is encoded by the outer ring.
      this.ctx.fillStyle = worldState.getFactionVisual(npc.state.factionId ?? '').primaryColour;
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, NPC_DOT_RADIUS, 0, Math.PI * 2);
      this.ctx.fill();

      if (hostility !== 'none') {
        const ringPulse = 0.45 + (Math.sin(performance.now() * (Math.PI * 2 / 600)) + 1) * 0.25;
        const ringColour = hostility === 'toPlayer' ? COLOURS.DANGER : COLOURS.NPC_HOSTILE_OTHER;
        this.ctx.globalAlpha *= ringPulse;
        this.ctx.strokeStyle = ringColour;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(dotX, dotY, NPC_DOT_RADIUS + 2, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      if (shipTargetId !== null && npc.state.id === shipTargetId) {
        const pulse = 0.55 + (Math.sin(performance.now() * (Math.PI * 2 / 900)) + 1) * 0.22;
        this.ctx.save();
        this.ctx.globalAlpha = pulse * npc.getOpacity();
        this.ctx.strokeStyle = COLOURS.UI_ACCENT;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(dotX, dotY, NPC_DOT_RADIUS + 5, 0, Math.PI * 2);
        this.ctx.stroke();
        const tick = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(dotX - tick, dotY);
        this.ctx.lineTo(dotX + tick, dotY);
        this.ctx.moveTo(dotX, dotY - tick);
        this.ctx.lineTo(dotX, dotY + tick);
        this.ctx.stroke();
        this.ctx.restore();
      }
      this.ctx.restore();
    }

    const playerMapX = mapX + ((playerPosition.x + SECTOR_SIZE / 2) / SECTOR_SIZE) * MINIMAP_SIZE;
    const playerMapY = mapY + ((playerPosition.y + SECTOR_SIZE / 2) / SECTOR_SIZE) * MINIMAP_SIZE;
    const heading = worldState.getPlayerShipState().angle - Math.PI / 2;
    const size = 6;
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.beginPath();
    this.ctx.moveTo(playerMapX + Math.cos(heading) * size, playerMapY + Math.sin(heading) * size);
    this.ctx.lineTo(
      playerMapX + Math.cos(heading + (Math.PI * 2) / 3) * (size - 2),
      playerMapY + Math.sin(heading + (Math.PI * 2) / 3) * (size - 2)
    );
    this.ctx.lineTo(
      playerMapX + Math.cos(heading - (Math.PI * 2) / 3) * (size - 2),
      playerMapY + Math.sin(heading - (Math.PI * 2) / 3) * (size - 2)
    );
    this.ctx.closePath();
    this.ctx.fill();

    this.renderVisitedSectorGrid(worldState, mapX + 6, mapY + MINIMAP_SIZE - 32);
  }

  private renderVisitedSectorGrid(worldState: WorldState, originX: number, originY: number): void {
    const cellSize = 8;
    const gap = 2;
    const current = worldState.getCurrentSectorCoord();

    for (let row = -1; row <= 1; row += 1) {
      for (let col = -1; col <= 1; col += 1) {
        // Screen rows increase downward, but sector Y increases upward.
        const rawCoord = { x: current.x + col, y: current.y - row };
        const coord = worldState.wrapSectorCoord(rawCoord);
        const x = originX + (col + 1) * (cellSize + gap);
        const y = originY + (row + 1) * (cellSize + gap);

        this.ctx.strokeStyle = COLOURS.STAR_DIM;
        this.ctx.strokeRect(x, y, cellSize, cellSize);

        if (worldState.isVisited(coord)) {
          const sector = worldState.getSector(coord);
          const hasLandables = (sector?.landables.length ?? 0) > 0;
          this.ctx.fillStyle = hasLandables
            ? 'rgba(64, 192, 255, 0.45)'
            : 'rgba(106, 106, 138, 0.55)';
          this.ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }

        if (coord.x === current.x && coord.y === current.y) {
          this.ctx.strokeStyle = COLOURS.UI_ACCENT;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x - 1, y - 1, cellSize + 2, cellSize + 2);
        }

        // Subtle slash marks neighboring cells that wrapped across the torus seam.
        if (!worldState.isSectorCoordInGalaxyBounds(rawCoord)) {
          this.ctx.strokeStyle = 'rgba(240, 210, 110, 0.6)';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x + cellSize - 2, y + 2);
          this.ctx.lineTo(x + 2, y + cellSize - 2);
          this.ctx.stroke();
        }
      }
    }
  }
}

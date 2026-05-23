import type { FactionVisual, HullDimensions, HullSilhouette } from '../../types';
import { traceHullPath } from './hullBuilder';
import { applyEquipmentOverlay } from './equipmentOverlay';

export function drawShip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  silhouette: HullSilhouette,
  dimensions: HullDimensions,
  factionVisual: FactionVisual,
  armourMass: number
): void {
  ctx.fillStyle = factionVisual.primaryColour;
  ctx.strokeStyle = factionVisual.primaryColour;
  ctx.lineWidth = 1.5;
  traceHullPath(ctx, silhouette, dimensions);
  ctx.fill();
  ctx.stroke();
  traceHullPath(ctx, silhouette, dimensions);
  applyEquipmentOverlay(ctx, armourMass, factionVisual.secondaryColour);
}

import type { FactionVisual, HullSpec } from '../../types';
import { traceHullPath } from './hullBuilder';
import { applyEquipmentOverlay } from './equipmentOverlay';

export function drawShip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  hullClass: HullSpec['hullClass'],
  dimensions: { length: number; width: number },
  factionVisual: FactionVisual,
  armourMass: number,
  renderHint?: string
): void {
  ctx.fillStyle = factionVisual.primaryColour;
  ctx.strokeStyle = factionVisual.primaryColour;
  ctx.lineWidth = 1.5;
  traceHullPath(ctx, hullClass, dimensions, renderHint);
  ctx.fill();
  ctx.stroke();
  traceHullPath(ctx, hullClass, dimensions, renderHint);
  applyEquipmentOverlay(ctx, armourMass, factionVisual.secondaryColour);
}

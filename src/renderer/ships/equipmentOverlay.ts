export function applyEquipmentOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  armourMass: number,
  secondaryColour: string
): void {
  if (armourMass <= 0) {
    return;
  }
  const strokeWidth = Math.max(2, Math.min(5, 2 + armourMass / 30));
  ctx.save();
  ctx.strokeStyle = secondaryColour;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

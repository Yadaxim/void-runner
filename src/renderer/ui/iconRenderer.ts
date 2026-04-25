import { COLOURS } from '../../constants';

export function renderEquipmentIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number
): void {
  const half = size / 2;
  ctx.save();
  ctx.strokeStyle = COLOURS.UI_PRIMARY;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - half);
  ctx.lineTo(centerX + half, centerY);
  ctx.lineTo(centerX, centerY + half);
  ctx.lineTo(centerX - half, centerY);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX - half * 0.6, centerY);
  ctx.lineTo(centerX + half * 0.6, centerY);
  ctx.moveTo(centerX, centerY - half * 0.6);
  ctx.lineTo(centerX, centerY + half * 0.6);
  ctx.strokeStyle = COLOURS.UI_ACCENT;
  ctx.stroke();
  ctx.restore();
}

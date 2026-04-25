import type { FactionVisual } from '../../types';

export function drawStation(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  _seed: number,
  factionVisual: FactionVisual,
  currentAngle: number
): void {
  const coreRadius = radius * 0.45;
  const armLength = radius * 0.75;
  const armWidth = Math.max(4, radius * 0.2);

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.rotate(currentAngle);

  ctx.fillStyle = 'rgba(20, 24, 35, 0.9)';
  ctx.strokeStyle = factionVisual.primaryColour;
  ctx.lineWidth = 2;

  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    const x = Math.cos(angle) * coreRadius;
    const y = Math.sin(angle) * coreRadius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.rotate((Math.PI / 2) * i);
    ctx.beginPath();
    ctx.rect(coreRadius - 2, -armWidth / 2, armLength, armWidth);
    ctx.fillStyle = 'rgba(12, 15, 24, 0.95)';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
export function renderStation(): void { throw new Error('not implemented'); }

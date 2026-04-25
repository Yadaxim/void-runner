import { SplitMix64 } from '../../core/prng';

export function drawMoon(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  centreY: number,
  radius: number,
  seed: number
): void {
  const prng = new SplitMix64(seed >>> 0);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
  ctx.clip();

  const fill = ctx.createRadialGradient(
    centreX - radius * 0.25,
    centreY - radius * 0.25,
    radius * 0.1,
    centreX,
    centreY,
    radius
  );
  fill.addColorStop(0, '#b0b0b0');
  fill.addColorStop(1, '#404040');
  ctx.fillStyle = fill;
  ctx.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2);

  const craterCount = 3 + Math.floor(prng.next() * 3);
  for (let i = 0; i < craterCount; i += 1) {
    const angle = prng.next() * Math.PI * 2;
    const distance = prng.next() * radius * 0.65;
    const craterX = centreX + Math.cos(angle) * distance;
    const craterY = centreY + Math.sin(angle) * distance;
    const craterRadius = radius * (0.15 + prng.next() * 0.1);
    ctx.fillStyle = 'rgba(35, 35, 35, 0.35)';
    ctx.beginPath();
    ctx.arc(craterX, craterY, craterRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  const crescentDirection = prng.next() > 0.5 ? 1 : -1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(
    centreX + crescentDirection * radius * 0.42,
    centreY,
    radius * 0.95,
    radius * 1.05,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}
export function renderMoon(): void { throw new Error('not implemented'); }

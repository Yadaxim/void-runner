import type { FactionVisual, HullDimensions, HullSilhouette } from '../../types';

function brightenHex(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return hex;
  }
  const r = Math.min(255, Math.round(parseInt(value.slice(0, 2), 16) * (1 + amount)));
  const g = Math.min(255, Math.round(parseInt(value.slice(2, 4), 16) * (1 + amount)));
  const b = Math.min(255, Math.round(parseInt(value.slice(4, 6), 16) * (1 + amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function traceFighterPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: HullDimensions
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;

  ctx.beginPath();
  ctx.moveTo(0, -halfLength);
  ctx.lineTo(halfWidth * 0.75, halfLength * 0.55);
  ctx.lineTo(0, halfLength * 0.35);
  ctx.lineTo(-halfWidth * 0.75, halfLength * 0.55);
  ctx.closePath();
}

function traceInterceptorPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: HullDimensions
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  ctx.moveTo(0, -halfLength);
  ctx.lineTo(halfWidth * 0.45, -halfLength * 0.18);
  ctx.lineTo(halfWidth * 0.55, halfLength * 0.5);
  ctx.lineTo(halfWidth * 0.25, halfLength * 0.95);
  ctx.lineTo(0, halfLength * 0.7);
  ctx.lineTo(-halfWidth * 0.25, halfLength * 0.95);
  ctx.lineTo(-halfWidth * 0.55, halfLength * 0.5);
  ctx.lineTo(-halfWidth * 0.45, -halfLength * 0.18);
  ctx.closePath();
}

function traceShuttlePath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: HullDimensions
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  ctx.moveTo(0, -halfLength * 0.52);
  ctx.lineTo(halfWidth * 0.88, -halfLength * 0.22);
  ctx.lineTo(halfWidth, halfLength * 0.28);
  ctx.lineTo(halfWidth * 0.72, halfLength * 0.62);
  ctx.lineTo(halfWidth * 0.42, halfLength);
  ctx.lineTo(0, halfLength * 0.88);
  ctx.lineTo(-halfWidth * 0.42, halfLength);
  ctx.lineTo(-halfWidth * 0.72, halfLength * 0.62);
  ctx.lineTo(-halfWidth, halfLength * 0.28);
  ctx.lineTo(-halfWidth * 0.88, -halfLength * 0.22);
  ctx.closePath();
}

function traceCourierPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: HullDimensions
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  ctx.moveTo(0, -halfLength);
  ctx.lineTo(halfWidth * 0.72, -halfLength * 0.25);
  ctx.lineTo(halfWidth * 0.9, halfLength * 0.25);
  ctx.lineTo(halfWidth * 0.45, halfLength * 0.82);
  ctx.lineTo(-halfWidth * 0.45, halfLength * 0.82);
  ctx.lineTo(-halfWidth * 0.9, halfLength * 0.25);
  ctx.lineTo(-halfWidth * 0.72, -halfLength * 0.25);
  ctx.closePath();
}

function traceFreighterPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: HullDimensions
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  ctx.moveTo(-halfWidth * 0.55, -halfLength);
  ctx.lineTo(halfWidth * 0.55, -halfLength);
  ctx.lineTo(halfWidth, -halfLength * 0.45);
  ctx.lineTo(halfWidth, halfLength * 0.8);
  ctx.lineTo(halfWidth * 0.7, halfLength);
  ctx.lineTo(-halfWidth * 0.7, halfLength);
  ctx.lineTo(-halfWidth, halfLength * 0.8);
  ctx.lineTo(-halfWidth, -halfLength * 0.45);
  ctx.closePath();
}

export function traceHullPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  silhouette: HullSilhouette,
  dimensions: HullDimensions
): void {
  switch (silhouette) {
    case 'interceptor':
      traceInterceptorPath(ctx, dimensions);
      return;
    case 'shuttle':
      traceShuttlePath(ctx, dimensions);
      return;
    case 'courier':
      traceCourierPath(ctx, dimensions);
      return;
    case 'freighter':
      traceFreighterPath(ctx, dimensions);
      return;
    case 'heavy':
      ctx.beginPath();
      ctx.rect(-dimensions.width / 2, -dimensions.length / 2, dimensions.width, dimensions.length);
      ctx.closePath();
      return;
    default:
      traceFighterPath(ctx, dimensions);
  }
}

export function drawHull(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  silhouette: HullSilhouette,
  dimensions: HullDimensions,
  factionVisual: FactionVisual
): void {
  ctx.fillStyle = factionVisual.primaryColour;
  ctx.strokeStyle = brightenHex(factionVisual.primaryColour, 0.25);
  ctx.lineWidth = 1.5;
  traceHullPath(ctx, silhouette, dimensions);
  ctx.fill();
  ctx.stroke();
}

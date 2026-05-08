import type { FactionVisual, HullSpec } from '../../types';

type HullClass = HullSpec['hullClass'];

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
  dimensions: { length: number; width: number },
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  const wingY = halfLength * 0.15;

  ctx.beginPath();
  ctx.moveTo(0, -halfLength);
  ctx.lineTo(halfWidth * 0.75, halfLength * 0.55);
  ctx.lineTo(0, halfLength * 0.35);
  ctx.lineTo(-halfWidth * 0.75, halfLength * 0.55);
  ctx.closePath();
}

function traceInterceptorPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: { length: number; width: number },
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  // Narrow dart profile: long nose, slim body, swept tail fins.
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

function traceCourierPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dimensions: { length: number; width: number }
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  // Pointed nose, flared mid-body, clipped stern.
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
  dimensions: { length: number; width: number }
): void {
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  ctx.beginPath();
  // Blunt, blocky hull with a broad cargo body.
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
  hullClass: HullClass,
  dimensions: { length: number; width: number },
  renderHint?: string
): void {
  if (hullClass === 'fighter') {
    if (renderHint === 'interceptor') {
      traceInterceptorPath(ctx, dimensions);
      return;
    }
    traceFighterPath(ctx, dimensions);
    return;
  }
  if (hullClass === 'courier') {
    traceCourierPath(ctx, dimensions);
    return;
  }
  if (hullClass === 'freighter') {
    traceFreighterPath(ctx, dimensions);
    return;
  }
  ctx.beginPath();
  ctx.rect(-dimensions.width / 2, -dimensions.length / 2, dimensions.width, dimensions.length);
  ctx.closePath();
}

export function drawHull(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  hullClass: HullClass,
  dimensions: { length: number; width: number },
  factionVisual: FactionVisual
): void {
  ctx.fillStyle = factionVisual.primaryColour;
  ctx.strokeStyle = brightenHex(factionVisual.primaryColour, 0.25);
  ctx.lineWidth = 1.5;
  traceHullPath(ctx, hullClass, dimensions);
  ctx.fill();
  ctx.stroke();
}

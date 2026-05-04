import { Vector2 } from '../physics/vector2';
import type { GridCoord } from '../types';

/** Euclidean distance between sector grid coordinates (continuous). */
export function sectorGridDistance(a: GridCoord, b: GridCoord): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Integer sector coord inside galaxy half-open bounds (matches `WorldState.isSectorCoordInGalaxyBounds`). */
export function clampSectorCoordToGalaxy(coord: { x: number; y: number }, gridWidth: number, gridHeight: number): GridCoord {
  const hw = gridWidth / 2;
  const hh = gridHeight / 2;
  const maxX = hw - 1;
  const maxY = hh - 1;
  return {
    x: clampInt(coord.x, -hw, maxX),
    y: clampInt(coord.y, -hh, maxY)
  };
}

/**
 * Landing sector after one hyperspace hop toward `target` from `current`.
 * Travels `min(distance, jumpRange)` along the straight line in grid space (then rounds to integer sector).
 * Returns `null` if target equals current (no hop).
 */
export function computeHyperspaceLandingSector(
  current: GridCoord,
  target: GridCoord,
  jumpRange: number,
  gridWidth: number,
  gridHeight: number
): GridCoord | null {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) {
    return null;
  }
  const step = Math.min(dist, Math.max(0, jumpRange));
  const fx = current.x + (dx / dist) * step;
  const fy = current.y + (dy / dist) * step;
  return clampSectorCoordToGalaxy({ x: fx, y: fy }, gridWidth, gridHeight);
}

/**
 * World-space unit vector for a hop from `from` toward `landing` (grid delta mapped to match ship thrust: +y is screen-up style).
 */
export function getHyperspaceHopWorldDirection(from: GridCoord, landing: GridCoord): Vector2 | null {
  const gdx = landing.x - from.x;
  const gdy = landing.y - from.y;
  const m = Math.hypot(gdx, gdy);
  if (m < 1e-9) {
    return null;
  }
  return new Vector2(gdx, -gdy).normalise();
}

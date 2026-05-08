import { Vector2 } from '../physics/vector2';
import type { GridCoord } from '../types';

function shortestWrappedAxisDelta(from: number, to: number, period: number): number {
  const direct = to - from;
  if (period <= 0) {
    return direct;
  }
  const wrapped = ((direct + period / 2) % period + period) % period - period / 2;
  return wrapped;
}

function wrapAxis(n: number, minInclusive: number, period: number): number {
  if (period <= 0) {
    return Math.round(n);
  }
  const rounded = Math.round(n);
  return ((rounded - minInclusive) % period + period) % period + minInclusive;
}

/** Euclidean distance between sector coordinates using shortest torus deltas. */
export function sectorGridDistance(a: GridCoord, b: GridCoord, gridWidth: number, gridHeight: number): number {
  const dx = shortestWrappedAxisDelta(a.x, b.x, gridWidth);
  const dy = shortestWrappedAxisDelta(a.y, b.y, gridHeight);
  return Math.hypot(dx, dy);
}

/** Integer sector coord wrapped into galaxy half-open bounds. */
export function clampSectorCoordToGalaxy(coord: { x: number; y: number }, gridWidth: number, gridHeight: number): GridCoord {
  const hw = gridWidth / 2;
  const hh = gridHeight / 2;
  return {
    x: wrapAxis(coord.x, -hw, gridWidth),
    y: wrapAxis(coord.y, -hh, gridHeight)
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
  const dx = shortestWrappedAxisDelta(current.x, target.x, gridWidth);
  const dy = shortestWrappedAxisDelta(current.y, target.y, gridHeight);
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
export function getHyperspaceHopWorldDirection(
  from: GridCoord,
  landing: GridCoord,
  gridWidth: number,
  gridHeight: number
): Vector2 | null {
  const gdx = shortestWrappedAxisDelta(from.x, landing.x, gridWidth);
  const gdy = shortestWrappedAxisDelta(from.y, landing.y, gridHeight);
  const m = Math.hypot(gdx, gdy);
  if (m < 1e-9) {
    return null;
  }
  return new Vector2(gdx, -gdy).normalise();
}

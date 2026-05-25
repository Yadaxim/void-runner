import { RADIATION_INNER_RADIUS, RADIATION_OUTER_RADIUS } from '../constants';
import { sectorGridDistance } from '../sim/hyperspaceJump';
import type { GridCoord } from '../types/world';

const GALAXY_CENTRE: GridCoord = { x: 0, y: 0 };

/** Radiation falloff 0..1 by torus distance from galactic centre (matches runtime). */
export function radiationIntensityAtCoord(
  coord: GridCoord,
  gridWidth: number,
  gridHeight: number
): number {
  const dist = sectorGridDistance(coord, GALAXY_CENTRE, gridWidth, gridHeight);
  const t = (RADIATION_OUTER_RADIUS - dist) / (RADIATION_OUTER_RADIUS - RADIATION_INNER_RADIUS);
  return Math.pow(Math.max(0, Math.min(1, t)), 2);
}

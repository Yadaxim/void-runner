import { SECTOR_EDGE_THRESHOLD, SECTOR_SIZE } from '../constants';
import type { GridCoord } from '../types';
import { Vector2 } from '../physics/vector2';
import { clampSectorCoordToGalaxy } from './hyperspaceJump';

export type SectorEdge = 'north' | 'south' | 'east' | 'west';

/** @see flightScreen.getAdjacentCoord — extracted for tests and navigation consistency */
export function getAdjacentSectorCoord(
  coord: GridCoord,
  edge: SectorEdge,
  gridWidth: number,
  gridHeight: number
): GridCoord {
  const next: GridCoord = (() => {
  if (edge === 'north') {
    return { x: coord.x, y: coord.y + 1 };
  }
  if (edge === 'south') {
    return { x: coord.x, y: coord.y - 1 };
  }
  if (edge === 'east') {
    return { x: coord.x + 1, y: coord.y };
  }
  return { x: coord.x - 1, y: coord.y };
  })();
  return clampSectorCoordToGalaxy(next, gridWidth, gridHeight);
}

/** Player spawn position on the inward side of a sector after crossing `edge` (preserves lateral coordinate). */
export function playerSpawnPositionAfterCrossing(edge: SectorEdge, previousPosition: Vector2): Vector2 {
  const spawnInset = SECTOR_EDGE_THRESHOLD * 2;
  if (edge === 'east') {
    return new Vector2(-(SECTOR_SIZE / 2) + spawnInset, previousPosition.y);
  }
  if (edge === 'west') {
    return new Vector2(SECTOR_SIZE / 2 - spawnInset, previousPosition.y);
  }
  if (edge === 'north') {
    return new Vector2(previousPosition.x, SECTOR_SIZE / 2 - spawnInset);
  }
  return new Vector2(previousPosition.x, -(SECTOR_SIZE / 2) + spawnInset);
}

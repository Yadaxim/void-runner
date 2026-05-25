import type { GridCoord } from '../types/world';

export function gridIndices(
  coord: GridCoord,
  sizeX: number,
  sizeY: number
): { col: number; row: number } {
  const hw = Math.floor(sizeX / 2);
  const hh = Math.floor(sizeY / 2);
  return {
    col: coord.x + hw,
    row: hh - 1 - coord.y
  };
}

export function coordFromGridIndices(col: number, row: number, sizeX: number, sizeY: number): GridCoord {
  const hw = Math.floor(sizeX / 2);
  const hh = Math.floor(sizeY / 2);
  return { x: col - hw, y: hh - 1 - row };
}

/** 0..1 weight — highest on grid edges where the torus wraps. */
export function torusSeamWeight(col: number, row: number, sizeX: number, sizeY: number): number {
  const distX = Math.min(col, sizeX - 1 - col);
  const distY = Math.min(row, sizeY - 1 - row);
  const distToSeam = Math.min(distX, distY);
  const falloff = Math.max(2, Math.min(sizeX, sizeY) * 0.1);
  return Math.exp(-distToSeam / falloff);
}

export function torusNeighbours(col: number, row: number, sizeX: number, sizeY: number): [number, number][] {
  return [
    [(col + 1) % sizeX, row],
    [(col - 1 + sizeX) % sizeX, row],
    [col, (row + 1) % sizeY],
    [col, (row - 1 + sizeY) % sizeY]
  ];
}

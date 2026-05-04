import { describe, expect, it } from 'vitest';
import {
  clampSectorCoordToGalaxy,
  computeHyperspaceLandingSector,
  sectorGridDistance
} from './hyperspaceJump';

describe('hyperspaceJump', () => {
  it('sectorGridDistance is Euclidean in grid units', () => {
    expect(sectorGridDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('full hop when target within range', () => {
    const land = computeHyperspaceLandingSector({ x: 0, y: 0 }, { x: 1, y: 1 }, 2, 30, 30);
    expect(land).toEqual({ x: 1, y: 1 });
  });

  it('partial hop along ray when target farther than range', () => {
    const land = computeHyperspaceLandingSector({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, 30, 30);
    expect(land).toEqual({ x: 2, y: 0 });
  });

  it('returns null when target equals current', () => {
    expect(computeHyperspaceLandingSector({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 30, 30)).toBeNull();
  });

  it('clampSectorCoordToGalaxy matches half-open bounds', () => {
    const c = clampSectorCoordToGalaxy({ x: 99, y: -99 }, 30, 30);
    expect(c.x).toBeLessThanOrEqual(14);
    expect(c.x).toBeGreaterThanOrEqual(-15);
    expect(c.y).toBeLessThanOrEqual(14);
    expect(c.y).toBeGreaterThanOrEqual(-15);
  });
});

import type { GalaxyShape } from './types/galaxyStructure';
import { armInfluence } from './spiralArms';

/** Planet-placement weight for a grid cell (0..1). Does not remove sectors from the galaxy. */
export function galaxyShapeWeight(
  shape: GalaxyShape,
  col: number,
  row: number,
  sizeX: number,
  sizeY: number,
  seed: number
): number {
  const cx = (sizeX - 1) / 2;
  const cy = (sizeY - 1) / 2;
  const dx = col - cx;
  const dy = row - cy;
  const maxR = Math.min(cx, cy) || 1;
  const r = Math.sqrt(dx * dx + dy * dy) / maxR;

  switch (shape) {
    case 'disc':
      return r <= 1 ? 1 : 0;
    case 'ring': {
      const inner = 0.45;
      return r >= inner && r <= 1 ? 1 : 0;
    }
    case 'spiral':
      if (r > 1) {
        return 0;
      }
      return armInfluence(col, row, sizeX, sizeY, seed);
    case 'heterogeneous': {
      if (r > 1) {
        return 0;
      }
      const n =
        Math.sin(col * 0.31 + seed * 0.001) * Math.cos(row * 0.27 - seed * 0.0007) +
        Math.sin((col + row) * 0.19) * 0.5;
      return clamp01(0.35 + n * 0.35);
    }
    default:
      return r <= 1 ? 1 : 0;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

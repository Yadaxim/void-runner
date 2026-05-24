/**
 * Log-spiral arm density (0..1) on the sector grid.
 *
 * Uses game-aligned coords: row 0 = top of map = +Y (matches galaxy map / sector grid).
 * Arm locus: θ + twist·ln(r) ≡ 0 (mod π) for two arms.
 */
export function armInfluence(
  col: number,
  row: number,
  sizeX: number,
  sizeY: number,
  seed: number,
  armCount = 2
): number {
  const cx = (sizeX - 1) / 2;
  const cy = (sizeY - 1) / 2;
  const maxR = Math.min(cx, cy) || 1;

  const nx = (col - cx) / maxR;
  const ny = (cy - row) / maxR;
  const r = Math.hypot(nx, ny);
  if (r > 1) {
    return 0;
  }

  const angle = Math.atan2(ny, nx);
  const twist = 2.2;
  const seedPhase = ((seed >>> 0) % 1000) / 1000 * (2 * Math.PI);
  const f = angle + twist * Math.log(Math.max(r, 0.03)) + seedPhase;

  const period = (2 * Math.PI) / armCount;
  let phase = f % period;
  if (phase < 0) {
    phase += period;
  }
  const distFromArm = Math.min(phase, period - phase);

  const armWidth = 0.34 + r * 0.14;
  let weight = Math.exp(-0.5 * (distFromArm / armWidth) ** 2);

  if (r > 0.92) {
    weight *= Math.max(0, (1 - r) / 0.08);
  }

  const armWeight = weight ** 0.72;
  const bulgeWeight = galacticBulge(r);
  return clamp01(Math.max(armWeight, bulgeWeight));
}

/** Small dense core overlaid on spiral arms (galactic bulge). */
function galacticBulge(r: number): number {
  const bulgeRadius = 0.18;
  return Math.exp(-0.5 * (r / bulgeRadius) ** 2);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

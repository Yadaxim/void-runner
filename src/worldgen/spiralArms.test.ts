import { armInfluence } from './spiralArms';
import { galaxyShapeWeight } from './galaxyShapeMask';

describe('armInfluence', () => {
  it('returns 0 outside the bounding disc', () => {
    expect(armInfluence(0, 0, 40, 40, 42)).toBe(0);
    expect(armInfluence(20, 20, 40, 40, 42)).toBeGreaterThan(0);
  });

  it('forms two-arm spiral with higher weight on arms than gaps', () => {
    const size = 40;
    const seed = 424242;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const maxR = Math.min(cx, cy);
    const twist = 2.2;
    const seedPhase = (seed % 1000) / 1000 * (2 * Math.PI);
    const period = Math.PI;

    let armSum = 0;
    let armCount = 0;
    let gapSum = 0;
    let gapCount = 0;

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const nx = (col - cx) / maxR;
        const ny = (cy - row) / maxR;
        const r = Math.hypot(nx, ny);
        if (r < 0.15 || r > 0.9) continue;

        const w = armInfluence(col, row, size, size, seed);
        const angle = Math.atan2(ny, nx);
        const f = angle + twist * Math.log(Math.max(r, 0.03)) + seedPhase;
        let phase = f % period;
        if (phase < 0) phase += period;
        const distFromArm = Math.min(phase, period - phase);

        if (distFromArm < 0.18) {
          armSum += w;
          armCount += 1;
        } else if (distFromArm > 0.42) {
          gapSum += w;
          gapCount += 1;
        }
      }
    }

    expect(armCount).toBeGreaterThan(15);
    expect(gapCount).toBeGreaterThan(15);
    expect(armSum / armCount).toBeGreaterThan((gapSum / gapCount) * 1.5);
  });

  it('densifies the galactic core with a small bulge overlay', () => {
    const size = 40;
    const seed = 424242;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const maxR = Math.min(cx, cy);

    let coreHigh = 0;
    let coreTotal = 0;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const nx = (col - cx) / maxR;
        const ny = (cy - row) / maxR;
        const r = Math.hypot(nx, ny);
        if (r > 0.14) continue;
        coreTotal += 1;
        if (armInfluence(col, row, size, size, seed) > 0.55) {
          coreHigh += 1;
        }
      }
    }

    expect(coreTotal).toBeGreaterThan(10);
    expect(coreHigh / coreTotal).toBeGreaterThan(0.85);
  });

  it('has high-weight cells tracing curved arms (not a solid disc)', () => {
    const size = 40;
    const seed = 424242;
    let highCount = 0;
    let totalInDisc = 0;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const w = armInfluence(col, row, size, size, seed);
        if (w <= 0) continue;
        totalInDisc += 1;
        if (w > 0.5) highCount += 1;
      }
    }
    expect(highCount / totalInDisc).toBeLessThan(0.65);
    expect(highCount).toBeGreaterThan(120);
  });
});

describe('galaxyShapeWeight spiral', () => {
  it('varies strongly between arms and gaps', () => {
    const size = 40;
    const seed = 99;
    const weights: number[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const w = galaxyShapeWeight('spiral', col, row, size, size, seed);
        if (w > 0) weights.push(w);
      }
    }
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    expect(max - min).toBeGreaterThan(0.45);
    expect(min).toBeLessThan(0.25);
    expect(max).toBeGreaterThan(0.65);
  });
});

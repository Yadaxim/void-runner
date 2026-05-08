import { describe, expect, it } from 'vitest';
import { loadTestWorldFile, makeHeadlessSim } from '../sim/headlessSim';
import { buildControlFrameSensorSnapshot } from './controlFrameSensor';

describe('buildControlFrameSensorSnapshot', () => {
  it('includes kinematics and normalized hull/shield fractions', () => {
    const wf = loadTestWorldFile();
    const { worldState, playerShip, sectorSimulation } = makeHeadlessSim({ worldFile: wf });
    const npcs = sectorSimulation.getNPCShips();
    const snap = buildControlFrameSensorSnapshot(worldState, playerShip, npcs, {
      landPressed: false,
      devRefuelPressed: false
    });
    expect(snap.position.x).toBeDefined();
    expect(snap.velocity.y).toBeDefined();
    expect(snap.hullFraction).toBeGreaterThanOrEqual(0);
    expect(snap.hullFraction).toBeLessThanOrEqual(1);
    expect(snap.shieldFraction).toBeGreaterThanOrEqual(0);
    expect(snap.shieldFraction).toBeLessThanOrEqual(1);
    expect(snap.radiationIntensity).toBeGreaterThanOrEqual(0);
    expect(snap.landPressed).toBe(false);
  });
});

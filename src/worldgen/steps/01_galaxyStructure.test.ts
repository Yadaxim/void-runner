import { SECTOR_SIZE } from '../../constants';
import {
  buildAllSectorCoords,
  generateGalaxyStructure,
  validateGalaxyStructureOutput
} from './01_galaxyStructure';
import { defaultGalaxyStructureInput } from '../types/galaxyStructure';

describe('generateGalaxyStructure', () => {
  const baseInput = defaultGalaxyStructureInput({
    sizeX: 20,
    sizeY: 20,
    sectorSize: SECTOR_SIZE,
    shape: 'disc',
    planetDensity: 0.5,
    moonProbability: 0.5,
    moonsPerPlanetRange: [1, 2],
    seed: 12345
  });

  it('is deterministic for the same seed', () => {
    const a = generateGalaxyStructure(baseInput);
    const b = generateGalaxyStructure(baseInput);
    expect(a).toEqual(b);
  });

  it('includes every sector on the grid in WorldFile sector format', () => {
    const out = generateGalaxyStructure(baseInput);
    expect(out.sectors).toHaveLength(baseInput.sizeX * baseInput.sizeY);
    expect(out.sectors.map((s) => s.coord)).toEqual(buildAllSectorCoords(baseInput.sizeX, baseInput.sizeY));
    expect(out.galaxy).toEqual({
      gridWidth: baseInput.sizeX,
      gridHeight: baseInput.sizeY,
      sectorSize: SECTOR_SIZE
    });
  });

  it('embeds landables inside sector entries', () => {
    const out = generateGalaxyStructure(baseInput);
    const totalLandables = out.sectors.reduce((n, s) => n + s.landables.length, 0);
    expect(totalLandables).toBeGreaterThan(0);
    for (const sector of out.sectors) {
      for (const landable of sector.landables) {
        expect(landable.position).toEqual(
          expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
        );
      }
    }
  });

  it('keeps landable positions within sector bounds', () => {
    const out = generateGalaxyStructure(baseInput);
    const half = out.galaxy.sectorSize / 2;
    for (const sector of out.sectors) {
      for (const landable of sector.landables) {
        expect(Math.abs(landable.position.x)).toBeLessThanOrEqual(half);
        expect(Math.abs(landable.position.y)).toBeLessThanOrEqual(half);
      }
    }
  });

  it('passes output validation', () => {
    const out = generateGalaxyStructure(baseInput);
    expect(validateGalaxyStructureOutput(out, baseInput)).toEqual([]);
  });

  it('produces fewer planets outside the disc mask than at the core', () => {
    const input = { ...baseInput, sizeX: 40, sizeY: 40, planetDensity: 1, moonProbability: 0, seed: 99 };
    const out = generateGalaxyStructure(input);
    const hw = Math.floor(input.sizeX / 2);
    const hh = Math.floor(input.sizeY / 2);
    const centerPlanets = out.sectors.find((s) => s.coord.x === 0 && s.coord.y === 0)!.landables.filter(
      (l) => l.type === 'planet'
    ).length;
    const cornerPlanets = out.sectors.find((s) => s.coord.x === -hw + 1 && s.coord.y === hh - 1)!.landables.filter(
      (l) => l.type === 'planet'
    ).length;
    expect(centerPlanets).toBeGreaterThanOrEqual(cornerPlanets);
  });

  it('rejects sectors with moons but no planet', () => {
    const out = generateGalaxyStructure(baseInput);
    const bad = structuredClone(out);
    const sector = bad.sectors.find((s) => s.coord.x === 0 && s.coord.y === 0)!;
    sector.landables = sector.landables.filter((l) => l.type !== 'planet');
    sector.landables.push({
      id: 'bad_moon',
      name: '',
      type: 'moon',
      description: '',
      atmosphere: '',
      factionControl: [],
      controlState: 'sole',
      mass: 20000,
      radius: 20,
      position: { x: 0, y: 0 },
      services: [],
      rotationSpeed: 0,
      seed: 1
    });
    expect(validateGalaxyStructureOutput(bad, baseInput).some((e) => e.includes('moons but no planet'))).toBe(true);
  });
});

describe('buildAllSectorCoords', () => {
  it('matches game grid convention for 60×60', () => {
    const coords = buildAllSectorCoords(60, 60);
    expect(coords).toHaveLength(3600);
    expect(coords[0]).toEqual({ x: -30, y: 29 });
    expect(coords[coords.length - 1]).toEqual({ x: 29, y: -30 });
  });
});

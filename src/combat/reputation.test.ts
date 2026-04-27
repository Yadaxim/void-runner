import { describe, expect, it } from 'vitest';
import {
  applyReputationDelta,
  computePirateReputation,
  type RepActionType
} from './reputation';
import type { FactionDefinition } from '../types';
import { Vector2 } from '../physics/vector2';
import { ShipEntity } from '../simulation/shipEntity';
import { NPCController } from '../simulation/npcController';
import { makeShipState } from '../test/fixtures';

const FACTIONS: FactionDefinition[] = [
  {
    id: 'federation',
    name: 'Fed',
    demonym: '',
    description: '',
    shipStyle: '',
    missionFlavour: '',
    homeSector: { x: 0, y: 0 },
    territoryRadius: 1,
    primaryColour: { h: 0, s: 0, l: 0 },
    secondaryColour: { h: 0, s: 0, l: 0 },
    geometryBias: 'angular',
    densityBias: 'dense',
    disposition: {},
    missionTiers: [],
    isPirate: false
  },
  {
    id: 'clans',
    name: 'Clans',
    demonym: '',
    description: '',
    shipStyle: '',
    missionFlavour: '',
    homeSector: { x: 0, y: 0 },
    territoryRadius: 1,
    primaryColour: { h: 0, s: 0, l: 0 },
    secondaryColour: { h: 0, s: 0, l: 0 },
    geometryBias: 'rounded',
    densityBias: 'sparse',
    disposition: {},
    missionTiers: [],
    isPirate: false
  },
  {
    id: 'pirates',
    name: 'Pirates',
    demonym: '',
    description: '',
    shipStyle: '',
    missionFlavour: '',
    homeSector: { x: 0, y: 0 },
    territoryRadius: 1,
    primaryColour: { h: 0, s: 0, l: 0 },
    secondaryColour: { h: 0, s: 0, l: 0 },
    geometryBias: 'rounded',
    densityBias: 'sparse',
    disposition: {},
    missionTiers: [],
    isPirate: true
  }
];

function applyMany(
  start: number,
  times: number,
  delta: number,
  action: RepActionType
): number {
  let r = start;
  for (let i = 0; i < times; i += 1) {
    const { newRep } = applyReputationDelta(r, delta, action);
    r = newRep;
  }
  return r;
}

describe('reputation pure functions', () => {
  it('combat_hit clamps at −50 after many negative hits', () => {
    expect(applyMany(0, 100, -5, 'combat_hit')).toBe(-50);
  });

  it('combat_kill clamps at −70', () => {
    expect(applyMany(0, 50, -5, 'combat_kill')).toBe(-70);
  });

  it('mission_fail floor at −30', () => {
    expect(applyMany(0, 20, -5, 'mission_fail')).toBe(-30);
  });

  it('mission_complete cannot exceed +60', () => {
    expect(applyMany(0, 200, 5, 'mission_complete')).toBe(60);
  });

  it('mission_special ceiling at +85', () => {
    expect(applyMany(0, 200, 10, 'mission_special')).toBe(85);
  });

  it('applies positive delta within bounds from 0', () => {
    const { newRep, actualDelta } = applyReputationDelta(0, 5, 'manual');
    expect(newRep).toBe(5);
    expect(actualDelta).toBe(5);
  });

  it('pirate rep is negative clamped average of non-pirate reps', () => {
    const reps = { federation: 20, clans: 0 };
    expect(computePirateReputation(reps, FACTIONS)).toBe(-10);
  });

  it('pirate rep updates when a non-pirate rep changes', () => {
    const r1 = computePirateReputation({ federation: 10, clans: 10 }, FACTIONS);
    const r2 = computePirateReputation({ federation: -100, clans: -100 }, FACTIONS);
    expect(r2).not.toBe(r1);
    expect(r2).toBe(100);
  });

  it('at combat_hit floor further negative hits do not change rep', () => {
    const { newRep, actualDelta } = applyReputationDelta(-50, -5, 'combat_hit');
    expect(newRep).toBe(-50);
    expect(actualDelta).toBe(0);
  });

  it('same-faction friendly fire: receiveAttack does not engage aggro', () => {
    const ship = new ShipEntity(
      makeShipState({
        id: 'victim',
        isPlayerControlled: false,
        factionId: 'federation',
        position: new Vector2(0, 0),
        velocity: new Vector2(0, 0)
      })
    );
    ship.attachNPCController(new NPCController('patrol', 1, 'federation'), 'patrol');
    ship.getNPCController()!.receiveAttack('ally', 'federation', 50);
    expect(ship.getNPCBehaviourType()).toBe('patrol');
    expect(ship.getNPCController()?.getAggroTargetId()).toBeNull();
  });
});

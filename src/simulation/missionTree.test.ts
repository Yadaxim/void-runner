import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorldState } from '../core/worldState';
import {
  evaluateTreePrerequisite,
  markMissionTreeNodeActive,
  onMissionTreeMissionCompleted,
  refreshMissionTreeAvailability
} from './missionTree';
import { formatGameTime } from './gameTime';
import type { Mission, WorldFile } from '../types';
import { makeShipState } from '../test/fixtures';

function loadWorld(): WorldFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'public/testWorld.json'), 'utf-8')) as WorldFile;
}

describe('game time', () => {
  it('formatGameTime renders cycle label', () => {
    expect(formatGameTime(0)).toBe('Cycle 1.00.00');
    expect(formatGameTime(3600)).toBe('Cycle 1.01.00');
  });

  it('tickTime advances epoch by rate * dt', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }));
    ws.tickTime(1);
    expect(ws.getGameTimeEpoch()).toBe(60);
    expect(ws.getPlayTime()).toBe(1);
  });
});

describe('mission trees', () => {
  it('testWorld tree starts with root node available', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }));
    const progress = ws.getMissionTreeProgress('tree_fed_border_accord');
    expect(progress?.nodeStates.accord_intro).toBe('available');
    expect(progress?.nodeStates.accord_priority).toBe('unavailable');
  });

  it('completing tree missions unlocks next node and applies final consequences', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }));
    const treeId = 'tree_fed_border_accord';

    const mission1: Mission = {
      id: 'msn_test_1',
      templateId: 'tpl_fed_standard_cargo',
      title: 't',
      description: 'd',
      factionRequirements: [],
      cargoWeight: 1,
      destinationLandableId: 'x',
      destinationSectorCoord: { x: 0, y: 0 },
      destinationName: 'x',
      payoff: 100,
      reputationRewards: [],
      acceptedAt: 0,
      missionTreeId: treeId,
      missionTreeNodeId: 'accord_intro'
    };
    markMissionTreeNodeActive(ws, treeId, 'accord_intro');
    onMissionTreeMissionCompleted(ws, mission1);
    refreshMissionTreeAvailability(ws, treeId);
    expect(ws.getMissionTreeProgress(treeId)?.nodeStates.accord_intro).toBe('completed');
    expect(ws.getMissionTreeProgress(treeId)?.nodeStates.accord_priority).toBe('available');

    const mission2: Mission = { ...mission1, id: 'msn_test_2', templateId: 'tpl_fed_priority_cargo', missionTreeNodeId: 'accord_priority' };
    markMissionTreeNodeActive(ws, treeId, 'accord_priority');
    onMissionTreeMissionCompleted(ws, mission2);

    expect(ws.getWorldFlag('fed_border_accord_complete')).toBe(true);
    expect(ws.getFactionDisposition('federation', 'veth_collective')).toBe(0.55);
  });

  it('evaluateTreePrerequisite checks world flags', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }));
    ws.setWorldFlag('test_flag', true);
    expect(
      evaluateTreePrerequisite(ws, { type: 'world_flag', flagId: 'test_flag', value: true })
    ).toBe(true);
  });
});

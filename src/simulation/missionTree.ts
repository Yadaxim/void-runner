import type { WorldState } from '../core/worldState';
import type {
  Mission,
  MissionTreeNodeState,
  MissionTreeProgress,
  MissionTreeProgressMap,
  MissionTreeTemplate,
  ProjectEffect,
  TreePrerequisite,
  WorldFile
} from '../types';
import { isLandableControlledBy } from '../types';

function prereqMatches(actual: unknown, expected: boolean | number | string): boolean {
  return actual === expected;
}

export function evaluateTreePrerequisite(
  worldState: WorldState,
  prereq: TreePrerequisite
): boolean {
  switch (prereq.type) {
    case 'tree_node_completed': {
      const progress = worldState.getMissionTreeProgress(prereq.treeId);
      return progress?.nodeStates[prereq.nodeId] === 'completed';
    }
    case 'tree_node_failed': {
      const progress = worldState.getMissionTreeProgress(prereq.treeId);
      return progress?.nodeStates[prereq.nodeId] === 'failed';
    }
    case 'reputation_at_least':
      return worldState.getReputationForFaction(prereq.factionId) >= prereq.value;
    case 'world_flag': {
      const value = worldState.getWorldFlag(prereq.flagId);
      return value !== undefined && prereqMatches(value, prereq.value);
    }
    default:
      return false;
  }
}

export function evaluateAllPrerequisites(worldState: WorldState, prereqs: TreePrerequisite[]): boolean {
  return prereqs.every((p) => evaluateTreePrerequisite(worldState, p));
}

export function createInitialMissionTreeProgress(templates: MissionTreeTemplate[]): MissionTreeProgressMap {
  const map: MissionTreeProgressMap = {};
  for (const tree of templates) {
    const nodeStates: Record<string, MissionTreeNodeState> = {};
    for (const node of tree.nodes) {
      nodeStates[node.id] = node.prerequisites.length === 0 ? 'available' : 'unavailable';
    }
    map[tree.id] = { started: false, nodeStates };
  }
  return map;
}

export function refreshMissionTreeAvailability(worldState: WorldState, treeId: string): void {
  const template = worldState.getMissionTreeTemplate(treeId);
  const progress = worldState.getMissionTreeProgress(treeId);
  if (!template || !progress) {
    return;
  }
  for (const node of template.nodes) {
    const current = progress.nodeStates[node.id];
    if (current === 'completed' || current === 'failed' || current === 'active') {
      continue;
    }
    progress.nodeStates[node.id] = evaluateAllPrerequisites(worldState, node.prerequisites)
      ? 'available'
      : 'unavailable';
  }
}

export function refreshAllMissionTreeAvailability(worldState: WorldState): void {
  for (const tree of worldState.getMissionTreeTemplates()) {
    refreshMissionTreeAvailability(worldState, tree.id);
  }
}

export function markMissionTreeNodeActive(
  worldState: WorldState,
  treeId: string,
  nodeId: string
): void {
  const progress = worldState.getMissionTreeProgress(treeId);
  if (!progress) {
    return;
  }
  progress.started = true;
  progress.nodeStates[nodeId] = 'active';
}

export function findTreeNodeForTemplate(
  template: MissionTreeTemplate,
  missionTemplateId: string
): { treeId: string; nodeId: string } | null {
  const node = template.nodes.find((n) => n.missionTemplateId === missionTemplateId);
  if (!node) {
    return null;
  }
  return { treeId: template.id, nodeId: node.id };
}

export function onMissionTreeMissionCompleted(
  worldState: WorldState,
  mission: Mission
): boolean {
  let anyChanged = false;
  for (const template of worldState.getMissionTreeTemplates()) {
    const match = findTreeNodeForTemplate(template, mission.templateId);
    if (!match) {
      continue;
    }
    const progress = worldState.getMissionTreeProgress(match.treeId);
    if (!progress || progress.nodeStates[match.nodeId] !== 'active') {
      continue;
    }
    progress.nodeStates[match.nodeId] = 'completed';
    const node = template.nodes.find((n) => n.id === match.nodeId);
    for (const outcome of node?.outcomes?.onComplete ?? []) {
      applyTreeOutcome(worldState, outcome);
    }
    refreshMissionTreeAvailability(worldState, match.treeId);
    if (isMissionTreeFullyCompleted(template, progress)) {
      applyProjectEffects(worldState, template.finalConsequences);
    }
    anyChanged = true;
  }
  return anyChanged;
}

function applyTreeOutcome(worldState: WorldState, outcome: TreePrerequisite): void {
  if (outcome.type === 'world_flag') {
    worldState.setWorldFlag(outcome.flagId, outcome.value);
    return;
  }
  if (outcome.type === 'reputation_at_least') {
    const current = worldState.getReputationForFaction(outcome.factionId);
    if (current < outcome.value) {
      worldState.setReputationFloor(outcome.factionId, outcome.value, 'mission_complete');
    }
  }
}

function isMissionTreeFullyCompleted(
  template: MissionTreeTemplate,
  progress: MissionTreeProgress
): boolean {
  return template.nodes.every((node) => progress.nodeStates[node.id] === 'completed');
}

export function applyProjectEffects(worldState: WorldState, effects: ProjectEffect[]): void {
  for (const effect of effects) {
    applyProjectEffect(worldState, effect);
  }
}

function applyProjectEffect(worldState: WorldState, effect: ProjectEffect): void {
  switch (effect.type) {
    case 'world_flag_set':
      worldState.setWorldFlag(effect.flagId, effect.value);
      break;
    case 'change_disposition':
      worldState.setDispositionOverride(effect.factionA, effect.factionB, effect.newDisposition);
      break;
    case 'control_shift':
      worldState.applyLandableControlShift(effect.landableId, effect.factionId, effect.share);
      break;
    case 'unlock_equipment':
      worldState.unlockEquipmentAtLandable(effect.equipmentItemId, effect.atLandableId);
      break;
    default:
      break;
  }
}

export function getAvailableTreeMissionsForLandable(
  worldState: WorldState,
  landableId: string
): { treeId: string; nodeId: string; templateId: string }[] {
  const landable = worldState.findLandableById(landableId);
  if (!landable) {
    return [];
  }
  const offers: { treeId: string; nodeId: string; templateId: string }[] = [];
  for (const tree of worldState.getMissionTreeTemplates()) {
    if (!isLandableControlledBy(landable, tree.factionId)) {
      continue;
    }
    const progress = worldState.getMissionTreeProgress(tree.id);
    if (!progress) {
      continue;
    }
    for (const node of tree.nodes) {
      if (progress.nodeStates[node.id] !== 'available') {
        continue;
      }
      offers.push({ treeId: tree.id, nodeId: node.id, templateId: node.missionTemplateId });
    }
  }
  return offers;
}

export function initialiseMissionTreesFromWorld(worldState: WorldState, worldFile: WorldFile): void {
  const templates = worldFile.missionTreeTemplates ?? [];
  const progress = createInitialMissionTreeProgress(templates);
  worldState.replaceMissionTreeProgress(progress);
  refreshAllMissionTreeAvailability(worldState);
}

/** Re-evaluate availability using live world state (after load). */
export function syncMissionTreeAvailability(worldState: WorldState): void {
  const templates = worldState.getMissionTreeTemplates();
  for (const tree of templates) {
    const progress = worldState.getMissionTreeProgress(tree.id);
    if (!progress) {
      continue;
    }
    for (const node of tree.nodes) {
      const current = progress.nodeStates[node.id];
      if (current === 'completed' || current === 'failed' || current === 'active') {
        continue;
      }
      progress.nodeStates[node.id] = evaluateAllPrerequisites(worldState, node.prerequisites)
        ? 'available'
        : 'unavailable';
    }
  }
}

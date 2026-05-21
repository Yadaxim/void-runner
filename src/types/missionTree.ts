import type { GridCoord } from './world';

/** World-state mutations applied when a faction project or mission tree completes. */
export type ProjectEffect =
  | { type: 'control_shift'; landableId: string; factionId: string; share: number }
  | { type: 'unlock_equipment'; equipmentItemId: string; atLandableId: string }
  | { type: 'change_disposition'; factionA: string; factionB: string; newDisposition: number }
  | { type: 'world_flag_set'; flagId: string; value: boolean | number | string };

export type TreePrerequisite =
  | { type: 'tree_node_completed'; treeId: string; nodeId: string }
  | { type: 'tree_node_failed'; treeId: string; nodeId: string }
  | { type: 'reputation_at_least'; factionId: string; value: number }
  | { type: 'world_flag'; flagId: string; value: boolean | number | string };

export interface MissionTreeNode {
  id: string;
  missionTemplateId: string;
  prerequisites: TreePrerequisite[];
  outcomes?: {
    onComplete?: TreePrerequisite[];
    onFail?: TreePrerequisite[];
  };
}

export interface MissionTreeTemplate {
  id: string;
  name: string;
  factionId: string;
  rootMissionTemplateId: string;
  nodes: MissionTreeNode[];
  finalConsequences: ProjectEffect[];
}

export type MissionTreeNodeState = 'unavailable' | 'available' | 'active' | 'completed' | 'failed';

export interface MissionTreeProgress {
  started: boolean;
  nodeStates: Record<string, MissionTreeNodeState>;
}

export type MissionTreeProgressMap = Record<string, MissionTreeProgress>;

export interface GameTimeState {
  /** Monotonic in-game seconds since galaxy start. */
  epoch: number;
  /** Game seconds advanced per one real second while time is running. */
  rate: number;
}

/** Optional metadata for generated landables (not used in Session F runtime). */
export interface LandableSpawnSpec {
  id: string;
  sectorCoord: GridCoord;
  landable: unknown;
}

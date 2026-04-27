// extracted from src/core/worldState.ts for testability
import {
  REP_CEILING_MISSION_COMPLETE,
  REP_CEILING_MISSION_SPECIAL,
  REP_FLOOR_COMBAT_HIT,
  REP_FLOOR_COMBAT_KILL,
  REP_FLOOR_MISSION_FAIL
} from '../constants';
import type { FactionDefinition } from '../types';

export type RepActionType =
  | 'combat_hit'
  | 'combat_kill'
  | 'mission_fail'
  | 'mission_complete'
  | 'mission_special'
  | 'manual';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getReputationBounds(actionType: RepActionType): { floor: number; ceiling: number } {
  switch (actionType) {
    case 'combat_hit':
      return { floor: REP_FLOOR_COMBAT_HIT, ceiling: 100 };
    case 'combat_kill':
      return { floor: REP_FLOOR_COMBAT_KILL, ceiling: 100 };
    case 'mission_fail':
      return { floor: REP_FLOOR_MISSION_FAIL, ceiling: 100 };
    case 'mission_complete':
      return { floor: -100, ceiling: REP_CEILING_MISSION_COMPLETE };
    case 'mission_special':
      return { floor: -100, ceiling: REP_CEILING_MISSION_SPECIAL };
    case 'manual':
      return { floor: -100, ceiling: 100 };
  }
}

/**
 * Returns new reputation and actual delta applied (after per-action floors/ceilings and global −100..100).
 */
export function applyReputationDelta(
  current: number,
  delta: number,
  actionType: RepActionType
): { newRep: number; actualDelta: number } {
  const { floor, ceiling } = getReputationBounds(actionType);
  if (delta < 0 && current <= floor) {
    return { newRep: current, actualDelta: 0 };
  }
  if (delta > 0 && current >= ceiling) {
    return { newRep: current, actualDelta: 0 };
  }
  const newRep = Math.max(floor, Math.min(ceiling, clamp(current + delta, -100, 100)));
  return { newRep, actualDelta: newRep - current };
}

export function computePirateReputation(
  factionReputations: Record<string, number>,
  factions: FactionDefinition[]
): number {
  const nonPirateFactions = factions.filter((faction) => !faction.isPirate);
  if (nonPirateFactions.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const faction of nonPirateFactions) {
    sum += factionReputations[faction.id] ?? 0;
  }
  const average = sum / nonPirateFactions.length;
  return -clamp(average, -100, 100);
}

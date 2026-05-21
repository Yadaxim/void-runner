import type { AchievementWorldSnapshot } from './context';
import type { AchievementDefinition, AchievementProgressMap } from '../types/achievement';
import { ACHIEVEMENT_CATALOG } from './catalog';
import { buildAchievementContext } from './context';
import { evaluateAllConditions } from './evaluate';

export function evaluateAchievements(
  worldState: AchievementWorldSnapshot & {
    getAchievementProgressMap(): AchievementProgressMap;
  },
  catalog: AchievementDefinition[] = ACHIEVEMENT_CATALOG
): string[] {
  const ctx = buildAchievementContext(worldState);
  const progress = worldState.getAchievementProgressMap();
  const unlocked: string[] = [];

  for (const def of catalog) {
    if (progress[def.id]) {
      continue;
    }
    if (evaluateAllConditions(ctx, def.conditions)) {
      unlocked.push(def.id);
    }
  }

  return unlocked;
}

export interface AchievementUnlockSink {
  getAchievementProgressMap(): AchievementProgressMap;
  setAchievementProgressMap(progress: AchievementProgressMap): void;
  appendRecentlyUnlocked(ids: string[]): void;
  getPlayTime(): number;
  getGameTimeEpoch(): number;
}

export function applyAchievementUnlocks(
  worldState: AchievementUnlockSink,
  ids: string[],
  catalog: AchievementDefinition[] = ACHIEVEMENT_CATALOG
): void {
  if (ids.length === 0) {
    return;
  }
  const progress = { ...worldState.getAchievementProgressMap() };
  const playTime = worldState.getPlayTime();
  const gameTime = worldState.getGameTimeEpoch();

  for (const id of ids) {
    if (progress[id]) {
      continue;
    }
    if (!catalog.some((d) => d.id === id)) {
      continue;
    }
    progress[id] = { unlockedAtPlayTime: playTime, unlockedAtGameTime: gameTime };
  }

  worldState.setAchievementProgressMap(progress);
  worldState.appendRecentlyUnlocked(ids);
}

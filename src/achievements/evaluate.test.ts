import { describe, expect, it } from 'vitest';
import { evaluateAllConditions } from './evaluate';
import { createDefaultPlayerMeta } from './context';
import type { AchievementCondition } from '../types/achievement';

describe('achievement evaluate', () => {
  it('compares numeric meta paths', () => {
    const cond: AchievementCondition = { path: 'meta.killCount', op: 'gte', value: 2 };
    const ctx = {
      meta: { ...createDefaultPlayerMeta(), killCount: 2 },
      derived: {
        exploredPercent: 0,
        totalSectors: 16,
        factionContactCount: 0,
        allSectorsVisited: false,
        nonPirateFactionCount: 2,
        nonPirateFactionContactCount: 0,
        allNonPirateFactionsContacted: false
      }
    };
    expect(evaluateAllConditions(ctx, [cond])).toBe(true);
  });

  it('supports meta.counters custom keys', () => {
    const cond: AchievementCondition = {
      path: 'meta.counters.ancientRelics',
      op: 'gte',
      value: 3
    };
    const ctx = {
      meta: { ...createDefaultPlayerMeta(), counters: { ancientRelics: 3 } },
      derived: {
        exploredPercent: 0,
        totalSectors: 1,
        factionContactCount: 0,
        allSectorsVisited: false,
        nonPirateFactionCount: 0,
        nonPirateFactionContactCount: 0,
        allNonPirateFactionsContacted: false
      }
    };
    expect(evaluateAllConditions(ctx, [cond])).toBe(true);
  });
});

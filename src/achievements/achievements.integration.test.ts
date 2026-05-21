import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WorldState } from '../core/worldState';
import { makeShipState } from '../test/fixtures';
import type { WorldFile } from '../types';

function loadWorld(): WorldFile {
  return JSON.parse(readFileSync(join(process.cwd(), 'public/testWorld.json'), 'utf-8')) as WorldFile;
}

describe('achievements integration', () => {
  it('persists player meta and unlocks first landing', () => {
    const wf = loadWorld();
    const ws = new WorldState(wf, wf.startingConditions.sectorCoord, makeShipState({ id: 'player' }), {
      activeSaveId: 'ach-test-landing'
    });

    expect(ws.getPlayerMeta().landingCount).toBe(0);
    expect(ws.isAchievementUnlocked('first_landing')).toBe(false);

    const landable = ws.getCurrentSector().landables[0];
    expect(landable).toBeDefined();
    ws.recordLanding(landable!);

    expect(ws.getPlayerMeta().landingCount).toBe(1);
    expect(ws.isAchievementUnlocked('first_landing')).toBe(true);
    expect(ws.getRecentlyUnlockedAchievementIds()).toContain('first_landing');

    const ls = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => {
        ls.set(k, v);
      },
      removeItem: (k: string) => {
        ls.delete(k);
      },
      clear: () => ls.clear(),
      key: () => null,
      length: ls.size
    } as Storage);
    ws.saveToLocalStorage();
    const loaded = WorldState.loadFromLocalStorage(wf, 'ach-test-landing');
    expect(loaded?.getPlayerMeta().landingCount).toBe(1);
    expect(loaded?.isAchievementUnlocked('first_landing')).toBe(true);

    WorldState.deleteSave(wf.metadata.seed, 'ach-test-landing');
    vi.unstubAllGlobals();
  });
});

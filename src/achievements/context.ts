import type { PlayerMetaData } from '../types/achievement';
import type { WorldFile } from '../types';

export interface AchievementDerivedMeta {
  exploredPercent: number;
  totalSectors: number;
  factionContactCount: number;
  allSectorsVisited: boolean;
  nonPirateFactionCount: number;
  nonPirateFactionContactCount: number;
  allNonPirateFactionsContacted: boolean;
}

export interface AchievementEvalContext {
  meta: PlayerMetaData;
  derived: AchievementDerivedMeta;
}

export function createDefaultPlayerMeta(exploredSectorCount = 1): PlayerMetaData {
  return {
    landingCount: 0,
    hyperspaceJumpCount: 0,
    killCount: 0,
    missionsCompletedCount: 0,
    exploredSectorCount,
    factionContact: [],
    counters: {},
    flags: {}
  };
}

export function normalisePlayerMeta(
  raw: Partial<PlayerMetaData> | undefined,
  visitedSectorCount: number
): PlayerMetaData {
  const base = createDefaultPlayerMeta(visitedSectorCount);
  if (!raw) {
    return base;
  }
  return {
    landingCount: finiteNonNeg(raw.landingCount, base.landingCount),
    hyperspaceJumpCount: finiteNonNeg(raw.hyperspaceJumpCount, base.hyperspaceJumpCount),
    killCount: finiteNonNeg(raw.killCount, base.killCount),
    missionsCompletedCount: finiteNonNeg(raw.missionsCompletedCount, base.missionsCompletedCount),
    exploredSectorCount: finiteNonNeg(raw.exploredSectorCount, visitedSectorCount),
    factionContact: Array.isArray(raw.factionContact)
      ? [...new Set(raw.factionContact.filter((id) => typeof id === 'string' && id.length > 0))]
      : base.factionContact,
    counters:
      raw.counters && typeof raw.counters === 'object'
        ? Object.fromEntries(
            Object.entries(raw.counters).filter(
              ([, v]) => typeof v === 'number' && Number.isFinite(v)
            ) as [string, number][]
          )
        : base.counters,
    flags:
      raw.flags && typeof raw.flags === 'object'
        ? Object.fromEntries(
            Object.entries(raw.flags).filter(([, v]) => typeof v === 'boolean') as [string, boolean][]
          )
        : base.flags
  };
}

function finiteNonNeg(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export interface AchievementWorldSnapshot {
  getPlayerMeta(): PlayerMetaData;
  getGridWidth(): number;
  getGridHeight(): number;
  getWorldFile(): WorldFile;
}

export function buildAchievementContext(worldState: AchievementWorldSnapshot): AchievementEvalContext {
  const meta = worldState.getPlayerMeta();
  const totalSectors = worldState.getGridWidth() * worldState.getGridHeight();
  const explored = meta.exploredSectorCount;
  const exploredPercent =
    totalSectors > 0 ? Math.min(100, Math.floor((explored / totalSectors) * 100)) : 0;

  const nonPirateFactions = worldState
    .getWorldFile()
    .factions.filter((f) => !f.isPirate);
  const nonPirateIds = new Set(nonPirateFactions.map((f) => f.id));
  const contactedNonPirate = meta.factionContact.filter((id) => nonPirateIds.has(id));

  return {
    meta,
    derived: {
      exploredPercent,
      totalSectors,
      factionContactCount: meta.factionContact.length,
      allSectorsVisited: totalSectors > 0 && explored >= totalSectors,
      nonPirateFactionCount: nonPirateFactions.length,
      nonPirateFactionContactCount: contactedNonPirate.length,
      allNonPirateFactionsContacted:
        nonPirateFactions.length > 0 && contactedNonPirate.length >= nonPirateFactions.length
    }
  };
}

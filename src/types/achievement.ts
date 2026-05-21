/** Scalar or list values used in player meta and achievement conditions. */
export type MetaScalar = boolean | number | string;

export type MetaValue = MetaScalar | string[];

/** Career-wide counters and flags — persisted per save slot. */
export interface PlayerMetaData {
  landingCount: number;
  hyperspaceJumpCount: number;
  killCount: number;
  missionsCompletedCount: number;
  exploredSectorCount: number;
  /** Distinct faction ids the player has interacted with (land, mission, etc.). */
  factionContact: string[];
  /** Open-ended counters for custom achievements (`meta.counters.myKey`). */
  counters: Record<string, number>;
  /** Boolean flags (`meta.flags.myKey`). */
  flags: Record<string, boolean>;
}

export type AchievementConditionOp =
  | 'eq'
  | 'neq'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  | 'includes'
  | 'notIncludes';

/**
 * Compares a dot-path against the evaluation context built in `buildAchievementContext`.
 * Examples: `meta.killCount`, `meta.counters.bossKills`, `derived.exploredPercent`.
 */
export interface AchievementCondition {
  path: string;
  op: AchievementConditionOp;
  value: MetaValue;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  hidden?: boolean;
  tier?: 'normal' | 'hard';
  /** All conditions must pass (AND). */
  conditions: AchievementCondition[];
}

export interface AchievementProgress {
  unlockedAtGameTime: number;
  unlockedAtPlayTime: number;
}

export type AchievementProgressMap = Record<string, AchievementProgress>;

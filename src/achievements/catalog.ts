import type { AchievementDefinition } from '../types/achievement';

/** Built-in achievements; extend this list or load from world JSON later. */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    id: 'first_landing',
    title: 'Feet on the Ground',
    description: 'Land at any port or world for the first time.',
    conditions: [{ path: 'meta.landingCount', op: 'gte', value: 1 }]
  },
  {
    id: 'first_hyperspace',
    title: 'Shortcut',
    description: 'Complete your first hyperspace jump.',
    conditions: [{ path: 'meta.hyperspaceJumpCount', op: 'gte', value: 1 }]
  },
  {
    id: 'first_kill',
    title: 'Hostile Takeover',
    description: 'Destroy a hostile ship in combat.',
    conditions: [{ path: 'meta.killCount', op: 'gte', value: 1 }]
  },
  {
    id: 'first_mission',
    title: 'Freelancer',
    description: 'Complete your first mission.',
    conditions: [{ path: 'meta.missionsCompletedCount', op: 'gte', value: 1 }]
  },
  {
    id: 'explore_25',
    title: 'Horizon Seeker',
    description: 'Explore at least 25% of the galaxy.',
    conditions: [{ path: 'derived.exploredPercent', op: 'gte', value: 25 }]
  },
  {
    id: 'explore_50',
    title: 'Wide Sky',
    description: 'Explore at least 50% of the galaxy.',
    conditions: [{ path: 'derived.exploredPercent', op: 'gte', value: 50 }]
  },
  {
    id: 'explore_75',
    title: 'Stellar Tourist',
    description: 'Explore at least 75% of the galaxy.',
    conditions: [{ path: 'derived.exploredPercent', op: 'gte', value: 75 }]
  },
  {
    id: 'meet_another_faction',
    title: 'Stranger at the Dock',
    description: 'Make contact with at least two different factions.',
    conditions: [{ path: 'derived.factionContactCount', op: 'gte', value: 2 }]
  },
  {
    id: 'visit_all_sectors',
    title: 'Cartographer',
    description: 'Visit every sector in the galaxy.',
    tier: 'hard',
    conditions: [{ path: 'derived.allSectorsVisited', op: 'eq', value: true }]
  },
  {
    id: 'meet_all_factions',
    title: 'Diplomatic Circuit',
    description: 'Make contact with every non-pirate faction in this galaxy.',
    tier: 'hard',
    hidden: true,
    conditions: [{ path: 'derived.allNonPirateFactionsContacted', op: 'eq', value: true }]
  }
];

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_CATALOG.find((entry) => entry.id === id);
}

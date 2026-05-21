import {
  MISSION_BOARD_COUNT,
  MISSION_BOARD_REFRESH_GAME_SECONDS,
  MISSION_MAX_DISTANCE,
  MISSION_MIN_DISTANCE,
  MISSION_PAYOFF_MIN
} from '../constants';
import { childPRNG, SplitMix64 } from '../core/prng';
import type { WorldState } from '../core/worldState';
import { getAvailableTreeMissionsForLandable } from './missionTree';
import { isLandableControlledBy, type GridCoord, type Landable, type Mission, type MissionTemplate, type RegionType } from '../types';

interface LandableInWorld {
  landable: Landable;
  sectorCoord: GridCoord;
}

function isRegionCompatible(templateRegion: RegionType, sectorRegion: RegionType): boolean {
  if (templateRegion === sectorRegion) {
    return true;
  }
  if (templateRegion === 'midring') {
    return sectorRegion === 'core_arm' || sectorRegion === 'frontier';
  }
  if (templateRegion === 'core_arm') {
    return sectorRegion === 'midring';
  }
  if (templateRegion === 'frontier') {
    return sectorRegion === 'midring' || sectorRegion === 'radiation_fringe';
  }
  if (templateRegion === 'radiation_fringe') {
    return sectorRegion === 'frontier';
  }
  return false;
}

function getDistance(a: GridCoord, b: GridCoord): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAllLandables(worldState: WorldState): LandableInWorld[] {
  const all: LandableInWorld[] = [];
  for (const sector of worldState.getWorldFile().sectors) {
    for (const landable of sector.landables) {
      all.push({
        landable,
        sectorCoord: { ...sector.coord }
      });
    }
  }
  return all;
}

function weightedPick<T>(items: T[], weights: number[], rng: SplitMix64): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return items[rng.nextInt(0, items.length - 1)];
  }
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

function pickDestination(
  template: MissionTemplate,
  originLandable: Landable,
  originSectorCoord: GridCoord,
  worldState: WorldState,
  rng: SplitMix64
): LandableInWorld | null {
  const all = getAllLandables(worldState).filter((candidate) => {
    if (candidate.landable.id === originLandable.id) {
      return false;
    }
    return candidate.landable.services.some((service) => service.type === 'refuel');
  });
  if (all.length === 0) {
    return null;
  }

  const primaryFaction = template.factionRequirements[0]?.factionId ?? null;
  const weights = all.map((candidate) => {
    const distance = getDistance(originSectorCoord, candidate.sectorCoord);
    const factionWeight = primaryFaction && isLandableControlledBy(candidate.landable, primaryFaction) ? 2 : 1;
    const distanceWeight =
      distance >= MISSION_MIN_DISTANCE && distance <= MISSION_MAX_DISTANCE
        ? 2
        : distance < MISSION_MIN_DISTANCE
          ? 0.35
          : 0.65;
    return factionWeight * distanceWeight;
  });
  return weightedPick(all, weights, rng);
}

function instantiateMission(
  template: MissionTemplate,
  originLandable: Landable,
  originSectorCoord: GridCoord,
  worldState: WorldState,
  rng: SplitMix64
): Mission | null {
  const destination = pickDestination(template, originLandable, originSectorCoord, worldState, rng);
  if (!destination) {
    return null;
  }

  const distance = getDistance(destination.sectorCoord, originSectorCoord);
  const cargoWeight = rng.nextInt(template.cargoWeightRange[0], template.cargoWeightRange[1]);
  const payoff = Math.max(
    MISSION_PAYOFF_MIN,
    Math.round(distance * template.payoffPerDistanceUnit * cargoWeight * 0.1)
  );
  const description = template.descriptionTemplate
    .replace('{destination}', destination.landable.name)
    .replace('{cargo}', `${cargoWeight}t of freight`);

  return {
    id: `msn_${template.id}_${Date.now()}_${rng.nextInt(1000, 9999)}`,
    templateId: template.id,
    title: template.title,
    description,
    factionRequirements: template.factionRequirements,
    cargoWeight,
    destinationLandableId: destination.landable.id,
    destinationSectorCoord: destination.sectorCoord,
    destinationName: destination.landable.name,
    payoff,
    reputationRewards: template.reputationRewards,
    expiryTime: undefined,
    acceptedAt: worldState.getGameTimeEpoch()
  };
}

function instantiateTreeMission(
  template: MissionTemplate,
  treeId: string,
  nodeId: string,
  originLandable: Landable,
  originSectorCoord: GridCoord,
  worldState: WorldState,
  rng: SplitMix64
): Mission | null {
  const mission = instantiateMission(template, originLandable, originSectorCoord, worldState, rng);
  if (!mission) {
    return null;
  }
  return {
    ...mission,
    missionTreeId: treeId,
    missionTreeNodeId: nodeId
  };
}

export class MissionBoard {
  static generateMissions(
    landable: Landable,
    currentSectorCoord: GridCoord,
    worldState: WorldState,
    count: number = MISSION_BOARD_COUNT
  ): Mission[] {
    const templates = worldState.getWorldFile().missionTemplates ?? [];
    const currentRegion = worldState.getCurrentSector().regionType;
    const landablesInWorld = getAllLandables(worldState).filter((entry) => entry.landable.id !== landable.id);
    if (landablesInWorld.length === 0) {
      return [];
    }

    const eligible = templates.filter((template) => isRegionCompatible(template.regionType, currentRegion));
    if (eligible.length === 0) {
      return [];
    }

    const epoch = worldState.getGameTimeEpoch();
    const refreshBucket = Math.floor(epoch / MISSION_BOARD_REFRESH_GAME_SECONDS);
    const seedDomain = `mission_board:${landable.id}:${landable.seed}:${refreshBucket}`;
    const rng = childPRNG(worldState.getWorldFile().metadata.seed, seedDomain);

    const missions: Mission[] = [];
    const treeOffers = getAvailableTreeMissionsForLandable(worldState, landable.id);
    const templateById = new Map(eligible.map((tpl) => [tpl.id, tpl]));
    for (const offer of treeOffers.slice(0, 2)) {
      const tpl = templateById.get(offer.templateId) ?? worldState.getWorldFile().missionTemplates.find((t) => t.id === offer.templateId);
      if (!tpl || !isRegionCompatible(tpl.regionType, currentRegion)) {
        continue;
      }
      const treeMission = instantiateTreeMission(
        tpl,
        offer.treeId,
        offer.nodeId,
        landable,
        currentSectorCoord,
        worldState,
        rng
      );
      if (treeMission) {
        missions.push(treeMission);
      }
    }

    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = rng.nextInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const remaining = Math.max(0, count - missions.length);
    const selected = shuffled.slice(0, remaining);
    for (const template of selected) {
      const mission = instantiateMission(template, landable, currentSectorCoord, worldState, rng);
      if (mission) {
        missions.push(mission);
      }
    }
    return missions;
  }
}

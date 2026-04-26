import type { GridCoord, RegionType } from './world';

export interface FactionRequirement {
  factionId: string;
  minReputation: number;
}

export interface ReputationReward {
  factionId: string;
  amount: number;
}

export interface MissionTemplate {
  id: string;
  title: string;
  descriptionTemplate: string;
  factionRequirements: FactionRequirement[];
  regionType: RegionType;
  cargoWeightRange: [number, number];
  payoffPerDistanceUnit: number;
  reputationRewards: ReputationReward[];
}

export interface CargoItem {
  missionId: string;
  description: string;
  weight: number;
}

export interface Mission {
  id: string;
  templateId: string;
  title: string;
  description: string;
  factionRequirements: FactionRequirement[];
  cargoWeight: number;
  destinationLandableId: string;
  destinationSectorCoord: GridCoord;
  destinationName: string;
  payoff: number;
  reputationRewards: ReputationReward[];
  expiryTime?: number;
  acceptedAt: number;
}

export interface CompletedMission {
  mission: Mission;
  creditsEarned: number;
}

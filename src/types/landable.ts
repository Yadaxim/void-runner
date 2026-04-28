import type { Vector2 } from './physics';

export type LandableType = 'planet' | 'moon' | 'station' | 'military_outpost' | 'shipyard_station';
export type ServiceType = 'refuel' | 'repair' | 'missionBoard' | 'shipyard' | 'equipmentStore' | 'trainingSimulator';
export type SimulatorTier = 'basic' | 'mid' | 'advanced' | 'elite';

export interface LandableService {
  type: ServiceType;
  simulatorTier?: SimulatorTier;
  refuelPricePerUnit?: number;
  repairPricePerHP?: number;
}

export interface LandableShipyard {
  /** Ids into `WorldFile.shipyardListings`. */
  listingIds: string[];
}

export interface Landable {
  id: string;
  name: string;
  type: LandableType;
  description: string;
  atmosphere: string;
  factionId: string | null;
  mass: number;
  radius: number;
  position: Vector2;
  services: LandableService[];
  /** When set, this landable offers the shipyard UI for these listings (independent of `services`). */
  shipyard?: LandableShipyard;
  rotationSpeed: number;
  seed: number;
}

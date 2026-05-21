import type { Vector2 } from './physics';

export type LandableType = 'planet' | 'moon' | 'station' | 'military_outpost' | 'shipyard_station';
export type ServiceType = 'refuel' | 'repair' | 'missionBoard' | 'shipyard' | 'equipmentStore' | 'trainingSimulator';
export type SimulatorTier = 'basic' | 'mid' | 'advanced' | 'elite';
export type LandableControlState = 'sole' | 'treaty' | 'cooperation' | 'dispute';

export interface LandableFactionControl {
  factionId: string;
  share: number;
}

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
  factionControl: LandableFactionControl[];
  controlState: LandableControlState;
  mass: number;
  radius: number;
  position: Vector2;
  services: LandableService[];
  /** When set, this landable offers the shipyard UI for these listings (independent of `services`). */
  shipyard?: LandableShipyard;
  rotationSpeed: number;
  seed: number;
}

export function getLandablePrimaryFactionId(landable: Landable): string | null {
  const [primary] = [...landable.factionControl].sort((a, b) => b.share - a.share);
  return primary?.factionId ?? null;
}

export function getLandableFactionIds(landable: Landable): string[] {
  return landable.factionControl.map((entry) => entry.factionId);
}

export function isLandableControlledBy(landable: Landable, factionId: string): boolean {
  return landable.factionControl.some((entry) => entry.factionId === factionId);
}

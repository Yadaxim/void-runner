import { DEFAULT_FACTION_VISUAL } from '../constants';
import { Vector2 } from '../physics/vector2';
import type {
  BulletSpec,
  EquipmentItem,
  FactionDefinition,
  FactionVisual,
  GridCoord,
  HullSpec,
  Landable,
  SectorMetadata,
  ShipState,
  WorldFile
} from '../types';

interface PersistedWorldState {
  currentSectorCoord: GridCoord;
  visitedSectors: string[];
  playerShipState: ShipState;
  factionReputations: Record<string, number>;
}

function toVector2(value: { x: number; y: number }): Vector2 {
  return new Vector2(value.x, value.y);
}

function coordKey(coord: GridCoord): string {
  return `${coord.x}:${coord.y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toSectorGrid(worldFile: WorldFile): SectorMetadata[][] {
  if (worldFile.galaxy.sectors.length > 0) {
    return worldFile.galaxy.sectors;
  }

  const grid: SectorMetadata[][] = Array.from({ length: worldFile.galaxy.gridHeight }, () =>
    Array.from({ length: worldFile.galaxy.gridWidth }, () => null)
  ) as unknown as SectorMetadata[][];

  for (const sector of worldFile.sectors) {
    if (
      sector.coord.y >= 0 &&
      sector.coord.y < worldFile.galaxy.gridHeight &&
      sector.coord.x >= 0 &&
      sector.coord.x < worldFile.galaxy.gridWidth
    ) {
      grid[sector.coord.y][sector.coord.x] = sector;
    }
  }

  return grid;
}

function normaliseWorldFile(worldFile: WorldFile): WorldFile {
  return {
    ...worldFile,
    sectors: worldFile.sectors.map((sector) => ({
      ...sector,
      landables: sector.landables.map((landable) => ({
        ...landable,
        position: toVector2(landable.position)
      }))
    }))
  };
}

function normaliseShipState(shipState: ShipState): ShipState {
  return {
    ...shipState,
    position: toVector2(shipState.position),
    velocity: toVector2(shipState.velocity)
  };
}

function defaultFactionReputations(worldFile: WorldFile): Record<string, number> {
  const rep: Record<string, number> = {};
  for (const faction of worldFile.factions) {
    if (!faction.isPirate) {
      rep[faction.id] = 0;
    }
  }
  return rep;
}

export class WorldState {
  private readonly worldFile: WorldFile;
  private currentSectorCoord: GridCoord;
  private visitedSectors: Set<string>;
  private playerShipState: ShipState;
  private factionReputations: Record<string, number>;
  private readonly sectorIndex: Map<string, SectorMetadata>;

  constructor(worldFile: WorldFile, startSector: GridCoord, playerShipState: ShipState) {
    const normalisedWorldFile = normaliseWorldFile(worldFile);
    const indexedWorld: WorldFile = {
      ...normalisedWorldFile,
      galaxy: {
        ...normalisedWorldFile.galaxy,
        sectors: toSectorGrid(normalisedWorldFile)
      }
    };

    this.worldFile = indexedWorld;
    this.currentSectorCoord = { ...startSector };
    this.visitedSectors = new Set<string>([coordKey(startSector)]);
    this.playerShipState = normaliseShipState(playerShipState);
    this.factionReputations = defaultFactionReputations(indexedWorld);
    this.sectorIndex = new Map<string, SectorMetadata>();

    for (const sector of this.worldFile.sectors) {
      this.sectorIndex.set(coordKey(sector.coord), sector);
    }
  }

  getCurrentSector(): SectorMetadata {
    const sector = this.getSector(this.currentSectorCoord);
    if (!sector) {
      throw new Error(`Current sector not found: ${coordKey(this.currentSectorCoord)}`);
    }
    return sector;
  }

  getSector(coord: GridCoord): SectorMetadata | null {
    return this.sectorIndex.get(coordKey(coord)) ?? null;
  }

  setCurrentSector(coord: GridCoord): void {
    if (!this.getSector(coord)) {
      throw new Error(`Cannot set unknown sector: ${coordKey(coord)}`);
    }
    this.currentSectorCoord = { ...coord };
  }

  getLandablesInCurrentSector(): Landable[] {
    return this.getCurrentSector().landables;
  }

  getLandableById(id: string): Landable | null {
    for (const sector of this.worldFile.sectors) {
      const found = sector.landables.find((landable) => landable.id === id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  getHullSpec(id: string): HullSpec | null {
    return this.worldFile.hullSpecs.find((hull) => hull.id === id) ?? null;
  }

  getFaction(id: string): FactionDefinition | null {
    return this.worldFile.factions.find((faction) => faction.id === id) ?? null;
  }

  getFactionVisual(id: string): FactionVisual {
    const faction = this.getFaction(id);
    if (!faction) {
      return DEFAULT_FACTION_VISUAL;
    }

    return {
      factionId: id,
      primaryColour: `hsl(${faction.primaryColour.h}, ${faction.primaryColour.s}%, ${faction.primaryColour.l}%)`,
      secondaryColour: `hsl(${faction.secondaryColour.h}, ${faction.secondaryColour.s}%, ${faction.secondaryColour.l}%)`,
      geometryBias: faction.geometryBias,
      densityBias: faction.densityBias
    };
  }

  getEquipmentItem(id: string): EquipmentItem | null {
    return this.worldFile.equipmentCatalog.find((item) => item.id === id) ?? null;
  }

  getBulletSpec(id: string): BulletSpec | null {
    return this.worldFile.bulletSpecs.find((spec) => spec.id === id) ?? null;
  }

  getReputation(factionId: string): number {
    return this.factionReputations[factionId] ?? 0;
  }

  setReputation(factionId: string, delta: number): void {
    const current = this.getReputation(factionId);
    this.factionReputations[factionId] = clamp(current + delta, -100, 100);
  }

  getPirateReputation(): number {
    const nonPirateFactions = this.worldFile.factions.filter((faction) => !faction.isPirate);
    if (nonPirateFactions.length === 0) {
      return 0;
    }

    let sum = 0;
    for (const faction of nonPirateFactions) {
      sum += this.getReputation(faction.id);
    }
    const average = sum / nonPirateFactions.length;
    return -clamp(average, -100, 100);
  }

  getPlayerShipState(): ShipState {
    return this.playerShipState;
  }

  updatePlayerShipState(updates: Partial<ShipState>): void {
    this.playerShipState = {
      ...this.playerShipState,
      ...updates,
      position: updates.position ? toVector2(updates.position) : this.playerShipState.position,
      velocity: updates.velocity ? toVector2(updates.velocity) : this.playerShipState.velocity
    };
  }

  markVisited(coord: GridCoord): void {
    this.visitedSectors.add(coordKey(coord));
  }

  isVisited(coord: GridCoord): boolean {
    return this.visitedSectors.has(coordKey(coord));
  }

  getCurrentSectorCoord(): GridCoord {
    return { ...this.currentSectorCoord };
  }

  saveToLocalStorage(): void {
    const payload: PersistedWorldState = {
      currentSectorCoord: this.currentSectorCoord,
      visitedSectors: Array.from(this.visitedSectors),
      playerShipState: this.playerShipState,
      factionReputations: this.factionReputations
    };
    localStorage.setItem(`voidrunner_save_${this.worldFile.metadata.seed}`, JSON.stringify(payload));
  }

  static loadFromLocalStorage(worldFile: WorldFile): WorldState | null {
    const raw = localStorage.getItem(`voidrunner_save_${worldFile.metadata.seed}`);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedWorldState;
      const state = new WorldState(worldFile, parsed.currentSectorCoord, normaliseShipState(parsed.playerShipState));
      state.visitedSectors = new Set(parsed.visitedSectors);
      state.factionReputations = { ...defaultFactionReputations(worldFile), ...parsed.factionReputations };
      return state;
    } catch {
      return null;
    }
  }
}

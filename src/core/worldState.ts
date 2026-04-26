import {
  DEFAULT_FACTION_VISUAL,
  REP_CEILING_MISSION_COMPLETE,
  REP_CEILING_MISSION_SPECIAL,
  REP_FLOOR_COMBAT_HIT,
  REP_FLOOR_COMBAT_KILL,
  REP_FLOOR_MISSION_FAIL,
  RADIATION_INNER_RADIUS,
  RADIATION_OUTER_RADIUS
} from '../constants';
import { childPRNG } from '../core/prng';
import { Vector2 } from '../physics/vector2';
import type {
  BulletSpec,
  EquipmentItem,
  EquipmentSlot,
  FactionDefinition,
  FactionVisual,
  GridCoord,
  HullSpec,
  Landable,
  SectorMetadata,
  ShipState,
  WeaponSlot,
  WorldFile
} from '../types';

interface PersistedWorldState {
  currentSectorCoord: GridCoord;
  visitedSectors: string[];
  playerShipState: ShipState;
  factionReputations: Record<string, number>;
  repLog: RepEvent[];
}

export type ReputationTier = 'allied' | 'friendly' | 'neutral' | 'unfriendly' | 'hostile';
export type RepActionType =
  | 'combat_hit'
  | 'combat_kill'
  | 'mission_fail'
  | 'mission_complete'
  | 'mission_special'
  | 'manual';

export interface RepEvent {
  factionId: string;
  factionName: string;
  delta: number;
  reason: string;
  timestamp: number;
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
  const predefinedGrid = worldFile.galaxy.sectors;
  if (Array.isArray(predefinedGrid) && predefinedGrid.length > 0) {
    return worldFile.galaxy.sectors;
  }

  const halfWidth = Math.floor(worldFile.galaxy.gridWidth / 2);
  const halfHeight = Math.floor(worldFile.galaxy.gridHeight / 2);
  const grid: SectorMetadata[][] = Array.from({ length: worldFile.galaxy.gridHeight }, () =>
    Array.from({ length: worldFile.galaxy.gridWidth }, () => null)
  ) as unknown as SectorMetadata[][];

  for (const sector of worldFile.sectors) {
    const gridX = sector.coord.x + halfWidth;
    const gridY = sector.coord.y + halfHeight;
    if (
      gridY >= 0 &&
      gridY < worldFile.galaxy.gridHeight &&
      gridX >= 0 &&
      gridX < worldFile.galaxy.gridWidth
    ) {
      grid[gridY][gridX] = sector;
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
    autoBrakeLinearEnabled: shipState.autoBrakeLinearEnabled ?? false,
    autoBrakeRotationEnabled: shipState.autoBrakeRotationEnabled ?? false,
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

function createRuntimeVoidSector(worldFile: WorldFile, coord: GridCoord): SectorMetadata {
  return {
    coord: { ...coord },
    regionType: 'void',
    factionId: null,
    landableDensity: 0,
    npcSpawnRules: [],
    inRadiationZone: false,
    radiationFringeIntensity: 0,
    ambientVisuals: {
      hasNebula: false,
      nebulaHue: 0,
      nebulaIntensity: 0,
      starDensityMultiplier: 0.5
    },
    seed: childPRNG(worldFile.metadata.seed, `sector:${coord.x}:${coord.y}`).nextInt(0, 999999),
    landables: []
  };
}

export class WorldState {
  private readonly worldFile: WorldFile;
  private currentSectorCoord: GridCoord;
  private visitedSectors: Set<string>;
  private playerShipState: ShipState;
  private factionReputations: Record<string, number>;
  private repLog: RepEvent[] = [];
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
    const key = coordKey(coord);
    if (!this.sectorIndex.has(key)) {
      this.sectorIndex.set(key, createRuntimeVoidSector(this.worldFile, coord));
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

  getSectorCoordByLandableId(id: string): GridCoord | null {
    for (const sector of this.worldFile.sectors) {
      if (sector.landables.some((landable) => landable.id === id)) {
        return { ...sector.coord };
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

  getFactionDisposition(factionA: string, factionB: string): number {
    const faction = this.getFaction(factionA);
    if (!faction) {
      return 0;
    }
    return faction.disposition[factionB] ?? 0;
  }

  areFactionsHostile(factionA: string, factionB: string): boolean {
    const ab = this.getFactionDisposition(factionA, factionB);
    const ba = this.getFactionDisposition(factionB, factionA);
    return ab < -0.5 || ba < -0.5;
  }

  getFactions(): FactionDefinition[] {
    return this.worldFile.factions;
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

  getDefaultLoadout(
    hullClass: HullSpec['hullClass']
  ): { equipmentSlots: EquipmentSlot[]; weaponLoadout: WeaponSlot[] } {
    const loadout = this.worldFile.defaultLoadouts?.[hullClass];
    if (!loadout) {
      return { equipmentSlots: [], weaponLoadout: [] };
    }
    return {
      equipmentSlots: loadout.equipmentSlots.map((slot) => ({ ...slot })),
      weaponLoadout: loadout.weaponLoadout.map((slot) => ({ ...slot }))
    };
  }

  calculateShipValue(shipState: ShipState): number {
    const hullSpec = this.getHullSpec(shipState.hullSpecId);
    const hullValue = hullSpec ? hullSpec.baseHP * 10 + hullSpec.cargoCapacity * 5 : 500;
    const equipmentValue = shipState.equipmentSlots
      .filter((slot) => slot.itemId !== null)
      .reduce((total, slot) => {
        const item = this.getEquipmentItem(slot.itemId!);
        if (!item) {
          return total;
        }
        return total + this.getEquipmentValue(item);
      }, 0);
    const weaponValue = shipState.weaponLoadout.reduce((total, slot) => {
      const item = this.getEquipmentItem(slot.itemId);
      if (!item) {
        return total;
      }
      return total + this.getEquipmentValue(item) * slot.stackCount;
    }, 0);
    return hullValue + equipmentValue + weaponValue;
  }

  getBulletSpec(id: string): BulletSpec | null {
    return this.worldFile.bulletSpecs.find((spec) => spec.id === id) ?? null;
  }

  getReputation(factionId: string): number {
    return this.factionReputations[factionId] ?? 0;
  }

  changeReputation(factionId: string, delta: number, actionType: RepActionType): void {
    const current = this.getReputation(factionId);
    const { floor, ceiling } = this.getRepLimits(actionType);
    if (delta < 0 && current <= floor) {
      return;
    }
    if (delta > 0 && current >= ceiling) {
      return;
    }
    const newRep = Math.max(floor, Math.min(ceiling, clamp(current + delta, -100, 100)));
    const actualDelta = newRep - current;
    this.factionReputations[factionId] = newRep;
    this.logRepEvent(factionId, actualDelta, this.getActionLabel(actionType));
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

  getReputationForFaction(factionId: string): number {
    const faction = this.getFaction(factionId);
    if (!faction) {
      return 0;
    }
    if (faction.isPirate) {
      return this.getPirateReputation();
    }
    return this.getReputation(factionId);
  }

  getReputationTier(factionId: string): ReputationTier {
    const rep = this.getReputationForFaction(factionId);
    if (rep >= 80) return 'allied';
    if (rep >= 40) return 'friendly';
    if (rep >= -39) return 'neutral';
    if (rep >= -80) return 'unfriendly';
    return 'hostile';
  }

  logRepEvent(factionId: string, actualDelta: number, reason: string): void {
    if (actualDelta === 0) {
      return;
    }
    const faction = this.getFaction(factionId);
    this.repLog.unshift({
      factionId,
      factionName: faction?.name ?? factionId,
      delta: actualDelta,
      reason,
      timestamp: Date.now()
    });
    if (this.repLog.length > 8) {
      this.repLog.pop();
    }
  }

  getRepLog(): RepEvent[] {
    return [...this.repLog];
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

  getVisitedSectorCoords(): GridCoord[] {
    return Array.from(this.visitedSectors).map((key) => {
      const [xRaw, yRaw] = key.split(':');
      return { x: Number(xRaw), y: Number(yRaw) };
    });
  }

  getCurrentSectorCoord(): GridCoord {
    return { ...this.currentSectorCoord };
  }

  getGridWidth(): number {
    return this.worldFile.galaxy.gridWidth;
  }

  getGridHeight(): number {
    return this.worldFile.galaxy.gridHeight;
  }

  getGalaxyCentre(): GridCoord {
    return { x: 0, y: 0 };
  }

  getDistanceFromCentre(coord: GridCoord): number {
    return Math.sqrt(coord.x ** 2 + coord.y ** 2);
  }

  getRadiationIntensity(): number {
    const coord = this.currentSectorCoord;
    const dist = Math.sqrt(coord.x ** 2 + coord.y ** 2);
    const t = (RADIATION_OUTER_RADIUS - dist) / (RADIATION_OUTER_RADIUS - RADIATION_INNER_RADIUS);
    return Math.pow(Math.max(0, Math.min(1, t)), 2);
  }

  isInRadiationZone(): boolean {
    return this.getRadiationIntensity() > 0;
  }

  saveToLocalStorage(): void {
    const payload: PersistedWorldState = {
      currentSectorCoord: this.currentSectorCoord,
      visitedSectors: Array.from(this.visitedSectors),
      playerShipState: this.playerShipState,
      factionReputations: this.factionReputations,
      repLog: this.repLog
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
      state.setCurrentSector(parsed.currentSectorCoord);
      state.visitedSectors = new Set(parsed.visitedSectors);
      state.factionReputations = { ...defaultFactionReputations(worldFile), ...parsed.factionReputations };
      state.repLog = Array.isArray(parsed.repLog) ? parsed.repLog.slice(-8) : [];
      return state;
    } catch {
      return null;
    }
  }

  private getEquipmentValue(item: EquipmentItem): number {
    const tierValues = [200, 500, 1200, 3000, 7000];
    return tierValues[Math.min(item.tier - 1, 4)];
  }

  private getRepLimits(actionType: RepActionType): { floor: number; ceiling: number } {
    switch (actionType) {
      case 'combat_hit':
        return { floor: REP_FLOOR_COMBAT_HIT, ceiling: 100 };
      case 'combat_kill':
        return { floor: REP_FLOOR_COMBAT_KILL, ceiling: 100 };
      case 'mission_fail':
        return { floor: REP_FLOOR_MISSION_FAIL, ceiling: 100 };
      case 'mission_complete':
        return { floor: -100, ceiling: REP_CEILING_MISSION_COMPLETE };
      case 'mission_special':
        return { floor: -100, ceiling: REP_CEILING_MISSION_SPECIAL };
      case 'manual':
        return { floor: -100, ceiling: 100 };
    }
  }

  private getActionLabel(actionType: RepActionType): string {
    switch (actionType) {
      case 'combat_hit':
        return 'Attacked ship';
      case 'combat_kill':
        return 'Destroyed ship';
      case 'mission_fail':
        return 'Failed mission';
      case 'mission_complete':
        return 'Completed mission';
      case 'mission_special':
        return 'Completed special mission';
      case 'manual':
        return 'Event';
    }
  }
}

import {
  DEFAULT_FACTION_VISUAL,
  RADIATION_INNER_RADIUS,
  RADIATION_OUTER_RADIUS,
  REQUIRED_SLOT_TYPES
} from '../constants';
import {
  applyReputationDelta,
  computePirateReputation,
  type RepActionType
} from '../combat/reputation';
import { childPRNG } from '../core/prng';
import { EquipmentStore } from '../simulation/equipmentStore';
import { Vector2 } from '../physics/vector2';
import type {
  CargoItem,
  CompletedMission,
  Mission,
  ArmourItem,
  ArmourLayerState,
  BulletSpec,
  EquipmentItem,
  EquipmentSlot,
  FactionDefinition,
  FuelTankItem,
  FactionVisual,
  GridCoord,
  HullLoadoutVariantKey,
  HullSpec,
  Landable,
  ReactorItem,
  SectorMetadata,
  ShieldItem,
  ShipState,
  ShipyardListing,
  StartingConditions,
  WeaponSlot,
  WeaponFireKey,
  WorldFile
} from '../types';
import {
  computeShipyardNetCost,
  customizeCargoFitsNewHull,
  customizeRequiredSlotsFilled,
  type ShipyardStoreEntry
} from '../shipyard/customize';
import { expandSlotsToFullHull } from '../shipyard/slotLayout';
import { throwIfWorldFileInvalidForGame, WorldFileValidationError } from '../world/validation';

export type { RepActionType };

interface PersistedWorldState {
  currentSectorCoord: GridCoord;
  visitedSectors: string[];
  playerShipState: ShipState;
  factionReputations: Record<string, number>;
  repLog: RepEvent[];
  pilotName: string;
  playTimeSeconds: number;
  /** Hyperspace jump target (Session 5 UI; jump rules in Session 6). */
  hyperspaceTargetCoord?: GridCoord | null;
}

export interface SaveMetadata {
  worldSeed: number;
  worldName: string;
  pilotName: string;
  savedAt: number;
  playTimeSeconds: number;
  currentSectorCoord: GridCoord;
  credits: number;
  shipHullName: string;
}

export type ReputationTier = 'allied' | 'friendly' | 'neutral' | 'unfriendly' | 'hostile';
export type EquipmentInstallSlotType = EquipmentSlot['slotType'] | `weapon_${WeaponFireKey}`;
export type PurchaseResult =
  | { success: true; netCost: number }
  | { success: false; reason: string };
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
    return predefinedGrid;
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
    shipyardListings: worldFile.shipyardListings ?? [],
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
  const legacy = shipState as unknown as { currentHP?: number; maxHP?: number };
  const maxHullHP = shipState.maxHullHP ?? legacy.maxHP ?? 100;
  const currentHullHP = shipState.currentHullHP ?? legacy.currentHP ?? maxHullHP;
  return {
    ...shipState,
    currentHullHP,
    maxHullHP,
    armourLayers: shipState.armourLayers ?? [],
    currentShieldHP: shipState.currentShieldHP ?? 0,
    maxShieldHP: shipState.maxShieldHP ?? 0,
    shieldRebooting: shipState.shieldRebooting ?? false,
    shieldRebootTimer: shipState.shieldRebootTimer ?? 0,
    lastHitTime: shipState.lastHitTime ?? 0,
    currentJoules: shipState.currentJoules ?? 0,
    autoBrakeLinearEnabled: shipState.autoBrakeLinearEnabled ?? false,
    autoBrakeRotationEnabled: shipState.autoBrakeRotationEnabled ?? false,
    position: toVector2(shipState.position),
    velocity: toVector2(shipState.velocity)
  };
}

function deriveWeaponLoadoutFromEquipmentSlots(
  equipmentSlots: EquipmentSlot[],
  maxWeaponSlots: number
): WeaponSlot[] {
  const fireKeys: WeaponFireKey[] = ['Z', 'X', 'C', 'V', 'B'];
  const equippedWeaponIds = equipmentSlots
    .filter((slot) => slot.slotType === 'weapon' && slot.itemId)
    .map((slot) => slot.itemId!) // safe: filtered above
    .slice(0, Math.max(0, maxWeaponSlots));
  return equippedWeaponIds
    .map((itemId, index) => ({
      fireKey: fireKeys[index],
      itemId,
      stackCount: 1,
      cooldownRemaining: 0
    }))
    .filter((slot): slot is WeaponSlot => slot.fireKey !== undefined);
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

/** Full-HP armour layers for equipment in `slots` (used when creating a fresh ship). */
function deriveStarterArmourLayers(worldState: WorldState, equipmentSlots: EquipmentSlot[]): ArmourLayerState[] {
  const armourSlots = equipmentSlots.filter((s) => s.slotType === 'armour' && s.itemId);
  return armourSlots
    .map((slot) => {
      const item = worldState.getEquipmentItem(slot.itemId!);
      if (!item || item.type !== 'armour') {
        return null;
      }
      return {
        itemId: slot.itemId!,
        currentHP: item.hpBonus,
        maxHP: item.hpBonus
      };
    })
    .filter((layer): layer is ArmourLayerState => layer !== null);
}

export function buildStarterShipState(worldState: WorldState): ShipState {
  const sc = worldState.getStartingConditions();
  const hullSpec = worldState.getHullSpec(sc.hullSpecId);

  if (!hullSpec) {
    throw new Error(`Starting hull spec not found: ${sc.hullSpecId}`);
  }

  const fallbackSlots =
    sc.equipmentSlots.length > 0
      ? sc.equipmentSlots
      : hullSpec.defaultLoadouts?.basic ?? hullSpec.equipmentLoadout ?? [];
  const baseEquipmentSlots = fallbackSlots.map((slot) => ({ ...slot }));
  const desired = worldState.getDesiredEquipmentSlotCounts(hullSpec);
  for (const [slotType, countRaw] of Object.entries(desired)) {
    const count = Math.max(0, Number(countRaw ?? 0));
    const existing = baseEquipmentSlots.filter((slot) => slot.slotType === slotType).length;
    for (let i = existing; i < count; i += 1) {
      baseEquipmentSlots.push({ slotType: slotType as EquipmentSlot['slotType'], itemId: null });
    }
  }
  const baseWeaponLoadout = deriveWeaponLoadoutFromEquipmentSlots(baseEquipmentSlots, hullSpec.weaponSlots);
  const fuelMax = worldState.getMaxFuelForSlots(baseEquipmentSlots);
  const shieldSlot = baseEquipmentSlots.find((slot) => slot.slotType === 'shield' && slot.itemId);
  const shieldItem = shieldSlot?.itemId ? worldState.getEquipmentItem(shieldSlot.itemId) : null;
  const maxShieldHP = shieldItem?.type === 'shield' ? shieldItem.shieldHP : 0;
  const jouleMax = worldState.getMaxJoulesForSlots(baseEquipmentSlots);

  return {
    id: 'player',
    hullSpecId: sc.hullSpecId,
    factionId: null,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angle: 0,
    angularVelocity: 0,
    currentHullHP: hullSpec.baseHP,
    maxHullHP: hullSpec.baseHP,
    armourLayers: deriveStarterArmourLayers(worldState, baseEquipmentSlots),
    currentShieldHP: maxShieldHP,
    maxShieldHP,
    shieldRebooting: false,
    shieldRebootTimer: 0,
    lastHitTime: 0,
    currentJoules: jouleMax,
    fuel: fuelMax,
    credits: sc.credits,
    cargo: [],
    equipmentSlots: baseEquipmentSlots,
    weaponLoadout: baseWeaponLoadout,
    activeMissions: [],
    brain: null,
    memoryCards: [],
    activeCardId: null,
    activeMode: null,
    guardMode: false,
    autoBrakeLinearEnabled: false,
    autoBrakeRotationEnabled: false,
    fleetRole: 'lead',
    targets: {},
    isPlayerControlled: true,
    insuranceActive: true,
    lastLandedLandableId: null
  };
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
  private hyperspaceTargetCoord: GridCoord | null = null;
  private playerShipState: ShipState;
  private factionReputations: Record<string, number>;
  private repLog: RepEvent[] = [];
  private readonly sectorIndex: Map<string, SectorMetadata>;
  private pilotName = 'Pilot';
  private playTimeSeconds = 0;

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
    this.ensureHullSlots();
    this.factionReputations = defaultFactionReputations(indexedWorld);
    this.sectorIndex = new Map<string, SectorMetadata>();

    for (const sector of this.worldFile.sectors) {
      this.sectorIndex.set(coordKey(sector.coord), sector);
    }
  }

  /** Slot counts the hull supports (matches how equipment slots are provisioned). */
  getDesiredEquipmentSlotCounts(hull: HullSpec): Partial<Record<EquipmentSlot['slotType'], number>> {
    const desired = { ...(hull.slotCounts ?? {}) } as Partial<Record<EquipmentSlot['slotType'], number>>;
    if (desired.weapon === undefined) {
      desired.weapon = hull.weaponSlots;
    }
    return desired;
  }

  /** How many slots of this type exist on the current player hull (0 if type not present). */
  getPlayerHullSlotCount(slotType: EquipmentSlot['slotType']): number {
    const hull = this.getHullSpec(this.getPlayerShipState().hullSpecId);
    if (!hull) {
      return 0;
    }
    const desired = this.getDesiredEquipmentSlotCounts(hull);
    const raw = desired[slotType];
    if (raw === undefined) {
      return 0;
    }
    const count = Math.max(0, Math.floor(Number(raw)));
    return slotType === 'weapon' ? Math.min(5, count) : count;
  }

  playerHullSlotExists(slotType: EquipmentSlot['slotType'], slotIndex: number): boolean {
    return slotIndex >= 0 && slotIndex < this.getPlayerHullSlotCount(slotType);
  }

  private ensureHullSlots(): void {
    const ship = this.playerShipState;
    const hull = this.getHullSpec(ship.hullSpecId);
    if (!hull) {
      return;
    }
    const desired = this.getDesiredEquipmentSlotCounts(hull);
    const slots = [...ship.equipmentSlots];
    for (const [slotType, countRaw] of Object.entries(desired)) {
      const count = Math.max(0, Number(countRaw ?? 0));
      const existing = slots.filter((slot) => slot.slotType === slotType).length;
      for (let i = existing; i < count; i += 1) {
        slots.push({ slotType: slotType as EquipmentSlot['slotType'], itemId: null });
      }
    }
    this.playerShipState = { ...ship, equipmentSlots: slots };
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

  getShipyardListing(id: string): ShipyardListing | null {
    return this.worldFile.shipyardListings?.find((l) => l.id === id) ?? null;
  }

  /**
   * Equipment slots for an NPC from hull `defaultLoadouts` (expanded to all hardpoints).
   */
  getNpcSpawnEquipmentSlots(hullSpecId: string, variant: HullLoadoutVariantKey = 'basic'): EquipmentSlot[] {
    const hull = this.getHullSpec(hullSpecId);
    if (!hull?.defaultLoadouts) {
      return [];
    }
    const preset = hull.defaultLoadouts[variant] ?? hull.defaultLoadouts.basic;
    return expandSlotsToFullHull(hull, preset.map((s) => ({ ...s })));
  }

  getHullLoadout(
    hullClass: HullSpec['hullClass']
  ): { equipmentSlots: EquipmentSlot[]; weaponLoadout: WeaponSlot[] } {
    const hull =
      this.worldFile.hullSpecs.find((candidate) => candidate.hullClass === hullClass && candidate.defaultLoadouts) ??
      this.worldFile.hullSpecs.find((candidate) => candidate.hullClass === hullClass) ??
      null;
    if (!hull) {
      return { equipmentSlots: [], weaponLoadout: [] };
    }
    const preset = hull.defaultLoadouts?.basic ?? hull.equipmentLoadout ?? [];
    const equipmentSlots = expandSlotsToFullHull(hull, preset.map((slot) => ({ ...slot })));
    const weaponLoadout = deriveWeaponLoadoutFromEquipmentSlots(equipmentSlots, hull.weaponSlots);
    return {
      equipmentSlots,
      weaponLoadout
    };
  }

  getNpcSpawnPack(
    hullSpecId: string,
    variant: HullLoadoutVariantKey = 'basic'
  ): { equipmentSlots: EquipmentSlot[]; weaponLoadout: WeaponSlot[] } {
    const hull = this.getHullSpec(hullSpecId);
    if (!hull) {
      return { equipmentSlots: [], weaponLoadout: [] };
    }
    const equipmentSlots = this.getNpcSpawnEquipmentSlots(hullSpecId, variant);
    return {
      equipmentSlots,
      weaponLoadout: deriveWeaponLoadoutFromEquipmentSlots(equipmentSlots, hull.weaponSlots)
    };
  }

  getHullSlotCountForHull(hullSpecId: string, slotType: EquipmentSlot['slotType']): number {
    const hull = this.getHullSpec(hullSpecId);
    if (!hull) {
      return 0;
    }
    const desired = this.getDesiredEquipmentSlotCounts(hull);
    const raw = desired[slotType];
    if (raw === undefined) {
      return 0;
    }
    const count = Math.max(0, Math.floor(Number(raw)));
    return slotType === 'weapon' ? Math.min(5, count) : count;
  }

  /**
   * Atomically completes a shipyard purchase after customize flow validations.
   */
  confirmShipyardPurchase(input: {
    landable: Landable;
    listing: ShipyardListing;
    /** Slots for the new hull (same shape as expandSlotsToFullHull output). */
    finalEquipmentSlots: EquipmentSlot[];
    slotOrigins: Map<string, 'new' | 'old'>;
    storeEntries: ShipyardStoreEntry[];
  }): PurchaseResult {
    const { landable, listing, finalEquipmentSlots, slotOrigins, storeEntries } = input;
    const newHull = this.getHullSpec(listing.hullSpecId);
    if (!newHull) {
      return { success: false, reason: 'Unknown hull' };
    }
    const ship = this.getPlayerShipState();
    const oldHull = this.getHullSpec(ship.hullSpecId);
    if (!oldHull) {
      return { success: false, reason: 'Unknown current hull' };
    }

    if (listing.minReputation !== undefined && landable.factionId) {
      if (this.getReputationForFaction(landable.factionId) < listing.minReputation) {
        return { success: false, reason: 'Insufficient reputation for this listing' };
      }
    }

    const expanded = expandSlotsToFullHull(newHull, finalEquipmentSlots.map((s) => ({ ...s })));
    if (!customizeRequiredSlotsFilled(newHull, expanded)) {
      return { success: false, reason: 'Required equipment slots must be filled' };
    }

    const hostile = landable.factionId ? this.getReputationTier(landable.factionId) === 'hostile' : false;
    const breakdown = computeShipyardNetCost({
      newHullPrice: newHull.price,
      oldHullSellValue: oldHull.sellValue,
      hostile,
      newHull,
      customizeShipSlots: expanded,
      slotOrigins,
      storeEntries,
      getBuyPrice: (itemId) => {
        const item = this.getEquipmentItem(itemId);
        return item ? EquipmentStore.getBuyPrice(item, this, landable.factionId) : 0;
      },
      getSellPrice: (itemId) => {
        const item = this.getEquipmentItem(itemId);
        return item ? EquipmentStore.getSellPrice(item) : 0;
      }
    });

    if (ship.credits < breakdown.netCost) {
      return { success: false, reason: `Need ${Math.ceil(breakdown.netCost)}₢ (have ${Math.floor(ship.credits)}₢)` };
    }

    const cargoMass = ship.cargo.reduce((t, c) => t + c.weight, 0);
    const cargoCheck = customizeCargoFitsNewHull(newHull, cargoMass);
    if (!cargoCheck.ok) {
      return {
        success: false,
        reason: `Cargo (${cargoCheck.cargoMass}t) exceeds new ship capacity (${cargoCheck.capacity}t). Sell or jettison cargo first.`
      };
    }

    let installedMass = 0;
    for (const slot of expanded) {
      if (!slot.itemId) {
        continue;
      }
      const item = this.getEquipmentItem(slot.itemId);
      if (item) {
        installedMass += item.mass;
      }
    }
    if (installedMass > newHull.equipmentCapacity) {
      return { success: false, reason: 'Installed equipment exceeds new hull capacity' };
    }

    const weaponLoadout = deriveWeaponLoadoutFromEquipmentSlots(expanded, newHull.weaponSlots);
    const fuelMax = this.getMaxFuelForSlots(expanded);
    const shieldSlot = expanded.find((slot) => slot.slotType === 'shield' && slot.itemId);
    const shieldItem = shieldSlot?.itemId ? this.getEquipmentItem(shieldSlot.itemId) : null;
    const maxShieldHP = shieldItem?.type === 'shield' ? shieldItem.shieldHP : 0;
    const jouleMax = this.getMaxJoulesForSlots(expanded);

    this.updatePlayerShipState({
      hullSpecId: newHull.id,
      credits: ship.credits - breakdown.netCost,
      equipmentSlots: expanded,
      weaponLoadout,
      currentHullHP: newHull.baseHP,
      maxHullHP: newHull.baseHP,
      armourLayers: deriveStarterArmourLayers(this, expanded),
      currentShieldHP: maxShieldHP,
      maxShieldHP,
      shieldRebooting: false,
      shieldRebootTimer: 0,
      currentJoules: jouleMax,
      fuel: fuelMax
    });
    this.saveToLocalStorage();
    return { success: true, netCost: breakdown.netCost };
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
    const { newRep, actualDelta } = applyReputationDelta(current, delta, actionType);
    if (actualDelta === 0) {
      return;
    }
    this.factionReputations[factionId] = newRep;
    this.logRepEvent(factionId, actualDelta, this.getActionLabel(actionType));
  }

  getPirateReputation(): number {
    return computePirateReputation(this.factionReputations, this.worldFile.factions);
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

  getInstalledEquipmentMass(): number {
    const ship = this.getPlayerShipState();
    return ship.equipmentSlots.reduce((total, slot) => {
      if (!slot.itemId) {
        return total;
      }
      return total + (this.getEquipmentItem(slot.itemId)?.mass ?? 0);
    }, 0);
  }

  getMaxFuelForSlots(slots: EquipmentSlot[]): number {
    const tankSlot = slots.find((slot) => slot.slotType === 'fuelTank' && slot.itemId);
    if (!tankSlot?.itemId) return 0;
    const item = this.getEquipmentItem(tankSlot.itemId);
    if (!item || item.type !== 'fuelTank') return 0;
    return (item as FuelTankItem).fuelCapacity;
  }

  getMaxFuel(): number {
    return this.getMaxFuelForSlots(this.getPlayerShipState().equipmentSlots);
  }

  getShieldItemForEquipmentSlots(equipmentSlots: EquipmentSlot[]): ShieldItem | null {
    const slot = equipmentSlots.find((s) => s.slotType === 'shield' && s.itemId);
    if (!slot?.itemId) return null;
    const item = this.getEquipmentItem(slot.itemId);
    return item?.type === 'shield' ? (item as ShieldItem) : null;
  }

  getInstalledShieldItemForShip(ship: ShipState): ShieldItem | null {
    return this.getShieldItemForEquipmentSlots(ship.equipmentSlots);
  }

  getInstalledShieldItem(): ShieldItem | null {
    return this.getInstalledShieldItemForShip(this.getPlayerShipState());
  }

  /** Full-HP armour layers, shield cap, and reactor battery cap from a slot list (e.g. NPC spawn loadout). */
  getCombatStateFromEquipmentSlots(equipmentSlots: EquipmentSlot[]): {
    armourLayers: ArmourLayerState[];
    maxShieldHP: number;
    currentShieldHP: number;
    maxJoules: number;
  } {
    const armourLayers = deriveStarterArmourLayers(this, equipmentSlots);
    const shieldItem = this.getShieldItemForEquipmentSlots(equipmentSlots);
    const maxShieldHP = shieldItem?.shieldHP ?? 0;
    const maxJoules = this.getMaxJoulesForSlots(equipmentSlots);
    return {
      armourLayers,
      maxShieldHP,
      currentShieldHP: maxShieldHP,
      maxJoules
    };
  }

  getInstalledReactorItem(): ReactorItem | null {
    const slot = this.getPlayerShipState().equipmentSlots.find((s) => s.slotType === 'reactor');
    if (!slot?.itemId) return null;
    const item = this.getEquipmentItem(slot.itemId);
    return item?.type === 'reactor' ? (item as ReactorItem) : null;
  }

  getMaxJoulesForSlots(slots: EquipmentSlot[]): number {
    const slot = slots.find((s) => s.slotType === 'reactor');
    if (!slot?.itemId) return 0;
    const item = this.getEquipmentItem(slot.itemId);
    return item?.type === 'reactor' ? (item as ReactorItem).capacityJoules : 0;
  }

  getMaxJoules(): number {
    return this.getMaxJoulesForSlots(this.getPlayerShipState().equipmentSlots);
  }

  isReactorOnline(): boolean {
    return this.getMaxJoules() > 0;
  }

  isShieldOnlineForShip(ship: ShipState): boolean {
    if (!this.getInstalledShieldItemForShip(ship)) return false;
    if (this.getMaxJoulesForSlots(ship.equipmentSlots) <= 0) return false;
    if (ship.shieldRebooting) return false;
    return true;
  }

  isShieldOnline(): boolean {
    return this.isShieldOnlineForShip(this.getPlayerShipState());
  }

  getOutermostDamageLayer(): 'shield' | 'armour' | 'hull' {
    const ship = this.getPlayerShipState();
    if (this.isShieldOnlineForShip(ship) && ship.currentShieldHP > 0) return 'shield';
    for (const layer of ship.armourLayers) {
      if (layer.currentHP > 0) return 'armour';
    }
    return 'hull';
  }

  recalculateMaxHP(): void {
    const ship = this.getPlayerShipState();
    const hullSpec = this.getHullSpec(ship.hullSpecId);
    if (!hullSpec) {
      return;
    }
    const maxHullHP = hullSpec.baseHP;
    this.updatePlayerShipState({
      maxHullHP,
      currentHullHP: Math.min(ship.currentHullHP, maxHullHP),
      fuel: Math.min(ship.fuel, this.getMaxFuel())
    });
  }

  recalculateArmourLayers(): void {
    const ship = this.getPlayerShipState();
    const armourSlots = ship.equipmentSlots.filter((s) => s.slotType === 'armour' && s.itemId);
    const newLayers: ArmourLayerState[] = armourSlots
      .map((slot) => {
        const item = this.getEquipmentItem(slot.itemId!);
        if (!item || item.type !== 'armour') {
          return null;
        }
        const existing = ship.armourLayers.find((layer) => layer.itemId === slot.itemId);
        return {
          itemId: slot.itemId!,
          currentHP: existing ? Math.min(existing.currentHP, item.hpBonus) : item.hpBonus,
          maxHP: item.hpBonus
        };
      })
      .filter((layer): layer is ArmourLayerState => layer !== null);
    this.updatePlayerShipState({ armourLayers: newLayers });
  }

  purchaseAndInstall(
    itemId: string,
    slotType: EquipmentSlot['slotType'],
    slotIndex: number,
    landable: Landable
  ): PurchaseResult {
    const ship = this.getPlayerShipState();
    const hullSpec = this.getHullSpec(ship.hullSpecId);
    const item = this.getEquipmentItem(itemId);
    if (!item) {
      return { success: false, reason: 'Item not found' };
    }

    const installClass = this.getItemInstallSlotClass(item);
    if (!this.slotTypeAcceptsInstallClass(slotType, installClass)) {
      return { success: false, reason: 'Item cannot be installed in that slot' };
    }

    const occupyingSlot = this.getSlot(slotType, slotIndex);
    const occupyingItem = occupyingSlot?.itemId ? this.getEquipmentItem(occupyingSlot.itemId) : null;
    if (occupyingItem?.id === item.id) {
      return { success: false, reason: 'Already installed in this slot' };
    }
    const massDelta = item.mass - (occupyingItem?.mass ?? 0);
    if (this.getInstalledEquipmentMass() + massDelta > (hullSpec?.equipmentCapacity ?? 0)) {
      return { success: false, reason: 'Insufficient equipment capacity' };
    }

    const buyPrice = EquipmentStore.getBuyPrice(item, this, landable.factionId);
    const sellValue = occupyingItem ? EquipmentStore.getSellPrice(occupyingItem) : 0;
    const netCost = buyPrice - sellValue;
    if (ship.credits < netCost) {
      return { success: false, reason: `Need ${netCost}₢ (have ${Math.floor(ship.credits)}₢)` };
    }

    const newSlots = [...ship.equipmentSlots];
    const slotArrayIndex = this.findSlotIndex(newSlots, slotType, slotIndex);
    if (slotArrayIndex < 0) {
      return { success: false, reason: 'Slot not found' };
    }
    newSlots[slotArrayIndex] = { slotType, itemId: item.id };

    let newLoadout = [...ship.weaponLoadout];
    if (item.type === 'weapon') {
      const existingWeaponSlot =
        occupyingItem?.type === 'weapon'
          ? newLoadout.find((slot) => slot.itemId === occupyingItem.id)
          : null;
      const fireKey = existingWeaponSlot?.fireKey ?? this.nextAvailableFireKey(newLoadout);
      if (fireKey) {
        newLoadout = newLoadout.filter((slot) => slot.fireKey !== fireKey);
        newLoadout.push({ fireKey, itemId: item.id, stackCount: 1, cooldownRemaining: 0 });
      }
    } else if (occupyingItem?.type === 'weapon') {
      newLoadout = newLoadout.filter((slot) => slot.itemId !== occupyingItem.id);
    }

    this.updatePlayerShipState({
      equipmentSlots: newSlots,
      weaponLoadout: newLoadout,
      credits: ship.credits - netCost
    });
    this.recalculateMaxHP();
    this.recalculateArmourLayers();
    const shieldItem = this.getInstalledShieldItem();
    const nextShieldMax = shieldItem?.shieldHP ?? 0;
    const nextJouleMax = this.getMaxJoules();
    this.updatePlayerShipState({
      maxShieldHP: nextShieldMax,
      currentShieldHP: Math.min(this.getPlayerShipState().currentShieldHP, nextShieldMax),
      currentJoules: Math.min(this.getPlayerShipState().currentJoules, nextJouleMax),
      shieldRebooting: nextShieldMax > 0 ? this.getPlayerShipState().shieldRebooting : false,
      shieldRebootTimer: nextShieldMax > 0 ? this.getPlayerShipState().shieldRebootTimer : 0
    });
    this.saveToLocalStorage();
    return { success: true, netCost };
  }

  sellFromSlot(
    slotType: EquipmentSlot['slotType'],
    slotIndex: number
  ): { success: boolean; creditsEarned: number; reason?: string } {
    const ship = this.getPlayerShipState();
    if (this.isSlotRequired(slotType, slotIndex, ship)) {
      return { success: false, creditsEarned: 0, reason: 'Cannot remove required equipment' };
    }
    const slot = this.getSlot(slotType, slotIndex);
    if (!slot?.itemId) {
      return { success: false, creditsEarned: 0, reason: 'Slot is empty' };
    }
    const item = this.getEquipmentItem(slot.itemId);
    if (!item) {
      return { success: false, creditsEarned: 0, reason: 'Item not found' };
    }
    const sellValue = EquipmentStore.getSellPrice(item);
    const newSlots = [...ship.equipmentSlots];
    const slotArrayIndex = this.findSlotIndex(newSlots, slotType, slotIndex);
    if (slotArrayIndex < 0) {
      return { success: false, creditsEarned: 0, reason: 'Slot not found' };
    }
    newSlots[slotArrayIndex] = { slotType, itemId: null };

    let newLoadout = [...ship.weaponLoadout];
    if (item.type === 'weapon') {
      newLoadout = newLoadout.filter((slotDef) => slotDef.itemId !== item.id);
    }
    this.updatePlayerShipState({
      equipmentSlots: newSlots,
      weaponLoadout: newLoadout,
      credits: ship.credits + sellValue
    });
    this.recalculateMaxHP();
    this.recalculateArmourLayers();
    const shieldItem = this.getInstalledShieldItem();
    const nextShieldMax = shieldItem?.shieldHP ?? 0;
    const nextJouleMax = this.getMaxJoules();
    this.updatePlayerShipState({
      maxShieldHP: nextShieldMax,
      currentShieldHP: Math.min(this.getPlayerShipState().currentShieldHP, nextShieldMax),
      currentJoules: Math.min(this.getPlayerShipState().currentJoules, nextJouleMax),
      shieldRebooting: nextShieldMax > 0 ? this.getPlayerShipState().shieldRebooting : false,
      shieldRebootTimer: nextShieldMax > 0 ? this.getPlayerShipState().shieldRebootTimer : 0
    });
    this.saveToLocalStorage();
    return { success: true, creditsEarned: sellValue };
  }

  getSlot(slotType: EquipmentSlot['slotType'], index: number): EquipmentSlot | null {
    const slots = this.playerShipState.equipmentSlots.filter((slot) => slot.slotType === slotType);
    return slots[index] ?? null;
  }

  findSlotIndex(slots: EquipmentSlot[], slotType: EquipmentSlot['slotType'], index: number): number {
    let seen = 0;
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].slotType !== slotType) {
        continue;
      }
      if (seen === index) {
        return i;
      }
      seen += 1;
    }
    return -1;
  }

  nextAvailableFireKey(loadout: WeaponSlot[]): WeaponFireKey | null {
    const maxWeaponSlots = Math.min(5, this.getHullSpec(this.playerShipState.hullSpecId)?.weaponSlots ?? 0);
    const keys: WeaponFireKey[] = ['Z', 'X', 'C', 'V', 'B'].slice(0, maxWeaponSlots) as WeaponFireKey[];
    const used = new Set(loadout.map((slot) => slot.fireKey));
    return keys.find((key) => !used.has(key)) ?? null;
  }

  private slotTypeAcceptsInstallClass(slotType: EquipmentSlot['slotType'], installClass: string): boolean {
    if (slotType === 'thruster_rotate') {
      return installClass === 'thruster_rotate';
    }
    return slotType === installClass;
  }

  private getItemInstallSlotClass(item: EquipmentItem): string {
    if (item.slotType) {
      return item.slotType;
    }
    if (item.type === 'thruster') {
      return 'thruster_forward';
    }
    return item.type;
  }

  private isSlotRequired(slotType: EquipmentSlot['slotType'], slotIndex: number, ship: ShipState): boolean {
    if (!REQUIRED_SLOT_TYPES.includes(slotType)) {
      return false;
    }
    const filled = ship.equipmentSlots.filter((slot) => slot.slotType === slotType && slot.itemId !== null);
    return filled.length <= 1;
  }

  acceptMission(mission: Mission): boolean {
    const ship = this.getPlayerShipState();
    const usedCargo = ship.cargo.reduce((total, item) => total + item.weight, 0);
    const cargoCapacity = this.getHullSpec(ship.hullSpecId)?.cargoCapacity ?? 0;
    const freeCargo = cargoCapacity - usedCargo;
    if (mission.cargoWeight > freeCargo) {
      return false;
    }

    const newCargo: CargoItem = {
      missionId: mission.id,
      description: `Mission cargo (${mission.cargoWeight}t)`,
      weight: mission.cargoWeight
    };

    this.updatePlayerShipState({
      activeMissions: [...ship.activeMissions, mission],
      cargo: [...ship.cargo, newCargo]
    });
    this.saveToLocalStorage();
    return true;
  }

  cancelMission(missionId: string): boolean {
    const ship = this.getPlayerShipState();
    const hasMission = ship.activeMissions.some((mission) => mission.id === missionId);
    if (!hasMission) {
      return false;
    }
    this.updatePlayerShipState({
      activeMissions: ship.activeMissions.filter((mission) => mission.id !== missionId),
      cargo: ship.cargo.filter((cargo) => cargo.missionId !== missionId)
    });
    this.saveToLocalStorage();
    return true;
  }

  checkMissionDelivery(landableId: string): CompletedMission[] {
    const ship = this.getPlayerShipState();
    const completed: CompletedMission[] = [];
    const remainingMissions = [] as ShipState['activeMissions'];
    const remainingCargo = [...ship.cargo];

    for (const mission of ship.activeMissions) {
      if (mission.destinationLandableId === landableId) {
        const cargoIndex = remainingCargo.findIndex((cargo) => cargo.missionId === mission.id);
        if (cargoIndex >= 0) {
          remainingCargo.splice(cargoIndex, 1);
        }
        for (const reward of mission.reputationRewards) {
          this.changeReputation(reward.factionId, reward.amount, 'mission_complete');
        }
        completed.push({ mission, creditsEarned: mission.payoff });
      } else {
        remainingMissions.push(mission);
      }
    }

    if (completed.length > 0) {
      this.updatePlayerShipState({
        activeMissions: remainingMissions,
        cargo: remainingCargo,
        credits: ship.credits + completed.reduce((sum, entry) => sum + entry.creditsEarned, 0)
      });
      this.saveToLocalStorage();
    }
    return completed;
  }

  getFreeCargo(): number {
    const ship = this.getPlayerShipState();
    const hullSpec = this.getHullSpec(ship.hullSpecId);
    const usedCargo = ship.cargo.reduce((total, item) => total + item.weight, 0);
    return Math.max(0, (hullSpec?.cargoCapacity ?? 0) - usedCargo);
  }

  updatePlayerShipState(updates: Partial<ShipState>): void {
    this.playerShipState = {
      ...this.playerShipState,
      ...updates,
      position: updates.position ? toVector2(updates.position) : this.playerShipState.position,
      velocity: updates.velocity ? toVector2(updates.velocity) : this.playerShipState.velocity
    };
    this.ensureHullSlots();
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

  getWorldFile(): WorldFile {
    return this.worldFile;
  }

  getStartingConditions(): StartingConditions {
    return this.worldFile.startingConditions;
  }

  getPilotName(): string {
    return this.pilotName;
  }

  setPilotName(name: string): void {
    this.pilotName = name.trim() || 'Pilot';
  }

  addPlayTime(dt: number): void {
    this.playTimeSeconds += dt;
  }

  getPlayTime(): number {
    return this.playTimeSeconds;
  }

  getGalaxyCentre(): GridCoord {
    return { x: 0, y: 0 };
  }

  getDistanceFromCentre(coord: GridCoord): number {
    return Math.sqrt(coord.x ** 2 + coord.y ** 2);
  }

  /** Radiation falloff 0…1 by distance from galactic centre (same formula as hull damage zone). */
  getRadiationIntensityAtCoord(coord: GridCoord): number {
    const dist = this.getDistanceFromCentre(coord);
    const t = (RADIATION_OUTER_RADIUS - dist) / (RADIATION_OUTER_RADIUS - RADIATION_INNER_RADIUS);
    return Math.pow(Math.max(0, Math.min(1, t)), 2);
  }

  getRadiationIntensity(): number {
    return this.getRadiationIntensityAtCoord(this.currentSectorCoord);
  }

  isInRadiationZone(): boolean {
    return this.getRadiationIntensity() > 0;
  }

  isSectorCoordInGalaxyBounds(coord: GridCoord): boolean {
    const hw = this.getGridWidth() / 2;
    const hh = this.getGridHeight() / 2;
    return coord.x >= -hw && coord.x < hw && coord.y >= -hh && coord.y < hh;
  }

  getHyperspaceTargetCoord(): GridCoord | null {
    return this.hyperspaceTargetCoord ? { ...this.hyperspaceTargetCoord } : null;
  }

  setHyperspaceTargetCoord(coord: GridCoord | null): void {
    if (coord === null) {
      this.hyperspaceTargetCoord = null;
      return;
    }
    if (!this.isSectorCoordInGalaxyBounds(coord)) {
      return;
    }
    this.hyperspaceTargetCoord = { ...coord };
  }

  saveToLocalStorage(): void {
    const payload: PersistedWorldState = {
      currentSectorCoord: this.currentSectorCoord,
      visitedSectors: Array.from(this.visitedSectors),
      playerShipState: this.playerShipState,
      factionReputations: this.factionReputations,
      repLog: this.repLog,
      pilotName: this.pilotName,
      playTimeSeconds: this.playTimeSeconds,
      hyperspaceTargetCoord: this.hyperspaceTargetCoord
    };
    const worldSeed = this.worldFile.metadata.seed;
    localStorage.setItem(`voidrunner_save_${worldSeed}`, JSON.stringify(payload));
    const shipHull = this.getHullSpec(this.playerShipState.hullSpecId);
    const metadata: SaveMetadata = {
      worldSeed,
      worldName: this.worldFile.metadata.name,
      pilotName: this.pilotName,
      savedAt: Date.now(),
      playTimeSeconds: this.playTimeSeconds,
      currentSectorCoord: this.currentSectorCoord,
      credits: this.playerShipState.credits,
      shipHullName: shipHull?.name ?? this.playerShipState.hullSpecId
    };
    localStorage.setItem(`voidrunner_meta_${worldSeed}`, JSON.stringify(metadata));
  }

  static loadFromLocalStorage(worldFile: WorldFile): WorldState | null {
    throwIfWorldFileInvalidForGame(worldFile);

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
      state.pilotName = typeof parsed.pilotName === 'string' ? parsed.pilotName : 'Pilot';
      state.playTimeSeconds = Number.isFinite(parsed.playTimeSeconds) ? Math.max(0, parsed.playTimeSeconds) : 0;
      const ht = parsed.hyperspaceTargetCoord;
      if (
        ht &&
        typeof ht.x === 'number' &&
        typeof ht.y === 'number' &&
        Number.isFinite(ht.x) &&
        Number.isFinite(ht.y)
      ) {
        state.setHyperspaceTargetCoord({ x: ht.x, y: ht.y });
      }
      return state;
    } catch (e) {
      if (e instanceof WorldFileValidationError) {
        throw e;
      }
      return null;
    }
  }

  static listSaves(): SaveMetadata[] {
    const saves: SaveMetadata[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('voidrunner_meta_')) {
        continue;
      }
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          continue;
        }
        const meta = JSON.parse(raw) as SaveMetadata;
        saves.push(meta);
      } catch {
        // Skip corrupted metadata entries.
      }
    }
    return saves.sort((a, b) => b.savedAt - a.savedAt);
  }

  static deleteSave(worldSeed: number): void {
    localStorage.removeItem(`voidrunner_save_${worldSeed}`);
    localStorage.removeItem(`voidrunner_meta_${worldSeed}`);
  }

  private getEquipmentValue(item: EquipmentItem): number {
    const tierValues = [200, 500, 1200, 3000, 7000];
    return tierValues[Math.min(item.tier - 1, 4)];
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

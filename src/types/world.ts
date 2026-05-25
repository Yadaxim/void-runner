import type { BulletSpec } from './bullet';
import type { EquipmentItem } from './equipment';
import type { FactionDefinition } from './faction';
import type { Landable } from './landable';
import type { MissionTemplate } from './mission';
import type { MissionTreeTemplate } from './missionTree';
import type { EquipmentSlot, HullLoadoutVariantKey, HullSpec, SlotMap } from './ship';
import type { Species } from './species';

export type RegionType = 'void' | 'frontier' | 'midring' | 'core_arm' | 'contested' | 'radiation_fringe';

export interface GridCoord {
  x: number;
  y: number;
}

export interface NPCSpawnRule {
  factionId: string;
  behaviourType: 'patrol' | 'transit' | 'trade' | 'hostile' | 'flee';
  hullSpecId: HullSpec['id'];
  /** Which hull `defaultLoadouts` preset NPCs use; default `basic`. */
  loadoutVariant?: HullLoadoutVariantKey;
  countRange: [number, number];
  minPresent: number;
  maxPresent: number;
  arrivalIntervalRange: [number, number];
}

export interface AmbientVisuals {
  hasNebula: boolean;
  nebulaHue: number;
  nebulaIntensity: number;
  starDensityMultiplier: number;
}

export interface SectorMetadata {
  coord: GridCoord;
  regionType: RegionType;
  factionId: string | null;
  npcSpawnRules: NPCSpawnRule[];
  inRadiationZone: boolean;
  radiationFringeIntensity: number;
  /** Bubble-edge shimmer zone (step 2). */
  inShimmerZone?: boolean;
  ambientVisuals: AmbientVisuals;
  seed: number;
  landables: Landable[];
}

export interface StartingConditions {
  sectorCoord: GridCoord;
  credits: number;
  hullSpecId: string;
  equipmentSlots: EquipmentSlot[];
  /** Optional starting rep overrides (validated when present). */
  factionReputations?: Record<string, number>;
}

export interface DefaultLoadoutEntry {
  hullSpecId: string;
  equipmentSlots: EquipmentSlot[];
}

export interface ShipyardListing {
  id: string;
  hullSpecId: string;
  equipmentSlots: SlotMap;
  /** Total credits for this configured ship (typically hull + equipment at list prices). */
  price: number;
  name?: string;
  description?: string;
  /** Minimum reputation with landable faction to purchase (same semantics as equipment store gating). */
  minReputation?: number;
}

export interface WorldFile {
  metadata: {
    name: string;
    seed: number;
    version: string;
    generatedAt: string;
    /** Game seconds per real second while the clock runs; default from constants when omitted. */
    gameTimeRate?: number;
  };
  galaxy: {
    gridWidth: number;
    gridHeight: number;
    /** World-unit width/height of each sector; defaults to {@link SECTOR_SIZE} when omitted. */
    sectorSize?: number;
    sectors?: SectorMetadata[][];
  };
  sectors: SectorMetadata[];
  species: Species[];
  factions: FactionDefinition[];
  hullSpecs: HullSpec[];
  /** Global shipyard SKU list; landables reference by id. */
  shipyardListings: ShipyardListing[];
  equipmentCatalog: EquipmentItem[];
  bulletSpecs: BulletSpec[];
  missionTemplates: MissionTemplate[];
  /** Story mission arcs with branching prerequisites and world consequences. */
  missionTreeTemplates?: MissionTreeTemplate[];
  startingConditions: StartingConditions;
  /** Optional named loadouts; every referenced item must exist in the catalog. */
  defaultLoadouts?: Record<string, DefaultLoadoutEntry>;
}

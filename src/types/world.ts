import type { BulletSpec } from './bullet';
import type { EquipmentItem } from './equipment';
import type { FactionDefinition } from './faction';
import type { Landable } from './landable';
import type { MissionTemplate } from './mission';
import type { EquipmentSlot, HullSpec, WeaponSlot } from './ship';

export type RegionType = 'void' | 'frontier' | 'midring' | 'core_arm' | 'contested' | 'radiation_fringe';

export interface GridCoord {
  x: number;
  y: number;
}

export interface NPCSpawnRule {
  factionId: string;
  behaviourType: 'patrol' | 'transit' | 'trade' | 'hostile' | 'escort';
  hullSpecId: HullSpec['id'];
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
  landableDensity: number;
  npcSpawnRules: NPCSpawnRule[];
  inRadiationZone: boolean;
  radiationFringeIntensity: number;
  ambientVisuals: AmbientVisuals;
  seed: number;
  landables: Landable[];
}

export interface WorldFile {
  metadata: {
    name: string;
    seed: number;
    version: string;
    generatedAt: string;
  };
  galaxy: {
    gridWidth: number;
    gridHeight: number;
    sectors: SectorMetadata[][];
  };
  sectors: SectorMetadata[];
  factions: FactionDefinition[];
  hullSpecs: HullSpec[];
  equipmentCatalog: EquipmentItem[];
  bulletSpecs: BulletSpec[];
  missionTemplates: MissionTemplate[];
  defaultLoadouts?: Partial<
    Record<
      HullSpec['hullClass'],
      {
        equipmentSlots: EquipmentSlot[];
        weaponLoadout: WeaponSlot[];
      }
    >
  >;
}

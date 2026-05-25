/** Explorer-only types — independent from game runtime. */

export interface GridCoord {
  x: number;
  y: number;
}

export type GalaxyShape = 'disc' | 'ring' | 'spiral' | 'heterogeneous';

export interface WorldGenConfig {
  sizeX: number;
  sizeY: number;
  sectorSize: number;
  shape: GalaxyShape;
  planetDensity: number;
  moonProbability: number;
  moonsPerPlanetRange: [number, number];
  seed: number;
  speciesCount: number;
  worldName: string;
}

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface PipelineStepDef {
  id: string;
  index: number;
  name: string;
  type: 'procedural' | 'llm' | 'procedural+llm' | 'assembly';
  dependsOn: string[];
  canParallel?: boolean;
}

export interface StepState {
  def: PipelineStepDef;
  status: StepStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  output?: unknown;
}

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stepId?: string;
}

export interface MapLayerFlags {
  grid: boolean;
  coords: boolean;
  structure: boolean;
  factions: boolean;
  radiation: boolean;
  nebula: boolean;
  ruins: boolean;
  shimmer: boolean;
  landables: boolean;
}

export interface LandablePin {
  id: string;
  type: 'planet' | 'moon' | 'station';
  sectorCoord: [number, number];
  parentId?: string;
  position: [number, number];
  name?: string;
}

export interface SectorOverride {
  sectorCoord: [number, number];
  properties: {
    radiation?: { intensity: number };
    nebula?: { color: string; density: number };
    ruins?: { detectionRequirement: number; salvageTier: 1 | 2 | 3 };
    shimmer?: boolean;
  };
}

export interface MapSectorView {
  coord: GridCoord;
  inGalaxy: boolean;
  /** Shape-mask weight 0..1 for structure layer rendering. */
  shapeWeight?: number;
  factionId: string | null;
  factionColour: string | null;
  landableCount: number;
  landables: LandablePin[];
  radiation: number;
  hasNebula: boolean;
  nebulaColor?: string;
  nebulaDensity?: number;
  hasRuins: boolean;
  hasShimmer: boolean;
  regionType?: string;
}

export interface MapViewData {
  gridWidth: number;
  gridHeight: number;
  sectors: Map<string, MapSectorView>;
  factions: { id: string; name: string; colour: string }[];
  source: 'empty' | 'preview' | 'step' | 'world';
  sourceLabel: string;
}

export interface HSLColour {
  h: number;
  s: number;
  l: number;
}

/** Minimal WorldFile slice for map rendering. */
export interface WorldFileSlice {
  metadata: { name: string; seed: number };
  galaxy: { gridWidth: number; gridHeight: number };
  factions: {
    id: string;
    name: string;
    primaryColour: HSLColour;
  }[];
  sectors: {
    coord: GridCoord;
    factionId: string | null;
    inRadiationZone?: boolean;
    radiationFringeIntensity?: number;
    inShimmerZone?: boolean;
    ambientVisuals?: { hasNebula: boolean; nebulaHue?: number };
    regionType?: string;
    landables: { id: string; name: string; type: string }[];
  }[];
}

export interface Step1Output {
  galaxy: { gridWidth: number; gridHeight: number; sectorSize: number };
  sectors: {
    coord: GridCoord;
    regionType: string;
    factionId: string | null;
    landables: { id: string; type: string; name: string; position: { x: number; y: number } }[];
    inRadiationZone?: boolean;
    radiationFringeIntensity?: number;
    inShimmerZone?: boolean;
    ambientVisuals?: { hasNebula: boolean };
  }[];
}

export interface Step2Output {
  sectorOverrides: SectorOverride[];
}

export function coordKey(c: GridCoord): string {
  return `${c.x},${c.y}`;
}

export function hslToCss(colour: HSLColour): string {
  return `hsl(${colour.h}, ${colour.s}%, ${colour.l}%)`;
}

export const DEFAULT_CONFIG: WorldGenConfig = {
  sizeX: 40,
  sizeY: 40,
  sectorSize: 10000,
  shape: 'spiral',
  planetDensity: 0.5,
  moonProbability: 0.3,
  moonsPerPlanetRange: [1, 3],
  seed: 424242,
  speciesCount: 5,
  worldName: 'Generated World'
};

export const DEFAULT_LAYERS: MapLayerFlags = {
  grid: true,
  coords: false,
  structure: true,
  factions: true,
  radiation: true,
  nebula: true,
  ruins: true,
  shimmer: true,
  landables: true
};

import type { GridCoord } from './world';

export type GeometryBias = 'angular' | 'rounded';
export type DensityBias = 'sparse' | 'dense';

export interface HSLColour {
  h: number;
  s: number;
  l: number;
}

export interface FactionDefinition {
  id: string;
  name: string;
  demonym: string;
  description: string;
  shipStyle: string;
  missionFlavour: string;
  homeSector: GridCoord;
  territoryRadius: number;
  primaryColour: HSLColour;
  secondaryColour: HSLColour;
  geometryBias: GeometryBias;
  densityBias: DensityBias;
  disposition: Record<string, number>;
  missionTiers: number[];
  isPirate: boolean;
}

export interface FactionVisual {
  factionId: string;
  primaryColour: string;
  secondaryColour: string;
  geometryBias: GeometryBias;
  densityBias: DensityBias;
}

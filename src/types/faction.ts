import type { GridCoord } from './world';

export type GeometryBias = 'angular' | 'rounded';
export type DensityBias = 'sparse' | 'dense';
export type FactionType = 'major_nation' | 'minor_nation' | 'independent';
export type BubbleStance = 'reunifier' | 'isolationist' | 'breaker' | 'indifferent';

export interface HSLColour {
  h: number;
  s: number;
  l: number;
}

export interface FactionDefinition {
  id: string;
  name: string;
  type: FactionType;
  demonym: string;
  description: string;
  shipStyle: string;
  missionFlavour: string;
  homeSector: GridCoord;
  homeLandableId: string | null;
  territoryRadius: number;
  speciesComposition: { speciesId: string; percentage: number }[];
  bubbleStance: BubbleStance;
  techArchetype: string;
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

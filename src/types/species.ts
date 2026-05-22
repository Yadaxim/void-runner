export type SpeciesArchetype =
  | 'biological'
  | 'machine'
  | 'hive'
  | 'energy'
  | 'voidtouched'
  | 'hybrid';


export type TechArchetype =
  | 'mechanical'
  | 'robotic'
  | 'synthetic'
  | 'biological'
  | 'energetic'
  | 'void';

export type HabitatPreference = 'core' | 'mid' | 'rim' | 'nebula' | 'radiation' | 'shimmer';

export interface Species {
  id: string;
  name: string;
  archetype: SpeciesArchetype;
  physiology: string;
  ethos: string;
  techArchetype: TechArchetype;
  preferredHabitat?: HabitatPreference;
}

export type SpeciesArchetype =
  | 'biological'
  | 'machine'
  | 'hive'
  | 'energy'
  | 'hybrid'
  | 'ascended'
  | 'parasitic'
  | 'symbiotic'
  | 'voidtouched';

export type HabitatPreference = 'core' | 'mid' | 'rim' | 'nebula' | 'radiation' | 'shimmer';

export interface Species {
  id: string;
  name: string;
  archetype: SpeciesArchetype;
  physiology: string;
  ethos: string;
  techProfile: {
    weaponStyle: string;
    hullAesthetic: string;
    namingConvention: string;
  };
  preferredHabitat?: HabitatPreference;
}

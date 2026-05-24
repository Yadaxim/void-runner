import type { PipelineStepDef } from './types';

/** 13-step pipeline from plan/worldgen/WORLDGEN.md */
export const PIPELINE_STEPS: PipelineStepDef[] = [
  {
    id: '01_galaxy_structure',
    index: 1,
    name: 'Galaxy structure',
    type: 'procedural',
    dependsOn: []
  },
  {
    id: '02_special_sectors',
    index: 2,
    name: 'Special sector seeds',
    type: 'procedural',
    dependsOn: ['01_galaxy_structure']
  },
  {
    id: '03_species',
    index: 3,
    name: 'Species',
    type: 'llm',
    dependsOn: []
  },
  {
    id: '04_faction_skeleton',
    index: 4,
    name: 'Faction skeleton',
    type: 'procedural',
    dependsOn: ['03_species']
  },
  {
    id: '05_faction_identity',
    index: 5,
    name: 'Faction identity',
    type: 'llm',
    dependsOn: ['04_faction_skeleton']
  },
  {
    id: '06_faction_homes',
    index: 6,
    name: 'Faction homes',
    type: 'procedural',
    dependsOn: ['01_galaxy_structure', '05_faction_identity']
  },
  {
    id: '07_territorial_growth',
    index: 7,
    name: 'Territorial growth',
    type: 'procedural+llm',
    dependsOn: ['06_faction_homes']
  },
  {
    id: '08a_relationships',
    index: 8,
    name: 'Faction relationships',
    type: 'procedural+llm',
    dependsOn: ['05_faction_identity'],
    canParallel: true
  },
  {
    id: '08b_stations',
    index: 9,
    name: 'Station placement',
    type: 'procedural',
    dependsOn: ['07_territorial_growth'],
    canParallel: true
  },
  {
    id: '09_equipment',
    index: 10,
    name: 'Equipment catalog',
    type: 'llm',
    dependsOn: ['03_species']
  },
  {
    id: '10_missions',
    index: 11,
    name: 'Mission templates',
    type: 'llm',
    dependsOn: ['05_faction_identity', '09_equipment']
  },
  {
    id: '11_mission_trees',
    index: 12,
    name: 'Mission tree templates',
    type: 'llm',
    dependsOn: ['05_faction_identity', '09_equipment', '10_missions']
  },
  {
    id: '12_faction_projects',
    index: 13,
    name: 'Faction projects',
    type: 'llm',
    dependsOn: ['05_faction_identity', '07_territorial_growth']
  },
  {
    id: '13_assembly',
    index: 14,
    name: 'Final assembly + validation',
    type: 'assembly',
    dependsOn: ['01_galaxy_structure', '02_special_sectors', '03_species', '05_faction_identity', '07_territorial_growth', '08a_relationships', '08b_stations', '09_equipment', '10_missions', '11_mission_trees', '12_faction_projects']
  }
];

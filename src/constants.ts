import type { DamageTypeKey } from './types';

// Physics and simulation
export const GRAVITY_CONSTANT = 5;
export const MIN_GRAVITY_DISTANCE = 100;
export const MAX_DELTA_SECONDS = 0.1;
export const BULLET_MOMENTUM_TRANSFER_SCALE = 1;
export const BULLET_MAX_IMPACT_DELTA_V = 45;
// Reputation action floors (most negative value this action can reach)
export const REP_FLOOR_COMBAT_HIT = -50;
export const REP_FLOOR_COMBAT_KILL = -70;
export const REP_FLOOR_MISSION_FAIL = -30;
// Reputation action ceilings (most positive value this action can reach)
export const REP_CEILING_MISSION_COMPLETE = 60;
export const REP_CEILING_MISSION_SPECIAL = 85;
export const REP_PENALTY_HIT = -2;
export const REP_PENALTY_KILL = -15;

// Flight gameplay and interactions
export const MAX_RADIATION_DAMAGE_PER_SECOND = 15;
export const LANDING_SPEED_THRESHOLD = 100;
export const LANDING_RADIUS_MULTIPLIER = 2.5;
export const TAKEOFF_VELOCITY = 30;
export const AUTOSAVE_INTERVAL_SECONDS = 1.5;

// Economy and resources
export const FUEL_CAPACITY_DEFAULT = 100;
export const FUEL_USE_LINEAR_THRUSTER_PER_SECOND = 1.0;
export const FUEL_USE_ROTATION_THRUSTER_PER_SECOND = 0.5;
export const REFUEL_PRICE_PER_UNIT = 1;
export const REFUEL_RATE = 20;
export const REPAIR_RATE = 10;
export const REPAIR_PRICE_DEFAULT = 3;
export const INSURANCE_REPAIR_COST_FRACTION = 0.1;
export const INSURANCE_PAYOUT_FRACTION = 0.9;
export const MISSION_BOARD_COUNT = 6;
export const MISSION_MIN_DISTANCE = 2;
export const MISSION_MAX_DISTANCE = 20;
export const MISSION_DELIVERY_DISPLAY_TIME = 5;
export const MISSION_PAYOFF_MIN = 200;

// Galaxy generation and world sizing
export const GALAXY_GRID_WIDTH = 30;
export const GALAXY_GRID_HEIGHT = 30;
export const SECTOR_WIDTH = 3200;
export const SECTOR_HEIGHT = 3200;
export const SECTOR_EDGE_THRESHOLD = 40;
export const RADIATION_OUTER_RADIUS = 3.0;
export const RADIATION_INNER_RADIUS = 1.0;
export const RADIATION_VIGNETTE_MAX_OPACITY = 0.55;
export const RADIATION_PARTICLE_COUNT = 60;
export const MAX_LANDABLES_PER_SECTOR = 4;
export const MAX_FLEET_SIZE = 5;

// NPC spawning
export const NPC_ARRIVAL_SPEED_MIN = 60;
export const NPC_ARRIVAL_SPEED_MAX = 140;
export const NPC_EDGE_INSET = 20;
export const NPC_ALLY_ALERT_RANGE = 800;

// Transit behaviour
export const TRANSIT_LOITER_RADIUS = 120;
export const TRANSIT_LOITER_MIN = 30;
export const TRANSIT_LOITER_MAX = 120;
export const TRANSIT_APPROACH_BRAKE_RADIUS = 300;
export const TRANSIT_LOITER_DRIFT_THRESHOLD = 2.0;
export const TRANSIT_LOITER_EXTENSION = 0.5;

// Patrol behaviour
export const PATROL_WAYPOINT_ARRIVAL_RADIUS = 80;
export const PATROL_WAYPOINT_COUNT = 4;

// Combat behaviour
export const NPC_AGGRO_RANGE = 600;
export const NPC_FLEE_HP_THRESHOLD = 0.25;
export const NPC_FIRE_RANGE = 400;
export const NPC_PREFERRED_COMBAT_RANGE = 280;
export const NPC_STRAFE_INTERVAL = 1.5;
export const NPC_DEAGGRO_RANGE_MULTIPLIER = 1.5;
export const NPC_THREAT_MEMORY_DURATION = 10;

// Opacity
export const NPC_FADE_DURATION = 1.0;
export const NPC_LEAVING_OPACITY = 0.3;

// Rendering and UI sizing
export const STAR_LAYER_COUNTS = [7000, 3500, 100, 40] as const;
export const STAR_SCROLL_FACTORS = [0.02, 0.08, 0.2, 0.5] as const;
export const MINIMAP_SIZE = 160;
export const EQUIPMENT_ICON_SIZE = 24;
export const ARRIVAL_MESSAGE_DURATION_MS = 3000;

export const HULL_DIMENSIONS = {
  fighter: { length: 32, width: 16 },
  courier: { length: 40, width: 24 },
  freighter: { length: 48, width: 36 },
  heavy: { length: 56, width: 42 }
} as const;

export const COLOURS = {
  SPACE_BLACK: '#080810',
  STAR_DIM: '#2a2a3a',
  STAR_MID: '#6a6a8a',
  STAR_BRIGHT: '#c8c8e8',
  UI_PRIMARY: '#e8e8f0',
  UI_SECONDARY: '#6060a0',
  UI_ACCENT: '#40c0ff',
  DANGER: '#ff4040',
  NPC_HOSTILE_OTHER: '#ff8c00',
  WARNING: '#ffaa00',
  SAFE: '#40ff80',
  CREDITS: '#ffd700'
} as const;

export const STAR_COLOURS = [COLOURS.STAR_DIM, COLOURS.STAR_MID, COLOURS.STAR_BRIGHT, COLOURS.UI_PRIMARY] as const;

export const DAMAGE_TYPE_LABELS: Record<DamageTypeKey, string> = {
  kinetic: 'KIN',
  antimatter_kinetic: 'A-KIN',
  darkmatter_kinetic: 'DM-KIN',
  explosive: 'EXP',
  antimatter_explosive: 'A-EXP',
  darkmatter_explosive: 'DM-EXP',
  laser: 'LSR',
  anti_photon_laser: 'A-LSR',
  dark_energy_laser: 'DE-LSR',
  plasma: 'PLA',
  antimatter_plasma: 'A-PLA',
  darkmatter_plasma: 'DM-PLA',
  void: 'VOID'
};

export const DEFAULT_FACTION_VISUAL = {
  factionId: 'player',
  primaryColour: '#e8e8f0',
  secondaryColour: '#40c0ff',
  geometryBias: 'angular' as const,
  densityBias: 'sparse' as const
};

// AI and neural controls
export const AI_OUTPUT_THRESHOLD = 0.5;
export const INPUT_VECTOR_BASE_SIZE = 6;
export const OUTPUT_VECTOR_SIZE = 10;

// Engine/system internals
export const UINT64_MASK = (1n << 64n) - 1n;
export const SAVE_KEY = 'void_runner_save';

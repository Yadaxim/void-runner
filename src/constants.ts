export const GRAVITY_CONSTANT = 0.5;
export const MAX_RADIATION_DAMAGE_PER_SECOND = 10;
export const LANDING_SPEED_THRESHOLD = 20;
export const LANDING_RADIUS_MULTIPLIER = 2.5;

export const GALAXY_GRID_WIDTH = 30;
export const GALAXY_GRID_HEIGHT = 30;
export const RADIATION_OUTER_RADIUS_FRACTION = 0.15;
export const RADIATION_INNER_RADIUS_FRACTION = 0.07;
export const MAX_LANDABLES_PER_SECTOR = 4;
export const MAX_FLEET_SIZE = 5;

export const STAR_LAYER_COUNTS = [300, 150, 60, 20] as const;
export const STAR_SCROLL_FACTORS = [0.02, 0.08, 0.2, 0.5] as const;
export const MINIMAP_SIZE = 160;
export const EQUIPMENT_ICON_SIZE = 24;

export const HULL_DIMENSIONS = {
  fighter: { length: 32, width: 16 },
  courier: { length: 40, width: 24 },
  freighter: { length: 48, width: 36 },
  heavy: { length: 56, width: 42 }
} as const;

export const AI_OUTPUT_THRESHOLD = 0.5;
export const INPUT_VECTOR_BASE_SIZE = 6;
export const OUTPUT_VECTOR_SIZE = 10;

export const INSURANCE_REPAIR_COST_FRACTION = 0.1;
export const INSURANCE_PAYOUT_FRACTION = 0.9;

export const COLOURS = {
  SPACE_BLACK: '#080810',
  STAR_DIM: '#2a2a3a',
  STAR_MID: '#6a6a8a',
  STAR_BRIGHT: '#c8c8e8',
  UI_PRIMARY: '#e8e8f0',
  UI_SECONDARY: '#6060a0',
  UI_ACCENT: '#40c0ff',
  DANGER: '#ff4040',
  WARNING: '#ffaa00',
  SAFE: '#40ff80',
  CREDITS: '#ffd700'
} as const;

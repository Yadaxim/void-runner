import type { WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import type { ShipEntity } from './shipEntity';

/**
 * Compact observation vector for imitation learning / replay metadata — recorded alongside
 * {@link ShipControlFrame} when flight recording is enabled.
 */
export interface ControlFrameSensorSnapshot {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  angularVelocity: number;
  /** `currentHullHP / maxHullHP` when max &gt; 0, else 0 */
  hullFraction: number;
  /** `currentShieldHP / maxShieldHP` when max &gt; 0, else 0 */
  shieldFraction: number;
  /** Sector radiation sample (same scale as {@link WorldState.getRadiationIntensity}). */
  radiationIntensity: number;
  /** Shortest distance to any NPC ship, or null if none. */
  nearestNpcDistanceMetres: number | null;
  /** Shortest distance to an NPC whose faction is hostile to the player's faction; null if unknown / none. */
  nearestHostileDistanceMetres: number | null;
  /** Land key edge this tick (same timing as {@link HumanPilot.getLastLandPressed}). */
  landPressed: boolean;
  /** Dev refuel key edge (same timing as flight screen). */
  devRefuelPressed: boolean;
}

export function buildControlFrameSensorSnapshot(
  worldState: WorldState,
  playerShip: ShipEntity,
  npcShips: ShipEntity[],
  aux?: { landPressed?: boolean; devRefuelPressed?: boolean }
): ControlFrameSensorSnapshot {
  const pos = playerShip.state.position as Vector2;
  const vel = playerShip.state.velocity as Vector2;
  const maxHull = Math.max(1e-9, playerShip.state.maxHullHP);
  const maxSh = Math.max(0, playerShip.state.maxShieldHP);
  const playerFactionId = playerShip.state.factionId;

  let nearestNpc: number | null = null;
  let nearestHostile: number | null = null;

  for (const npc of npcShips) {
    const d = Vector2.distance(pos, npc.state.position as Vector2);
    if (nearestNpc === null || d < nearestNpc) {
      nearestNpc = d;
    }
    const npcFaction = npc.state.factionId;
    if (playerFactionId && npcFaction && worldState.areFactionsHostile(playerFactionId, npcFaction)) {
      if (nearestHostile === null || d < nearestHostile) {
        nearestHostile = d;
      }
    }
  }

  return {
    position: { x: pos.x, y: pos.y },
    velocity: { x: vel.x, y: vel.y },
    angle: playerShip.state.angle,
    angularVelocity: playerShip.state.angularVelocity,
    hullFraction: Math.max(0, Math.min(1, playerShip.state.currentHullHP / maxHull)),
    shieldFraction:
      maxSh > 0 ? Math.max(0, Math.min(1, playerShip.state.currentShieldHP / maxSh)) : 0,
    radiationIntensity: worldState.getRadiationIntensity(),
    nearestNpcDistanceMetres: nearestNpc,
    nearestHostileDistanceMetres: nearestHostile,
    landPressed: Boolean(aux?.landPressed),
    devRefuelPressed: Boolean(aux?.devRefuelPressed)
  };
}

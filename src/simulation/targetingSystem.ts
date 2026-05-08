import { Vector2 } from '../physics/vector2';
import type { Landable, TargetState } from '../types';
import type { ShipEntity } from './shipEntity';

function sortByDistance<T>(
  playerPosition: Vector2,
  candidates: T[],
  getPosition: (candidate: T) => Vector2
): T[] {
  return [...candidates].sort((a, b) => {
    const da = Vector2.distance(playerPosition, getPosition(a));
    const db = Vector2.distance(playerPosition, getPosition(b));
    return da - db;
  });
}

function cycleTargetId<T extends { id: string }>(
  sortedCandidates: T[],
  currentTargetId: string | null
): string | null {
  if (sortedCandidates.length === 0) {
    return null;
  }
  if (!currentTargetId) {
    return sortedCandidates[0].id;
  }
  const currentIndex = sortedCandidates.findIndex((candidate) => candidate.id === currentTargetId);
  if (currentIndex < 0) {
    return sortedCandidates[0].id;
  }
  return sortedCandidates[(currentIndex + 1) % sortedCandidates.length].id;
}

export class TargetingSystem {
  private shipTargetId: string | null = null;
  private landableTargetId: string | null = null;

  cycleShipTarget(
    playerPosition: Vector2,
    ships: ShipEntity[],
    currentTargetId: string | null
  ): string | null {
    const sorted = sortByDistance(playerPosition, ships, (ship) => ship.state.position as Vector2);
    const sortedIds = sorted.map((ship) => ({ id: ship.state.id }));
    this.shipTargetId = cycleTargetId(sortedIds, currentTargetId);
    return this.shipTargetId;
  }

  /**
   * Shift+Tab: nearest NPC hostile to the player; if none, nearest NPC not hostile to the player
   * (`none` / `toOther`). Empty sector → clear target.
   */
  targetClosestHostileShip(playerPosition: Vector2, ships: ShipEntity[]): string | null {
    const hostileToPlayer = ships.filter((s) => s.getNPCHostilityState() === 'toPlayer');
    const pool =
      hostileToPlayer.length > 0
        ? hostileToPlayer
        : ships.filter((s) => s.getNPCHostilityState() !== 'toPlayer');
    const sorted = sortByDistance(playerPosition, pool, (ship) => ship.state.position as Vector2);
    this.shipTargetId = sorted[0]?.state.id ?? null;
    return this.shipTargetId;
  }

  cycleLandableTarget(
    playerPosition: Vector2,
    landables: Landable[],
    currentTargetId: string | null
  ): string | null {
    const sorted = sortByDistance(playerPosition, landables, (landable) => landable.position as Vector2);
    this.landableTargetId = cycleTargetId(sorted, currentTargetId);
    return this.landableTargetId;
  }

  setShipTarget(id: string | null): void {
    this.shipTargetId = id;
  }

  setLandableTarget(id: string | null): void {
    this.landableTargetId = id;
  }

  getShipTargetId(): string | null {
    return this.shipTargetId;
  }

  getLandableTargetId(): string | null {
    return this.landableTargetId;
  }

  getTargetState(): TargetState {
    return {
      shipTargetId: this.shipTargetId ?? undefined,
      landableTargetId: this.landableTargetId ?? undefined
    };
  }
}

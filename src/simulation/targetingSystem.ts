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

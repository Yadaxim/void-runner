import type { Vector2 } from '../types';
import { Vector2 as RuntimeVector2 } from '../physics/vector2';

export interface Camera {
  playerWorldPos: Vector2;
  canvasWidth: number;
  canvasHeight: number;
}

export function worldToScreen(worldPos: Vector2, camera: Camera): Vector2 {
  return new RuntimeVector2(
    worldPos.x - camera.playerWorldPos.x + camera.canvasWidth / 2,
    worldPos.y - camera.playerWorldPos.y + camera.canvasHeight / 2
  );
}

export function screenToWorld(screenPos: Vector2, camera: Camera): Vector2 {
  return new RuntimeVector2(
    screenPos.x + camera.playerWorldPos.x - camera.canvasWidth / 2,
    screenPos.y + camera.playerWorldPos.y - camera.canvasHeight / 2
  );
}

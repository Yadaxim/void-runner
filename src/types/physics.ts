export interface Vector2 {
  x: number;
  y: number;
}

export interface PolarCoord {
  r: number;
  theta: number;
}

export interface PhysicsBody {
  position: Vector2;
  velocity: Vector2;
  angle: number;
  angularVelocity: number;
  mass: number;
}

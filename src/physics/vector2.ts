import type { Vector2 as Vector2Like } from '../types';

export class Vector2 implements Vector2Like {
  constructor(public readonly x: number, public readonly y: number) {}

  add(other: Vector2Like): Vector2 { return new Vector2(this.x + other.x, this.y + other.y); }
  sub(other: Vector2Like): Vector2 { return new Vector2(this.x - other.x, this.y - other.y); }
  scale(scalar: number): Vector2 { return new Vector2(this.x * scalar, this.y * scalar); }
  dot(other: Vector2Like): number { return this.x * other.x + this.y * other.y; }
  cross(other: Vector2Like): number { return this.x * other.y - this.y * other.x; }
  magnitudeSquared(): number { return this.dot(this); }
  magnitude(): number { return Math.sqrt(this.magnitudeSquared()); }
  normalise(): Vector2 { const m = this.magnitude(); return m === 0 ? Vector2.zero() : this.scale(1 / m); }
  angleTo(other: Vector2Like): number { return Math.atan2(other.x - this.x, this.y - other.y); }
  rotate(angle: number): Vector2 { const c = Math.cos(angle); const s = Math.sin(angle); return new Vector2(this.x*c - this.y*s, this.x*s + this.y*c); }
  lerp(target: Vector2Like, t: number): Vector2 { return new Vector2(this.x + (target.x - this.x)*t, this.y + (target.y - this.y)*t); }

  static fromAngle(angle: number): Vector2 { return new Vector2(Math.sin(angle), -Math.cos(angle)); }
  static zero(): Vector2 { return new Vector2(0, 0); }
  static distance(a: Vector2Like, b: Vector2Like): number { return Math.hypot(a.x - b.x, a.y - b.y); }
}

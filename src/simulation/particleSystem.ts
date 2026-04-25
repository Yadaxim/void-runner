import { Vector2 } from '../physics/vector2';
import { childPRNG } from '../core/prng';

export interface Particle {
  position: Vector2;
  velocity: Vector2;
  colour: string;
  opacity: number;
  size: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private burstCounter = 0;

  spawnImpact(position: Vector2, colour: string, count: number = 8): void {
    this.spawnBurst(position, colour, count, 80, 160, 0.2, 0.4, 2, 4);
  }

  spawnExplosion(position: Vector2, colour: string, count: number = 24): void {
    this.spawnBurst(position, colour, count, 100, 300, 0.4, 1.0, 3, 8);
  }

  update(dt: number): void {
    for (const particle of this.particles) {
      particle.position = particle.position.add(particle.velocity.scale(dt));
      particle.life = Math.max(0, particle.life - dt);
      particle.opacity = particle.maxLife > 0 ? particle.life / particle.maxLife : 0;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  getParticles(): Particle[] {
    return this.particles;
  }

  private spawnBurst(
    position: Vector2,
    colour: string,
    count: number,
    speedMin: number,
    speedMax: number,
    lifeMin: number,
    lifeMax: number,
    sizeMin: number,
    sizeMax: number
  ): void {
    const prng = childPRNG(42, `particle_burst_${this.burstCounter++}`);
    const randomRange = (min: number, max: number): number => min + prng.next() * (max - min);
    for (let i = 0; i < count; i += 1) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(speedMin, speedMax);
      const life = randomRange(lifeMin, lifeMax);
      this.particles.push({
        position: new Vector2(position.x, position.y),
        velocity: Vector2.fromAngle(angle).scale(speed),
        colour,
        opacity: 1,
        size: randomRange(sizeMin, sizeMax),
        life,
        maxLife: life
      });
    }
  }
}

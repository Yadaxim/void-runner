import {
  RADIATION_PARTICLE_COUNT,
  RADIATION_VIGNETTE_MAX_OPACITY
} from '../../constants';

interface RadiationParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  life: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class RadiationLayer {
  private readonly particles: RadiationParticle[];
  private lastFrameTimeMs = performance.now();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly canvas: HTMLCanvasElement
  ) {
    this.particles = Array.from({ length: RADIATION_PARTICLE_COUNT }, () => this.createParticle(true));
  }

  render(intensity: number): void {
    if (intensity <= 0) {
      this.lastFrameTimeMs = performance.now();
      return;
    }

    const now = performance.now();
    const dt = clamp((now - this.lastFrameTimeMs) / 1000, 0, 0.1);
    this.lastFrameTimeMs = now;

    this.renderVignette(intensity, now);
    this.renderParticles(intensity, dt);
  }

  private renderVignette(intensity: number, nowMs: number): void {
    const pulse = 0.85 + 0.15 * Math.sin(nowMs * 0.003);
    const opacity = intensity * RADIATION_VIGNETTE_MAX_OPACITY * pulse;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius = Math.hypot(cx, cy);
    const innerRadius = Math.max(0, radius * 0.2);

    const gradient = this.ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, radius);
    gradient.addColorStop(0, `rgba(120, 20, 20, ${opacity * 0.05})`);
    gradient.addColorStop(0.55, `rgba(120, 20, 20, ${opacity * 0.35})`);
    gradient.addColorStop(1, `rgba(120, 20, 20, ${opacity})`);

    this.ctx.save();
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  private renderParticles(intensity: number, dt: number): void {
    const activeCount = Math.floor(intensity * RADIATION_PARTICLE_COUNT);
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    this.ctx.save();
    for (let i = 0; i < activeCount; i += 1) {
      const particle = this.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt * 0.5;

      if (particle.life <= 0 || this.isNearCentre(particle, cx, cy)) {
        this.particles[i] = this.createParticle(false);
        continue;
      }

      const alpha = clamp(intensity * particle.opacity * particle.life, 0, 1);
      this.ctx.strokeStyle = `rgba(200, 80, 80, ${alpha})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(particle.x, particle.y);
      this.ctx.lineTo(particle.x - particle.vx * 0.03, particle.y - particle.vy * 0.03);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private isNearCentre(particle: RadiationParticle, cx: number, cy: number): boolean {
    return Math.hypot(particle.x - cx, particle.y - cy) < 14;
  }

  private createParticle(initialFill: boolean): RadiationParticle {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = Math.random() * this.canvas.width;
      y = -20;
    } else if (side === 1) {
      x = this.canvas.width + 20;
      y = Math.random() * this.canvas.height;
    } else if (side === 2) {
      x = Math.random() * this.canvas.width;
      y = this.canvas.height + 20;
    } else {
      x = -20;
      y = Math.random() * this.canvas.height;
    }

    if (initialFill) {
      x = Math.random() * this.canvas.width;
      y = Math.random() * this.canvas.height;
    }

    const toCenterX = cx - x;
    const toCenterY = cy - y;
    const length = Math.hypot(toCenterX, toCenterY) || 1;
    const speed = 140 + Math.random() * 220;

    return {
      x,
      y,
      vx: (toCenterX / length) * speed,
      vy: (toCenterY / length) * speed,
      opacity: 0.35 + Math.random() * 0.65,
      life: 0.5 + Math.random() * 0.5
    };
  }
}

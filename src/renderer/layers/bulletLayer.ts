import type { BulletEntity } from '../../simulation/bulletEntity';
import type { Camera } from '../camera';
import { worldToScreen } from '../camera';

export class BulletLayer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  private getRenderAngle(bullet: BulletEntity): number {
    // Bullet angles are stored in ship-heading space (0 = up),
    // while canvas primitive shapes are authored facing +X.
    return bullet.getAngle() - Math.PI / 2;
  }

  render(bullets: BulletEntity[], camera: Camera): void {
    for (const bullet of bullets) {
      const spec = bullet.getSpec();
      if (spec.visualType === 'bolt') {
        this.drawBolt(bullet, camera);
      } else if (spec.visualType === 'orb') {
        this.drawOrb(bullet, camera);
      } else if (spec.visualType === 'missile') {
        this.drawMissile(bullet, camera);
      } else if (spec.visualType === 'beam_pulse') {
        this.drawBeamPulse(bullet, camera);
      }
    }
  }

  private drawBolt(bullet: BulletEntity, camera: Camera): void {
    const trail = bullet.getTrailPositions();
    const trailAlphas = [0.6, 0.3, 0.1];
    const renderAngle = this.getRenderAngle(bullet);
    for (let i = 0; i < trailAlphas.length; i += 1) {
      const index = trail.length - 2 - i;
      if (index < 0) {
        continue;
      }
      this.drawOrientedOval(
        worldToScreen(trail[index], camera),
        renderAngle,
        8 - i * 2,
        3 - i * 0.6,
        bullet.getSpec().colour,
        trailAlphas[i]
      );
    }
    this.drawOrientedOval(
      worldToScreen(bullet.getPosition(), camera),
      renderAngle,
      8,
      3,
      bullet.getSpec().colour,
      1
    );
  }

  private drawOrb(bullet: BulletEntity, camera: Camera): void {
    const pos = worldToScreen(bullet.getPosition(), camera);
    const radius = 5;
    const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    gradient.addColorStop(0, bullet.getSpec().colour);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    const glow = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 1.5);
    glow.addColorStop(0, `${bullet.getSpec().colour}33`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius * 1.5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawMissile(bullet: BulletEntity, camera: Camera): void {
    const pos = worldToScreen(bullet.getPosition(), camera);
    const renderAngle = this.getRenderAngle(bullet);
    this.ctx.save();
    this.ctx.translate(pos.x, pos.y);
    this.ctx.rotate(renderAngle);
    this.ctx.fillStyle = bullet.getSpec().colour;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -3);
    this.ctx.lineTo(6, 0);
    this.ctx.lineTo(0, 3);
    this.ctx.closePath();
    this.ctx.fill();

    const trailGradient = this.ctx.createLinearGradient(-12, 0, 0, 0);
    trailGradient.addColorStop(0, 'rgba(255,255,255,0)');
    trailGradient.addColorStop(1, bullet.getSpec().colour);
    this.ctx.strokeStyle = trailGradient;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(-12, 0);
    this.ctx.lineTo(0, 0);
    this.ctx.stroke();
    this.ctx.fillStyle = '#ffd080';
    this.ctx.beginPath();
    this.ctx.arc(-2, 0, 1.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawBeamPulse(bullet: BulletEntity, camera: Camera): void {
    const pos = worldToScreen(bullet.getPosition(), camera);
    const renderAngle = this.getRenderAngle(bullet);
    this.ctx.save();
    this.ctx.translate(pos.x, pos.y);
    this.ctx.rotate(renderAngle);
    this.ctx.fillStyle = bullet.getSpec().colour;
    this.ctx.fillRect(-6, -1, 12, 2);
    this.ctx.globalAlpha = 0.1;
    this.ctx.fillRect(-12, -2, 24, 4);
    this.ctx.restore();
  }

  private drawOrientedOval(
    pos: { x: number; y: number },
    angle: number,
    width: number,
    height: number,
    colour: string,
    alpha: number
  ): void {
    this.ctx.save();
    this.ctx.translate(pos.x, pos.y);
    this.ctx.rotate(angle);
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = colour;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }
}

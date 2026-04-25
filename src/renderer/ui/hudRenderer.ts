import { COLOURS } from '../../constants';
import type { ShipEntity } from '../../simulation/shipEntity';

function normaliseDegrees(angleRad: number): number {
  const deg = (angleRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export class HudRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(playerShip: ShipEntity): void {
    const speed = Math.round(Math.hypot(playerShip.state.velocity.x, playerShip.state.velocity.y));
    const heading = Math.round(normaliseDegrees(playerShip.state.angle));
    const speedText = `SPD: ${speed.toString().padStart(3, '0')}`;
    const headingText = `HDG: ${heading.toString().padStart(3, '0')}°`;
    const linearBrakeText = `L-BRK: ${playerShip.isLinearAutoBrakeEnabled() ? 'ON' : 'OFF'}`;
    const rotationBrakeText = `R-BRK: ${playerShip.isRotationAutoBrakeEnabled() ? 'ON' : 'OFF'}`;

    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "12px 'Courier New', monospace";
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(speedText, 12, 12);
    this.ctx.fillText(headingText, 12, 28);
    this.ctx.fillText(linearBrakeText, 12, 44);
    this.ctx.fillText(rotationBrakeText, 12, 60);

    const cx = this.ctx.canvas.width / 2;
    const cy = this.ctx.canvas.height / 2;
    this.ctx.strokeStyle = COLOURS.UI_PRIMARY;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - 6, cy);
    this.ctx.lineTo(cx + 6, cy);
    this.ctx.moveTo(cx, cy - 6);
    this.ctx.lineTo(cx, cy + 6);
    this.ctx.stroke();
  }
}

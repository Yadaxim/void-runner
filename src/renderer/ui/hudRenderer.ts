import { COLOURS } from '../../constants';
import { LANDING_SPEED_THRESHOLD } from '../../constants';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { GridCoord, Landable } from '../../types';

function normaliseDegrees(angleRad: number): number {
  const deg = (angleRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function fitTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = '...';
  let result = text;
  while (result.length > 0 && ctx.measureText(`${result}${ellipsis}`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result.length > 0 ? `${result}${ellipsis}` : ellipsis;
}

export class HudRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(playerShip: ShipEntity, landingCandidate: Landable | null, sectorCoord: GridCoord): void {
    const speed = Math.round(Math.hypot(playerShip.state.velocity.x, playerShip.state.velocity.y));
    const heading = Math.round(normaliseDegrees(playerShip.state.angle));
    const fuelCurrent = Math.max(0, playerShip.state.fuel);
    const fuelMax = Math.max(0, playerShip.state.maxFuel);
    const fuelPercent = fuelMax > 0 ? Math.round((fuelCurrent / fuelMax) * 100) : 0;
    const credits = Math.floor(Math.max(0, playerShip.state.credits));
    const speedText = `SPD: ${speed.toString().padStart(3, '0')}`;
    const headingText = `HDG: ${heading.toString().padStart(3, '0')}°`;
    const fuelText = `FUEL: ${Math.floor(fuelCurrent).toString().padStart(3, '0')} / ${Math.floor(fuelMax).toString().padStart(3, '0')} (${fuelPercent.toString().padStart(3, '0')}%)`;
    const creditsText = `CR: ${credits.toString()}`;
    const linearBrakeText = `L-BRK: ${playerShip.isLinearAutoBrakeEnabled() ? 'ON' : 'OFF'}`;
    const rotationBrakeText = `R-BRK: ${playerShip.isRotationAutoBrakeEnabled() ? 'ON' : 'OFF'}`;

    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "12px 'Courier New', monospace";
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(speedText, 12, 12);
    this.ctx.fillText(headingText, 12, 28);
    this.ctx.fillText(fuelText, 12, 44);
    this.ctx.fillText(creditsText, 12, 60);
    this.ctx.fillText(linearBrakeText, 12, 76);
    this.ctx.fillText(rotationBrakeText, 12, 92);

    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    const sectorText = `SECTOR  ${sectorCoord.x} : ${sectorCoord.y}`;
    const sectorWidth = this.ctx.measureText(sectorText).width;
    this.ctx.fillText(sectorText, this.ctx.canvas.width - sectorWidth - 12, 12);

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

    if (landingCandidate && speed < LANDING_SPEED_THRESHOLD) {
      const pulse = 0.65 + (Math.sin(performance.now() * (Math.PI * 2 / 1000)) + 1) * 0.125;
      this.ctx.font = "14px 'Courier New', monospace";
      const paddingX = 14;
      const maxWidth = this.ctx.canvas.width - 32;
      const prefix = '[ L ]  LAND AT  ';
      const maxNameWidth = maxWidth - paddingX * 2 - this.ctx.measureText(prefix).width;
      const safeName = fitTextToWidth(this.ctx, landingCandidate.name.toUpperCase(), Math.max(40, maxNameWidth));
      const promptText = `${prefix}${safeName}`;
      const textWidth = this.ctx.measureText(promptText).width;
      const width = Math.min(maxWidth, textWidth + paddingX * 2);
      const height = 30;
      const x = (this.ctx.canvas.width - width) / 2;
      const y = this.ctx.canvas.height - 62;

      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.fillStyle = COLOURS.SPACE_BLACK;
      this.ctx.strokeStyle = COLOURS.UI_ACCENT;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, width, height, 14);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = COLOURS.UI_ACCENT;
      this.ctx.textBaseline = 'middle';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(promptText, x + paddingX, y + height / 2);
      this.ctx.restore();
    }
  }
}

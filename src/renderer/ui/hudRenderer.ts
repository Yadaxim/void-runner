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

  render(
    playerShip: ShipEntity,
    landingCandidate: Landable | null,
    sectorCoord: GridCoord,
    showBoundaryWarning: boolean,
    arrivalMessage: {
      title: string;
      landablesLine: string;
      alpha: number;
    } | null
  ): void {
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

    if (showBoundaryWarning) {
      const pulse = 0.4 + (Math.sin(performance.now() * (Math.PI * 2 / 1000)) + 1) * 0.3;
      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.fillStyle = COLOURS.WARNING;
      this.ctx.font = "13px 'Courier New', monospace";
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText('⚠  GALAXY BOUNDARY', this.ctx.canvas.width / 2, 12);
      this.ctx.restore();
    }

    if (arrivalMessage) {
      const maxWidth = this.ctx.canvas.width - 48;
      this.ctx.save();
      this.ctx.globalAlpha = arrivalMessage.alpha;
      this.ctx.font = "13px 'Courier New', monospace";
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      const title = arrivalMessage.title;
      const landablesLine = fitTextToWidth(this.ctx, arrivalMessage.landablesLine, maxWidth - 24);
      const titleWidth = this.ctx.measureText(title).width;
      const lineWidth = this.ctx.measureText(landablesLine).width;
      const boxWidth = Math.min(maxWidth, Math.max(titleWidth, lineWidth) + 24);
      const boxHeight = 42;
      const boxX = (this.ctx.canvas.width - boxWidth) / 2;
      const boxY = showBoundaryWarning ? 34 : 18;
      this.ctx.fillStyle = 'rgba(8, 8, 16, 0.85)';
      this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = COLOURS.UI_PRIMARY;
      this.ctx.fillText(title, this.ctx.canvas.width / 2, boxY + 7);
      this.ctx.fillStyle = COLOURS.UI_SECONDARY;
      this.ctx.font = "11px 'Courier New', monospace";
      this.ctx.fillText(landablesLine, this.ctx.canvas.width / 2, boxY + 24);
      this.ctx.restore();
    }

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

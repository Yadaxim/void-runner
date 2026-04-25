import { COLOURS } from '../../constants';
import { LANDING_SPEED_THRESHOLD } from '../../constants';
import type { ReputationTier, WorldState } from '../../core/worldState';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { GridCoord, Landable, WeaponFireKey, WeaponSlot } from '../../types';
import { WeaponStripRenderer } from './weaponStripRenderer';

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

function tierColour(tier: ReputationTier): string {
  if (tier === 'allied') return COLOURS.SAFE;
  if (tier === 'friendly') return COLOURS.UI_ACCENT;
  if (tier === 'neutral') return COLOURS.UI_PRIMARY;
  if (tier === 'unfriendly') return COLOURS.WARNING;
  return COLOURS.DANGER;
}

export class HudRenderer {
  private readonly weaponStripRenderer: WeaponStripRenderer;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.weaponStripRenderer = new WeaponStripRenderer(ctx);
  }

  render(
    playerShip: ShipEntity,
    landingCandidate: Landable | null,
    sectorCoord: GridCoord,
    showBoundaryWarning: boolean,
    arrivalMessage: {
      title: string;
      landablesLine: string;
      alpha: number;
    } | null,
    radiationIntensity: number,
    destructionMessageAlpha: number,
    shipTarget: { name: string; hpRatio: number } | null,
    landableTarget: { name: string } | null,
    sectorFaction: { shortName: string; reputation: number; tier: ReputationTier } | null,
    weaponLoadout: WeaponSlot[],
    worldState: WorldState,
    heldFireKeys: Record<WeaponFireKey, boolean>
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
    this.renderHpBar(playerShip, radiationIntensity);
    this.renderSectorReputationIndicator(sectorFaction);

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

    this.renderRadiationWarning(radiationIntensity, showBoundaryWarning, arrivalMessage !== null);
    this.renderDestructionMessage(destructionMessageAlpha);
    this.renderTargets(shipTarget, landableTarget);
    this.weaponStripRenderer.render(
      weaponLoadout,
      heldFireKeys,
      worldState,
      this.ctx.canvas.width,
      this.ctx.canvas.height
    );

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

  private renderTargets(
    shipTarget: { name: string; hpRatio: number } | null,
    landableTarget: { name: string } | null
  ): void {
    const leftMargin = 12;
    const topY = 132;
    const boxWidth = 320;
    const boxHeight = 20;
    const gap = 6;
    const boxX = leftMargin;
    const centerX = boxX + boxWidth / 2;
    const shipBoxY = topY;
    const landBoxY = shipBoxY + boxHeight + gap;
    this.ctx.save();
    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.82)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(boxX, shipBoxY, boxWidth, boxHeight, 6);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.roundRect(boxX, landBoxY, boxWidth, boxHeight, 6);
    this.ctx.fill();
    this.ctx.stroke();

    const shipLine = shipTarget ? shipTarget.name : 'NO SHIP TARGET';
    this.ctx.fillStyle = shipTarget ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
    this.ctx.fillText(shipLine, centerX, shipBoxY + boxHeight / 2);
    if (shipTarget) {
      const ratio = Math.max(0, Math.min(1, shipTarget.hpRatio));
      const percent = Math.round(ratio * 100);
      const bars = 6;
      const filled = Math.round(ratio * bars);
      const barText = `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, bars - filled))}  ${percent}%`;
      this.ctx.fillStyle = ratio > 0.6 ? COLOURS.SAFE : ratio > 0.3 ? COLOURS.WARNING : COLOURS.DANGER;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(barText, boxX + boxWidth - 8, shipBoxY + boxHeight / 2);
    }

    this.ctx.textAlign = 'center';
    const landLine = landableTarget ? landableTarget.name : 'NO LAND TARGET';
    this.ctx.fillStyle = landableTarget ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
    this.ctx.fillText(landLine, centerX, landBoxY + boxHeight / 2);
    this.ctx.restore();
  }

  private renderHpBar(playerShip: ShipEntity, radiationIntensity: number): void {
    const barX = 12;
    const barY = 112;
    const barWidth = 210;
    const barHeight = 10;
    const hpCurrent = Math.max(0, playerShip.state.currentHP);
    const hpMax = Math.max(1, playerShip.state.maxHP);
    const hpRatio = Math.max(0, Math.min(1, hpCurrent / hpMax));
    const fillWidth = Math.max(0, Math.floor((barWidth - 2) * hpRatio));

    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    this.ctx.fillStyle = COLOURS.SAFE;
    this.ctx.fillRect(barX + 1, barY + 1, fillWidth, barHeight - 2);

    if (radiationIntensity > 0) {
      const flicker = 0.65 + (Math.sin(performance.now() * 0.02) + 1) * 0.175;
      this.ctx.save();
      this.ctx.globalAlpha = radiationIntensity * 0.6 * flicker;
      this.ctx.fillStyle = COLOURS.DANGER;
      this.ctx.fillRect(barX + 1, barY + 1, fillWidth, barHeight - 2);
      this.ctx.restore();
    }
  }

  private renderSectorReputationIndicator(
    sectorFaction: { shortName: string; reputation: number; tier: ReputationTier } | null
  ): void {
    if (!sectorFaction) {
      return;
    }
    const y = this.ctx.canvas.height - 82;
    const x = 12;
    const barWidth = 72;
    const bars = 6;
    const value = Math.round(sectorFaction.reputation);
    const tier = sectorFaction.tier;
    const colour = tierColour(tier);
    const fillBars = Math.round((Math.abs(Math.max(-100, Math.min(100, value))) / 100) * bars);
    const barText = `${'█'.repeat(fillBars)}${'░'.repeat(Math.max(0, bars - fillBars))}`;
    const warnPrefix = tier === 'unfriendly' || tier === 'hostile' ? '⚠ ' : '';
    const shouldFlash = tier === 'hostile' && Math.floor(performance.now() / 250) % 2 === 0;
    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = "13px 'Courier New', monospace";
    this.ctx.fillStyle = shouldFlash ? COLOURS.DANGER : COLOURS.UI_PRIMARY;
    this.ctx.fillText(`${warnPrefix}${sectorFaction.shortName.toUpperCase().slice(0, 4)}`, x, y);
    this.ctx.fillStyle = shouldFlash ? COLOURS.DANGER : colour;
    this.ctx.fillText(barText, x + barWidth, y);
    this.ctx.fillText(`${value >= 0 ? '+' : ''}${value}`, x + barWidth + 66, y);
    this.ctx.restore();
  }

  private renderRadiationWarning(
    radiationIntensity: number,
    showBoundaryWarning: boolean,
    showArrivalMessage: boolean
  ): void {
    if (radiationIntensity <= 0) {
      return;
    }

    const isCritical = radiationIntensity >= 0.4;
    const text = isCritical ? '☢  RADIATION CRITICAL  —  LEAVE NOW' : '⚠  RADIATION DETECTED';
    const pulseFreq = isCritical ? 0.02 : 0.012;
    const pulse = 0.5 + (Math.sin(performance.now() * pulseFreq) + 1) * 0.25;

    this.ctx.save();
    this.ctx.globalAlpha = pulse;
    this.ctx.fillStyle = isCritical ? COLOURS.DANGER : COLOURS.WARNING;
    this.ctx.font = isCritical ? "16px 'Courier New', monospace" : "13px 'Courier New', monospace";
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    const baseY = showBoundaryWarning ? 56 : 34;
    const messageOffsetY = showArrivalMessage ? 48 : 0;
    this.ctx.fillText(text, this.ctx.canvas.width / 2, baseY + messageOffsetY);
    this.ctx.restore();
  }

  private renderDestructionMessage(alpha: number): void {
    if (alpha <= 0) {
      return;
    }

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = COLOURS.DANGER;
    this.ctx.font = "24px 'Courier New', monospace";
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      'SHIP DESTROYED — 500 ₢ PENALTY',
      this.ctx.canvas.width / 2,
      this.ctx.canvas.height / 2
    );
    this.ctx.restore();
  }
}

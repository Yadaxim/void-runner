import { COLOURS, REP_FLOOR_COMBAT_HIT, REP_FLOOR_COMBAT_KILL } from '../../constants';
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
    shipTarget: { name: string; hpRatio: number; hostility: 'none' | 'toPlayer' | 'toOther' } | null,
    landableTarget: { name: string } | null,
    sectorFaction: { shortName: string; reputation: number; tier: ReputationTier } | null,
    npcDebugLines: string[],
    spawnRuleDebugLines: string[],
    weaponLoadout: WeaponSlot[],
    worldState: WorldState,
    heldFireKeys: Record<WeaponFireKey, boolean>,
    playerBurnRemainingSeconds: number | null
  ): void {
    const speed = Math.round(Math.hypot(playerShip.state.velocity.x, playerShip.state.velocity.y));
    const heading = Math.round(normaliseDegrees(playerShip.state.angle));
    const fuelCurrent = Math.max(0, playerShip.state.fuel);
    const fuelMax = Math.max(0, playerShip.state.maxFuel);
    const fuelPercent = fuelMax > 0 ? Math.round((fuelCurrent / fuelMax) * 100) : 0;
    const credits = Math.floor(Math.max(0, playerShip.state.credits));
    const autoBrakeInstalled = playerShip.hasAutoBrake(worldState);
    const headingText = `HDG: ${heading.toString().padStart(3, '0')}°`;
    const creditsText = `CR: ${credits.toString()}`;
    this.renderShipTelemetryPanel({
      speed,
      headingText,
      fuelCurrent,
      fuelMax,
      fuelPercent,
      creditsText,
      linearBrakeEnabled: autoBrakeInstalled && playerShip.isLinearAutoBrakeEnabled(),
      rotationBrakeEnabled: autoBrakeInstalled && playerShip.isRotationAutoBrakeEnabled(),
      autoBrakeInstalled,
      hpCurrent: Math.max(0, playerShip.state.currentHP),
      hpMax: Math.max(1, playerShip.state.maxHP),
      hullBaseHP: worldState.getHullSpec(playerShip.state.hullSpecId)?.baseHP ?? Math.max(1, playerShip.state.maxHP),
      radiationIntensity,
      playerBurnRemainingSeconds
    });
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
    this.renderNPCDebug(npcDebugLines);
    this.renderSpawnRuleDebug(spawnRuleDebugLines);
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

  private renderShipTelemetryPanel(config: {
    speed: number;
    headingText: string;
    fuelCurrent: number;
    fuelMax: number;
    fuelPercent: number;
    creditsText: string;
    linearBrakeEnabled: boolean;
    rotationBrakeEnabled: boolean;
    autoBrakeInstalled: boolean;
    hpCurrent: number;
    hpMax: number;
    hullBaseHP: number;
    radiationIntensity: number;
    playerBurnRemainingSeconds: number | null;
  }): void {
    const panelX = 12;
    const panelY = 12;
    const panelWidth = 330;
    const panelHeight = 134;
    const headerY = panelY + 8;
    const speedGaugeMax = Math.max(LANDING_SPEED_THRESHOLD * 4, 400);
    const speedRatio = Math.max(0, Math.min(1, config.speed / speedGaugeMax));
    const fuelRatio = Math.max(0, Math.min(1, config.fuelMax > 0 ? config.fuelCurrent / config.fuelMax : 0));
    const speedColour = config.speed > LANDING_SPEED_THRESHOLD ? COLOURS.WARNING : COLOURS.SAFE;
    const fuelColour =
      config.fuelPercent > 50 ? COLOURS.SAFE : config.fuelPercent > 25 ? COLOURS.WARNING : COLOURS.DANGER;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.82)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText(config.headingText, panelX + 8, headerY);
    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.fillText(config.creditsText, panelX + panelWidth - 8, headerY);

    this.renderGauge({
      centerX: panelX + 104,
      centerY: panelY + 62,
      radius: 26,
      ratio: speedRatio,
      accent: speedColour,
      label: 'SPEED',
      value: config.speed.toString().padStart(3, '0'),
      subvalue: `SAFE <= ${LANDING_SPEED_THRESHOLD}`
    });
    this.renderGauge({
      centerX: panelX + 194,
      centerY: panelY + 62,
      radius: 26,
      ratio: fuelRatio,
      accent: fuelColour,
      label: 'FUEL',
      value: `${config.fuelPercent.toString().padStart(3, '0')}%`,
      subvalue: `${Math.floor(config.fuelCurrent).toString().padStart(3, '0')} / ${Math.floor(config.fuelMax).toString().padStart(3, '0')}`
    });

    this.renderBrakeChip(
      panelX + 260,
      panelY + 44,
      'L-BRK',
      config.autoBrakeInstalled ? config.linearBrakeEnabled : null
    );
    this.renderBrakeChip(
      panelX + 260,
      panelY + 66,
      'R-BRK',
      config.autoBrakeInstalled ? config.rotationBrakeEnabled : null
    );
    this.renderPanelHpBar(panelX + 8, panelY + 106, panelWidth - 16, config);
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText('[R] DEV REFUEL', panelX + panelWidth - 8, panelY + 120);
    this.ctx.restore();
  }

  private renderGauge(config: {
    centerX: number;
    centerY: number;
    radius: number;
    ratio: number;
    accent: string;
    label: string;
    value: string;
    subvalue: string;
  }): void {
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const clampedRatio = Math.max(0, Math.min(1, config.ratio));
    const valueAngle = start + (end - start) * clampedRatio;

    this.ctx.save();
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = COLOURS.STAR_DIM;
    this.ctx.beginPath();
    this.ctx.arc(config.centerX, config.centerY, config.radius, start, end);
    this.ctx.stroke();

    this.ctx.strokeStyle = config.accent;
    this.ctx.beginPath();
    this.ctx.arc(config.centerX, config.centerY, config.radius, start, valueAngle);
    this.ctx.stroke();

    this.ctx.fillStyle = config.accent;
    this.ctx.beginPath();
    this.ctx.arc(
      config.centerX + Math.cos(valueAngle) * config.radius,
      config.centerY + Math.sin(valueAngle) * config.radius,
      2.5,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText(config.label, config.centerX, config.centerY - 12);
    this.ctx.font = "12px 'Courier New', monospace";
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.fillText(config.value, config.centerX, config.centerY + 2);
    this.ctx.font = "9px 'Courier New', monospace";
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText(config.subvalue, config.centerX, config.centerY + config.radius + 6);
    this.ctx.restore();
  }

  private renderBrakeChip(x: number, y: number, label: string, enabled: boolean | null): void {
    const width = 62;
    const height = 18;
    const status = enabled === null ? 'N/A' : enabled ? 'ON' : 'OFF';
    const accent = enabled === null ? COLOURS.UI_SECONDARY : enabled ? COLOURS.SAFE : COLOURS.WARNING;

    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, 4);
    this.ctx.stroke();
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = "9px 'Courier New', monospace";
    this.ctx.fillText(label, x + 5, y + height / 2);
    this.ctx.fillStyle = accent;
    this.ctx.textAlign = 'right';
    this.ctx.fillText(status, x + width - 5, y + height / 2);
  }

  private renderPanelHpBar(
    barX: number,
    barY: number,
    barWidth: number,
    config: {
      hpCurrent: number;
      hpMax: number;
      hullBaseHP: number;
      radiationIntensity: number;
      playerBurnRemainingSeconds: number | null;
    }
  ): void {
    const barHeight = 10;
    const hpRatio = Math.max(0, Math.min(1, config.hpCurrent / config.hpMax));
    const fillWidth = Math.max(0, Math.floor((barWidth - 2) * hpRatio));

    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    this.ctx.fillStyle = COLOURS.SAFE;
    this.ctx.fillRect(barX + 1, barY + 1, fillWidth, barHeight - 2);

    if (config.radiationIntensity > 0) {
      const flicker = 0.65 + (Math.sin(performance.now() * 0.02) + 1) * 0.175;
      this.ctx.save();
      this.ctx.globalAlpha = config.radiationIntensity * 0.6 * flicker;
      this.ctx.fillStyle = COLOURS.DANGER;
      this.ctx.fillRect(barX + 1, barY + 1, fillWidth, barHeight - 2);
      this.ctx.restore();
    }
    if (config.hullBaseHP < config.hpMax) {
      const baseRatio = Math.max(0, Math.min(1, config.hullBaseHP / config.hpMax));
      const tickX = barX + 1 + (barWidth - 2) * baseRatio;
      this.ctx.save();
      this.ctx.strokeStyle = COLOURS.UI_ACCENT;
      this.ctx.globalAlpha = 0.7;
      this.ctx.beginPath();
      this.ctx.moveTo(tickX, barY - 2);
      this.ctx.lineTo(tickX, barY + barHeight + 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      `HP ${Math.round(config.hpCurrent).toString()} / ${Math.round(config.hpMax).toString()}`,
      barX,
      barY + 12
    );
    if (config.playerBurnRemainingSeconds !== null && config.playerBurnRemainingSeconds > 0) {
      const hpTextWidth = this.ctx.measureText(
        `HP ${Math.round(config.hpCurrent).toString()} / ${Math.round(config.hpMax).toString()}`
      ).width;
      this.ctx.fillStyle = '#80ff40';
      this.ctx.fillText(`⬡ ${config.playerBurnRemainingSeconds.toFixed(1)}s`, barX + hpTextWidth + 10, barY + 12);
    }
  }

  private renderTargets(
    shipTarget: { name: string; hpRatio: number; hostility: 'none' | 'toPlayer' | 'toOther' } | null,
    landableTarget: { name: string } | null
  ): void {
    const leftMargin = 12;
    const topY = 160;
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

    const shipLine = shipTarget
      ? `${shipTarget.hostility === 'toPlayer' ? '[HOSTILE TO YOU] ' : shipTarget.hostility === 'toOther' ? '[HOSTILE TO OTHER] ' : '[NEUTRAL] '} ${shipTarget.name}`
      : 'NO SHIP TARGET';
    this.ctx.fillStyle = shipTarget
      ? shipTarget.hostility === 'toPlayer'
        ? COLOURS.DANGER
        : shipTarget.hostility === 'toOther'
          ? COLOURS.WARNING
          : COLOURS.UI_PRIMARY
      : COLOURS.UI_SECONDARY;
    const hpTextPadding = 12;
    const hpTextReservedWidth = 108;
    const shipTextMaxWidth = boxWidth - hpTextReservedWidth - hpTextPadding * 2;
    const shipLineFitted = fitTextToWidth(this.ctx, shipLine, shipTextMaxWidth);
    this.ctx.textAlign = 'left';
    this.ctx.fillText(shipLineFitted, boxX + hpTextPadding, shipBoxY + boxHeight / 2);
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

  private renderHpBar(
    playerShip: ShipEntity,
    radiationIntensity: number,
    worldState: WorldState,
    playerBurnRemainingSeconds: number | null
  ): void {
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
    const hullSpec = worldState.getHullSpec(playerShip.state.hullSpecId);
    const baseHP = hullSpec?.baseHP ?? hpMax;
    if (baseHP < hpMax) {
      const baseRatio = Math.max(0, Math.min(1, baseHP / hpMax));
      const tickX = barX + 1 + (barWidth - 2) * baseRatio;
      this.ctx.save();
      this.ctx.strokeStyle = COLOURS.UI_ACCENT;
      this.ctx.globalAlpha = 0.7;
      this.ctx.beginPath();
      this.ctx.moveTo(tickX, barY - 2);
      this.ctx.lineTo(tickX, barY + barHeight + 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      `${Math.round(hpCurrent).toString()} / ${Math.round(hpMax).toString()}`,
      barX + barWidth + 10,
      barY - 1
    );
    if (playerBurnRemainingSeconds !== null && playerBurnRemainingSeconds > 0) {
      const hpTextWidth = this.ctx.measureText(`${Math.round(hpCurrent).toString()} / ${Math.round(hpMax).toString()}`).width;
      this.ctx.fillStyle = '#80ff40';
      this.ctx.fillText(
        `⬡ ${playerBurnRemainingSeconds.toFixed(1)}s`,
        barX + barWidth + 22 + hpTextWidth,
        barY - 1
      );
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
    const nearFloor =
      (value > REP_FLOOR_COMBAT_HIT - 10 && value <= REP_FLOOR_COMBAT_HIT) ||
      (value > REP_FLOOR_COMBAT_KILL - 10 && value <= REP_FLOOR_COMBAT_KILL);
    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = "13px 'Courier New', monospace";
    this.ctx.fillStyle = shouldFlash ? COLOURS.DANGER : COLOURS.UI_PRIMARY;
    this.ctx.fillText(`${warnPrefix}${sectorFaction.shortName.toUpperCase().slice(0, 4)}`, x, y);
    this.ctx.fillStyle = shouldFlash ? COLOURS.DANGER : colour;
    this.ctx.fillText(barText, x + barWidth, y);
    this.ctx.fillText(`${value >= 0 ? '+' : ''}${value}`, x + barWidth + 66, y);
    if (nearFloor) {
      this.ctx.fillStyle = COLOURS.WARNING;
      this.ctx.fillText('⚠ near limit', x + barWidth + 116, y);
    }
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

  private renderNPCDebug(npcDebugLines: string[]): void {
    if (npcDebugLines.length === 0) {
      return;
    }
    this.ctx.save();
    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    const baseY = this.ctx.canvas.height - 148;
    for (let i = 0; i < npcDebugLines.length; i += 1) {
      this.ctx.fillText(npcDebugLines[i], 12, baseY - i * 14);
    }
    this.ctx.restore();
  }

  private renderSpawnRuleDebug(spawnRuleDebugLines: string[]): void {
    if (spawnRuleDebugLines.length === 0) {
      return;
    }
    const x = this.ctx.canvas.width - 316;
    const y = this.ctx.canvas.height - 286;
    const width = 304;
    const visibleRows = spawnRuleDebugLines.slice(0, 5);
    const height = 18 + visibleRows.length * 13;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.82)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, 6);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = COLOURS.UI_ACCENT;
    this.ctx.fillText('SPAWN RULES', x + 8, y + 4);

    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    for (let i = 0; i < visibleRows.length; i += 1) {
      const line = visibleRows[i];
      const parts = line.split(' ');
      const countPart = parts[4] ?? '0/0';
      const timerPartRaw = parts[5] ?? 't:0.0s';
      const [currentRaw, maxRaw] = countPart.split('/');
      const current = Number(currentRaw);
      const max = Number(maxRaw);
      const timerValue = Number(timerPartRaw.replace('t:', '').replace('s', ''));
      if (current >= max && max > 0) {
        this.ctx.fillStyle = COLOURS.WARNING;
      } else if (!Number.isNaN(timerValue) && timerValue < 2) {
        this.ctx.fillStyle = COLOURS.DANGER;
      } else {
        this.ctx.fillStyle = COLOURS.UI_SECONDARY;
      }
      this.ctx.fillText(line, x + 8, y + 19 + i * 13);
    }
    this.ctx.restore();
  }
}

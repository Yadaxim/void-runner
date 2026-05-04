import { COLOURS } from '../../constants';
import { LANDING_SPEED_THRESHOLD } from '../../constants';
import type { WorldState } from '../../core/worldState';
import { Vector2 } from '../../physics/vector2';
import type { ShipEntity } from '../../simulation/shipEntity';
import type { GridCoord, Landable, Mission, WeaponFireKey, WeaponSlot } from '../../types';
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
    npcDebugLines: string[],
    spawnRuleDebugLines: string[],
    weaponLoadout: WeaponSlot[],
    worldState: WorldState,
    heldFireKeys: Record<WeaponFireKey, boolean>,
    playerBurnRemainingSeconds: number | null,
    activeMissions: Mission[],
    missionsPanelExpanded: boolean,
    hyperspaceAssist: { jumpDir: Vector2; showJumpPrompt: boolean } | null
  ): void {
    const speed = Math.round(Math.hypot(playerShip.state.velocity.x, playerShip.state.velocity.y));
    const fuelCurrent = Math.max(0, playerShip.state.fuel);
    const fuelMax = Math.max(0, worldState.getMaxFuel());
    const fuelPercent = fuelMax > 0 ? Math.round((fuelCurrent / fuelMax) * 100) : 0;
    const credits = Math.floor(Math.max(0, playerShip.state.credits));
    let armourCurrent = playerShip.state.armourLayers.reduce((sum, layer) => sum + Math.max(0, layer.currentHP), 0);
    let armourMax = playerShip.state.armourLayers.reduce((sum, layer) => sum + Math.max(0, layer.maxHP), 0);
    if (armourMax <= 0) {
      for (const slot of playerShip.state.equipmentSlots) {
        if (slot.slotType !== 'armour' || !slot.itemId) continue;
        const item = worldState.getEquipmentItem(slot.itemId);
        if (item?.type === 'armour') {
          armourMax += item.hpBonus;
          armourCurrent += item.hpBonus;
        }
      }
    }
    const shieldInstalled = !!worldState.getInstalledShieldItem();
    const reactorMax = worldState.getMaxJoules();
    const autoBrakeInstalled = playerShip.hasAutoBrake(worldState);
    const creditsText = `CR: ${credits.toString()}`;
    const sectorText = `SEC ${sectorCoord.x}:${sectorCoord.y}`;
    const hyperspaceCoord = worldState.getHyperspaceTargetCoord();
    // Draw target strips before HUD chrome so expanded HUD remains on top.
    this.renderTargets(shipTarget, landableTarget, hyperspaceCoord);
    this.renderShipTelemetryPanel({
      speed,
      sectorText,
      fuelCurrent,
      fuelMax,
      fuelPercent,
      creditsText,
      linearBrakeEnabled: autoBrakeInstalled && playerShip.isLinearAutoBrakeEnabled(),
      rotationBrakeEnabled: autoBrakeInstalled && playerShip.isRotationAutoBrakeEnabled(),
      autoBrakeInstalled,
      hullCurrent: Math.max(0, playerShip.state.currentHullHP),
      hullMax: Math.max(1, playerShip.state.maxHullHP),
      armourCurrent,
      armourMax,
      shieldCurrent: Math.max(0, playerShip.state.currentShieldHP),
      shieldMax: Math.max(0, playerShip.state.maxShieldHP),
      shieldInstalled,
      shieldRebooting: playerShip.state.shieldRebooting,
      shieldRebootTimer: playerShip.state.shieldRebootTimer,
      shieldOnline: worldState.isShieldOnline(),
      lastHitTime: playerShip.state.lastHitTime,
      shieldRegenDelay: worldState.getInstalledShieldItem()?.regenDelay ?? 0,
      currentJoules: Math.max(0, playerShip.state.currentJoules),
      maxJoules: Math.max(0, reactorMax),
      hullBaseHP: worldState.getHullSpec(playerShip.state.hullSpecId)?.baseHP ?? Math.max(1, playerShip.state.maxHullHP),
      radiationIntensity,
      playerBurnRemainingSeconds
    });
    this.renderActiveMissions(activeMissions, sectorCoord, missionsPanelExpanded);

    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
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

    this.renderHyperspaceJumpAssist(hyperspaceAssist);

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

    if (hyperspaceAssist?.showJumpPrompt) {
      const pulse = 0.65 + (Math.sin(performance.now() * (Math.PI * 2 / 1000)) + 1) * 0.125;
      const landingShowing = !!(landingCandidate && speed < LANDING_SPEED_THRESHOLD);
      const paddingX = 14;
      const maxWidth = this.ctx.canvas.width - 32;
      const promptText = '[ J ]  HYPER JUMP (TARGET LOCKED)';
      const textWidth = this.ctx.measureText(promptText).width;
      const width = Math.min(maxWidth, textWidth + paddingX * 2);
      const height = 30;
      const x = (this.ctx.canvas.width - width) / 2;
      const y = this.ctx.canvas.height - (landingShowing ? 130 : 96);

      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.fillStyle = COLOURS.SPACE_BLACK;
      this.ctx.strokeStyle = COLOURS.WARNING;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, width, height, 14);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = COLOURS.WARNING;
      this.ctx.font = "14px 'Courier New', monospace";
      this.ctx.textBaseline = 'middle';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(promptText, x + paddingX, y + height / 2);
      this.ctx.restore();
    }

    if (
      activeMissions.some(
        (mission) => mission.destinationSectorCoord.x === sectorCoord.x && mission.destinationSectorCoord.y === sectorCoord.y
      )
    ) {
      this.ctx.save();
      this.ctx.font = "13px 'Courier New', monospace";
      this.ctx.fillStyle = COLOURS.SAFE;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText('★ LAND TO DELIVER', this.ctx.canvas.width / 2, this.ctx.canvas.height - 18);
      this.ctx.restore();
    }
  }

  private static rayExitToAabbMargin(
    cx: number,
    cy: number,
    ux: number,
    uy: number,
    w: number,
    h: number,
    margin: number
  ): { ex: number; ey: number } | null {
    const minX = margin;
    const minY = margin;
    const maxX = w - margin;
    const maxY = h - margin;
    let tMin = Infinity;
    const consider = (t: number) => {
      if (t > 0 && t < tMin) {
        tMin = t;
      }
    };
    if (ux > 1e-9) {
      consider((maxX - cx) / ux);
    }
    if (ux < -1e-9) {
      consider((minX - cx) / ux);
    }
    if (uy > 1e-9) {
      consider((maxY - cy) / uy);
    }
    if (uy < -1e-9) {
      consider((minY - cy) / uy);
    }
    if (!Number.isFinite(tMin) || tMin <= 0) {
      return null;
    }
    return { ex: cx + ux * tMin, ey: cy + uy * tMin };
  }

  private renderHyperspaceJumpAssist(hyperspaceAssist: { jumpDir: Vector2; showJumpPrompt: boolean } | null): void {
    if (!hyperspaceAssist) {
      return;
    }
    const { jumpDir, showJumpPrompt } = hyperspaceAssist;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const edge = HudRenderer.rayExitToAabbMargin(cx, cy, jumpDir.x, jumpDir.y, w, h, 28);
    if (!edge) {
      return;
    }
    const inward = new Vector2(cx - edge.ex, cy - edge.ey).normalise();
    const pulse = 0.5 + (Math.sin(performance.now() * 0.0035) + 1) * 0.22;
    this.ctx.save();
    this.ctx.globalAlpha = showJumpPrompt ? pulse : pulse * 0.42;
    const tipX = edge.ex;
    const tipY = edge.ey;
    const baseX = edge.ex - inward.x * 26;
    const baseY = edge.ey - inward.y * 26;
    const px = -inward.y * 12;
    const py = inward.x * 12;
    this.ctx.fillStyle = COLOURS.WARNING;
    this.ctx.beginPath();
    this.ctx.moveTo(tipX, tipY);
    this.ctx.lineTo(baseX - px, baseY - py);
    this.ctx.lineTo(baseX + px, baseY + py);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.strokeStyle = COLOURS.UI_PRIMARY;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.restore();
  }

  renderActiveMissions(missions: Mission[], currentSectorCoord: GridCoord, expanded: boolean): void {
    const tabX = this.ctx.canvas.width - 164;
    const tabY = 12;
    this.ctx.save();
    this.ctx.font = "12px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.82)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.strokeRect(tabX, tabY, 150, 24);
    this.ctx.fillRect(tabX, tabY, 150, 24);
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.fillText(`[MISSIONS: ${missions.length}]`, tabX + 8, tabY + 6);
    if (!expanded) {
      this.ctx.restore();
      return;
    }
    const panelX = this.ctx.canvas.width - 420;
    const panelY = 42;
    const panelWidth = 396;
    const panelHeight = Math.min(280, 54 + missions.length * 58);
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.9)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "14px 'Courier New', monospace";
    this.ctx.fillText('ACTIVE MISSIONS', panelX + 10, panelY + 8);
    let rowY = panelY + 30;
    for (const mission of missions.slice(0, 4)) {
      const distance = Math.round(Math.hypot(
        mission.destinationSectorCoord.x - currentSectorCoord.x,
        mission.destinationSectorCoord.y - currentSectorCoord.y
      ));
      this.ctx.fillStyle = COLOURS.UI_PRIMARY;
      this.ctx.font = "12px 'Courier New', monospace";
      this.ctx.fillText(mission.title, panelX + 10, rowY);
      this.ctx.fillStyle = COLOURS.UI_ACCENT;
      this.ctx.fillText(
        `-> ${mission.destinationName} (${mission.destinationSectorCoord.x},${mission.destinationSectorCoord.y})`,
        panelX + 10,
        rowY + 16
      );
      this.ctx.fillStyle = COLOURS.UI_SECONDARY;
      this.ctx.fillText(`${mission.payoff} ₢   ${mission.cargoWeight}t   Distance: ~${distance}`, panelX + 10, rowY + 32);
      rowY += 56;
    }
    this.ctx.restore();
  }

  private renderShipTelemetryPanel(config: {
    speed: number;
    sectorText: string;
    fuelCurrent: number;
    fuelMax: number;
    fuelPercent: number;
    creditsText: string;
    linearBrakeEnabled: boolean;
    rotationBrakeEnabled: boolean;
    autoBrakeInstalled: boolean;
    hullCurrent: number;
    hullMax: number;
    armourCurrent: number;
    armourMax: number;
    shieldCurrent: number;
    shieldMax: number;
    shieldInstalled: boolean;
    shieldRebooting: boolean;
    shieldRebootTimer: number;
    shieldOnline: boolean;
    lastHitTime: number;
    shieldRegenDelay: number;
    currentJoules: number;
    maxJoules: number;
    hullBaseHP: number;
    radiationIntensity: number;
    playerBurnRemainingSeconds: number | null;
  }): void {
    const panelX = 12;
    const panelY = 12;
    const panelWidth = 330;
    const panelHeight = 228;
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
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText(
      fitTextToWidth(this.ctx, config.sectorText, panelWidth - 100),
      panelX + panelWidth / 2,
      headerY
    );
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
    this.renderLayerBars(panelX + 8, panelY + 100, panelWidth - 16, config);
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = COLOURS.UI_SECONDARY;
    this.ctx.fillText('[R] DEV REFUEL', panelX + panelWidth - 8, panelY + panelHeight - 10);
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

  private renderLayerBars(
    barX: number,
    barY: number,
    barWidth: number,
    config: {
      hullCurrent: number;
      hullMax: number;
      armourCurrent: number;
      armourMax: number;
      shieldCurrent: number;
      shieldMax: number;
      shieldInstalled: boolean;
      shieldRebooting: boolean;
      shieldRebootTimer: number;
      shieldOnline: boolean;
      lastHitTime: number;
      shieldRegenDelay: number;
      currentJoules: number;
      maxJoules: number;
      hullBaseHP: number;
      radiationIntensity: number;
      playerBurnRemainingSeconds: number | null;
    }
  ): void {
    const rowH = 22;
    let y = barY;
    if (config.shieldInstalled) {
      this.drawHudLayerRow('SHD', barX, y, barWidth, config.shieldCurrent, config.shieldMax, '#4aa3ff', true);
      const timeSinceHitSec = (Date.now() - config.lastHitTime) / 1000;
      const inRegenDelay =
        !config.shieldRebooting &&
        config.shieldMax > 0 &&
        config.lastHitTime > 0 &&
        timeSinceHitSec < config.shieldRegenDelay;
      const regenDelayRemain = inRegenDelay ? Math.max(0, config.shieldRegenDelay - timeSinceHitSec) : 0;
      const activelyRegen =
        config.shieldOnline &&
        config.shieldCurrent < config.shieldMax &&
        timeSinceHitSec >= config.shieldRegenDelay &&
        config.currentJoules > 0;

      this.ctx.font = "9px 'Courier New', monospace";
      this.ctx.textAlign = 'left';
      const statusY = y + 14;
      if (config.shieldRebooting) {
        const pulse = 0.65 + (Math.sin(performance.now() * 0.008) + 1) * 0.175;
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.fillStyle = COLOURS.DANGER;
        this.ctx.fillText(`     ⏸ rebooting ${config.shieldRebootTimer.toFixed(1)}s`, barX, statusY);
        this.ctx.restore();
      } else if (inRegenDelay) {
        this.ctx.fillStyle = COLOURS.WARNING;
        this.ctx.fillText(`     ⏸ ${regenDelayRemain.toFixed(1)}s`, barX, statusY);
      } else if (activelyRegen) {
        const pulse = 0.65 + (Math.sin(performance.now() * 0.012) + 1) * 0.175;
        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.ctx.fillStyle = COLOURS.SAFE;
        this.ctx.fillText('     ↑ regen', barX, statusY);
        this.ctx.restore();
      }
      y += rowH + 12;
    }
    if (config.armourMax > 0) {
      this.drawHudLayerRow('ARM', barX, y, barWidth, config.armourCurrent, config.armourMax, '#ff9a3d', true);
      y += rowH;
    }
    const hullRatio = config.hullMax > 0 ? config.hullCurrent / config.hullMax : 0;
    const hullColour = hullRatio > 0.6 ? COLOURS.SAFE : hullRatio > 0.3 ? COLOURS.WARNING : COLOURS.DANGER;
    this.drawHudLayerRow('HUL', barX, y, barWidth, config.hullCurrent, config.hullMax, hullColour, true, '', config.radiationIntensity);
    y += rowH;
    if (config.maxJoules > 0) {
      this.drawHudLayerRow('PWR', barX, y, barWidth, config.currentJoules, config.maxJoules, '#ffd700', true, ' J');
    }
  }

  private hudAsciiBar(ratio: number, segments = 10): string {
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * segments);
    return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, segments - filled))}`;
  }

  private drawHudLayerRow(
    label: string,
    x: number,
    y: number,
    width: number,
    current: number,
    max: number,
    colour: string,
    visible: boolean,
    suffix = '',
    radiationIntensity = 0
  ): void {
    if (!visible) {
      return;
    }
    const labelW = 32;
    const barSegX = x + labelW + 6;
    const barW = width - 110;
    const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.fillText(label, x, y + 2);
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barSegX, y + 1, barW, 10);
    this.ctx.fillStyle = colour;
    const fillW = Math.max(0, (barW - 2) * ratio);
    this.ctx.fillRect(barSegX + 1, y + 2, fillW, 8);
    if (radiationIntensity > 0 && fillW > 0) {
      const flicker = 0.65 + (Math.sin(performance.now() * 0.02) + 1) * 0.175;
      this.ctx.save();
      this.ctx.globalAlpha = radiationIntensity * 0.6 * flicker;
      this.ctx.fillStyle = COLOURS.DANGER;
      this.ctx.fillRect(barSegX + 1, y + 2, fillW, 8);
      this.ctx.restore();
    }
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    const numX = barSegX + barW + 8;
    this.ctx.fillText(`${Math.round(current)} / ${Math.round(max)}${suffix}`, numX, y + 2);
  }

  private renderTargets(
    shipTarget: { name: string; hpRatio: number; hostility: 'none' | 'toPlayer' | 'toOther' } | null,
    landableTarget: { name: string } | null,
    hyperspaceCoord: GridCoord | null
  ): void {
    const leftMargin = 12;
    const hudPanelY = 12;
    const hudPanelHeight = 228;
    const topY = hudPanelY + hudPanelHeight + 10;
    const boxWidth = 320;
    const boxHeight = 20;
    const gap = 6;
    const boxX = leftMargin;
    const centerX = boxX + boxWidth / 2;
    const shipBoxY = topY;
    const landBoxY = shipBoxY + boxHeight + gap;
    const hsBoxY = landBoxY + boxHeight + gap;
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
    this.ctx.beginPath();
    this.ctx.roundRect(boxX, hsBoxY, boxWidth, boxHeight, 6);
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

    const hsLine = hyperspaceCoord
      ? `HS TARGET  ${hyperspaceCoord.x} : ${hyperspaceCoord.y}`
      : 'NO HYPERSPACE TARGET';
    this.ctx.fillStyle = hyperspaceCoord ? COLOURS.WARNING : COLOURS.UI_SECONDARY;
    this.ctx.fillText(hsLine, centerX, hsBoxY + boxHeight / 2);
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
    const hpCurrent = Math.max(0, playerShip.state.currentHullHP);
    const hpMax = Math.max(1, playerShip.state.maxHullHP);
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

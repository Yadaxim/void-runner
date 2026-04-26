import {
  COLOURS,
  REFUEL_PRICE_PER_UNIT,
  REFUEL_RATE,
  REP_CEILING_MISSION_COMPLETE,
  REP_CEILING_MISSION_SPECIAL,
  REP_FLOOR_COMBAT_HIT,
  REP_FLOOR_COMBAT_KILL,
  REPAIR_PRICE_DEFAULT,
  REPAIR_RATE
} from '../constants';
import type { ReputationTier, WorldState } from '../core/worldState';
import { drawPlanet } from '../renderer/landables/planetRenderer';
import { drawMoon } from '../renderer/landables/moonRenderer';
import { drawStation } from '../renderer/landables/stationRenderer';
import type { Landable } from '../types';
import type { LandableService, ServiceType } from '../types/landable';
import type { Screen } from './screenManager';

type TabId =
  | 'overview'
  | 'refuel'
  | 'repair'
  | 'missionBoard'
  | 'shipyard'
  | 'equipmentStore'
  | 'trainingSimulator';

interface TabRect {
  id: TabId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LandableScreen implements Screen {
  private static readonly DEV_CREDIT_GRANT = 1000;
  private activeTab: TabId = 'overview';
  private isRefuelHeld = false;
  private isRepairing = false;
  private repairService: LandableService | null = null;
  private clickableTabs: TabId[] = ['overview', 'refuel', 'repair'];
  private tabRects: TabRect[] = [];
  private takeOffRect: { x: number; y: number; width: number; height: number } | null = null;
  private refuelRect: { x: number; y: number; width: number; height: number } | null = null;
  private fillUpRect: { x: number; y: number; width: number; height: number } | null = null;
  private repairRect: { x: number; y: number; width: number; height: number } | null = null;
  private fullRepairRect: { x: number; y: number; width: number; height: number } | null = null;
  private overviewHullRect: { x: number; y: number; width: number; height: number } | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Tab') {
      event.preventDefault();
      this.refreshClickableTabs();
      const nextIndex = (this.clickableTabs.indexOf(this.activeTab) + 1) % this.clickableTabs.length;
      this.activeTab = this.clickableTabs[nextIndex];
      return;
    }
    if (event.code === 'KeyT') {
      event.preventDefault();
      this.onTakeOff();
      return;
    }
    if (event.code === 'KeyY') {
      event.preventDefault();
      const ship = this.worldState.getPlayerShipState();
      this.worldState.updatePlayerShipState({
        credits: ship.credits + LandableScreen.DEV_CREDIT_GRANT
      });
      this.worldState.saveToLocalStorage();
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const hit = this.getCanvasPoint(event);
    if (!hit) return;
    if (this.takeOffRect && this.inRect(hit.x, hit.y, this.takeOffRect)) {
      this.onTakeOff();
      return;
    }
    for (const tab of this.tabRects) {
      if (this.inRect(hit.x, hit.y, tab)) {
        this.activeTab = tab.id;
        return;
      }
    }
    if (this.activeTab === 'overview' && this.overviewHullRect && this.inRect(hit.x, hit.y, this.overviewHullRect)) {
      this.activeTab = 'repair';
      return;
    }
    if (this.activeTab === 'refuel' && this.refuelRect && this.inRect(hit.x, hit.y, this.refuelRect)) {
      this.isRefuelHeld = true;
      return;
    }
    if (this.activeTab === 'refuel' && this.fillUpRect && this.inRect(hit.x, hit.y, this.fillUpRect)) {
      this.applyFullRefuel();
      return;
    }
    if (this.activeTab === 'repair' && this.repairRect && this.inRect(hit.x, hit.y, this.repairRect)) {
      this.isRepairing = true;
      return;
    }
    if (this.activeTab === 'repair' && this.fullRepairRect && this.inRect(hit.x, hit.y, this.fullRepairRect)) {
      this.applyFullRepair();
    }
  };

  private readonly onMouseUp = (): void => {
    this.isRefuelHeld = false;
    this.isRepairing = false;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly landable: Landable,
    private readonly worldState: WorldState,
    private readonly onTakeOff: () => void
  ) {
    this.repairService = this.landable.services.find((service) => service.type === 'repair') ?? null;
  }

  onEnter(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  onExit(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.isRefuelHeld = false;
    this.isRepairing = false;
  }

  update(dt: number): void {
    this.updateRefuel(dt);
    this.updateRepair(dt);
  }

  private updateRefuel(dt: number): void {
    if (!this.canAccessService('refuel')) return;
    if (this.activeTab !== 'refuel' || !this.isRefuelHeld) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerUnit = this.getRefuelPricePerUnit();
    const missingFuel = ship.maxFuel - ship.fuel;
    if (missingFuel <= 0) return;
    if (pricePerUnit <= 0) return;
    const affordableUnits = Math.floor(ship.credits / pricePerUnit);
    if (affordableUnits <= 0) return;
    const refillUnits = Math.min(missingFuel, REFUEL_RATE * dt, affordableUnits);
    if (refillUnits <= 0) return;
    this.worldState.updatePlayerShipState({
      fuel: ship.fuel + refillUnits,
      credits: ship.credits - refillUnits * pricePerUnit
    });
    this.worldState.saveToLocalStorage();
  }

  private updateRepair(dt: number): void {
    if (!this.canAccessService('repair')) return;
    if (this.activeTab !== 'repair' || !this.isRepairing) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.getRepairPricePerHP();
    if (pricePerHP <= 0) {
      this.isRepairing = false;
      return;
    }
    const repairAmount = Math.min(REPAIR_RATE * dt, ship.maxHP - ship.currentHP, ship.credits / pricePerHP);
    if (repairAmount <= 0) {
      this.isRepairing = false;
      return;
    }
    const cost = repairAmount * pricePerHP;
    this.worldState.updatePlayerShipState({
      currentHP: ship.currentHP + repairAmount,
      credits: ship.credits - cost
    });
    this.worldState.saveToLocalStorage();
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.refreshClickableTabs();
    const panelX = 48;
    const panelY = 44;
    const panelWidth = Math.max(700, ctx.canvas.width - 96);
    const panelHeight = Math.max(440, ctx.canvas.height - 88);
    const headerHeight = 92;
    const tabsHeight = 44;
    const contentX = panelX + 22;
    const contentY = panelY + headerHeight + tabsHeight + 20;
    const contentWidth = panelWidth - 44;
    const contentHeight = panelHeight - headerHeight - tabsHeight - 40;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 8, 16, 0.92)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(panelX, panelY, panelWidth, headerHeight);
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.font = "24px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this.landable.name.toUpperCase(), panelX + 20, panelY + 16);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    const factionText = this.worldState.getFaction(this.landable.factionId ?? '')?.name ?? 'Independent';
    ctx.fillText(factionText, panelX + 20, panelY + 54);
    if (this.isHostileAtLandable()) {
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('⚠ YOU ARE NOT WELCOME HERE — PRICES DOUBLED', panelX + 20, panelY + 72);
    }

    this.takeOffRect = {
      x: panelX + panelWidth - 172,
      y: panelY + 20,
      width: 146,
      height: 34
    };
    this.drawButton(ctx, this.takeOffRect, '[ TAKE OFF ]', true);

    const tabY = panelY + headerHeight + 6;
    const tabStartX = panelX + 16;
    const tabGap = 18;
    this.tabRects = [];
    let x = tabStartX;
    const allTabs: Array<{ label: string; id: TabId; serviceType: ServiceType | null; available: boolean }> = [
      { label: 'OVERVIEW', id: 'overview', serviceType: null, available: true },
      { label: 'REFUEL', id: 'refuel', serviceType: 'refuel', available: this.hasService('refuel') },
      { label: 'REPAIR', id: 'repair', serviceType: 'repair', available: this.hasService('repair') },
      {
        label: 'MISSION BOARD',
        id: 'missionBoard',
        serviceType: 'missionBoard',
        available: this.hasService('missionBoard')
      },
      { label: 'SHIPYARD', id: 'shipyard', serviceType: 'shipyard', available: this.hasService('shipyard') },
      {
        label: 'EQUIPMENT',
        id: 'equipmentStore',
        serviceType: 'equipmentStore',
        available: this.hasService('equipmentStore')
      },
      {
        label: 'TRAINING',
        id: 'trainingSimulator',
        serviceType: 'trainingSimulator',
        available: this.hasService('trainingSimulator')
      }
    ];
    ctx.font = "16px 'Courier New', monospace";
    ctx.textAlign = 'left';
    for (const tab of allTabs) {
      const accessible = tab.serviceType ? this.canAccessService(tab.serviceType) : true;
      const showLock = tab.serviceType !== null && tab.available && !accessible;
      const renderLabel = showLock ? `${tab.label} ` : tab.label;
      const width = ctx.measureText(renderLabel).width + (showLock ? 16 : 6);
      const isActive = tab.id === this.activeTab;
      if (!tab.available) {
        ctx.fillStyle = '#2a2a3a';
      } else if (showLock) {
        ctx.fillStyle = COLOURS.WARNING;
      } else {
        ctx.fillStyle = isActive ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
      }
      ctx.fillText(renderLabel, x, tabY + 8);
      if (showLock) {
        this.drawLockGlyph(ctx, x + ctx.measureText(renderLabel).width + 2, tabY + 10, 10, COLOURS.WARNING);
      }
      if (isActive) {
        ctx.strokeStyle = COLOURS.UI_ACCENT;
        ctx.beginPath();
        ctx.moveTo(x, tabY + 30);
        ctx.lineTo(x + width, tabY + 30);
        ctx.stroke();
      }
      if (tab.available) {
        this.tabRects.push({ id: tab.id, x, y: tabY, width, height: 30 });
      }
      x += width + tabGap;
    }
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + headerHeight);
    ctx.lineTo(panelX + panelWidth, panelY + headerHeight);
    ctx.moveTo(panelX, panelY + headerHeight + tabsHeight);
    ctx.lineTo(panelX + panelWidth, panelY + headerHeight + tabsHeight);
    ctx.stroke();

    if (this.activeTab === 'overview') {
      this.renderOverview(ctx, contentX, contentY, contentWidth, contentHeight);
    } else if (this.activeTab === 'refuel') {
      if (!this.canAccessService('refuel')) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderRefuel(ctx, contentX, contentY, contentWidth, contentHeight);
      }
    } else if (this.activeTab === 'repair') {
      if (!this.canAccessService('repair')) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderRepair(ctx, contentX, contentY, contentWidth, contentHeight);
      }
    } else if (
      this.activeTab === 'missionBoard' ||
      this.activeTab === 'shipyard' ||
      this.activeTab === 'equipmentStore' ||
      this.activeTab === 'trainingSimulator'
    ) {
      if (!this.canAccessService(this.activeTab)) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderServicePreview(ctx, contentX, contentY, this.activeTab);
      }
    } else {
      this.renderRefuel(ctx, contentX, contentY, contentWidth, contentHeight);
    }

    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `[ Y ] DEV CREDITS +${LandableScreen.DEV_CREDIT_GRANT}`,
      panelX + panelWidth - 16,
      panelY + panelHeight - 10
    );
    ctx.restore();
  }

  private renderOverview(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText(this.landable.name, x, y);

    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(this.formatType(this.landable.type), x, y + 28);
    const description = this.getOverviewDescription();
    this.drawWrappedText(ctx, description, x, y + 62, width - 210, 20);

    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`Faction: ${this.worldState.getFaction(this.landable.factionId ?? '')?.name ?? 'Independent'}`, x, y + 190);
    ctx.font = "italic 13px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(this.landable.atmosphere || 'Unknown atmosphere', x, y + 214);

    let tagX = x;
    const tagY = y + 240;
    this.overviewHullRect = null;
    ctx.font = "11px 'Courier New', monospace";
    for (const service of this.landable.services) {
      const label = service.type.toUpperCase();
      const labelWidth = ctx.measureText(label).width;
      const tagWidth = labelWidth + 14;
      ctx.strokeStyle = COLOURS.UI_ACCENT;
      ctx.strokeRect(tagX, tagY, tagWidth, 20);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(label, tagX + 7, tagY + 5);
      tagX += tagWidth + 8;
    }

    const ship = this.worldState.getPlayerShipState();
    const hullRatio = ship.maxHP > 0 ? Math.min(1, Math.max(0, ship.currentHP / ship.maxHP)) : 0;
    const hullTextY = tagY + 42;
    const barX = x + 120;
    const barY = hullTextY + 2;
    const barWidth = 140;
    const barHeight = 14;
    const needsRepair = ship.currentHP < ship.maxHP;
    const statusColour = needsRepair
      ? this.getHullColourByRatio(hullRatio)
      : COLOURS.SAFE;
    const statusText = needsRepair ? '[ needs repair ]' : '[ hull intact ]';
    this.overviewHullRect = { x, y: hullTextY - 2, width: 420, height: 22 };

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillText('HULL STATUS', x, hullTextY);
    this.drawStatusBar(ctx, barX, barY, barWidth, barHeight, hullRatio, this.getHullColourByRatio(hullRatio));
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`${Math.round(hullRatio * 100)}%`, barX + barWidth + 10, hullTextY);
    ctx.fillStyle = statusColour;
    ctx.fillText(statusText, barX + barWidth + 62, hullTextY);

    const standingY = tagY + 78;
    this.renderStanding(ctx, x, standingY, width - 20, y + _height);
    this.drawLandablePreview(ctx, x + width - 120, y + 104, 80);
  }

  private renderRefuel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const ship = this.worldState.getPlayerShipState();
    const pricePerUnit = this.getRefuelPricePerUnit();
    const fuelCurrent = ship.fuel;
    const fuelMax = ship.maxFuel;
    const fuelRatio = fuelMax > 0 ? Math.min(1, fuelCurrent / fuelMax) : 0;
    const credits = ship.credits;
    const affordable = credits >= pricePerUnit;
    const tankFull = fuelCurrent >= fuelMax;
    const fuelNeeded = Math.max(0, fuelMax - fuelCurrent);
    const fillUpCost = fuelNeeded * pricePerUnit;
    const canFillUp = !tankFull && credits >= fillUpCost;

    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`Current fuel: ${fuelCurrent.toFixed(1)} / ${fuelMax.toFixed(1)}`, x, y);

    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, y + 30, width - 260, 20);
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillRect(x + 1, y + 31, (width - 262) * fuelRatio, 18);

    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Price per unit: ${pricePerUnit} ₢ per unit`, x, y + 70);
    ctx.fillText(`Player credits: ${credits.toFixed(1)} ₢`, x, y + 92);

    this.refuelRect = { x, y: y + 130, width: 170, height: 36 };
    const canRefuel = !tankFull && affordable;
    this.drawButton(ctx, this.refuelRect, '[ REFUEL ]', canRefuel);
    if (tankFull) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText('TANK FULL', x + 192, y + 140);
    } else if (!affordable) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('INSUFFICIENT CREDITS', x + 192, y + 140);
    } else {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`-> ${(pricePerUnit * REFUEL_RATE).toFixed(1)} ₢/s`, x + 192, y + 140);
    }

    this.fillUpRect = { x, y: y + 184, width: 170, height: 36 };
    this.drawButton(ctx, this.fillUpRect, '[ FILL UP TANK ]', canFillUp);
    if (!tankFull) {
      ctx.fillStyle = canFillUp ? COLOURS.UI_SECONDARY : COLOURS.DANGER;
      ctx.fillText(`-> ${fillUpCost.toFixed(1)} ₢ total`, x + 192, y + 194);
    }

    if (tankFull) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText('TANK FULL', x + 192, y + 140);
    } else if (!affordable) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('INSUFFICIENT CREDITS', x + 192, y + 140);
    } else if (!canFillUp) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('INSUFFICIENT CREDITS', x + 192, y + 218);
    }
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    text: string,
    enabled: boolean
  ): void {
    ctx.save();
    ctx.fillStyle = enabled ? 'rgba(8, 8, 16, 0.85)' : 'rgba(30, 30, 44, 0.8)';
    ctx.strokeStyle = enabled ? COLOURS.UI_ACCENT : '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = enabled ? COLOURS.UI_ACCENT : '#3a3a4a';
    ctx.font = "13px 'Courier New', monospace";
    const fittedText = this.fitTextToWidth(ctx, text, rect.width - 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fittedText, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.restore();
  }

  private renderRepair(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.getRepairPricePerHP();
    const hpNeeded = Math.max(0, ship.maxHP - ship.currentHP);
    const hullRatio = ship.maxHP > 0 ? Math.min(1, Math.max(0, ship.currentHP / ship.maxHP)) : 0;
    const hullSpec = this.worldState.getHullSpec(ship.hullSpecId);
    const baseHullHP = hullSpec?.baseHP ?? ship.maxHP;
    const armourHP = Math.max(0, ship.maxHP - baseHullHP);
    const fullRepairCost = hpNeeded * pricePerHP;
    const hullIntact = hpNeeded <= 0;
    const canHoldRepair = !hullIntact && ship.credits >= pricePerHP;
    const canFullRepair = !hullIntact && ship.credits >= fullRepairCost;
    const maxRepairHP = pricePerHP > 0 ? Math.min(hpNeeded, Math.floor(ship.credits / pricePerHP)) : 0;
    const maxRepairCost = maxRepairHP * pricePerHP;

    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('HULL STATUS', x, y);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Hull integrity: ${ship.currentHP.toFixed(1)} / ${ship.maxHP.toFixed(1)} (${Math.round(hullRatio * 100)}%)`, x, y + 28);
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(
      `Hull: ${Math.round(baseHullHP)} HP + Armour: ${Math.round(armourHP)} HP = ${Math.round(ship.maxHP)} HP max`,
      x,
      y + 48
    );
    this.drawStatusBar(ctx, x, y + 72, width - 260, 20, hullRatio, this.getHullColourByRatio(hullRatio));

    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Damage: ${hpNeeded.toFixed(1)} HP`, x, y + 102);
    ctx.fillText(`Repair cost: ${pricePerHP} ₢ per HP`, x, y + 124);
    ctx.fillText(`Your credits: ${ship.credits.toFixed(1)} ₢`, x, y + 146);

    this.repairRect = { x, y: y + 184, width: 210, height: 36 };
    this.drawButton(ctx, this.repairRect, '[ HOLD TO REPAIR ]', canHoldRepair);
    if (hullIntact) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText('HULL INTACT', x + 228, y + 194);
    } else if (!canHoldRepair) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('INSUFFICIENT CREDITS', x + 228, y + 194);
    } else {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`-> ${(pricePerHP * REPAIR_RATE).toFixed(1)} ₢/s`, x + 228, y + 194);
    }

    this.fullRepairRect = { x, y: y + 238, width: 210, height: 36 };
    this.drawButton(ctx, this.fullRepairRect, '[ FULL REPAIR ]', canFullRepair);
    if (!hullIntact) {
      ctx.fillStyle = canFullRepair ? COLOURS.UI_SECONDARY : COLOURS.DANGER;
      ctx.fillText(`-> ${fullRepairCost.toFixed(1)} ₢ total`, x + 228, y + 248);
    }

    if (!canFullRepair && !hullIntact && maxRepairHP > 0) {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(`MAX REPAIR WITH CURRENT CREDITS: ${maxRepairHP} HP - ${maxRepairCost.toFixed(1)} ₢`, x, y + 290);
    }
  }

  private getRefuelPricePerUnit(): number {
    const base = this.landable.services.find((service) => service.type === 'refuel')?.refuelPricePerUnit ?? REFUEL_PRICE_PER_UNIT;
    return this.isHostileAtLandable() ? base * 2 : base;
  }

  private applyFullRefuel(): void {
    if (!this.canAccessService('refuel')) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerUnit = this.getRefuelPricePerUnit();
    const fuelNeeded = ship.maxFuel - ship.fuel;
    const totalCost = fuelNeeded * pricePerUnit;
    if (ship.credits < totalCost || fuelNeeded <= 0) return;
    this.worldState.updatePlayerShipState({
      fuel: ship.maxFuel,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private applyFullRepair(): void {
    if (!this.canAccessService('repair')) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.getRepairPricePerHP();
    const hpNeeded = ship.maxHP - ship.currentHP;
    const totalCost = hpNeeded * pricePerHP;
    if (ship.credits < totalCost || hpNeeded <= 0) return;
    this.worldState.updatePlayerShipState({
      currentHP: ship.maxHP,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private getRepairPricePerHP(): number {
    const base = this.repairService?.repairPricePerHP ?? REPAIR_PRICE_DEFAULT;
    return this.isHostileAtLandable() ? base * 2 : base;
  }

  private refreshClickableTabs(): void {
    const serviceTabs: ServiceType[] = [
      'refuel',
      'repair',
      'missionBoard',
      'shipyard',
      'equipmentStore',
      'trainingSimulator'
    ];
    this.clickableTabs = ['overview', ...serviceTabs.filter((serviceType) => this.hasService(serviceType))];
    if (!this.clickableTabs.includes(this.activeTab)) {
      this.activeTab = 'overview';
    }
  }

  private hasService(serviceType: ServiceType): boolean {
    return this.landable.services.some((service) => service.type === serviceType);
  }

  private canAccessService(serviceType: ServiceType): boolean {
    const landableFactionId = this.landable.factionId;
    if (!landableFactionId) return true;
    const tier = this.worldState.getReputationTier(landableFactionId);
    switch (serviceType) {
      case 'refuel':
      case 'repair':
        return tier !== 'hostile';
      case 'missionBoard':
        if (landableFactionId === 'pirates') {
          return tier === 'friendly' || tier === 'allied';
        }
        return tier !== 'hostile' && tier !== 'unfriendly';
      case 'equipmentStore':
      case 'shipyard':
      case 'trainingSimulator':
        return tier !== 'hostile' && tier !== 'unfriendly';
      default:
        return true;
    }
  }

  private renderAccessDenied(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const factionName = this.worldState.getFaction(this.landable.factionId ?? '')?.name ?? 'this faction';
    const reputation = this.landable.factionId ? Math.round(this.worldState.getReputationForFaction(this.landable.factionId)) : 0;
    const tier = this.landable.factionId ? this.worldState.getReputationTier(this.landable.factionId) : 'neutral';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.DANGER;
    ctx.font = "22px 'Courier New', monospace";
    ctx.fillText('ACCESS DENIED', x, y + 12);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Your reputation with ${factionName} is too low.`, x, y + 52);
    ctx.fillText(`Current standing: ${tier.toUpperCase()}  (${reputation >= 0 ? '+' : ''}${reputation})`, x, y + 76);
  }

  private renderServicePreview(ctx: CanvasRenderingContext2D, x: number, y: number, tabId: TabId): void {
    const labels: Record<TabId, string> = {
      overview: 'Overview',
      refuel: 'Refuel',
      repair: 'Repair',
      missionBoard: 'Mission Board',
      shipyard: 'Shipyard',
      equipmentStore: 'Equipment Store',
      trainingSimulator: 'Training Simulator'
    };
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText(labels[tabId].toUpperCase(), x, y);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText('Service terminal linked. Full interaction arrives in a later session.', x, y + 34);
  }

  private drawLockGlyph(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    colour: string
  ): void {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 3, size, size - 2);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + 3, size / 3, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  private isHostileAtLandable(): boolean {
    if (!this.landable.factionId) return false;
    return this.worldState.getReputationTier(this.landable.factionId) === 'hostile';
  }

  private getOverviewDescription(): string {
    if (this.landable.factionId !== 'pirates') {
      return this.landable.description || 'No description available.';
    }
    const pirateTier = this.worldState.getReputationTier('pirates');
    if (pirateTier === 'hostile') {
      return "Strangers aren't welcome here.";
    }
    return "The Syndicate does not ask where you've been. Only where you're going.";
  }

  private renderStanding(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    contentBottomY: number
  ): void {
    const factions = this.worldState.getFactions();
    const pirateFaction = this.worldState.getFaction('pirates');
    const uniqueFactions = pirateFaction
      ? [...factions.filter((faction) => faction.id !== 'pirates'), pirateFaction]
      : factions;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText('FACTION STANDING', x, y);

    const rowHeight = 20;
    const barWidth = 120;
    const barHeight = 10;
    const repLog = this.worldState.getRepLog().slice(-5);
    const standingHeaderHeight = 24;
    const repLogHeaderHeight = repLog.length > 0 ? 20 : 0;
    const repLogRowsHeight = repLog.length * 16;
    const availableForRows = Math.max(0, contentBottomY - y - standingHeaderHeight - repLogHeaderHeight - repLogRowsHeight - 8);
    const maxRows = Math.max(1, Math.floor(availableForRows / rowHeight));
    const pirateIndex = uniqueFactions.findIndex((faction) => faction.id === 'pirates');
    let visibleFactions = uniqueFactions.slice(0, maxRows);
    if (pirateIndex >= 0 && !visibleFactions.some((faction) => faction.id === 'pirates')) {
      visibleFactions = [...visibleFactions.slice(0, Math.max(0, maxRows - 1)), uniqueFactions[pirateIndex]];
    }

    for (let i = 0; i < visibleFactions.length; i += 1) {
      const faction = visibleFactions[i];
      const rep = Math.round(this.worldState.getReputationForFaction(faction.id));
      const tier = this.worldState.getReputationTier(faction.id);
      const rowY = y + 24 + i * rowHeight;
      const isLandableFaction = this.landable.factionId === faction.id;
      if (isLandableFaction) {
        ctx.fillStyle = 'rgba(64, 192, 255, 0.08)';
        ctx.fillRect(x - 2, rowY - 1, width - 40, rowHeight - 2);
      }
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      const nameText = `${faction.name}${faction.isPirate ? ' (derived)' : ''}`;
      ctx.fillText(nameText, x, rowY + 2);
      this.drawReputationBar(ctx, x + 190, rowY + 4, barWidth, barHeight, rep);
      ctx.fillStyle = this.getTierColour(tier);
      ctx.fillText(`${rep >= 0 ? '+' : ''}${rep}  ${tier.toUpperCase()}`, x + 320, rowY + 2);
    }

    this.renderRepLog(ctx, x, y + 24 + visibleFactions.length * rowHeight + 12);
  }

  private drawReputationBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    reputation: number
  ): void {
    const centre = x + width / 2;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, y, width, height);
    ctx.beginPath();
    ctx.moveTo(centre, y);
    ctx.lineTo(centre, y + height);
    ctx.strokeStyle = COLOURS.UI_PRIMARY;
    ctx.stroke();
    const normalised = Math.min(100, Math.max(-100, reputation)) / 100;
    const magnitude = Math.abs(normalised) * (width / 2 - 1);
    if (normalised > 0) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillRect(centre + 1, y + 1, magnitude, height - 2);
    } else if (normalised < 0) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillRect(centre - magnitude, y + 1, magnitude, height - 2);
    }
    this.drawRepLimitTick(ctx, x, y, width, height, REP_FLOOR_COMBAT_KILL, 'rgba(255, 64, 64, 0.6)');
    this.drawRepLimitTick(ctx, x, y, width, height, REP_FLOOR_COMBAT_HIT, 'rgba(255, 170, 0, 0.6)');
    this.drawRepLimitTick(ctx, x, y, width, height, REP_CEILING_MISSION_COMPLETE, 'rgba(64, 255, 128, 0.6)');
    this.drawRepLimitTick(ctx, x, y, width, height, REP_CEILING_MISSION_SPECIAL, 'rgba(120, 255, 170, 0.6)');
  }

  private drawRepLimitTick(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    repValue: number,
    colour: string
  ): void {
    const clamped = Math.max(-100, Math.min(100, repValue));
    const tickX = x + ((clamped + 100) / 200) * width;
    const tickY = y + Math.floor((height - 4) / 2);
    ctx.save();
    ctx.fillStyle = colour;
    ctx.fillRect(Math.round(tickX), tickY, 1, 4);
    ctx.restore();
  }

  private renderRepLog(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const entries = this.worldState.getRepLog().slice(-5);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillText('RECENT EVENTS', x, y);
    const oldestFirst = [...entries];
    oldestFirst.forEach((event, index) => {
      const rowY = y + 18 + index * 16;
      ctx.fillStyle = event.delta >= 0 ? COLOURS.SAFE : COLOURS.DANGER;
      const deltaText = `${event.delta >= 0 ? '+' : ''}${event.delta}`.padStart(4, ' ');
      ctx.fillText(deltaText, x, rowY);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      const eventText = `${event.factionName.padEnd(18, ' ')} ${event.reason.padEnd(16, ' ')} ${this.formatRelativeTime(event.timestamp)}`;
      ctx.fillText(eventText, x + 38, rowY);
    });
  }

  private formatRelativeTime(timestamp: number): string {
    const diffMs = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes <= 0) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr ago`;
  }

  private getTierColour(tier: ReputationTier): string {
    if (tier === 'allied') return COLOURS.SAFE;
    if (tier === 'friendly') return COLOURS.UI_ACCENT;
    if (tier === 'neutral') return COLOURS.UI_PRIMARY;
    if (tier === 'unfriendly') return COLOURS.WARNING;
    return COLOURS.DANGER;
  }

  private getHullColourByRatio(ratio: number): string {
    if (ratio <= 0.33) return COLOURS.DANGER;
    if (ratio <= 0.66) return COLOURS.WARNING;
    return COLOURS.SAFE;
  }

  private drawStatusBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    fillColour: string
  ): void {
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = fillColour;
    ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);
  }

  private formatType(rawType: string): string {
    return rawType.replace(/_/g, ' ').toUpperCase();
  }

  private fitTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
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

  private drawLandablePreview(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number
  ): void {
    if (this.landable.type === 'planet') {
      drawPlanet(ctx, x, y, radius, this.landable.seed);
      return;
    }
    if (this.landable.type === 'moon') {
      drawMoon(ctx, x, y, radius, this.landable.seed);
      return;
    }
    drawStation(
      ctx,
      x,
      y,
      radius,
      this.landable.seed,
      this.worldState.getFactionVisual(this.landable.factionId ?? ''),
      performance.now() * this.landable.rotationSpeed * 0.001
    );
  }

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    const words = text.split(/\s+/);
    let line = '';
    let lineY = y;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ctx.fillText(line, x, lineY);
    }
  }

  private inRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    const scaleX = this.canvas.width / bounds.width;
    const scaleY = this.canvas.height / bounds.height;
    return { x: (event.clientX - bounds.left) * scaleX, y: (event.clientY - bounds.top) * scaleY };
  }
}

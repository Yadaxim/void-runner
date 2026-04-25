import { COLOURS, REFUEL_PRICE_PER_UNIT, REFUEL_RATE, REPAIR_PRICE_DEFAULT, REPAIR_RATE } from '../constants';
import type { WorldState } from '../core/worldState';
import { drawPlanet } from '../renderer/landables/planetRenderer';
import { drawMoon } from '../renderer/landables/moonRenderer';
import { drawStation } from '../renderer/landables/stationRenderer';
import type { Landable } from '../types';
import type { LandableService } from '../types/landable';
import type { Screen } from './screenManager';

type TabId = 'overview' | 'refuel' | 'repair';

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
  private readonly clickableTabs: TabId[] = ['overview', 'refuel', 'repair'];
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
    if (this.activeTab !== 'repair' || !this.isRepairing) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.repairService?.repairPricePerHP ?? REPAIR_PRICE_DEFAULT;
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
    const allTabs: Array<{ label: string; id?: TabId; enabled: boolean }> = [
      { label: 'OVERVIEW', id: 'overview', enabled: true },
      { label: 'REFUEL', id: 'refuel', enabled: true },
      { label: 'REPAIR', id: 'repair', enabled: true },
      { label: 'MISSION BOARD', enabled: false },
      { label: 'SHIPYARD', enabled: false },
      { label: 'EQUIPMENT', enabled: false },
      { label: 'MISSIONS', enabled: false }
    ];
    ctx.font = "16px 'Courier New', monospace";
    ctx.textAlign = 'left';
    for (const tab of allTabs) {
      const width = ctx.measureText(tab.label).width + 6;
      const isActive = tab.id === this.activeTab;
      ctx.fillStyle = tab.enabled ? (isActive ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY) : '#2a2a3a';
      ctx.fillText(tab.label, x, tabY + 8);
      if (isActive) {
        ctx.strokeStyle = COLOURS.UI_ACCENT;
        ctx.beginPath();
        ctx.moveTo(x, tabY + 30);
        ctx.lineTo(x + width, tabY + 30);
        ctx.stroke();
      }
      if (tab.enabled && tab.id) {
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
      this.renderRefuel(ctx, contentX, contentY, contentWidth, contentHeight);
    } else {
      this.renderRepair(ctx, contentX, contentY, contentWidth, contentHeight);
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
    const description = this.landable.description || 'No description available.';
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
    const pricePerHP = this.repairService?.repairPricePerHP ?? REPAIR_PRICE_DEFAULT;
    const hpNeeded = Math.max(0, ship.maxHP - ship.currentHP);
    const hullRatio = ship.maxHP > 0 ? Math.min(1, Math.max(0, ship.currentHP / ship.maxHP)) : 0;
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
    this.drawStatusBar(ctx, x, y + 52, width - 260, 20, hullRatio, this.getHullColourByRatio(hullRatio));

    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Damage: ${hpNeeded.toFixed(1)} HP`, x, y + 82);
    ctx.fillText(`Repair cost: ${pricePerHP} ₢ per HP`, x, y + 104);
    ctx.fillText(`Your credits: ${ship.credits.toFixed(1)} ₢`, x, y + 126);

    this.repairRect = { x, y: y + 164, width: 210, height: 36 };
    this.drawButton(ctx, this.repairRect, '[ HOLD TO REPAIR ]', canHoldRepair);
    if (hullIntact) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText('HULL INTACT', x + 228, y + 174);
    } else if (!canHoldRepair) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText('INSUFFICIENT CREDITS', x + 228, y + 174);
    } else {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`-> ${(pricePerHP * REPAIR_RATE).toFixed(1)} ₢/s`, x + 228, y + 174);
    }

    this.fullRepairRect = { x, y: y + 218, width: 210, height: 36 };
    this.drawButton(ctx, this.fullRepairRect, '[ FULL REPAIR ]', canFullRepair);
    if (!hullIntact) {
      ctx.fillStyle = canFullRepair ? COLOURS.UI_SECONDARY : COLOURS.DANGER;
      ctx.fillText(`-> ${fullRepairCost.toFixed(1)} ₢ total`, x + 228, y + 228);
    }

    if (!canFullRepair && !hullIntact && maxRepairHP > 0) {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(`MAX REPAIR WITH CURRENT CREDITS: ${maxRepairHP} HP - ${maxRepairCost.toFixed(1)} ₢`, x, y + 270);
    }
  }

  private getRefuelPricePerUnit(): number {
    return this.landable.services.find((service) => service.type === 'refuel')?.refuelPricePerUnit ?? REFUEL_PRICE_PER_UNIT;
  }

  private applyFullRefuel(): void {
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
    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.repairService?.repairPricePerHP ?? REPAIR_PRICE_DEFAULT;
    const hpNeeded = ship.maxHP - ship.currentHP;
    const totalCost = hpNeeded * pricePerHP;
    if (ship.credits < totalCost || hpNeeded <= 0) return;
    this.worldState.updatePlayerShipState({
      currentHP: ship.maxHP,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
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

import {
  COLOURS,
  DAMAGE_TYPE_LABELS,
  EQUIPMENT_STORE_COUNT,
  MISSION_DELIVERY_DISPLAY_TIME,
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
import type { EquipmentInstallSlotType } from '../core/worldState';
import type { CompletedMission } from '../types';
import type { Mission } from '../types';
import { drawPlanet } from '../renderer/landables/planetRenderer';
import { drawMoon } from '../renderer/landables/moonRenderer';
import { drawStation } from '../renderer/landables/stationRenderer';
import type { Landable } from '../types';
import { emptyReductionProfile } from '../types';
import type { ArmourItem, ArmourReductionProfile, DamageTypeKey, EquipmentItem } from '../types';
import type { EquipmentSlot } from '../types';
import type { LandableService, ServiceType } from '../types/landable';
import { MissionBoard } from '../simulation/missionBoard';
import { EquipmentStore } from '../simulation/equipmentStore';
import type { Screen } from './screenManager';

type TabId =
  | 'overview'
  | 'missions'
  | 'refuel'
  | 'repair'
  | 'missionBoard'
  | 'shipyard'
  | 'equipmentStore'
  | 'trainingSimulator';

type EquipmentSubTabId = 'store' | 'installed' | 'inventory';
type WeaponFireKey = 'Z' | 'X' | 'C' | 'V' | 'B';

interface TabRect {
  id: TabId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LandableScreen implements Screen {
  private isArmourItem(item: EquipmentItem | null): item is ArmourItem {
    return item?.type === 'armour';
  }

  private static readonly DAMAGE_TYPE_ORDER: DamageTypeKey[] = [
    'kinetic',
    'antimatter_kinetic',
    'darkmatter_kinetic',
    'explosive',
    'antimatter_explosive',
    'darkmatter_explosive',
    'laser',
    'anti_photon_laser',
    'dark_energy_laser',
    'plasma',
    'antimatter_plasma',
    'darkmatter_plasma',
    'void'
  ];
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
  private generatedMissions: Mission[] | null = null;
  private missionActionRects: Array<{ missionId: string; x: number; y: number; width: number; height: number }> = [];
  private missionScrollOffset = 0;
  private missionFlashMessage = '';
  private missionFlashTimer = 0;
  private pendingDeliveries: CompletedMission[] = [];
  private deliveryDismissAt = 0;
  private missionsTabScrollOffset = 0;
  private equipmentSubTab: EquipmentSubTabId = 'store';
  private equipmentInventory: EquipmentItem[] = [];
  private equipmentSubTabRects: Array<{ id: EquipmentSubTabId; x: number; y: number; width: number; height: number }> = [];
  private equipmentActionRects: Array<{
    action: 'buy' | 'sell' | 'install' | 'uninstall' | 'confirmSell' | 'cancelSell' | 'pickWeaponSlot';
    itemId?: string;
    slotType?: EquipmentInstallSlotType;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  private equipmentFlashMessage = '';
  private equipmentFlashTimer = 0;
  private pendingSellItemId: string | null = null;
  private pendingWeaponItemId: string | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.pendingDeliveries.length > 0) {
      this.pendingDeliveries = [];
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      this.refreshClickableTabs();
      const nextIndex = (this.clickableTabs.indexOf(this.activeTab) + 1) % this.clickableTabs.length;
      this.activeTab = this.clickableTabs[nextIndex];
      return;
    }
    if (this.activeTab === 'missions') {
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        this.missionsTabScrollOffset += 1;
        return;
      }
      if (event.code === 'ArrowUp') {
        event.preventDefault();
        this.missionsTabScrollOffset = Math.max(0, this.missionsTabScrollOffset - 1);
        return;
      }
    }
    if (this.activeTab === 'missionBoard') {
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        this.missionScrollOffset += 1;
        return;
      }
      if (event.code === 'ArrowUp') {
        event.preventDefault();
        this.missionScrollOffset = Math.max(0, this.missionScrollOffset - 1);
        return;
      }
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
    if (this.pendingDeliveries.length > 0) {
      this.pendingDeliveries = [];
    }
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
      return;
    }
    if (this.activeTab === 'missionBoard') {
      for (const rect of this.missionActionRects) {
        if (!this.inRect(hit.x, hit.y, rect)) {
          continue;
        }
        const mission = this.generatedMissions?.find((candidate) => candidate.id === rect.missionId);
        if (!mission) {
          continue;
        }
        if (!this.worldState.acceptMission(mission)) {
          this.missionFlashMessage = 'INSUFFICIENT CARGO SPACE';
          this.missionFlashTimer = 1.4;
          return;
        }
        this.generatedMissions = (this.generatedMissions ?? []).filter((candidate) => candidate.id !== mission.id);
        this.missionFlashMessage = 'MISSION ACCEPTED';
        this.missionFlashTimer = 1.0;
        return;
      }
    }
    if (this.activeTab === 'equipmentStore' && this.canAccessService('equipmentStore')) {
      for (const tab of this.equipmentSubTabRects) {
        if (this.inRect(hit.x, hit.y, tab)) {
          this.equipmentSubTab = tab.id;
          this.pendingSellItemId = null;
          this.pendingWeaponItemId = null;
          return;
        }
      }
      for (const action of this.equipmentActionRects) {
        if (!this.inRect(hit.x, hit.y, action)) {
          continue;
        }
        this.handleEquipmentAction(action);
        return;
      }
    }
  };

  private readonly onMouseUp = (): void => {
    this.isRefuelHeld = false;
    this.isRepairing = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.activeTab === 'missions') {
      event.preventDefault();
      if (event.deltaY > 0) {
        this.missionsTabScrollOffset += 1;
      } else if (event.deltaY < 0) {
        this.missionsTabScrollOffset = Math.max(0, this.missionsTabScrollOffset - 1);
      }
      return;
    }
    if (this.activeTab !== 'missionBoard') {
      return;
    }
    event.preventDefault();
    if (event.deltaY > 0) {
      this.missionScrollOffset += 1;
    } else if (event.deltaY < 0) {
      this.missionScrollOffset = Math.max(0, this.missionScrollOffset - 1);
    }
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
    const completed = this.worldState.checkMissionDelivery(this.landable.id);
    if (completed.length > 0) {
      this.pendingDeliveries = completed;
      this.deliveryDismissAt = Date.now() + MISSION_DELIVERY_DISPLAY_TIME * 1000;
    }
    if (this.hasService('equipmentStore')) {
      this.equipmentInventory = EquipmentStore.generateInventory(this.landable, this.worldState, EQUIPMENT_STORE_COUNT);
    }
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('mouseup', this.onMouseUp);
  }

  onExit(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.isRefuelHeld = false;
    this.isRepairing = false;
  }

  update(dt: number): void {
    this.updateRefuel(dt);
    this.updateRepair(dt);
    this.missionFlashTimer = Math.max(0, this.missionFlashTimer - dt);
    this.equipmentFlashTimer = Math.max(0, this.equipmentFlashTimer - dt);
    if (this.pendingDeliveries.length > 0 && Date.now() >= this.deliveryDismissAt) {
      this.pendingDeliveries = [];
    }
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
    this.renderDeliveryNotifications(ctx, panelX + 18, panelY + 8, panelWidth - 220);

    const tabY = panelY + headerHeight + 6;
    const tabStartX = panelX + 16;
    const tabGap = 18;
    this.tabRects = [];
    let x = tabStartX;
    const allTabs: Array<{ label: string; id: TabId; serviceType: ServiceType | null; available: boolean }> = [
      { label: 'OVERVIEW', id: 'overview', serviceType: null, available: true },
      { label: 'MISSIONS', id: 'missions', serviceType: null, available: true },
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
    } else if (this.activeTab === 'missions') {
      this.renderMissionsTab(ctx, contentX, contentY, contentWidth, contentHeight);
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
    } else if (this.activeTab === 'missionBoard') {
      if (!this.canAccessService('missionBoard')) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderMissionBoardTab(ctx, contentX, contentY, contentWidth, contentHeight);
      }
    } else if (this.activeTab === 'equipmentStore') {
      if (!this.canAccessService('equipmentStore')) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderEquipmentStore(ctx, contentX, contentY, contentWidth, contentHeight);
      }
    } else if (this.activeTab === 'shipyard' || this.activeTab === 'trainingSimulator') {
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

    this.renderArmourReductionProfile(ctx, ship, x + width - 420, y + 10);
  }

  private renderArmourReductionProfile(
    ctx: CanvasRenderingContext2D,
    ship: ReturnType<WorldState['getPlayerShipState']>,
    x: number,
    y: number
  ): void {
    const equippedArmour = ship.equipmentSlots
      .filter((slot) => slot.itemId !== null)
      .map((slot) => this.worldState.getEquipmentItem(slot.itemId!))
      .filter((item) => this.isArmourItem(item));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;

    if (equippedArmour.length === 0) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText('ARMOUR: NONE', x, y);
      return;
    }

    const profile = this.sumArmourReductions(equippedArmour);
    const primaryArmour = equippedArmour[0]!;
    const title = equippedArmour.length > 1 ? `${primaryArmour.name} +${equippedArmour.length - 1}` : primaryArmour.name;
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`ARMOUR   ${title}`, x, y);

    const rowStartY = y + 26;
    const columnWidth = 120;
    const valueOffset = 52;
    for (let i = 0; i < LandableScreen.DAMAGE_TYPE_ORDER.length; i += 1) {
      const key = LandableScreen.DAMAGE_TYPE_ORDER[i];
      const row = Math.floor(i / 3);
      const col = i % 3;
      const drawX = x + col * columnWidth;
      const drawY = rowStartY + row * 20;
      const value = profile[key];
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(DAMAGE_TYPE_LABELS[key], drawX, drawY);
      ctx.fillStyle = value > 0 ? COLOURS.SAFE : value < 0 ? COLOURS.DANGER : COLOURS.UI_SECONDARY;
      const display = value > 0 ? `+${value}` : `${value}`;
      ctx.fillText(display.padStart(4, ' '), drawX + valueOffset, drawY);
    }
  }

  private sumArmourReductions(armourItems: Array<{ reductions: ArmourReductionProfile }>): ArmourReductionProfile {
    const total = emptyReductionProfile();
    for (const item of armourItems) {
      for (const key of LandableScreen.DAMAGE_TYPE_ORDER) {
        total[key] += item.reductions[key] ?? 0;
      }
    }
    return total;
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
    this.clickableTabs = ['overview', 'missions', ...serviceTabs.filter((serviceType) => this.hasService(serviceType))];
    if (!this.clickableTabs.includes(this.activeTab)) {
      this.activeTab = 'overview';
    }
  }

  private renderMissionsTab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    const ship = this.worldState.getPlayerShipState();
    const missions = ship.activeMissions;
    const hullCapacity = this.worldState.getHullSpec(ship.hullSpecId)?.cargoCapacity ?? 0;
    const usedCargo = ship.cargo.reduce((sum, cargo) => sum + cargo.weight, 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText('ACTIVE MISSIONS', x, y);
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Cargo: ${usedCargo} / ${hullCapacity}t`, x + width - 210, y + 2);
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.beginPath();
    ctx.moveTo(x, y + 26);
    ctx.lineTo(x + width, y + 26);
    ctx.stroke();

    if (missions.length === 0) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText('No active missions. Visit a Mission Board to accept contracts.', x, y + 52);
      return;
    }

    const visibleStart = Math.min(this.missionsTabScrollOffset, Math.max(0, missions.length - 1));
    const visible = missions.slice(visibleStart, visibleStart + 4);
    const cardHeight = 116;
    for (let i = 0; i < visible.length; i += 1) {
      const mission = visible[i];
      const cardY = y + 40 + i * cardHeight;
      const currentCoord = this.worldState.getCurrentSector().coord;
      const distance = Math.round(
        Math.hypot(
          mission.destinationSectorCoord.x - currentCoord.x,
          mission.destinationSectorCoord.y - currentCoord.y
        )
      );
      const rewards = mission.reputationRewards
        .map((reward) => `${this.worldState.getFaction(reward.factionId)?.name ?? reward.factionId} +${reward.amount}`)
        .join('  ');

      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(x, cardY, width, cardHeight - 10);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "15px 'Courier New', monospace";
      ctx.fillText(mission.title, x + 8, cardY + 8);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(this.fitTextToWidth(ctx, mission.description, width - 24), x + 8, cardY + 30);
      ctx.fillStyle = COLOURS.UI_ACCENT;
      ctx.fillText(
        `Destination: ${mission.destinationName} (${mission.destinationSectorCoord.x},${mission.destinationSectorCoord.y})`,
        x + 8,
        cardY + 50
      );
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(
        `Distance: ~${distance} sectors    Pay: ${mission.payoff.toLocaleString()} ₢    Cargo: ${mission.cargoWeight}t`,
        x + 8,
        cardY + 68
      );
      if (mission.destinationSectorCoord.x === currentCoord.x && mission.destinationSectorCoord.y === currentCoord.y) {
        ctx.fillStyle = COLOURS.SAFE;
        ctx.fillText('★ You are in destination sector. Land to deliver.', x + 8, cardY + 86);
      } else if (rewards) {
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.fillText(`Rewards: ${rewards}`, x + 8, cardY + 86);
      }

      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.beginPath();
      ctx.moveTo(x + 8, cardY + cardHeight - 12);
      ctx.lineTo(x + width - 8, cardY + cardHeight - 12);
      ctx.stroke();
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
        return tier !== 'hostile';
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
      missions: 'Missions',
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

  private renderDeliveryNotifications(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    if (this.pendingDeliveries.length === 0) {
      return;
    }
    const rowHeight = 52;
    const height = 10 + this.pendingDeliveries.length * rowHeight;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 20, 12, 0.94)';
    ctx.strokeStyle = COLOURS.SAFE;
    ctx.strokeRect(x, y, width, height);
    ctx.fillRect(x, y, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.pendingDeliveries.length; i += 1) {
      const rowY = y + 8 + i * rowHeight;
      const entry = this.pendingDeliveries[i];
      const repText = entry.mission.reputationRewards
        .map((reward) => {
          const factionName = this.worldState.getFaction(reward.factionId)?.name ?? reward.factionId;
          return `${factionName} +${reward.amount}`;
        })
        .join('  ');
      ctx.fillStyle = COLOURS.SAFE;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText('✓ DELIVERY COMPLETE', x + 10, rowY);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(entry.mission.title, x + 26, rowY + 18);
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText(`+${Math.round(entry.creditsEarned)} ₢${repText ? `    ${repText}` : ''}`, x + 26, rowY + 34);
    }
    ctx.restore();
  }

  private renderMissionBoardTab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    if (!this.generatedMissions) {
      this.generatedMissions = MissionBoard.generateMissions(
        this.landable,
        this.worldState.getCurrentSector().coord,
        this.worldState,
        6
      );
    }
    this.missionActionRects = [];
    const ship = this.worldState.getPlayerShipState();
    const hullCapacity = this.worldState.getHullSpec(ship.hullSpecId)?.cargoCapacity ?? 0;
    const usedCargo = ship.cargo.reduce((sum, cargo) => sum + cargo.weight, 0);
    const freeCargo = Math.max(0, hullCapacity - usedCargo);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('MISSION BOARD', x, y);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillText(`Cargo: ${usedCargo} / ${hullCapacity}t`, x + width - 210, y + 2);
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.beginPath();
    ctx.moveTo(x, y + 26);
    ctx.lineTo(x + width, y + 26);
    ctx.stroke();

    const missions = this.generatedMissions ?? [];
    const visibleStart = Math.min(this.missionScrollOffset, Math.max(0, missions.length - 1));
    const visible = missions.slice(visibleStart, visibleStart + 4);
    const cardHeight = 118;
    for (let i = 0; i < visible.length; i += 1) {
      const mission = visible[i];
      const cardY = y + 40 + i * cardHeight;
      const lockedRequirement = mission.factionRequirements.find(
        (req) => this.worldState.getReputationForFaction(req.factionId) < req.minReputation
      );
      const distance = Math.round(
        Math.hypot(
          mission.destinationSectorCoord.x - this.worldState.getCurrentSector().coord.x,
          mission.destinationSectorCoord.y - this.worldState.getCurrentSector().coord.y
        )
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(x, cardY, width, cardHeight - 10);
      ctx.font = "15px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(mission.title, x + 8, cardY + 8);
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(this.fitTextToWidth(ctx, mission.description, width - 24), x + 8, cardY + 30);

      if (lockedRequirement) {
        const currentRep = Math.round(this.worldState.getReputationForFaction(lockedRequirement.factionId));
        const tier = this.worldState.getReputationTier(lockedRequirement.factionId).toUpperCase();
        const factionName = this.worldState.getFaction(lockedRequirement.factionId)?.name ?? lockedRequirement.factionId;
        ctx.fillStyle = COLOURS.WARNING;
        ctx.fillText(`🔒 Requires: ${factionName} +${lockedRequirement.minReputation}`, x + 8, cardY + 54);
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.fillText(`Your standing: ${currentRep >= 0 ? '+' : ''}${currentRep} (${tier})`, x + 8, cardY + 72);
      } else {
        const repReward = mission.reputationRewards.map((reward) => `+${reward.amount} ${reward.factionId}`).join('  ');
        ctx.fillStyle = COLOURS.UI_PRIMARY;
        ctx.fillText(
          `Distance: ~${distance} sectors    Pay: ${mission.payoff.toLocaleString()} ₢${repReward ? `    ${repReward}` : ''}`,
          x + 8,
          cardY + 54
        );
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.fillText(`Cargo: ${mission.cargoWeight}t`, x + 8, cardY + 72);
        const canAccept = mission.cargoWeight <= freeCargo;
        const btn = { x: x + width - 150, y: cardY + 66, width: 138, height: 30 };
        this.drawButton(ctx, btn, canAccept ? '[ ACCEPT ]' : '[ NO SPACE ]', canAccept);
        if (canAccept) {
          this.missionActionRects.push({ missionId: mission.id, ...btn });
        }
      }
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.beginPath();
      ctx.moveTo(x + 8, cardY + cardHeight - 12);
      ctx.lineTo(x + width - 8, cardY + cardHeight - 12);
      ctx.stroke();
    }

    if (this.missionFlashTimer > 0 && this.missionFlashMessage) {
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillStyle = this.missionFlashMessage.includes('INSUFFICIENT') ? COLOURS.DANGER : COLOURS.SAFE;
      ctx.fillText(this.missionFlashMessage, x, y + height - 24);
    }
  }

  private renderEquipmentStore(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const ship = this.worldState.getPlayerShipState();
    this.equipmentActionRects = [];
    this.equipmentSubTabRects = [];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText('EQUIPMENT', x, y);
    ctx.fillStyle = COLOURS.CREDITS;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Credits: ${Math.round(ship.credits).toLocaleString()} ₢`, x + width - 240, y + 2);
    this.renderEquipmentCapacityBar(ctx, x, y + 30, width - 8);

    const tabs: EquipmentSubTabId[] = ['store', 'installed', 'inventory'];
    let tabX = x;
    for (const tab of tabs) {
      const label = tab.toUpperCase();
      const tabWidth = 118;
      const rect = { id: tab, x: tabX, y: y + 58, width: tabWidth, height: 28 };
      this.equipmentSubTabRects.push(rect);
      this.drawButton(ctx, rect, `[ ${label} ]`, true);
      if (this.equipmentSubTab === tab) {
        ctx.strokeStyle = COLOURS.UI_ACCENT;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      tabX += tabWidth + 10;
    }

    if (this.equipmentSubTab === 'store') {
      this.renderEquipmentStoreSubTab(ctx, x, y + 98, width, height - 100);
    } else if (this.equipmentSubTab === 'installed') {
      this.renderInstalledEquipmentSubTab(ctx, x, y + 98, width, height - 100);
    } else {
      this.renderInventoryEquipmentSubTab(ctx, x, y + 98, width, height - 100);
    }

    if (this.equipmentFlashTimer > 0 && this.equipmentFlashMessage) {
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillStyle = this.equipmentFlashMessage.includes('NO ') || this.equipmentFlashMessage.includes('cannot')
        ? COLOURS.WARNING
        : COLOURS.SAFE;
      ctx.fillText(this.equipmentFlashMessage, x, y + height - 24);
    }
  }

  private renderEquipmentStoreSubTab(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, _height: number): void {
    const ship = this.worldState.getPlayerShipState();
    const hullSpec = this.worldState.getHullSpec(ship.hullSpecId);
    const cardHeight = 88;
    const items = this.equipmentInventory.slice(0, EQUIPMENT_STORE_COUNT);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const cardY = y + i * (cardHeight + 8);
      const cardW = width - 10;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(x, cardY, cardW, cardHeight);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText(item.name, x + 8, cardY + 8);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`Tier ${item.tier}  ${item.type}`, x + cardW - 170, cardY + 8);
      const lines = this.formatEquipmentStats(item);
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(lines[0] ?? `Mass: ${item.mass}`, x + 8, cardY + 30);
      if (lines[1]) {
        ctx.fillText(lines[1], x + 8, cardY + 47);
      }
      const buyPrice = EquipmentStore.getBuyPrice(item, this.worldState, this.landable.factionId);
      ctx.fillStyle = COLOURS.CREDITS;
      ctx.fillText(`Buy: ${buyPrice} ₢`, x + 8, cardY + 64);
      const canAfford = ship.credits >= buyPrice;
      const canCarry = this.worldState.getInstalledEquipmentMass() + this.getInventoryMass() + item.mass <= (hullSpec?.equipmentCapacity ?? 0);
      const label = !canAfford ? '[ NO CREDITS ]' : !canCarry ? '[ NO CAPACITY ]' : '[ BUY ]';
      const button = { x: x + cardW - 170, y: cardY + 50, width: 156, height: 30 };
      this.drawButton(ctx, button, label, canAfford && canCarry);
      if (canAfford && canCarry) {
        this.equipmentActionRects.push({ action: 'buy', itemId: item.id, ...button });
      }
    }
  }

  private renderInstalledEquipmentSubTab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    const ship = this.worldState.getPlayerShipState();
    const rows: Array<{ label: string; slotType: EquipmentInstallSlotType; item: EquipmentItem | null }> = [
      { label: 'Forward Thruster', slotType: 'thruster_forward', item: this.getItemForSlot('thruster_forward') },
      { label: 'Reverse Thruster', slotType: 'thruster_reverse', item: this.getItemForSlot('thruster_reverse') },
      { label: 'Rotation Thrusters (CW / CCW)', slotType: 'thruster_rotateCW', item: this.getRotationThrusterItem() },
      { label: 'Armour', slotType: 'armour', item: this.getItemForSlot('armour') },
      { label: 'Auto Brake', slotType: 'autoBrake', item: this.getItemForSlot('autoBrake') }
    ];
    const maxWeaponSlots = Math.min(5, this.worldState.getHullSpec(ship.hullSpecId)?.weaponSlots ?? 0);
    const weaponKeys = ['Z', 'X', 'C', 'V', 'B'].slice(0, maxWeaponSlots) as WeaponFireKey[];
    for (const key of weaponKeys) {
      const slot = ship.weaponLoadout.find((entry) => entry.fireKey === key);
      rows.push({
        label: `Weapon Slot ${key}`,
        slotType: `weapon_${key}`,
        item: slot ? this.worldState.getEquipmentItem(slot.itemId) : null
      });
    }

    const cardHeight = 74;
    rows.forEach((row, index) => {
      const cardY = y + index * (cardHeight + 8);
      const cardW = width - 10;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(row.label.toUpperCase(), x, cardY);
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(x, cardY + 16, cardW, cardHeight - 6);
      if (!row.item) {
        ctx.fillStyle = COLOURS.STAR_MID;
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText('[ EMPTY SLOT ]', x + 8, cardY + 38);
        const installBtn = { x: x + cardW - 212, y: cardY + 26, width: 198, height: 28 };
        this.drawButton(ctx, installBtn, '[ + INSTALL FROM INVENTORY ]', true);
        this.equipmentActionRects.push({ action: 'install', slotType: row.slotType, ...installBtn });
        return;
      }
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillText(`${row.item.name}  (Tier ${row.item.tier})`, x + 8, cardY + 24);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      const stats = this.formatEquipmentStats(row.item).join('  ');
      const displayStats = row.slotType === 'thruster_rotateCW' ? `${stats} (x2)` : stats;
      ctx.fillText(displayStats, x + 8, cardY + 42);
      const btn = { x: x + cardW - 146, y: cardY + 30, width: 132, height: 28 };
      this.drawButton(ctx, btn, '[ UNINSTALL ]', true);
      this.equipmentActionRects.push({ action: 'uninstall', slotType: row.slotType, ...btn });
    });
  }

  private renderInventoryEquipmentSubTab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    const ship = this.worldState.getPlayerShipState();
    const cardHeight = 94;
    if (ship.inventory.length === 0) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText('Inventory empty. Buy equipment from STORE.', x, y);
      return;
    }
    ship.inventory.forEach((item, index) => {
      const cardY = y + index * (cardHeight + 8);
      const cardW = width - 10;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(x, cardY, cardW, cardHeight);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText(`${item.name}  (Tier ${item.tier})`, x + 8, cardY + 8);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      const stats = this.formatEquipmentStats(item);
      ctx.fillText(stats[0] ?? `Mass: ${item.mass}`, x + 8, cardY + 30);
      if (stats[1]) {
        ctx.fillText(stats[1], x + 8, cardY + 47);
      }
      ctx.fillStyle = COLOURS.CREDITS;
      const sellPrice = EquipmentStore.getSellPrice(item);
      ctx.fillText(`Sell: ${sellPrice} ₢`, x + 8, cardY + 66);
      if (this.pendingSellItemId === item.id) {
        const yesBtn = { x: x + cardW - 248, y: cardY + 60, width: 108, height: 28 };
        const noBtn = { x: x + cardW - 128, y: cardY + 60, width: 108, height: 28 };
        this.drawButton(ctx, yesBtn, '[ YES ]', true);
        this.drawButton(ctx, noBtn, '[ NO ]', true);
        this.equipmentActionRects.push({ action: 'confirmSell', itemId: item.id, ...yesBtn });
        this.equipmentActionRects.push({ action: 'cancelSell', itemId: item.id, ...noBtn });
      } else {
        const installLabel = this.getInventoryInstallLabel(item);
        const installBtn = { x: x + cardW - 292, y: cardY + 60, width: 170, height: 28 };
        const sellBtn = { x: x + cardW - 112, y: cardY + 60, width: 98, height: 28 };
        this.drawButton(ctx, installBtn, installLabel, true);
        this.drawButton(ctx, sellBtn, '[ SELL ]', true);
        this.equipmentActionRects.push({ action: 'install', itemId: item.id, ...installBtn });
        this.equipmentActionRects.push({ action: 'sell', itemId: item.id, ...sellBtn });
      }

      if (this.pendingWeaponItemId === item.id) {
        const slotKeys = this.getWeaponKeys();
        ctx.fillStyle = COLOURS.WARNING;
        ctx.fillText('INSTALL TO SLOT:', x + 8, cardY + 78);
        slotKeys.forEach((key, i) => {
          const btn = { x: x + 124 + i * 52, y: cardY + 74, width: 46, height: 20 };
          this.drawButton(ctx, btn, `[${key}]`, true);
          this.equipmentActionRects.push({ action: 'pickWeaponSlot', itemId: item.id, slotType: `weapon_${key}`, ...btn });
        });
      }
    });
  }

  private renderEquipmentCapacityBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const ship = this.worldState.getPlayerShipState();
    const hullSpec = this.worldState.getHullSpec(ship.hullSpecId);
    const used = this.worldState.getInstalledEquipmentMass();
    const cap = hullSpec?.equipmentCapacity ?? 0;
    const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
    const colour = ratio >= 0.9 ? COLOURS.DANGER : ratio >= 0.75 ? COLOURS.WARNING : COLOURS.SAFE;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, y, width, 14);
    ctx.fillStyle = colour;
    ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, 12);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText(`Equip capacity  ${Math.round(used)} / ${Math.round(cap)} mass`, x, y - 16);
  }

  private handleEquipmentAction(action: {
    action: 'buy' | 'sell' | 'install' | 'uninstall' | 'confirmSell' | 'cancelSell' | 'pickWeaponSlot';
    itemId?: string;
    slotType?: EquipmentInstallSlotType;
  }): void {
    const ship = this.worldState.getPlayerShipState();
    if (action.action === 'buy' && action.itemId) {
      const item = this.equipmentInventory.find((entry) => entry.id === action.itemId);
      if (!item) return;
      const price = EquipmentStore.getBuyPrice(item, this.worldState, this.landable.factionId);
      if (ship.credits < price) {
        this.setEquipmentFlash('NO CREDITS');
        return;
      }
      this.worldState.updatePlayerShipState({ credits: ship.credits - price });
      this.worldState.addToInventory(item);
      this.worldState.saveToLocalStorage();
      this.setEquipmentFlash(`Bought ${item.name}`);
      return;
    }
    if (action.action === 'sell' && action.itemId) {
      this.pendingSellItemId = action.itemId;
      return;
    }
    if (action.action === 'cancelSell') {
      this.pendingSellItemId = null;
      return;
    }
    if (action.action === 'confirmSell' && action.itemId) {
      const currentShip = this.worldState.getPlayerShipState();
      const item = currentShip.inventory.find((entry) => entry.id === action.itemId);
      if (!item) {
        this.pendingSellItemId = null;
        return;
      }
      const value = EquipmentStore.getSellPrice(item);
      this.worldState.removeFromInventory(item.id);
      this.worldState.updatePlayerShipState({ credits: this.worldState.getPlayerShipState().credits + value });
      this.worldState.saveToLocalStorage();
      this.pendingSellItemId = null;
      this.setEquipmentFlash(`Sold ${item.name} for ${value} ₢`);
      return;
    }
    if (action.action === 'uninstall' && action.slotType) {
      const success = this.worldState.uninstallEquipment(action.slotType);
      this.setEquipmentFlash(success ? 'Uninstalled' : 'Nothing to uninstall');
      return;
    }
    if (action.action === 'install') {
      const itemId = action.itemId;
      if (!itemId && action.slotType) {
        this.equipmentSubTab = 'inventory';
        return;
      }
      const item = this.worldState.getPlayerShipState().inventory.find((entry) => entry.id === itemId);
      if (!item) return;
      if (item.type === 'weapon' && this.getWeaponKeys().length > 1 && !action.slotType) {
        this.pendingWeaponItemId = item.id;
        return;
      }
      const slotType = action.slotType ?? this.defaultSlotForItem(item);
      if (!slotType) {
        this.setEquipmentFlash('No compatible slot');
        return;
      }
      const result = this.worldState.installEquipment(item.id, slotType);
      this.pendingWeaponItemId = null;
      this.setEquipmentFlash(result.success ? `Installed ${item.name}` : result.reason);
      return;
    }
    if (action.action === 'pickWeaponSlot' && action.itemId && action.slotType) {
      const result = this.worldState.installEquipment(action.itemId, action.slotType);
      this.pendingWeaponItemId = null;
      this.setEquipmentFlash(result.success ? 'Weapon installed' : result.reason);
    }
  }

  private setEquipmentFlash(message: string): void {
    this.equipmentFlashMessage = message;
    this.equipmentFlashTimer = 1.6;
  }

  private defaultSlotForItem(item: EquipmentItem): EquipmentInstallSlotType | null {
    const installClass = item.installSlotClass ?? this.legacyInstallClass(item);
    if (installClass === 'weapon') {
      const keys = this.getWeaponKeys();
      return keys.length > 0 ? (`weapon_${keys[0]}` as EquipmentInstallSlotType) : null;
    }
    if (installClass === 'thruster_rotation') return 'thruster_rotateCW';
    if (installClass === 'thruster_forward') return 'thruster_forward';
    if (installClass === 'thruster_reverse') return 'thruster_reverse';
    if (installClass === 'armour') return 'armour';
    if (installClass === 'autoBrake') return 'autoBrake';
    if (installClass === 'fuelTank') return 'fuelTank';
    if (installClass === 'hyperspaceDrive') return 'hyperspaceDrive';
    if (installClass === 'sensorArray') return 'sensorArray';
    if (installClass === 'neuralBrain') return 'neuralBrain';
    if (installClass === 'memoryCard') return 'memoryCard';
    return null;
  }

  private legacyInstallClass(item: EquipmentItem): string {
    if (item.type === 'weapon') return 'weapon';
    if (item.type === 'armour') return 'armour';
    if (item.type === 'autoBrake') return 'autoBrake';
    if (item.type === 'fuelTank') return 'fuelTank';
    if (item.type === 'hyperspaceDrive') return 'hyperspaceDrive';
    if (item.type === 'sensorArray') return 'sensorArray';
    if (item.type === 'neuralBrain') return 'neuralBrain';
    if (item.type === 'memoryCard') return 'memoryCard';
    if (item.type === 'thruster') {
      return item.mountPosition === 'rear' ? 'thruster_forward' : 'thruster_reverse';
    }
    return '';
  }

  private getItemForSlot(slotType: EquipmentSlot['slotType']): EquipmentItem | null {
    const ship = this.worldState.getPlayerShipState();
    const slot = ship.equipmentSlots.find((entry) => entry.slotType === slotType);
    if (!slot?.itemId) return null;
    return this.worldState.getEquipmentItem(slot.itemId);
  }

  private getRotationThrusterItem(): EquipmentItem | null {
    return this.getItemForSlot('thruster_rotateCW') ?? this.getItemForSlot('thruster_rotateCCW');
  }

  private getWeaponKeys(): WeaponFireKey[] {
    const ship = this.worldState.getPlayerShipState();
    const maxSlots = Math.min(5, this.worldState.getHullSpec(ship.hullSpecId)?.weaponSlots ?? 0);
    return ['Z', 'X', 'C', 'V', 'B'].slice(0, maxSlots) as WeaponFireKey[];
  }

  private getInventoryMass(): number {
    const ship = this.worldState.getPlayerShipState();
    return ship.inventory.reduce((sum, item) => sum + item.mass, 0);
  }

  private getInventoryInstallLabel(item: EquipmentItem): string {
    if (item.type === 'weapon') {
      return '[ INSTALL -> WEAPON ]';
    }
    const slot = this.defaultSlotForItem(item);
    if (!slot) {
      return '[ INSTALL ]';
    }
    return `[ INSTALL -> ${slot} ]`;
  }

  private formatEquipmentStats(item: EquipmentItem): string[] {
    switch (item.type) {
      case 'thruster':
        return [`Force: ${item.force}`, `Mass: ${item.mass}`];
      case 'weapon': {
        const spec = this.worldState.getBulletSpec(item.bulletSpecId);
        return [`${this.formatDamageType(spec)} Dmg: ${spec?.damage ?? '?'}`, `Rate: ${item.fireRate}/s  Mass: ${item.mass}`];
      }
      case 'armour':
        return [`HP +${item.hpBonus}  Mass: ${item.mass}`, this.formatArmourSummary(item.reductions)];
      case 'autoBrake':
        return [`Damping: ${item.dampingFactor}`, `Mass: ${item.mass}`];
      case 'fuelTank':
        return [`Capacity: ${item.fuelCapacity}`, `Mass: ${item.mass}`];
      case 'hyperspaceDrive':
        return [`Range: ${item.jumpRange} sectors`, `Mass: ${item.mass}`];
      case 'sensorArray':
        return [`Range: ${item.range}  Slots: ${item.trackedObjectSlots}`, `Mass: ${item.mass}`];
      case 'neuralBrain':
        return [`${item.maxLayers}x${item.maxNeuronsPerLayer}`, `Mass: ${item.mass}`];
      case 'memoryCard':
        return [`Slots: ${item.storageSlots}`, `Mass: ${item.mass}`];
    }
    return ['Mass: ?'];
  }

  private formatDamageType(spec: ReturnType<WorldState['getBulletSpec']>): string {
    if (!spec) return '?';
    const cat = spec.damageCategory.charAt(0).toUpperCase() + spec.damageCategory.slice(1);
    const mat = spec.matterType === 'normal' ? '' : ` / ${spec.matterType}`;
    return `${cat}${mat}`;
  }

  private formatArmourSummary(reductions: ArmourReductionProfile): string {
    const parts = Object.entries(reductions)
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => `${DAMAGE_TYPE_LABELS[key as DamageTypeKey]} ${value > 0 ? '+' : ''}${value}`)
      .slice(0, 6);
    return parts.join('  ') || 'No resistances';
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

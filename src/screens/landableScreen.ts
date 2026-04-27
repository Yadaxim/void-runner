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
  REPAIR_PRICE_ARMOUR_MULTIPLIER,
  REPAIR_PRICE_DEFAULT,
  REPAIR_RATE_ARMOUR,
  REPAIR_RATE_HULL
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
import type {
  ArmourItem,
  ArmourReductionProfile,
  DamageTypeKey,
  EquipmentItem,
  ReactorItem,
  ShieldItem
} from '../types';
import type { EquipmentSlot } from '../types';
import type { LandableService, ServiceType } from '../types/landable';
import { MissionBoard } from '../simulation/missionBoard';
import { EquipmentStore } from '../simulation/equipmentStore';
import type { Screen } from './screenManager';

type TabId =
  | 'overview'
  | 'reputation'
  | 'missions'
  | 'supplies'
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
  private isSuppliesFuelHeld = false;
  private isSuppliesChargeHeld = false;
  private repairHold: 'none' | 'hull' | number = 'none';
  private repairService: LandableService | null = null;
  private clickableTabs: TabId[] = ['overview', 'supplies', 'repair'];
  private tabRects: TabRect[] = [];
  private takeOffRect: { x: number; y: number; width: number; height: number } | null = null;
  private suppliesFuelHoldRect: { x: number; y: number; width: number; height: number } | null = null;
  private suppliesFuelFillRect: { x: number; y: number; width: number; height: number } | null = null;
  private suppliesChargeHoldRect: { x: number; y: number; width: number; height: number } | null = null;
  private suppliesChargeFillRect: { x: number; y: number; width: number; height: number } | null = null;
  private suppliesShieldFillRect: { x: number; y: number; width: number; height: number } | null = null;
  private repairHullHoldRect: { x: number; y: number; width: number; height: number } | null = null;
  private repairHullFullRect: { x: number; y: number; width: number; height: number } | null = null;
  private repairArmourRects: Array<{
    layerIndex: number;
    hold: { x: number; y: number; width: number; height: number };
    full: { x: number; y: number; width: number; height: number };
  }> = [];
  private repairScrollPx = 0;
  private repairScrollMax = 0;
  private repairViewport: { x: number; y: number; width: number; height: number } | null = null;
  private overviewHullRect: { x: number; y: number; width: number; height: number } | null = null;
  private generatedMissions: Mission[] | null = null;
  private missionActionRects: Array<{ missionId: string; x: number; y: number; width: number; height: number }> = [];
  private missionScrollOffset = 0;
  private missionFlashMessage = '';
  private missionFlashTimer = 0;
  private pendingDeliveries: CompletedMission[] = [];
  private deliveryDismissAt = 0;
  private missionsTabScrollOffset = 0;
  private equipmentInventory: EquipmentItem[] = [];
  private equipmentActionRects: Array<{
    action:
      | 'selectSlot'
      | 'purchase'
      | 'sell'
      | 'confirmPurchase'
      | 'cancelPurchase'
      | 'confirmSell'
      | 'cancelSell'
      | 'clearStoreFilter';
    itemId?: string;
    slotType?: EquipmentInstallSlotType;
    slotIndex?: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  private equipmentFlashMessage = '';
  private equipmentFlashTimer = 0;
  private equipmentFlashCreditDelta: number | null = null;
  private pendingSellItemId: string | null = null;
  private selectedShipSlot: { slotType: EquipmentSlot['slotType']; slotIndex: number } | null = null;
  private pendingPurchase: { itemId: string; slotType: EquipmentSlot['slotType']; slotIndex: number } | null = null;
  private equipmentStoreScrollPx = 0;
  private equipmentStoreScrollMax = 0;
  private equipmentStoreViewport: { x: number; y: number; width: number; height: number } | null = null;
  private shipSlotsScrollPx = 0;
  private shipSlotsScrollMax = 0;
  private shipSlotsViewport: { x: number; y: number; width: number; height: number } | null = null;

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
    if (this.activeTab === 'equipmentStore' && this.canAccessService('equipmentStore')) {
      const step = 72;
      const storeMax = this.equipmentStoreScrollMax;
      const shipMax = this.shipSlotsScrollMax;
      if (event.code === 'ArrowDown' || event.code === 'PageDown') {
        event.preventDefault();
        const delta = event.code === 'PageDown' ? step * 4 : step;
        if (storeMax > 0) {
          this.equipmentStoreScrollPx = Math.min(storeMax, this.equipmentStoreScrollPx + delta);
        } else if (shipMax > 0) {
          this.shipSlotsScrollPx = Math.min(shipMax, this.shipSlotsScrollPx + delta);
        }
        return;
      }
      if (event.code === 'ArrowUp' || event.code === 'PageUp') {
        event.preventDefault();
        const delta = event.code === 'PageUp' ? step * 4 : step;
        if (storeMax > 0) {
          this.equipmentStoreScrollPx = Math.max(0, this.equipmentStoreScrollPx - delta);
        } else if (shipMax > 0) {
          this.shipSlotsScrollPx = Math.max(0, this.shipSlotsScrollPx - delta);
        }
        return;
      }
      if (event.code === 'Home') {
        event.preventDefault();
        if (storeMax > 0) {
          this.equipmentStoreScrollPx = 0;
        } else if (shipMax > 0) {
          this.shipSlotsScrollPx = 0;
        }
        return;
      }
      if (event.code === 'End') {
        event.preventDefault();
        if (storeMax > 0) {
          this.equipmentStoreScrollPx = storeMax;
        } else if (shipMax > 0) {
          this.shipSlotsScrollPx = shipMax;
        }
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
        if (tab.id === 'equipmentStore') {
          this.equipmentStoreScrollPx = 0;
          this.shipSlotsScrollPx = 0;
        }
        this.activeTab = tab.id;
        return;
      }
    }
    if (this.activeTab === 'overview' && this.overviewHullRect && this.inRect(hit.x, hit.y, this.overviewHullRect)) {
      this.activeTab = 'repair';
      return;
    }
    if (this.activeTab === 'supplies') {
      if (this.suppliesFuelHoldRect && this.inRect(hit.x, hit.y, this.suppliesFuelHoldRect)) {
        this.isSuppliesFuelHeld = true;
        return;
      }
      if (this.suppliesFuelFillRect && this.inRect(hit.x, hit.y, this.suppliesFuelFillRect)) {
        this.applyFullRefuel();
        return;
      }
      if (this.suppliesChargeHoldRect && this.inRect(hit.x, hit.y, this.suppliesChargeHoldRect)) {
        this.isSuppliesChargeHeld = true;
        return;
      }
      if (this.suppliesChargeFillRect && this.inRect(hit.x, hit.y, this.suppliesChargeFillRect)) {
        this.applyFullEnergyCharge();
        return;
      }
      if (this.suppliesShieldFillRect && this.inRect(hit.x, hit.y, this.suppliesShieldFillRect)) {
        this.applyFillShieldFromBattery();
        return;
      }
    }
    if (this.activeTab === 'repair' && this.repairHullHoldRect && this.inRect(hit.x, hit.y, this.repairHullHoldRect)) {
      this.repairHold = 'hull';
      return;
    }
    if (this.activeTab === 'repair' && this.repairHullFullRect && this.inRect(hit.x, hit.y, this.repairHullFullRect)) {
      this.applyFullHullRepair();
      return;
    }
    if (this.activeTab === 'repair') {
      for (const row of this.repairArmourRects) {
        if (this.inRect(hit.x, hit.y, row.hold)) {
          this.repairHold = row.layerIndex;
          return;
        }
        if (this.inRect(hit.x, hit.y, row.full)) {
          this.applyFullArmourRepair(row.layerIndex);
          return;
        }
      }
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
    this.isSuppliesFuelHeld = false;
    this.isSuppliesChargeHeld = false;
    this.repairHold = 'none';
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
    if (this.activeTab === 'equipmentStore' && this.canAccessService('equipmentStore')) {
      const pt = this.getCanvasPoint(event);
      const shipVp = this.shipSlotsViewport;
      const storeVp = this.equipmentStoreViewport;
      if (pt && shipVp && this.inRect(pt.x, pt.y, shipVp) && this.shipSlotsScrollMax > 0) {
        event.preventDefault();
        const next = this.shipSlotsScrollPx + event.deltaY;
        this.shipSlotsScrollPx = Math.max(0, Math.min(this.shipSlotsScrollMax, next));
      } else if (pt && storeVp && this.inRect(pt.x, pt.y, storeVp) && this.equipmentStoreScrollMax > 0) {
        event.preventDefault();
        const next = this.equipmentStoreScrollPx + event.deltaY;
        this.equipmentStoreScrollPx = Math.max(0, Math.min(this.equipmentStoreScrollMax, next));
      }
      return;
    }
    if (this.activeTab === 'repair' && this.canAccessService('repair')) {
      const pt = this.getCanvasPoint(event);
      if (
        pt &&
        this.repairViewport &&
        this.inRect(pt.x, pt.y, this.repairViewport) &&
        this.repairScrollMax > 0
      ) {
        event.preventDefault();
        const next = this.repairScrollPx + event.deltaY;
        this.repairScrollPx = Math.max(0, Math.min(this.repairScrollMax, next));
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
    this.worldState.recalculateArmourLayers();
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
    this.isSuppliesFuelHeld = false;
    this.isSuppliesChargeHeld = false;
    this.repairHold = 'none';
  }

  update(dt: number): void {
    this.updateSupplies(dt);
    this.updateRepair(dt);
    this.missionFlashTimer = Math.max(0, this.missionFlashTimer - dt);
    this.equipmentFlashTimer = Math.max(0, this.equipmentFlashTimer - dt);
    if (this.pendingDeliveries.length > 0 && Date.now() >= this.deliveryDismissAt) {
      this.pendingDeliveries = [];
    }
  }

  private updateSupplies(dt: number): void {
    if (!this.canAccessService('refuel')) return;
    if (this.activeTab !== 'supplies') return;
    if (this.isSuppliesFuelHeld) {
      const ship = this.worldState.getPlayerShipState();
      const pricePerUnit = this.getRefuelPricePerUnit();
      const missingFuel = this.worldState.getMaxFuel() - ship.fuel;
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
    if (this.isSuppliesChargeHeld) {
      const ship = this.worldState.getPlayerShipState();
      const reactor = this.worldState.getInstalledReactorItem();
      if (!reactor) return;
      const maxJ = reactor.capacityJoules;
      if (ship.currentJoules >= maxJ || ship.fuel <= 0) return;
      const needed = maxJ - ship.currentJoules;
      const gen = Math.min(reactor.chargeRateJoulesPerSecond * dt, needed);
      const fuelCost = gen * reactor.fuelPerJoule;
      if (ship.fuel < fuelCost) return;
      this.worldState.updatePlayerShipState({
        currentJoules: Math.min(maxJ, ship.currentJoules + gen),
        fuel: ship.fuel - fuelCost
      });
      this.worldState.saveToLocalStorage();
    }
  }

  private updateRepair(dt: number): void {
    if (!this.canAccessService('repair')) return;
    if (this.activeTab !== 'repair' || this.repairHold === 'none') return;
    const ship = this.worldState.getPlayerShipState();
    if (this.repairHold === 'hull') {
      const pricePerHP = this.getRepairPricePerHP();
      if (pricePerHP <= 0) return;
      const repairAmount = Math.min(REPAIR_RATE_HULL * dt, ship.maxHullHP - ship.currentHullHP, ship.credits / pricePerHP);
      if (repairAmount <= 0) return;
      const cost = repairAmount * pricePerHP;
      this.worldState.updatePlayerShipState({
        currentHullHP: ship.currentHullHP + repairAmount,
        credits: ship.credits - cost
      });
      this.worldState.saveToLocalStorage();
      return;
    }
    const layerIndex = this.repairHold as number;
    const layer = ship.armourLayers[layerIndex];
    if (!layer) return;
    const item = this.worldState.getEquipmentItem(layer.itemId);
    if (!item || item.type !== 'armour') return;
    const pricePerHP = this.getArmourRepairPricePerHP();
    if (pricePerHP <= 0) return;
    const repairAmount = Math.min(
      REPAIR_RATE_ARMOUR * dt,
      layer.maxHP - layer.currentHP,
      ship.credits / pricePerHP
    );
    if (repairAmount <= 0) return;
    const cost = repairAmount * pricePerHP;
    const nextLayers = ship.armourLayers.map((L, i) =>
      i === layerIndex ? { ...L, currentHP: L.currentHP + repairAmount } : L
    );
    this.worldState.updatePlayerShipState({
      armourLayers: nextLayers,
      credits: ship.credits - cost
    });
    this.worldState.saveToLocalStorage();
  }

  private getArmourRepairPricePerHP(): number {
    return this.getRepairPricePerHP() * REPAIR_PRICE_ARMOUR_MULTIPLIER;
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
      { label: 'REPUTATION', id: 'reputation', serviceType: null, available: true },
      { label: 'MISSIONS', id: 'missions', serviceType: null, available: true },
      { label: 'SUPPLIES', id: 'supplies', serviceType: 'refuel', available: this.hasService('refuel') },
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
    } else if (this.activeTab === 'reputation') {
      this.renderReputationTab(ctx, contentX, contentY, contentWidth, contentHeight);
    } else if (this.activeTab === 'missions') {
      this.renderMissionsTab(ctx, contentX, contentY, contentWidth, contentHeight);
    } else if (this.activeTab === 'supplies') {
      if (!this.canAccessService('refuel')) {
        this.renderAccessDenied(ctx, contentX, contentY);
      } else {
        this.renderSupplies(ctx, contentX, contentY, contentWidth, contentHeight);
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
      this.renderSupplies(ctx, contentX, contentY, contentWidth, contentHeight);
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
    const hullRatio = ship.maxHullHP > 0 ? Math.min(1, Math.max(0, ship.currentHullHP / ship.maxHullHP)) : 0;
    const hullTextY = tagY + 42;
    const barX = x + 120;
    const barY = hullTextY + 2;
    const barWidth = 140;
    const barHeight = 14;
    const needsRepair = ship.currentHullHP < ship.maxHullHP;
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

  private renderReputationTab(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText('REPUTATION', x, y);
    this.renderStanding(ctx, x, y + 34, width - 20, y + height);
  }

  private renderSupplies(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    this.suppliesFuelHoldRect = null;
    this.suppliesFuelFillRect = null;
    this.suppliesChargeHoldRect = null;
    this.suppliesChargeFillRect = null;
    this.suppliesShieldFillRect = null;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const ship = this.worldState.getPlayerShipState();
    const pricePerUnit = this.getRefuelPricePerUnit();
    const fuelMax = this.worldState.getMaxFuel();
    const fuelCurrent = ship.fuel;
    const fuelRatio = fuelMax > 0 ? Math.min(1, fuelCurrent / fuelMax) : 0;
    const credits = ship.credits;
    const affordable = credits >= pricePerUnit;
    const tankFull = fuelCurrent >= fuelMax;
    const fuelNeeded = Math.max(0, fuelMax - fuelCurrent);
    const fillUpFuelCost = fuelNeeded * pricePerUnit;
    const canFillFuel = !tankFull && credits >= fillUpFuelCost;

    let ly = y;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillText('FUEL', x, ly);
    ly += 22;
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`${Math.floor(fuelCurrent)} / ${Math.floor(fuelMax)} units`, x, ly);
    ly += 22;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, ly, Math.min(width - 40, 420), 16);
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillRect(x + 1, ly + 1, (Math.min(width - 42, 418)) * fuelRatio, 14);
    ly += 28;
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Price: ${pricePerUnit} ₢/unit`, x, ly);
    ly += 22;
    this.suppliesFuelHoldRect = { x, y: ly, width: 200, height: 32 };
    this.drawButton(ctx, this.suppliesFuelHoldRect, '[ HOLD TO REFUEL ]', !tankFull && affordable);
    this.suppliesFuelFillRect = { x: x + 220, y: ly, width: 200, height: 32 };
    this.drawButton(ctx, this.suppliesFuelFillRect, `[ FILL UP — ${fillUpFuelCost.toFixed(0)} ₢ ]`, canFillFuel);
    ly += 44;

    const reactor = this.worldState.getInstalledReactorItem();
    if (reactor) {
      const maxJ = reactor.capacityJoules;
      const jNeeded = Math.max(0, maxJ - ship.currentJoules);
      const fillEnergyCredits = jNeeded * reactor.fuelPerJoule * pricePerUnit;
      const canFillEnergy = jNeeded > 0 && ship.credits >= fillEnergyCredits;
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_ACCENT;
      ctx.fillText('ENERGY', x, ly);
      ly += 22;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(`${Math.round(ship.currentJoules)} / ${maxJ} J`, x, ly);
      ly += 20;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`Reactor: ${reactor.name}`, x, ly);
      ly += 18;
      ctx.fillText(`Conversion: ${reactor.fuelPerJoule} fuel/J`, x, ly);
      ly += 18;
      ctx.fillText(`To fill: ${jNeeded.toFixed(0)} J = ${(jNeeded * reactor.fuelPerJoule).toFixed(2)} fuel = ${fillEnergyCredits.toFixed(2)} ₢`, x, ly);
      ly += 26;
      this.suppliesChargeHoldRect = { x, y: ly, width: 200, height: 32 };
      const canChargeHold = ship.currentJoules < maxJ && ship.fuel > 0;
      this.drawButton(ctx, this.suppliesChargeHoldRect, '[ HOLD TO CHARGE ]', canChargeHold);
      this.suppliesChargeFillRect = { x: x + 220, y: ly, width: 220, height: 32 };
      this.drawButton(ctx, this.suppliesChargeFillRect, `[ FILL UP — ${fillEnergyCredits.toFixed(2)} ₢ ]`, canFillEnergy);
      ly += 48;
    } else {
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText('ENERGY — No reactor installed.', x, ly);
      ly += 28;
    }

    const shield = this.worldState.getInstalledShieldItem();
    if (shield) {
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_ACCENT;
      ctx.fillText('SHIELD', x, ly);
      ly += 22;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(`${Math.round(ship.currentShieldHP)} / ${shield.shieldHP} HP`, x, ly);
      ly += 20;
      const hpGap = Math.max(0, shield.shieldHP - ship.currentShieldHP);
      const joulesNeeded = hpGap * shield.joulesPerHPRegen;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`Regen uses: ${shield.joulesPerHPRegen} J/HP  (${Math.round(joulesNeeded)} J needed)`, x, ly);
      ly += 18;
      const okJ = ship.currentJoules >= joulesNeeded;
      ctx.fillText(`Battery: ${Math.round(ship.currentJoules)} J${okJ ? '  ✓ sufficient' : '  ✗ insufficient'}`, x, ly);
      ly += 22;
      if (ship.shieldRebooting) {
        ctx.fillStyle = COLOURS.DANGER;
        ctx.fillText(`SHIELD REBOOTING — ${ship.shieldRebootTimer.toFixed(1)}s remaining`, x, ly);
        ly += 22;
      }
      this.suppliesShieldFillRect = { x, y: ly, width: 220, height: 32 };
      const canFillShield = !ship.shieldRebooting && hpGap > 0 && ship.currentJoules >= joulesNeeded;
      this.drawButton(ctx, this.suppliesShieldFillRect, `[ FILL SHIELD — ${Math.round(joulesNeeded)} J ]`, canFillShield);
    } else {
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText('SHIELD — No shield installed.', x, ly);
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
    const fontSize = rect.width <= 84 ? 11 : rect.width <= 100 ? 12 : 13;
    const horizontalPadding = rect.width <= 84 ? 4 : rect.width <= 100 ? 6 : 10;
    ctx.font = `${fontSize}px 'Courier New', monospace`;
    const fittedText = this.fitTextToWidth(ctx, text, rect.width - horizontalPadding * 2);
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
    height: number
  ): void {
    this.repairViewport = { x, y, width, height };
    this.repairHullHoldRect = null;
    this.repairHullFullRect = null;
    this.repairArmourRects = [];

    const ship = this.worldState.getPlayerShipState();
    const priceHull = this.getRepairPricePerHP();
    const priceArmour = this.getArmourRepairPricePerHP();
    const profileW = Math.min(400, Math.max(0, width - 280));
    const colW = Math.max(200, width - profileW - 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let contentH = 0;
    const bump = (n: number): void => {
      contentH += n;
    };

    bump(20);
    bump(200);
    for (let i = 0; i < ship.armourLayers.length; i += 1) {
      bump(132);
    }
    bump(profileW > 0 ? 220 : 0);

    this.repairScrollMax = Math.max(0, contentH - height);
    this.repairScrollPx = Math.min(this.repairScrollPx, this.repairScrollMax);

    const gutter = this.repairScrollMax > 0 ? 12 : 0;
    const clipW = width - gutter;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, clipW, height);
    ctx.clip();

    const scroll = this.repairScrollPx;
    let cy = y - scroll;

    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText('Shields are not repaired here — use SUPPLIES to charge from the reactor battery.', x + 2, cy);
    cy += 22;

    const hpNeeded = Math.max(0, ship.maxHullHP - ship.currentHullHP);
    const hullRatio = ship.maxHullHP > 0 ? Math.min(1, Math.max(0, ship.currentHullHP / ship.maxHullHP)) : 0;
    const hullSpec = this.worldState.getHullSpec(ship.hullSpecId);
    const baseHullHP = hullSpec?.baseHP ?? ship.maxHullHP;
    const armourBonusHP = Math.max(0, ship.maxHullHP - baseHullHP);
    const fullHullCost = hpNeeded * priceHull;
    const hullIntact = hpNeeded <= 0;
    const canHoldHull = !hullIntact && ship.credits >= priceHull;
    const canFullHull = !hullIntact && ship.credits >= fullHullCost;
    const maxRepairHP = priceHull > 0 ? Math.min(hpNeeded, Math.floor(ship.credits / priceHull)) : 0;
    const maxRepairCost = maxRepairHP * priceHull;

    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('HULL', x + 2, cy);
    cy += 26;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(
      `Integrity: ${ship.currentHullHP.toFixed(1)} / ${ship.maxHullHP.toFixed(1)} (${Math.round(hullRatio * 100)}%)`,
      x + 2,
      cy
    );
    cy += 22;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText(
      `Base hull ${Math.round(baseHullHP)} HP + armour bonus ${Math.round(armourBonusHP)} HP`,
      x + 2,
      cy
    );
    cy += 20;
    this.drawStatusBar(ctx, x + 2, cy, colW - 24, 16, hullRatio, this.getHullColourByRatio(hullRatio));
    cy += 24;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Damage: ${hpNeeded.toFixed(1)} HP    ${priceHull} ₢/HP    credits ${ship.credits.toFixed(1)} ₢`, x + 2, cy);
    cy += 20;

    this.repairHullHoldRect = { x: x + 2, y: cy, width: 200, height: 32 };
    this.drawButton(ctx, this.repairHullHoldRect, '[ HOLD HULL ]', canHoldHull);
    ctx.fillStyle = hullIntact ? COLOURS.SAFE : !canHoldHull ? COLOURS.DANGER : COLOURS.UI_SECONDARY;
    ctx.font = "12px 'Courier New', monospace";
    if (hullIntact) {
      ctx.fillText('INTACT', x + 214, cy + 10);
    } else if (!canHoldHull) {
      ctx.fillText('NO CREDITS', x + 214, cy + 10);
    } else {
      ctx.fillText(`${(priceHull * REPAIR_RATE_HULL).toFixed(1)} ₢/s`, x + 214, cy + 10);
    }
    cy += 40;

    this.repairHullFullRect = { x: x + 2, y: cy, width: 200, height: 32 };
    this.drawButton(ctx, this.repairHullFullRect, '[ FULL HULL ]', canFullHull);
    if (!hullIntact) {
      ctx.fillStyle = canFullHull ? COLOURS.UI_SECONDARY : COLOURS.DANGER;
      ctx.fillText(`${fullHullCost.toFixed(1)} ₢`, x + 214, cy + 10);
    }
    cy += 42;

    if (!canFullHull && !hullIntact && maxRepairHP > 0) {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText(`Max affordable hull repair: ${maxRepairHP} HP (${maxRepairCost.toFixed(1)} ₢)`, x + 2, cy);
      cy += 18;
    }

    for (let layerIndex = 0; layerIndex < ship.armourLayers.length; layerIndex += 1) {
      const layer = ship.armourLayers[layerIndex]!;
      const item = this.worldState.getEquipmentItem(layer.itemId);
      const layerName = item?.name ?? layer.itemId;
      const ratioL = layer.maxHP > 0 ? Math.min(1, Math.max(0, layer.currentHP / layer.maxHP)) : 0;
      const dmg = Math.max(0, layer.maxHP - layer.currentHP);
      const fullCost = dmg * priceArmour;
      const intactL = dmg <= 0;
      const canHold = !intactL && ship.credits >= priceArmour;
      const canFull = !intactL && ship.credits >= fullCost;

      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.fillText(`ARMOUR LAYER ${layerIndex + 1} — ${layerName}`, x + 2, cy);
      cy += 22;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(
        `${layer.currentHP.toFixed(1)} / ${layer.maxHP.toFixed(1)} HP    ${priceArmour} ₢/HP (${REPAIR_PRICE_ARMOUR_MULTIPLIER}× hull)`,
        x + 2,
        cy
      );
      cy += 18;
      this.drawStatusBar(ctx, x + 2, cy, colW - 24, 14, ratioL, this.getHullColourByRatio(ratioL));
      cy += 20;

      const holdR = { x: x + 2, y: cy, width: 200, height: 30 };
      const fullR = { x: x + 210, y: cy, width: 200, height: 30 };
      this.repairArmourRects.push({ layerIndex, hold: holdR, full: fullR });
      this.drawButton(ctx, holdR, '[ HOLD ]', canHold);
      this.drawButton(ctx, fullR, '[ FULL ]', canFull);
      cy += 36;
      if (!intactL) {
        ctx.fillStyle = canFull ? COLOURS.UI_SECONDARY : COLOURS.WARNING;
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(`Full layer repair: ${fullCost.toFixed(1)} ₢`, x + 2, cy);
        cy += 16;
      }
      cy += 6;
    }

    if (profileW > 0) {
      this.renderArmourReductionProfile(ctx, ship, x + colW + 8, y - scroll + 22);
    }

    ctx.restore();

    if (this.repairScrollMax > 0) {
      const sbX = x + width - 10;
      const sbW = 6;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(sbX, y, sbW, height);
      const thumbH = Math.max(24, (height / contentH) * height);
      const travel = Math.max(1, height - thumbH);
      const t = this.repairScrollMax > 0 ? this.repairScrollPx / this.repairScrollMax : 0;
      const thumbY = y + t * travel;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillRect(sbX + 1, thumbY + 1, sbW - 2, thumbH - 2);
    }
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
    const fuelNeeded = this.worldState.getMaxFuel() - ship.fuel;
    const totalCost = fuelNeeded * pricePerUnit;
    if (ship.credits < totalCost || fuelNeeded <= 0) return;
    this.worldState.updatePlayerShipState({
      fuel: this.worldState.getMaxFuel(),
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private applyFullHullRepair(): void {
    if (!this.canAccessService('repair')) return;
    const ship = this.worldState.getPlayerShipState();
    const pricePerHP = this.getRepairPricePerHP();
    const hpNeeded = ship.maxHullHP - ship.currentHullHP;
    const totalCost = hpNeeded * pricePerHP;
    if (ship.credits < totalCost || hpNeeded <= 0) return;
    this.worldState.updatePlayerShipState({
      currentHullHP: ship.maxHullHP,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private applyFullEnergyCharge(): void {
    if (!this.canAccessService('refuel')) return;
    const ship = this.worldState.getPlayerShipState();
    const reactor = this.worldState.getInstalledReactorItem();
    if (!reactor) return;
    const pricePerUnit = this.getRefuelPricePerUnit();
    const maxJ = reactor.capacityJoules;
    const jNeeded = Math.max(0, maxJ - ship.currentJoules);
    const totalCost = jNeeded * reactor.fuelPerJoule * pricePerUnit;
    if (jNeeded <= 0 || ship.credits < totalCost) return;
    this.worldState.updatePlayerShipState({
      currentJoules: maxJ,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private applyFillShieldFromBattery(): void {
    const ship = this.worldState.getPlayerShipState();
    const shield = this.worldState.getInstalledShieldItem();
    if (!shield || ship.shieldRebooting) return;
    const hpGap = Math.max(0, shield.shieldHP - ship.currentShieldHP);
    const joulesNeeded = hpGap * shield.joulesPerHPRegen;
    if (hpGap <= 0 || ship.currentJoules < joulesNeeded) return;
    this.worldState.updatePlayerShipState({
      currentShieldHP: shield.shieldHP,
      maxShieldHP: shield.shieldHP,
      currentJoules: ship.currentJoules - joulesNeeded
    });
    this.worldState.saveToLocalStorage();
  }

  private applyFullArmourRepair(layerIndex: number): void {
    if (!this.canAccessService('repair')) return;
    const ship = this.worldState.getPlayerShipState();
    const layer = ship.armourLayers[layerIndex];
    if (!layer) return;
    const hpNeeded = layer.maxHP - layer.currentHP;
    if (hpNeeded <= 0) return;
    const pricePerHP = this.getArmourRepairPricePerHP();
    const totalCost = hpNeeded * pricePerHP;
    if (ship.credits < totalCost) return;
    const nextLayers = ship.armourLayers.map((L, i) =>
      i === layerIndex ? { ...L, currentHP: L.maxHP } : L
    );
    this.worldState.updatePlayerShipState({
      armourLayers: nextLayers,
      credits: ship.credits - totalCost
    });
    this.worldState.saveToLocalStorage();
  }

  private getRepairPricePerHP(): number {
    const base = this.repairService?.repairPricePerHP ?? REPAIR_PRICE_DEFAULT;
    return this.isHostileAtLandable() ? base * 2 : base;
  }

  private refreshClickableTabs(): void {
    const serviceTabs: Array<{ tab: TabId; service: ServiceType }> = [
      { tab: 'supplies', service: 'refuel' },
      { tab: 'repair', service: 'repair' },
      { tab: 'missionBoard', service: 'missionBoard' },
      { tab: 'shipyard', service: 'shipyard' },
      { tab: 'equipmentStore', service: 'equipmentStore' },
      { tab: 'trainingSimulator', service: 'trainingSimulator' }
    ];
    this.clickableTabs = [
      'overview',
      'reputation',
      'missions',
      ...serviceTabs.filter((entry) => this.hasService(entry.service)).map((entry) => entry.tab)
    ];
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
      reputation: 'Reputation',
      missions: 'Missions',
      supplies: 'Supplies',
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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText('EQUIPMENT', x, y);
    ctx.fillStyle = COLOURS.CREDITS;
    ctx.font = "14px 'Courier New', monospace";
    const creditsX = x + width - 240;
    ctx.fillText(`Credits: ${Math.round(ship.credits).toLocaleString()} ₢`, creditsX, y + 2);
    if (this.equipmentFlashTimer > 0 && this.equipmentFlashMessage) {
      const alpha = Math.min(1, this.equipmentFlashTimer / 1.6);
      const delta = this.equipmentFlashCreditDelta;
      const deltaText =
        delta === null
          ? ''
          : `${delta >= 0 ? '+' : '-'}${Math.abs(Math.round(delta)).toLocaleString()} ₢`;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillStyle = delta === null ? COLOURS.UI_SECONDARY : delta >= 0 ? COLOURS.SAFE : COLOURS.WARNING;
      ctx.fillText(deltaText || this.equipmentFlashMessage, creditsX, y + 20);
      if (deltaText) {
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.fillText(this.equipmentFlashMessage, creditsX + 120, y + 20);
      }
      ctx.restore();
    }
    this.renderEquipmentCapacityBar(ctx, x, y + 38, width - 8);

    const badSel = this.selectedShipSlot;
    if (badSel && !this.worldState.playerHullSlotExists(badSel.slotType, badSel.slotIndex)) {
      this.selectedShipSlot = null;
    }
    if (
      this.pendingPurchase &&
      !this.worldState.playerHullSlotExists(this.pendingPurchase.slotType, this.pendingPurchase.slotIndex)
    ) {
      this.pendingPurchase = null;
    }

    const leftW = Math.floor((width - 24) * 0.48);
    const rightX = x + leftW + 24;
    const rightW = width - leftW - 24;
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText('YOUR SHIP', x, y + 86);
    ctx.fillText('STORE', rightX, y + 86);
    const statusH = this.renderShipPowerStatus(ctx, x, y + 108, leftW);
    const shipPanelTop = y + 108 + statusH + 6;
    const shipPanelH = Math.max(100, y + height - 8 - shipPanelTop);
    const storeLabelW = ctx.measureText('STORE').width;
    const slotHintSelection = this.selectedShipSlot;
    const slotHintValid =
      !!slotHintSelection &&
      this.worldState.playerHullSlotExists(slotHintSelection.slotType, slotHintSelection.slotIndex);
    const storeHintX = rightX + storeLabelW + 10;
    if (!slotHintValid) {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText('Prices only — use Browse on a slot to buy or swap.', storeHintX, y + 88);
    } else {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.font = "12px 'Courier New', monospace";
      const seeAllLabel = 'See all';
      ctx.fillText(seeAllLabel, storeHintX, y + 88);
      const seeAllW = ctx.measureText(seeAllLabel).width;
      this.equipmentActionRects.push({
        action: 'clearStoreFilter',
        x: storeHintX,
        y: y + 88,
        width: seeAllW,
        height: 14
      });
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText(`Browsing: ${this.formatSelectedSlotBrowseTitle()}`, storeHintX + seeAllW + 14, y + 89);
    }
    this.renderShipSlotsPanel(ctx, x, shipPanelTop, leftW, shipPanelH);
    this.renderStorePanel(ctx, rightX, shipPanelTop, rightW, shipPanelH);

  }

  private renderShipPowerStatus(ctx: CanvasRenderingContext2D, bx: number, by: number, panelW: number): number {
    const ship = this.worldState.getPlayerShipState();
    const reactor = this.worldState.getInstalledReactorItem();
    const shield = this.worldState.getInstalledShieldItem();
    const lineH = 15;
    let line = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = "11px 'Courier New', monospace";

    if (!reactor) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(this.fitTextToWidth(ctx, 'REACTOR  ○ OFFLINE  (no unit)', panelW - 8), bx, by + line * lineH);
    } else if (this.worldState.isReactorOnline()) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText(
        this.fitTextToWidth(ctx, `REACTOR  ● ONLINE  ${reactor.name}`, panelW - 8),
        bx,
        by + line * lineH
      );
    } else {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(
        this.fitTextToWidth(ctx, `REACTOR  ○ OFFLINE  ${reactor.name}`, panelW - 8),
        bx,
        by + line * lineH
      );
    }
    line += 1;

    if (!shield) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(this.fitTextToWidth(ctx, 'SHIELD  ○ OFFLINE  (no unit)', panelW - 8), bx, by + line * lineH);
      line += 1;
    } else if (ship.shieldRebooting) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText(
        this.fitTextToWidth(ctx, `SHIELD  ⏸ REBOOTING  ${shield.name}`, panelW - 8),
        bx,
        by + line * lineH
      );
      line += 1;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(
        this.fitTextToWidth(ctx, `  ${ship.shieldRebootTimer.toFixed(1)}s until online`, panelW - 8),
        bx,
        by + line * lineH
      );
      line += 1;
    } else if (this.worldState.isShieldOnline()) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.fillText(this.fitTextToWidth(ctx, `SHIELD  ● ONLINE  ${shield.name}`, panelW - 8), bx, by + line * lineH);
      line += 1;
    } else {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(this.fitTextToWidth(ctx, `SHIELD  ○ OFFLINE  ${shield.name}`, panelW - 8), bx, by + line * lineH);
      line += 1;
    }

    return line * lineH + 6;
  }

  private static readonly EQUIPMENT_SHIP_SLOT_GROUPS: Array<{ label: string; slotType: EquipmentSlot['slotType'] }> = [
    { label: 'Forward Thruster', slotType: 'thruster_forward' },
    { label: 'Rotation Thruster', slotType: 'thruster_rotate' },
    { label: 'Reverse Thruster', slotType: 'thruster_reverse' },
    { label: 'Armour', slotType: 'armour' },
    { label: 'Reactor', slotType: 'reactor' },
    { label: 'Shield', slotType: 'shield' },
    { label: 'Auto-Brake', slotType: 'autoBrake' },
    { label: 'Fuel Tank', slotType: 'fuelTank' },
    { label: 'Weapon', slotType: 'weapon' }
  ];

  private getShipSlotsPanelContentHeight(): number {
    let h = 0;
    for (const group of LandableScreen.EQUIPMENT_SHIP_SLOT_GROUPS) {
      const count = this.worldState.getPlayerHullSlotCount(group.slotType);
      h += count === 0 ? 88 : count * 88;
    }
    return h;
  }

  private renderShipSlotsPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    this.shipSlotsViewport = { x, y, width, height };
    const contentHeight = this.getShipSlotsPanelContentHeight();
    this.shipSlotsScrollMax = Math.max(0, contentHeight - height);
    this.shipSlotsScrollPx = Math.min(this.shipSlotsScrollPx, this.shipSlotsScrollMax);

    const gutter = this.shipSlotsScrollMax > 0 ? 12 : 0;
    const panelW = width - gutter;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    let off = 0;
    for (const group of LandableScreen.EQUIPMENT_SHIP_SLOT_GROUPS) {
      const count = this.worldState.getPlayerHullSlotCount(group.slotType);
      if (count === 0) {
        const lineY = y + off - this.shipSlotsScrollPx;
        const cardY = y + off + 14 - this.shipSlotsScrollPx;
        const cardH = 66;
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText(group.label.toUpperCase(), x, lineY);
        ctx.strokeStyle = COLOURS.STAR_DIM;
        ctx.strokeRect(x, cardY, panelW, cardH);
        ctx.fillStyle = COLOURS.STAR_MID;
        ctx.fillText('Unavailable', x + 8, cardY + 22);
        off += 88;
        continue;
      }
      for (let idx = 0; idx < count; idx += 1) {
        const lineY = y + off - this.shipSlotsScrollPx;
        const cardY = y + off + 14 - this.shipSlotsScrollPx;
        const cardH = 66;
        const slot = this.worldState.getSlot(group.slotType, idx);
        const item = slot?.itemId ? this.worldState.getEquipmentItem(slot.itemId) : null;
        const sel = this.selectedShipSlot;
        const isSelectedSlot =
          !!sel &&
          this.worldState.playerHullSlotExists(sel.slotType, sel.slotIndex) &&
          group.slotType === sel.slotType &&
          idx === sel.slotIndex;
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText(`${group.label.toUpperCase()}${group.slotType === 'weapon' ? ` ${idx + 1}` : ''}`, x, lineY);
        ctx.strokeStyle = COLOURS.STAR_DIM;
        ctx.strokeRect(x, cardY, panelW, cardH);
        if (item) {
          ctx.fillStyle = COLOURS.UI_PRIMARY;
          ctx.font = "12px 'Courier New', monospace";
          ctx.fillText(`${item.name} (T${item.tier})`, x + 8, cardY + 8);
          ctx.fillStyle = COLOURS.UI_SECONDARY;
          ctx.fillText(this.formatEquipmentStats(item).join('  '), x + 8, cardY + 26);
          const canSell = this.canSellSlot(group.slotType, idx);
          if (canSell) {
            const sell = EquipmentStore.getSellPrice(item);
            ctx.fillStyle = COLOURS.CREDITS;
            ctx.fillText(`Sell: ${sell} ₢`, x + 8, cardY + 44);
            const pendingKey = `${group.slotType}:${idx}`;
            if (this.pendingSellItemId === pendingKey) {
              const yes = { x: x + panelW - 196, y: cardY + 34, width: 90, height: 24 };
              const no = { x: x + panelW - 98, y: cardY + 34, width: 90, height: 24 };
              this.drawButton(ctx, yes, '[ YES ]', true);
              this.drawButton(ctx, no, '[ NO ]', true);
              this.equipmentActionRects.push({ action: 'confirmSell', slotType: group.slotType, slotIndex: idx, ...yes });
              this.equipmentActionRects.push({ action: 'cancelSell', slotType: group.slotType, slotIndex: idx, ...no });
            } else {
              const browseBtn = { x: x + panelW - 168, y: cardY + 34, width: 80, height: 22 };
              const sellBtn = { x: x + panelW - 84, y: cardY + 34, width: 80, height: 22 };
              this.drawButton(ctx, browseBtn, '[ BROWSE ]', true);
              this.drawButton(ctx, sellBtn, '[ SELL ]', true);
              this.equipmentActionRects.push({ action: 'selectSlot', slotType: group.slotType, slotIndex: idx, ...browseBtn });
              this.equipmentActionRects.push({ action: 'sell', slotType: group.slotType, slotIndex: idx, ...sellBtn });
            }
          } else {
            const browseBtn = { x: x + panelW - 102, y: cardY + 34, width: 96, height: 24 };
            this.drawButton(ctx, browseBtn, '[ BROWSE ]', true);
            this.equipmentActionRects.push({ action: 'selectSlot', slotType: group.slotType, slotIndex: idx, ...browseBtn });
          }
        } else {
          ctx.fillStyle = COLOURS.STAR_MID;
          ctx.fillText('— empty —', x + 8, cardY + 22);
          const browseBtn = { x: x + panelW - 102, y: cardY + 34, width: 96, height: 24 };
          this.drawButton(ctx, browseBtn, '[ BROWSE ]', true);
          this.equipmentActionRects.push({ action: 'selectSlot', slotType: group.slotType, slotIndex: idx, ...browseBtn });
        }
        if (isSelectedSlot) {
          ctx.save();
          ctx.strokeStyle = COLOURS.WARNING;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, cardY + 1, panelW - 2, cardH - 2);
          ctx.restore();
        }
        off += 88;
      }
    }

    ctx.restore();

    if (this.shipSlotsScrollMax > 0) {
      const sbX = x + width - 10;
      const sbW = 6;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(sbX, y, sbW, height);
      const thumbH = Math.max(24, (height / contentHeight) * height);
      const travel = Math.max(1, height - thumbH);
      const t = this.shipSlotsScrollMax > 0 ? this.shipSlotsScrollPx / this.shipSlotsScrollMax : 0;
      const thumbY = y + t * travel;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillRect(sbX + 1, thumbY + 1, sbW - 2, thumbH - 2);
    }
  }

  private renderStorePanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    this.equipmentStoreViewport = { x, y, width, height };
    const selection = this.selectedShipSlot;
    const selectionValid =
      !!selection &&
      this.worldState.playerHullSlotExists(selection.slotType, selection.slotIndex);
    const items = this.equipmentInventory
      .filter((item) => !selectionValid || this.matchesSlotSelection(item, selection!.slotType))
      .slice(0, EQUIPMENT_STORE_COUNT);
    const cardH = 88;
    const rowGap = 8;
    const rowStride = cardH + rowGap;
    const contentHeight = items.length > 0 ? (items.length - 1) * rowStride + cardH : 0;
    this.equipmentStoreScrollMax = Math.max(0, contentHeight - height);
    this.equipmentStoreScrollPx = Math.min(this.equipmentStoreScrollPx, this.equipmentStoreScrollMax);

    const gutter = this.equipmentStoreScrollMax > 0 ? 12 : 0;
    const storeW = width - gutter;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      const cardY = y + i * rowStride - this.equipmentStoreScrollPx;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(x, cardY, storeW, cardH);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillText(`${item.name}  Tier ${item.tier}`, x + 8, cardY + 8);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(this.formatEquipmentStats(item).join('  '), x + 8, cardY + 28);
      const buy = EquipmentStore.getBuyPrice(item, this.worldState, this.landable.factionId);
      if (!selectionValid) {
        ctx.fillStyle = COLOURS.CREDITS;
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText(`Buy: ${buy} ₢`, x + 8, cardY + 50);
        ctx.fillStyle = COLOURS.UI_SECONDARY;
        ctx.font = "10px 'Courier New', monospace";
        ctx.fillText('Browse a ship slot to purchase or swap.', x + 8, cardY + 68, storeW - 16);
        continue;
      }
      const existing = this.getSlotItem(selection!.slotType, selection!.slotIndex);
      const sellOld = existing ? EquipmentStore.getSellPrice(existing) : 0;
      const net = buy - sellOld;
      ctx.fillStyle = COLOURS.CREDITS;
      ctx.fillText(`Buy: ${buy} ₢  Sell old: ${sellOld} ₢`, x + 8, cardY + 46);
      ctx.fillStyle = net <= 0 ? COLOURS.SAFE : COLOURS.UI_PRIMARY;
      ctx.fillText(`Net: ${net} ₢`, x + 8, cardY + 62);
      const resourcesOk = this.storePurchasePassesResources(item, existing, buy, sellOld);
      const canPurchase = existing?.id !== item.id && resourcesOk;
      const action = this.getStoreActionLabel(item, existing);
      const btn = { x: x + storeW - 118, y: cardY + 54, width: 108, height: 26 };
      const isPending =
        selectionValid &&
        this.pendingPurchase?.itemId === item.id &&
        this.pendingPurchase.slotType === selection?.slotType &&
        this.pendingPurchase.slotIndex === selection?.slotIndex;
      if (isPending) {
        const yes = { x: x + storeW - 226, y: cardY + 54, width: 100, height: 26 };
        const no = { x: x + storeW - 118, y: cardY + 54, width: 100, height: 26 };
        this.drawButton(ctx, yes, '[ CONFIRM ]', true);
        this.drawButton(ctx, no, '[ CANCEL ]', true);
        this.equipmentActionRects.push({ action: 'confirmPurchase', itemId: item.id, ...yes });
        this.equipmentActionRects.push({ action: 'cancelPurchase', itemId: item.id, ...no });
      } else {
        this.drawButton(ctx, btn, action, canPurchase);
        if (canPurchase && selection) {
          this.equipmentActionRects.push({
            action: 'purchase',
            itemId: item.id,
            slotType: selection.slotType,
            slotIndex: selection.slotIndex,
            ...btn
          });
        }
      }
    }

    ctx.restore();

    if (this.equipmentStoreScrollMax > 0) {
      const sbX = x + width - 10;
      const sbW = 6;
      ctx.strokeStyle = COLOURS.STAR_DIM;
      ctx.strokeRect(sbX, y, sbW, height);
      const thumbH = Math.max(24, (height / contentHeight) * height);
      const travel = Math.max(1, height - thumbH);
      const t = this.equipmentStoreScrollMax > 0 ? this.equipmentStoreScrollPx / this.equipmentStoreScrollMax : 0;
      const thumbY = y + t * travel;
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillRect(sbX + 1, thumbY + 1, sbW - 2, thumbH - 2);
    }
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
    ctx.fillText(`Equip capacity  ${Math.round(used)} / ${Math.round(cap)} mass`, x, y + 18);
  }

  private handleEquipmentAction(action: {
    action:
      | 'selectSlot'
      | 'purchase'
      | 'sell'
      | 'confirmPurchase'
      | 'cancelPurchase'
      | 'confirmSell'
      | 'cancelSell'
      | 'clearStoreFilter';
    itemId?: string;
    slotType?: EquipmentInstallSlotType;
    slotIndex?: number;
  }): void {
    if (action.action === 'clearStoreFilter') {
      this.selectedShipSlot = null;
      this.pendingPurchase = null;
      this.equipmentStoreScrollPx = 0;
      this.shipSlotsScrollPx = 0;
      return;
    }
    if (action.action === 'selectSlot' && action.slotType && action.slotIndex !== undefined) {
      const st = action.slotType as EquipmentSlot['slotType'];
      if (!this.worldState.playerHullSlotExists(st, action.slotIndex)) {
        return;
      }
      this.selectedShipSlot = { slotType: st, slotIndex: action.slotIndex };
      this.pendingPurchase = null;
      this.equipmentStoreScrollPx = 0;
      return;
    }
    if (action.action === 'purchase' && action.itemId && action.slotType && action.slotIndex !== undefined) {
      const sel = this.selectedShipSlot;
      if (
        !sel ||
        sel.slotType !== action.slotType ||
        sel.slotIndex !== action.slotIndex ||
        !this.worldState.playerHullSlotExists(sel.slotType, sel.slotIndex)
      ) {
        return;
      }
      const st = action.slotType as EquipmentSlot['slotType'];
      if (!this.worldState.playerHullSlotExists(st, action.slotIndex)) {
        return;
      }
      this.pendingPurchase = {
        itemId: action.itemId,
        slotType: st,
        slotIndex: action.slotIndex
      };
      return;
    }
    if (action.action === 'confirmPurchase' && this.pendingPurchase) {
      const result = this.worldState.purchaseAndInstall(
        this.pendingPurchase.itemId,
        this.pendingPurchase.slotType,
        this.pendingPurchase.slotIndex,
        this.landable
      );
      this.pendingPurchase = null;
      this.setEquipmentFlash(
        result.success ? `Installed (net ${result.netCost} ₢)` : result.reason,
        result.success ? -result.netCost : null
      );
      return;
    }
    if (action.action === 'cancelPurchase') {
      this.pendingPurchase = null;
      return;
    }
    if (action.action === 'sell' && action.slotType && action.slotIndex !== undefined) {
      this.pendingSellItemId = `${action.slotType}:${action.slotIndex}`;
      return;
    }
    if (action.action === 'confirmSell' && action.slotType && action.slotIndex !== undefined) {
      const result = this.worldState.sellFromSlot(action.slotType as EquipmentSlot['slotType'], action.slotIndex);
      this.pendingSellItemId = null;
      this.setEquipmentFlash(
        result.success ? `Sold for ${result.creditsEarned} ₢` : (result.reason ?? 'Cannot sell'),
        result.success ? result.creditsEarned : null
      );
      return;
    }
    if (action.action === 'cancelSell') {
      this.pendingSellItemId = null;
    }
  }

  private setEquipmentFlash(message: string, creditDelta: number | null = null): void {
    this.equipmentFlashMessage = message;
    this.equipmentFlashCreditDelta = creditDelta;
    this.equipmentFlashTimer = 1.6;
  }

  private getItemForSlot(slotType: EquipmentSlot['slotType'], index: number = 0): EquipmentItem | null {
    const slot = this.worldState.getSlot(slotType, index);
    if (!slot?.itemId) return null;
    return this.worldState.getEquipmentItem(slot.itemId);
  }

  private getSlotItem(slotType: EquipmentSlot['slotType'], slotIndex: number): EquipmentItem | null {
    return this.getItemForSlot(slotType, slotIndex);
  }

  private matchesSlotSelection(item: EquipmentItem, slotType: EquipmentSlot['slotType']): boolean {
    if (slotType === 'thruster_rotate') return item.slotType === 'thruster_rotate';
    return (item.slotType ?? item.type) === slotType;
  }

  private getStoreActionLabel(item: EquipmentItem, installed: EquipmentItem | null): string {
    if (installed?.id === item.id) return '[ INSTALLED ]';
    if (!installed) return '[ INSTALL ]';
    if (item.tier > installed.tier) return '[ UPGRADE ]';
    if (item.tier < installed.tier) return '[ DOWNGRADE ]';
    return '[ SWAP ]';
  }

  private storePurchasePassesResources(
    item: EquipmentItem,
    occupying: EquipmentItem | null,
    buyPrice: number,
    sellOld: number
  ): boolean {
    const net = buyPrice - sellOld;
    const ship = this.worldState.getPlayerShipState();
    if (Math.floor(ship.credits) < net) {
      return false;
    }
    const hullSpec = this.worldState.getHullSpec(ship.hullSpecId);
    const cap = hullSpec?.equipmentCapacity ?? 0;
    const massDelta = item.mass - (occupying?.mass ?? 0);
    return this.worldState.getInstalledEquipmentMass() + massDelta <= cap;
  }

  private formatSelectedSlotBrowseTitle(): string {
    const sel = this.selectedShipSlot;
    if (!sel || !this.worldState.playerHullSlotExists(sel.slotType, sel.slotIndex)) {
      return '';
    }
    const row = LandableScreen.EQUIPMENT_SHIP_SLOT_GROUPS.find((g) => g.slotType === sel.slotType);
    const label = (row?.label ?? sel.slotType).toUpperCase();
    return sel.slotType === 'weapon' ? `${label} ${sel.slotIndex + 1}` : label;
  }

  private isRequiredSlotType(slotType: EquipmentSlot['slotType']): boolean {
    return slotType === 'thruster_forward' || slotType === 'thruster_rotate' || slotType === 'fuelTank';
  }

  private canSellSlot(slotType: EquipmentSlot['slotType'], slotIndex: number): boolean {
    const slot = this.worldState.getSlot(slotType, slotIndex);
    if (!slot?.itemId) {
      return false;
    }
    if (!this.isRequiredSlotType(slotType)) {
      return true;
    }
    const ship = this.worldState.getPlayerShipState();
    const filled = ship.equipmentSlots.filter((s) => s.slotType === slotType && s.itemId !== null).length;
    return filled > 1;
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
      case 'reactor':
        return [
          `${item.capacityJoules} J cap  ${item.chargeRateJoulesPerSecond} J/s`,
          `${item.fuelPerJoule} fuel/J  mass ${item.mass}`
        ];
      case 'shield':
        return [
          `${item.shieldHP} HP  regen ${item.regenRateHPPerSecond}/s`,
          `${item.joulesPerHPRegen} J/HP  delay ${item.regenDelay}s  reboot ${item.rebootTime}s`
        ];
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

  private getCanvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    const scaleX = this.canvas.width / bounds.width;
    const scaleY = this.canvas.height / bounds.height;
    return { x: (event.clientX - bounds.left) * scaleX, y: (event.clientY - bounds.top) * scaleY };
  }
}

import { COLOURS, REFUEL_PRICE_PER_UNIT, REFUEL_RATE } from '../constants';
import { drawPlanet } from '../renderer/landables/planetRenderer';
import type { ShipEntity } from '../simulation/shipEntity';
import type { Landable } from '../types';
import type { Screen } from './screenManager';

type TabId = 'overview' | 'refuel';

interface TabRect {
  id: TabId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LandableScreen implements Screen {
  private activeTab: TabId = 'overview';
  private isRefuelHeld = false;
  private readonly clickableTabs: TabId[] = ['overview', 'refuel'];
  private tabRects: TabRect[] = [];
  private takeOffRect: { x: number; y: number; width: number; height: number } | null = null;
  private refuelRect: { x: number; y: number; width: number; height: number } | null = null;

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
    if (this.activeTab === 'refuel' && this.refuelRect && this.inRect(hit.x, hit.y, this.refuelRect)) {
      this.isRefuelHeld = true;
    }
  };

  private readonly onMouseUp = (): void => {
    this.isRefuelHeld = false;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly landable: Landable,
    private readonly playerShip: ShipEntity,
    private readonly onTakeOff: () => void
  ) {}

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
  }

  update(dt: number): void {
    if (this.activeTab !== 'refuel' || !this.isRefuelHeld) return;
    const missingFuel = this.playerShip.state.maxFuel - this.playerShip.state.fuel;
    if (missingFuel <= 0) return;
    const affordableUnits = Math.floor(this.playerShip.state.credits / REFUEL_PRICE_PER_UNIT);
    if (affordableUnits <= 0) return;
    const refillUnits = Math.min(missingFuel, REFUEL_RATE * dt, affordableUnits);
    if (refillUnits <= 0) return;
    this.playerShip.state = {
      ...this.playerShip.state,
      fuel: this.playerShip.state.fuel + refillUnits,
      credits: this.playerShip.state.credits - refillUnits * REFUEL_PRICE_PER_UNIT
    };
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
    ctx.textBaseline = 'top';
    ctx.fillText(this.landable.name.toUpperCase(), panelX + 20, panelY + 16);
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    const factionText = this.landable.factionId ? this.landable.factionId : 'Independent';
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
      { label: 'SHIPYARD', enabled: false },
      { label: 'EQUIPMENT', enabled: false },
      { label: 'MISSIONS', enabled: false },
      { label: 'TRAINING', enabled: false },
      { label: 'FLEET', enabled: false }
    ];
    ctx.font = "16px 'Courier New', monospace";
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
    } else {
      this.renderRefuel(ctx, contentX, contentY, contentWidth, contentHeight);
    }
    ctx.restore();
  }

  private renderOverview(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText(this.landable.name, x, y);

    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(this.landable.type.toUpperCase(), x, y + 28);
    const description = this.landable.description || 'No description available.';
    this.drawWrappedText(ctx, description, x, y + 62, width - 210, 20);

    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`Atmosphere: ${this.landable.atmosphere || 'Unknown'}`, x, y + 190);
    if (this.landable.factionId) {
      ctx.fillText(`Faction: ${this.landable.factionId}`, x, y + 214);
    }

    drawPlanet(ctx, x + width - 120, y + 104, 80, this.landable.seed);
  }

  private renderRefuel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number
  ): void {
    const fuelCurrent = this.playerShip.state.fuel;
    const fuelMax = this.playerShip.state.maxFuel;
    const fuelRatio = fuelMax > 0 ? Math.min(1, fuelCurrent / fuelMax) : 0;
    const credits = this.playerShip.state.credits;
    const affordable = credits >= REFUEL_PRICE_PER_UNIT;
    const tankFull = fuelCurrent >= fuelMax;

    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`Current fuel: ${fuelCurrent.toFixed(1)} / ${fuelMax.toFixed(1)}`, x, y);

    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(x, y + 30, width - 260, 20);
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillRect(x + 1, y + 31, (width - 262) * fuelRatio, 18);

    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Price per unit: ${REFUEL_PRICE_PER_UNIT} ₢ per unit`, x, y + 70);
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
    }
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    text: string,
    enabled: boolean
  ): void {
    ctx.fillStyle = enabled ? 'rgba(8, 8, 16, 0.85)' : 'rgba(30, 30, 44, 0.8)';
    ctx.strokeStyle = enabled ? COLOURS.UI_ACCENT : '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = enabled ? COLOURS.UI_ACCENT : '#3a3a4a';
    ctx.font = "14px 'Courier New', monospace";
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + 12, rect.y + rect.height / 2);
  }

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
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

import {
  COLOURS,
  INSURANCE_PAYOUT_FRACTION,
  INSURANCE_REPAIR_COST_FRACTION
} from '../constants';
import type { WorldState } from '../core/worldState';
import type { Screen } from './screenManager';

export type InsuranceChoice = { type: 'repair' } | { type: 'payout' };

export class InsuranceScreen implements Screen {
  private claimRect: { x: number; y: number; width: number; height: number } | null = null;
  private payoutRect: { x: number; y: number; width: number; height: number } | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'a') {
      if (this.canAffordRepair()) {
        this.onResolution({ type: 'repair' });
      }
      event.preventDefault();
      return;
    }
    if (key === 'b') {
      this.onResolution({ type: 'payout' });
      event.preventDefault();
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) {
      return;
    }
    if (this.claimRect && this.inRect(point.x, point.y, this.claimRect) && this.canAffordRepair()) {
      this.onResolution({ type: 'repair' });
      return;
    }
    if (this.payoutRect && this.inRect(point.x, point.y, this.payoutRect)) {
      this.onResolution({ type: 'payout' });
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldState: WorldState,
    private readonly shipValue: number,
    private readonly onResolution: (choice: InsuranceChoice) => void
  ) {}

  onEnter(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
  }

  onExit(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    const panelWidth = Math.min(this.canvas.width - 120, 760);
    const panelHeight = Math.min(this.canvas.height - 90, 640);
    const panelX = (this.canvas.width - panelWidth) / 2;
    const panelY = (this.canvas.height - panelHeight) / 2;
    const ship = this.worldState.getPlayerShipState();
    const repairCost = Math.ceil(this.shipValue * INSURANCE_REPAIR_COST_FRACTION);
    const payoutCredits = Math.floor(this.shipValue * INSURANCE_PAYOUT_FRACTION);
    const canAffordRepair = ship.credits >= repairCost;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#0f0f1a';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.lineWidth = 1;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.DANGER;
    ctx.font = "28px 'Courier New', monospace";
    ctx.fillText('SHIP DESTROYED', panelX + 28, panelY + 26);

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "15px 'Courier New', monospace";
    ctx.fillText('Your vessel has been lost in combat.', panelX + 28, panelY + 72);
    ctx.fillText(`Ship value: ${Math.round(this.shipValue).toLocaleString()} ₢`, panelX + 28, panelY + 104);

    const optionX = panelX + 24;
    const optionWidth = panelWidth - 48;
    const optionHeight = 178;
    const optionAY = panelY + 142;
    const optionBY = optionAY + optionHeight + 16;

    this.drawOptionPanel(ctx, optionX, optionAY, optionWidth, optionHeight, 'OPTION A — INSURANCE CLAIM');
    this.drawOptionPanel(ctx, optionX, optionBY, optionWidth, optionHeight, 'OPTION B — TOTAL LOSS PAYOUT');

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(`Pay 10% excess: ${repairCost.toLocaleString()} ₢`, optionX + 18, optionAY + 40);
    ctx.fillText('Receive: Full ship + all equipment', optionX + 18, optionAY + 66);
    ctx.fillText('Respawn: Last visited landable', optionX + 18, optionAY + 92);

    this.claimRect = { x: optionX + 18, y: optionAY + 126, width: 220, height: 34 };
    this.drawButton(ctx, this.claimRect, '[ A ] CLAIM INSURANCE', canAffordRepair);
    if (!canAffordRepair) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText(
        `INSUFFICIENT CREDITS (need ${repairCost.toLocaleString()} ₢)`,
        this.claimRect.x + this.claimRect.width + 14,
        this.claimRect.y + 9
      );
    }

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(`Receive: 90% payout -> ${payoutCredits.toLocaleString()} ₢`, optionX + 18, optionBY + 40);
    ctx.fillText('Ship: Basic starter hull', optionX + 18, optionBY + 66);
    ctx.fillText('Equipment: Lost', optionX + 18, optionBY + 92);
    ctx.fillText('Respawn: Nearest accessible landable', optionX + 18, optionBY + 118);

    this.payoutRect = { x: optionX + 18, y: optionBY + 142, width: 180, height: 34 };
    this.drawButton(ctx, this.payoutRect, '[ B ] TAKE PAYOUT', true);

    ctx.fillStyle = COLOURS.CREDITS;
    ctx.font = "15px 'Courier New', monospace";
    ctx.fillText(
      `Current credits: ${Math.floor(ship.credits).toLocaleString()} ₢`,
      panelX + 28,
      panelY + panelHeight - 34
    );
    ctx.restore();
  }

  private canAffordRepair(): boolean {
    const ship = this.worldState.getPlayerShipState();
    const repairCost = Math.ceil(this.shipValue * INSURANCE_REPAIR_COST_FRACTION);
    return ship.credits >= repairCost;
  }

  private drawOptionPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string
  ): void {
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText(title, x + 14, y + 14);
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    text: string,
    enabled: boolean
  ): void {
    ctx.fillStyle = enabled ? 'rgba(8, 8, 16, 0.9)' : 'rgba(30, 30, 44, 0.8)';
    ctx.strokeStyle = enabled ? COLOURS.UI_ACCENT : '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = enabled ? COLOURS.UI_ACCENT : '#3a3a4a';
    ctx.font = "13px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  private inRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    const scaleX = this.canvas.width / bounds.width;
    const scaleY = this.canvas.height / bounds.height;
    return { x: (event.clientX - bounds.left) * scaleX, y: (event.clientY - bounds.top) * scaleY };
  }
}

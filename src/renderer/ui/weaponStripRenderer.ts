import { COLOURS, MINIMAP_SIZE } from '../../constants';
import type { WorldState } from '../../core/worldState';
import type { WeaponFireKey, WeaponItem, WeaponSlot } from '../../types';

const FIRE_KEYS: WeaponFireKey[] = ['Z', 'X', 'C', 'V', 'B'];
const PANEL_MARGIN = 16;
const STRIP_TO_MINIMAP_GAP = 10;

function isWeaponItem(item: unknown): item is WeaponItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    (item as WeaponItem).type === 'weapon'
  );
}

function toDisplayName(item: WeaponItem): string {
  return item.name
    .replace(/\s*mk\s*i+\b/gi, '')
    .replace(/\s*t\d+\b/gi, '')
    .trim()
    .toUpperCase();
}

function fitLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export class WeaponStripRenderer {
  private mouseX: number | null = null;
  private mouseY: number | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    const canvas = this.ctx.canvas;
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouseX = null;
      this.mouseY = null;
    });
  }

  render(
    weaponLoadout: WeaponSlot[],
    heldFireKeys: Record<WeaponFireKey, boolean>,
    worldState: WorldState,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const cellSize = 54;
    const gap = 4;
    const totalWidth = FIRE_KEYS.length * cellSize + (FIRE_KEYS.length - 1) * gap;
    const minimapX = canvasWidth - MINIMAP_SIZE - PANEL_MARGIN;
    const minimapY = canvasHeight - MINIMAP_SIZE - PANEL_MARGIN;
    const startX = Math.max(12, minimapX - totalWidth - STRIP_TO_MINIMAP_GAP);
    const y = minimapY + MINIMAP_SIZE - cellSize;

    let hoveredWeaponName: string | null = null;
    for (let i = 0; i < FIRE_KEYS.length; i += 1) {
      const fireKey = FIRE_KEYS[i];
      const slot = weaponLoadout.find((entry) => entry.fireKey === fireKey) ?? null;
      const x = startX + i * (cellSize + gap);
      const hoveredName = this.drawCell(x, y, cellSize, fireKey, slot, heldFireKeys[fireKey], worldState);
      if (hoveredName) {
        hoveredWeaponName = hoveredName;
      }
    }
    if (hoveredWeaponName && this.mouseX !== null && this.mouseY !== null) {
      this.drawHoverTooltip(hoveredWeaponName, this.mouseX, this.mouseY, canvasWidth, canvasHeight);
    }
  }

  private drawCell(
    x: number,
    y: number,
    cellSize: number,
    fireKey: WeaponFireKey,
    slot: WeaponSlot | null,
    isHeld: boolean,
    worldState: WorldState
  ): string | null {
    const hasSlot = slot !== null;
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.8)';
    this.ctx.fillRect(x, y, cellSize, cellSize);
    this.ctx.strokeStyle = isHeld ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    this.ctx.fillStyle = isHeld ? COLOURS.UI_ACCENT : COLOURS.UI_PRIMARY;
    this.ctx.font = "10px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(`[${fireKey}]`, x + 4, y + 4);

    if (!hasSlot) {
      this.ctx.globalAlpha = 0.3;
      this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
      this.ctx.strokeRect(x + 8, y + 10, cellSize - 16, cellSize - 22);
      this.ctx.restore();
      return null;
    }

    const item = worldState.getEquipmentItem(slot.itemId);
    if (!isWeaponItem(item)) {
      this.ctx.restore();
      return null;
    }
    this.drawBulletPreview(x + cellSize / 2, y + cellSize / 2 - 2, worldState, item);

    if (slot.stackCount > 1) {
      this.ctx.font = "9px 'Courier New', monospace";
      this.ctx.fillText(`×${slot.stackCount}`, x + cellSize / 2, y + 41);
    }

    const readyRatio =
      item.fireRate <= 0
        ? 1
        : Math.max(0, Math.min(1, 1 - slot.cooldownRemaining * item.fireRate));
    this.ctx.fillStyle = readyRatio >= 1 ? COLOURS.UI_ACCENT : COLOURS.WARNING;
    this.ctx.fillRect(x + 2, y + cellSize - 6, (cellSize - 4) * readyRatio, 4);
    this.ctx.restore();
    const isHovered =
      this.mouseX !== null &&
      this.mouseY !== null &&
      this.mouseX >= x &&
      this.mouseX <= x + cellSize &&
      this.mouseY >= y &&
      this.mouseY <= y + cellSize;
    return isHovered ? toDisplayName(item) : null;
  }

  private drawHoverTooltip(
    text: string,
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    this.ctx.save();
    this.ctx.font = "11px 'Courier New', monospace";
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    const paddingX = 8;
    const paddingY = 5;
    const textWidth = this.ctx.measureText(text).width;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = 20;
    const x = Math.max(6, Math.min(canvasWidth - boxWidth - 6, mouseX + 12));
    const y = Math.max(6, Math.min(canvasHeight - boxHeight - 6, mouseY - boxHeight - 8));
    this.ctx.fillStyle = 'rgba(8, 8, 16, 0.95)';
    this.ctx.strokeStyle = COLOURS.UI_SECONDARY;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, boxWidth, boxHeight, 5);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.fillStyle = COLOURS.UI_PRIMARY;
    this.ctx.fillText(text, x + paddingX, y + paddingY);
    this.ctx.restore();
  }

  private drawBulletPreview(centerX: number, centerY: number, worldState: WorldState, item: WeaponItem): void {
    const spec = worldState.getBulletSpec(item.bulletSpecId);
    if (!spec) {
      this.ctx.strokeStyle = COLOURS.UI_PRIMARY;
      this.ctx.strokeRect(centerX - 5, centerY - 5, 10, 10);
      return;
    }

    if (spec.visualType === 'bolt') {
      this.ctx.fillStyle = spec.colour;
      this.ctx.beginPath();
      this.ctx.ellipse(centerX, centerY, 7, 2.5, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 0.35;
      this.ctx.beginPath();
      this.ctx.ellipse(centerX - 6, centerY, 4, 1.6, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
      return;
    }

    if (spec.visualType === 'orb') {
      const core = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 5);
      core.addColorStop(0, spec.colour);
      core.addColorStop(1, 'rgba(255,255,255,0)');
      this.ctx.fillStyle = core;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }

    if (spec.visualType === 'missile') {
      this.ctx.fillStyle = spec.colour;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX + 5, centerY);
      this.ctx.lineTo(centerX - 4, centerY - 2.5);
      this.ctx.lineTo(centerX - 4, centerY + 2.5);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.strokeStyle = `${spec.colour}99`;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 8, centerY);
      this.ctx.lineTo(centerX - 4, centerY);
      this.ctx.stroke();
      return;
    }

    if (spec.visualType === 'beam_pulse') {
      this.ctx.fillStyle = spec.colour;
      this.ctx.fillRect(centerX - 7, centerY - 1, 14, 2);
      this.ctx.globalAlpha = 0.2;
      this.ctx.fillRect(centerX - 9, centerY - 2, 18, 4);
      this.ctx.globalAlpha = 1;
      return;
    }

    this.ctx.strokeStyle = COLOURS.UI_PRIMARY;
    this.ctx.strokeRect(centerX - 5, centerY - 5, 10, 10);
  }
}

import { COLOURS } from '../constants';
import { GameLoop } from '../core/gameLoop';
import { buildStarterShipState, WorldState } from '../core/worldState';
import {
  getAvailableWorlds,
  loadWorldForEntry,
  saveImportedWorld,
  type WorldEntry
} from '../core/worldRegistry';
import type { WorldFile } from '../types';
import { launchFlightScreen } from './flightScreenFactory';
import type { Screen, ScreenManager } from './screenManager';

export class NewGameScreen implements Screen {
  private static readonly PANEL_MARGIN_X = 80;
  private static readonly PANEL_MARGIN_Y = 56;
  private static readonly HEADER_HEIGHT = 46;
  private gameLoop: GameLoop | null = null;
  private worlds: WorldEntry[] = [];
  private selectedWorldIndex = 0;
  private pilotName = 'Pilot';
  private inputFocused = true;
  private caretBlinkMs = 0;
  private startButtonRect: { x: number; y: number; width: number; height: number } | null = null;
  private backButtonRect: { x: number; y: number; width: number; height: number } | null = null;
  private inputRect: { x: number; y: number; width: number; height: number } | null = null;
  private worldRects: Array<{ x: number; y: number; width: number; height: number; index: number }> = [];
  private importRect: { x: number; y: number; width: number; height: number } | null = null;
  private hoveredWorldIndex = -1;
  private hoveredStart = false;
  private hoveredImport = false;
  private isStarting = false;
  private errorMessage = '';

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.goBack();
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      if (!this.inputFocused && this.worlds.length > 0) {
        this.selectedWorldIndex = this.selectedWorldIndex;
      }
      if (this.canStart()) {
        void this.startGame();
      }
      return;
    }
    if (!this.inputFocused && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
      event.preventDefault();
      const delta = event.code === 'ArrowUp' ? -1 : 1;
      this.selectedWorldIndex =
        (this.selectedWorldIndex + delta + this.worlds.length) % Math.max(1, this.worlds.length);
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      this.inputFocused = !this.inputFocused;
      return;
    }
    if (!this.inputFocused) {
      return;
    }
    if (event.code === 'Backspace') {
      event.preventDefault();
      this.pilotName = this.pilotName.slice(0, -1);
      return;
    }
    if (event.key.length === 1 && this.pilotName.length < 20) {
      this.pilotName += event.key;
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) return;
    if (this.backButtonRect && this.inRect(point.x, point.y, this.backButtonRect)) {
      this.goBack();
      return;
    }
    if (this.inputRect && this.inRect(point.x, point.y, this.inputRect)) {
      this.inputFocused = true;
      return;
    }
    this.inputFocused = false;
    for (const worldRect of this.worldRects) {
      if (this.inRect(point.x, point.y, worldRect)) {
        this.selectedWorldIndex = worldRect.index;
        return;
      }
    }
    if (this.importRect && this.inRect(point.x, point.y, this.importRect)) {
      this.importWorldFromDisk();
      return;
    }
    if (this.startButtonRect && this.inRect(point.x, point.y, this.startButtonRect) && this.canStart()) {
      void this.startGame();
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) return;
    this.hoveredWorldIndex = -1;
    for (const worldRect of this.worldRects) {
      if (this.inRect(point.x, point.y, worldRect)) {
        this.hoveredWorldIndex = worldRect.index;
        break;
      }
    }
    this.hoveredStart = !!this.startButtonRect && this.inRect(point.x, point.y, this.startButtonRect);
    this.hoveredImport = !!this.importRect && this.inRect(point.x, point.y, this.importRect);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    this.worlds = getAvailableWorlds();
    this.selectedWorldIndex = 0;
    this.errorMessage = '';
    this.inputFocused = true;
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.gameLoop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
  }

  onExit(): void {
    this.gameLoop?.stop();
    this.gameLoop = null;
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
  }

  update(dt: number): void {
    this.caretBlinkMs += dt * 1000;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const panelX = NewGameScreen.PANEL_MARGIN_X;
    const panelY = NewGameScreen.PANEL_MARGIN_Y;
    const panelWidth = this.canvas.width - NewGameScreen.PANEL_MARGIN_X * 2;
    const panelHeight = this.canvas.height - NewGameScreen.PANEL_MARGIN_Y * 2;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    this.backButtonRect = { x: panelX + 18, y: panelY + 12, width: 90, height: 24 };
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "15px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('<- BACK', this.backButtonRect.x, this.backButtonRect.y + 2);
    ctx.textAlign = 'center';
    ctx.fillText('NEW GAME', panelX + panelWidth / 2, panelY + 13);
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + NewGameScreen.HEADER_HEIGHT);
    ctx.lineTo(panelX + panelWidth, panelY + NewGameScreen.HEADER_HEIGHT);
    ctx.stroke();

    const contentX = panelX + 28;
    let y = panelY + NewGameScreen.HEADER_HEIGHT + 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText('PILOT NAME', contentX, y);
    y += 22;
    this.inputRect = { x: contentX, y, width: panelWidth - 56, height: 36 };
    ctx.strokeStyle = this.inputFocused ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
    ctx.strokeRect(this.inputRect.x, this.inputRect.y, this.inputRect.width, this.inputRect.height);
    ctx.font = "18px 'Courier New', monospace";
    const displayName = this.pilotName || '';
    const caretVisible = Math.floor(this.caretBlinkMs / 500) % 2 === 0 && this.inputFocused;
    ctx.fillText(`${displayName}${caretVisible ? '_' : ''}`, this.inputRect.x + 10, this.inputRect.y + 9);

    y += 58;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('SELECT WORLD', contentX, y);
    y += 20;

    this.worldRects = [];
    for (let i = 0; i < this.worlds.length; i += 1) {
      const world = this.worlds[i];
      const hovered = i === this.hoveredWorldIndex;
      const selected = i === this.selectedWorldIndex;
      const rowY = y + i * 74;
      this.worldRects.push({ x: contentX, y: rowY, width: panelWidth - 56, height: 68, index: i });
      ctx.fillStyle = selected ? 'rgba(64, 192, 255, 0.12)' : hovered ? 'rgba(232, 232, 240, 0.06)' : 'transparent';
      ctx.fillRect(contentX, rowY, panelWidth - 56, 68);
      ctx.strokeStyle = selected ? COLOURS.UI_ACCENT : hovered ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
      ctx.strokeRect(contentX, rowY, panelWidth - 56, 68);
      ctx.fillStyle = selected ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
      ctx.font = "16px 'Courier New', monospace";
      ctx.fillText(`${selected ? '●' : '○'} ${world.name}`, contentX + 10, rowY + 10);
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(this.truncate(world.description, 86), contentX + 24, rowY + 32);
      ctx.fillText(`Seed: ${world.seed}`, contentX + 24, rowY + 50);
    }

    const importY = y + this.worlds.length * 74;
    this.importRect = { x: contentX, y: importY, width: panelWidth - 56, height: 36 };
    ctx.strokeStyle = this.hoveredImport ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
    ctx.strokeRect(this.importRect.x, this.importRect.y, this.importRect.width, this.importRect.height);
    ctx.fillStyle = this.hoveredImport ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText('○ (import a world file)', this.importRect.x + 10, this.importRect.y + 10);

    this.startButtonRect = {
      x: panelX + panelWidth / 2 - 120,
      y: panelY + panelHeight - 78,
      width: 240,
      height: 44
    };
    const canStart = this.canStart();
    ctx.strokeStyle = canStart ? (this.hoveredStart ? COLOURS.UI_PRIMARY : COLOURS.UI_ACCENT) : '#3a3a4a';
    ctx.strokeRect(
      this.startButtonRect.x,
      this.startButtonRect.y,
      this.startButtonRect.width,
      this.startButtonRect.height
    );
    ctx.fillStyle = canStart ? COLOURS.UI_PRIMARY : '#6a6a78';
    ctx.textAlign = 'center';
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText('[ START GAME ]', this.startButtonRect.x + this.startButtonRect.width / 2, this.startButtonRect.y + 13);

    const selectedWorld = this.getSelectedWorld();
    if (selectedWorld) {
      const existingSave = WorldState.listSaves().find((save) => save.worldSeed === selectedWorld.seed);
      if (existingSave) {
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOURS.WARNING;
        ctx.font = "12px 'Courier New', monospace";
        ctx.fillText(
          'A save already exists for this world. Starting a new game will overwrite it.',
          contentX,
          panelY + panelHeight - 22
        );
      }
    }
    if (this.errorMessage) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLOURS.DANGER;
      ctx.fillText(this.errorMessage, contentX, panelY + panelHeight - 40);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText('Tab: switch focus - Arrow keys: choose world - Enter: start', contentX, panelY + panelHeight - 12);
  }

  private getSelectedWorld(): WorldEntry | null {
    return this.worlds[this.selectedWorldIndex] ?? null;
  }

  private canStart(): boolean {
    return this.pilotName.trim().length > 0 && !!this.getSelectedWorld() && !this.isStarting;
  }

  private async startGame(): Promise<void> {
    const world = this.getSelectedWorld();
    if (!world || !this.canStart()) {
      return;
    }
    this.isStarting = true;
    this.errorMessage = '';
    try {
      WorldState.deleteSave(world.seed);
      const worldFile = await loadWorldForEntry(world);
      const startSector = worldFile.startingConditions.sectorCoord;
      const worldState = new WorldState(worldFile, startSector, {
        id: 'player',
        hullSpecId: 'fighter_mk1',
        factionId: null,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
        currentHP: 100,
        maxHP: 100,
        fuel: 100,
        maxFuel: 100,
        credits: 0,
        cargo: [],
        equipmentSlots: [],
        weaponLoadout: [],
        activeMissions: [],
        brain: null,
        memoryCards: [],
        activeCardId: null,
        activeMode: null,
        guardMode: false,
        autoBrakeLinearEnabled: false,
        autoBrakeRotationEnabled: false,
        fleetRole: 'lead',
        targets: {},
        isPlayerControlled: true,
        insuranceActive: true,
        lastLandedLandableId: null
      });
      worldState.updatePlayerShipState(buildStarterShipState(worldState));
      worldState.setPilotName(this.pilotName.trim());
      worldState.saveToLocalStorage();
      this.onExit();
      this.screenManager.pop();
      launchFlightScreen(this.canvas, this.ctx, this.screenManager, worldState);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to start game.';
      this.isStarting = false;
    }
  }

  private importWorldFromDisk(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        const raw = await file.text();
        const worldFile = JSON.parse(raw) as WorldFile;
        if (!worldFile?.metadata?.seed || !worldFile?.sectors || !worldFile?.factions) {
          throw new Error('Invalid world file format.');
        }
        const imported = saveImportedWorld(worldFile);
        this.worlds = getAvailableWorlds();
        this.selectedWorldIndex = this.worlds.findIndex((entry) => entry.seed === imported.seed);
        if (this.selectedWorldIndex < 0) {
          this.selectedWorldIndex = 0;
        }
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'World import failed.';
      }
    };
    input.click();
  }

  private goBack(): void {
    this.onExit();
    this.screenManager.pop();
    this.screenManager.top()?.onEnter();
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

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  }
}

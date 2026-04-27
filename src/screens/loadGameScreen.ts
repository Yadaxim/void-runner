import { COLOURS } from '../constants';
import { GameLoop } from '../core/gameLoop';
import type { SaveMetadata } from '../core/worldState';
import { WorldState } from '../core/worldState';
import { getWorldBySeed, loadWorldForEntry } from '../core/worldRegistry';
import { WorldFileValidationError } from '../world/validation';
import { mountValidationErrorPanel } from '../world/validation-ui';
import { launchFlightScreen } from './flightScreenFactory';
import type { Screen, ScreenManager } from './screenManager';

export class LoadGameScreen implements Screen {
  private static readonly PANEL_MARGIN_X = 80;
  private static readonly PANEL_MARGIN_Y = 56;
  private static readonly HEADER_HEIGHT = 46;
  private gameLoop: GameLoop | null = null;
  private saves: SaveMetadata[] = [];
  private actionRects: Array<{ type: 'resume' | 'delete'; seed: number; x: number; y: number; width: number; height: number }> =
    [];
  private backRect: { x: number; y: number; width: number; height: number } | null = null;
  private pendingDeleteSeed: number | null = null;
  private confirmRects: Array<{ yes: boolean; x: number; y: number; width: number; height: number }> = [];
  private selectedSaveIndex = 0;
  private hoveredAction: { seed: number; type: 'resume' | 'delete' } | null = null;
  private errorMessage = '';

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.goBack();
      return;
    }
    if (this.saves.length === 0) {
      return;
    }
    if (this.pendingDeleteSeed !== null) {
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Tab') {
        event.preventDefault();
        return;
      }
      if (event.code === 'Enter') {
        event.preventDefault();
        WorldState.deleteSave(this.pendingDeleteSeed);
        this.pendingDeleteSeed = null;
        this.refreshSaves();
      }
      return;
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
      const delta = event.code === 'ArrowUp' ? -1 : 1;
      this.selectedSaveIndex =
        (this.selectedSaveIndex + delta + this.saves.length) % Math.max(1, this.saves.length);
      return;
    }
    if (event.code === 'Delete') {
      event.preventDefault();
      const save = this.saves[this.selectedSaveIndex];
      if (save) {
        this.pendingDeleteSeed = save.worldSeed;
      }
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      const save = this.saves[this.selectedSaveIndex];
      if (save) {
        void this.resumeSave(save.worldSeed);
      }
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) {
      this.hoveredAction = null;
      return;
    }
    this.hoveredAction = null;
    for (const action of this.actionRects) {
      if (this.inRect(point.x, point.y, action)) {
        this.hoveredAction = { seed: action.seed, type: action.type };
        break;
      }
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) return;
    if (this.backRect && this.inRect(point.x, point.y, this.backRect)) {
      this.goBack();
      return;
    }
    for (const confirm of this.confirmRects) {
      if (this.inRect(point.x, point.y, confirm)) {
        if (confirm.yes && this.pendingDeleteSeed !== null) {
          WorldState.deleteSave(this.pendingDeleteSeed);
          this.pendingDeleteSeed = null;
          this.refreshSaves();
        } else {
          this.pendingDeleteSeed = null;
        }
        return;
      }
    }
    for (const action of this.actionRects) {
      if (!this.inRect(point.x, point.y, action)) continue;
      if (action.type === 'resume') {
        void this.resumeSave(action.seed);
      } else {
        this.pendingDeleteSeed = action.seed;
      }
      return;
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    this.refreshSaves();
    this.errorMessage = '';
    this.selectedSaveIndex = 0;
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

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const panelX = LoadGameScreen.PANEL_MARGIN_X;
    const panelY = LoadGameScreen.PANEL_MARGIN_Y;
    const panelWidth = this.canvas.width - LoadGameScreen.PANEL_MARGIN_X * 2;
    const panelHeight = this.canvas.height - LoadGameScreen.PANEL_MARGIN_Y * 2;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + LoadGameScreen.HEADER_HEIGHT);
    ctx.lineTo(panelX + panelWidth, panelY + LoadGameScreen.HEADER_HEIGHT);
    ctx.stroke();

    this.backRect = { x: panelX + 18, y: panelY + 12, width: 90, height: 24 };
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "15px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('<- BACK', this.backRect.x, this.backRect.y + 2);
    ctx.textAlign = 'center';
    ctx.fillText('LOAD GAME', panelX + panelWidth / 2, panelY + 14);

    this.actionRects = [];
    this.confirmRects = [];

    if (this.saves.length === 0) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "18px 'Courier New', monospace";
      ctx.fillText('NO SAVED GAMES FOUND', panelX + panelWidth / 2, panelY + panelHeight / 2);
      return;
    }

    const cardX = panelX + 28;
    let cardY = panelY + LoadGameScreen.HEADER_HEIGHT + 18;
    const cardWidth = panelWidth - 56;
    for (const save of this.saves) {
      const selected = this.saves[this.selectedSaveIndex]?.worldSeed === save.worldSeed;
      ctx.strokeStyle = selected ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
      if (selected) {
        ctx.fillStyle = 'rgba(64, 192, 255, 0.07)';
        ctx.fillRect(cardX, cardY, cardWidth, 118);
      }
      ctx.strokeRect(cardX, cardY, cardWidth, 118);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.textAlign = 'left';
      ctx.font = "16px 'Courier New', monospace";
      ctx.fillText(save.worldName, cardX + 12, cardY + 10);
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillText(`Pilot: ${save.pilotName}`, cardX + 12, cardY + 33);
      ctx.fillText(`Sector: ${save.currentSectorCoord.x} : ${save.currentSectorCoord.y}`, cardX + 12, cardY + 52);
      ctx.fillText(`Credits: ${Math.round(save.credits)} C`, cardX + 250, cardY + 52);
      ctx.fillText(`Ship: ${save.shipHullName}`, cardX + 12, cardY + 71);
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(`Play time: ${this.formatPlayTime(save.playTimeSeconds)}`, cardX + 12, cardY + 90);
      ctx.fillText(`Last played: ${this.formatRelative(save.savedAt)}`, cardX + 250, cardY + 90);

      const resumeRect = { x: cardX + cardWidth - 130, y: cardY + 24, width: 100, height: 28 };
      const deleteRect = { x: cardX + cardWidth - 130, y: cardY + 60, width: 100, height: 28 };
      const hoverResume = this.hoveredAction?.seed === save.worldSeed && this.hoveredAction.type === 'resume';
      const hoverDelete = this.hoveredAction?.seed === save.worldSeed && this.hoveredAction.type === 'delete';
      ctx.strokeStyle = hoverResume ? COLOURS.UI_PRIMARY : COLOURS.UI_ACCENT;
      ctx.strokeRect(resumeRect.x, resumeRect.y, resumeRect.width, resumeRect.height);
      ctx.fillStyle = COLOURS.UI_PRIMARY;
      ctx.textAlign = 'center';
      ctx.fillText('[RESUME]', resumeRect.x + resumeRect.width / 2, resumeRect.y + 8);
      ctx.strokeStyle = hoverDelete ? COLOURS.WARNING : COLOURS.DANGER;
      ctx.strokeRect(deleteRect.x, deleteRect.y, deleteRect.width, deleteRect.height);
      ctx.fillStyle = hoverDelete ? COLOURS.WARNING : COLOURS.DANGER;
      ctx.fillText('[DELETE]', deleteRect.x + deleteRect.width / 2, deleteRect.y + 8);

      this.actionRects.push({ type: 'resume', seed: save.worldSeed, ...resumeRect });
      this.actionRects.push({ type: 'delete', seed: save.worldSeed, ...deleteRect });

      if (this.pendingDeleteSeed === save.worldSeed) {
        const overlayY = cardY + 96;
        ctx.fillStyle = COLOURS.WARNING;
        ctx.textAlign = 'left';
        ctx.fillText('ARE YOU SURE?', cardX + 12, overlayY);
        const yesRect = { x: cardX + 150, y: overlayY - 4, width: 60, height: 20 };
        const noRect = { x: cardX + 220, y: overlayY - 4, width: 60, height: 20 };
        ctx.strokeStyle = COLOURS.DANGER;
        ctx.strokeRect(yesRect.x, yesRect.y, yesRect.width, yesRect.height);
        ctx.strokeStyle = COLOURS.UI_SECONDARY;
        ctx.strokeRect(noRect.x, noRect.y, noRect.width, noRect.height);
        ctx.fillStyle = COLOURS.DANGER;
        ctx.fillText('YES', yesRect.x + 18, yesRect.y + 3);
        ctx.fillStyle = COLOURS.UI_PRIMARY;
        ctx.fillText('NO', noRect.x + 22, noRect.y + 3);
        this.confirmRects.push({ yes: true, ...yesRect });
        this.confirmRects.push({ yes: false, ...noRect });
      }

      cardY += 132;
    }

    if (this.errorMessage) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.textAlign = 'left';
      ctx.fillText(this.errorMessage, panelX + 24, panelY + panelHeight - 24);
    }
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.textAlign = 'left';
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText('Arrow keys: select save - Enter: resume - Delete: remove', panelX + 28, panelY + panelHeight - 12);
  }

  private refreshSaves(): void {
    this.saves = WorldState.listSaves();
  }

  private async resumeSave(seed: number): Promise<void> {
    this.errorMessage = '';
    const worldEntry = getWorldBySeed(seed);
    if (!worldEntry) {
      this.errorMessage = `World for save seed ${seed} not found.`;
      return;
    }
    try {
      const worldFile = await loadWorldForEntry(worldEntry);
      const worldState = WorldState.loadFromLocalStorage(worldFile);
      if (!worldState) {
        throw new Error('Save data could not be loaded.');
      }
      this.onExit();
      this.screenManager.pop();
      launchFlightScreen(this.canvas, this.ctx, this.screenManager, worldState);
    } catch (error) {
      if (error instanceof WorldFileValidationError) {
        mountValidationErrorPanel({
          title: 'World file failed validation',
          result: error.result,
          onDismiss: () => {},
          extraButtons: [{ label: 'Back to Main Menu', onClick: () => this.goBack() }]
        });
        return;
      }
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load save.';
    }
  }

  private goBack(): void {
    this.onExit();
    this.screenManager.pop();
    this.screenManager.top()?.onEnter();
  }

  private formatPlayTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  private formatRelative(timestampMs: number): string {
    const diff = Math.max(0, Date.now() - timestampMs);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes > 0) {
      return `${minutes} min ago`;
    }
    return 'just now';
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

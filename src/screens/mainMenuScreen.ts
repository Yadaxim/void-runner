import { COLOURS } from '../constants';
import { GameLoop } from '../core/gameLoop';
import { WorldState } from '../core/worldState';
import { Vector2 } from '../physics/vector2';
import { BackgroundLayer } from '../renderer/layers/backgroundLayer';
import type { ScreenManager, Screen } from './screenManager';
import { NewGameScreen } from './newGameScreen';
import { LoadGameScreen } from './loadGameScreen';
import { WorldGenScreen } from './worldGenScreen';
import { GameManualScreen } from './gameManualScreen';

interface MenuButton {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export class MainMenuScreen implements Screen {
  private static readonly PANEL_MARGIN_X = 80;
  private static readonly PANEL_MARGIN_Y = 56;
  private static readonly HEADER_HEIGHT = 46;
  private gameLoop: GameLoop | null = null;
  private readonly buttonRects: Array<{ x: number; y: number; width: number; height: number }> = [];
  private selectedIndex = 0;
  private hoveredIndex = -1;
  private backgroundLayer: BackgroundLayer | null = null;
  private driftX = 0;
  private driftY = 0;
  private hasSaves = false;

  private readonly onMouseMove = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) {
      return;
    }
    this.hoveredIndex = this.buttonRects.findIndex((rect) => this.inRect(point.x, point.y, rect));
    if (this.hoveredIndex >= 0) {
      this.selectedIndex = this.hoveredIndex;
    }
  };
  private readonly onMouseLeave = (): void => {
    this.hoveredIndex = -1;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (!point) {
      return;
    }
    const index = this.buttonRects.findIndex((rect) => this.inRect(point.x, point.y, rect));
    if (index >= 0) {
      this.selectedIndex = index;
      this.activateSelected();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1);
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1);
    } else if (event.code === 'Enter') {
      event.preventDefault();
      this.activateSelected();
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    this.hasSaves = WorldState.listSaves().length > 0;
    this.backgroundLayer = new BackgroundLayer(this.ctx, this.canvas.width, this.canvas.height, 0, {
      hasNebula: false,
      nebulaHue: 0,
      nebulaIntensity: 0,
      starDensityMultiplier: 1
    });
    this.selectedIndex = this.hasSaves ? 0 : 0;
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
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
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
  }

  update(dt: number): void {
    this.driftX += 8 * dt;
    this.driftY += 3 * dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.backgroundLayer?.render(new Vector2(this.driftX, this.driftY));

    const panelX = MainMenuScreen.PANEL_MARGIN_X;
    const panelY = MainMenuScreen.PANEL_MARGIN_Y;
    const panelWidth = this.canvas.width - MainMenuScreen.PANEL_MARGIN_X * 2;
    const panelHeight = this.canvas.height - MainMenuScreen.PANEL_MARGIN_Y * 2;
    ctx.fillStyle = 'rgba(8, 8, 16, 0.3)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + MainMenuScreen.HEADER_HEIGHT);
    ctx.lineTo(panelX + panelWidth, panelY + MainMenuScreen.HEADER_HEIGHT);
    ctx.stroke();

    const titleY = panelY + 16;
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "28px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('VOID RUNNER', this.canvas.width / 2, titleY);
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.beginPath();
    ctx.moveTo(this.canvas.width / 2 - 160, panelY + MainMenuScreen.HEADER_HEIGHT - 6);
    ctx.lineTo(this.canvas.width / 2 + 160, panelY + MainMenuScreen.HEADER_HEIGHT - 6);
    ctx.stroke();

    const buttons = this.getButtons();
    const buttonWidth = 320;
    const buttonHeight = 44;
    const gap = 16;
    const startY = panelY + MainMenuScreen.HEADER_HEIGHT + 64;
    this.buttonRects.length = 0;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < buttons.length; i += 1) {
      const x = (this.canvas.width - buttonWidth) / 2;
      const y = startY + i * (buttonHeight + gap);
      this.buttonRects.push({ x, y, width: buttonWidth, height: buttonHeight });
      const hovered = i === this.hoveredIndex;
      const selected = i === this.selectedIndex;
      const disabled = !!buttons[i].disabled;
      ctx.strokeStyle = disabled ? '#3a3a4a' : selected ? COLOURS.UI_ACCENT : hovered ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
      ctx.fillStyle = disabled
        ? 'rgba(32, 32, 48, 0.85)'
        : selected
          ? 'rgba(16, 28, 44, 0.9)'
          : hovered
            ? 'rgba(12, 16, 28, 0.9)'
            : 'rgba(8, 8, 16, 0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, buttonWidth, buttonHeight);
      ctx.fillRect(x, y, buttonWidth, buttonHeight);
      ctx.fillStyle = disabled ? '#7a7a86' : selected || hovered ? COLOURS.UI_PRIMARY : COLOURS.UI_SECONDARY;
      ctx.font = "18px 'Courier New', monospace";
      ctx.fillText(buttons[i].label, x + buttonWidth / 2, y + buttonHeight / 2);
    }

    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.textBaseline = 'alphabetic';
    const saveLabel = this.hasSaves ? `${WorldState.listSaves().length} save(s) found` : 'no saves found';
    ctx.fillText(`v0.1 - Test Galaxy loaded - ${saveLabel}`, this.canvas.width / 2, panelY + panelHeight - 28);
    ctx.fillText('Arrow keys: navigate - Enter: select', this.canvas.width / 2, panelY + panelHeight - 14);
  }

  private getButtons(): MenuButton[] {
    return [
      {
        label: '[ NEW GAME ]',
        onClick: () => {
          this.onExit();
          this.screenManager.push(new NewGameScreen(this.canvas, this.ctx, this.screenManager));
        }
      },
      {
        label: this.hasSaves ? '[ LOAD GAME ]' : '[ LOAD GAME ] (no saves)',
        disabled: !this.hasSaves,
        onClick: () => {
          if (!this.hasSaves) {
            return;
          }
          this.onExit();
          this.screenManager.push(new LoadGameScreen(this.canvas, this.ctx, this.screenManager));
        }
      },
      {
        label: '[ WORLD GENERATOR ]',
        onClick: () => {
          this.onExit();
          this.screenManager.push(new WorldGenScreen(this.canvas, this.ctx, this.screenManager));
        }
      },
      {
        label: '[ GAME MANUAL ]',
        onClick: () => {
          this.onExit();
          this.screenManager.push(new GameManualScreen(this.canvas, this.ctx, this.screenManager));
        }
      }
    ];
  }

  private moveSelection(delta: number): void {
    const buttons = this.getButtons();
    let next = this.selectedIndex;
    for (let i = 0; i < buttons.length; i += 1) {
      next = (next + delta + buttons.length) % buttons.length;
      if (!buttons[next].disabled) {
        this.selectedIndex = next;
        return;
      }
    }
  }

  private activateSelected(): void {
    const buttons = this.getButtons();
    const selected = buttons[this.selectedIndex];
    if (!selected || selected.disabled) {
      return;
    }
    selected.onClick();
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
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY
    };
  }
}

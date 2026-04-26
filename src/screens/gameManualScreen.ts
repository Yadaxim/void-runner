import { COLOURS } from '../constants';
import { GameLoop } from '../core/gameLoop';
import type { Screen, ScreenManager } from './screenManager';

export class GameManualScreen implements Screen {
  private gameLoop: GameLoop | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || event.code === 'Enter') {
      event.preventDefault();
      this.goBack();
    }
  };

  private readonly onMouseDown = (): void => {
    this.goBack();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.gameLoop = new GameLoop({
      update: () => undefined,
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
  }

  onExit(): void {
    this.gameLoop?.stop();
    this.gameLoop = null;
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    const panelX = 70;
    const panelY = 52;
    const panelWidth = this.canvas.width - 140;
    const panelHeight = this.canvas.height - 104;

    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(8, 8, 16, 0.95)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "24px 'Courier New', monospace";
    ctx.fillText('GAME MANUAL', panelX + 20, panelY + 16);

    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillText('Flight Controls', panelX + 20, panelY + 62);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    const controls = [
      'Arrow Up/Down: forward/reverse thrust',
      'Arrow Left/Right: rotate ship',
      'Q: toggle linear auto-brake',
      'E: toggle rotation auto-brake',
      'L: land when prompt appears',
      'M: toggle active missions panel',
      'Tab: cycle ship target, G: cycle landable target',
      'Z/X/C/V/B: weapon groups',
      'Esc: pause menu, H: in-flight help overlay'
    ];
    let y = panelY + 88;
    for (const line of controls) {
      ctx.fillText(`- ${line}`, panelX + 28, y);
      y += 20;
    }

    y += 6;
    ctx.fillStyle = COLOURS.UI_ACCENT;
    ctx.fillText('Mission Loop', panelX + 20, y);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    y += 24;
    const loop = [
      '1) Land at a station/planet with Mission Board service.',
      '2) Accept cargo missions that fit remaining cargo space.',
      '3) Fly to destination sector and watch for "LAND TO DELIVER".',
      '4) Land at destination to auto-deliver cargo for credits/rep.',
      '5) Repeat with multiple missions up to cargo capacity.'
    ];
    for (const line of loop) {
      ctx.fillText(line, panelX + 28, y);
      y += 20;
    }

    y += 8;
    ctx.fillStyle = COLOURS.WARNING;
    ctx.fillText('Landing tip: engage Q and E auto-brakes before final approach.', panelX + 20, y);

    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillText('Press Esc/Enter or click anywhere to return', panelX + 20, panelY + panelHeight - 26);
  }

  private goBack(): void {
    this.onExit();
    this.screenManager.pop();
    this.screenManager.top()?.onEnter();
  }
}

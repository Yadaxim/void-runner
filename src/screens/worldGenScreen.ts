import { COLOURS } from '../constants';
import { GameLoop } from '../core/gameLoop';
import type { WorldFile } from '../types';
import { mountValidationErrorPanel } from '../world/validation-ui';
import { countWorldExportStats, exportValidatedWorldFile, formatExportSuccessLine } from '../world/worldFileExport';
import { WorldGenPipeline } from '../worldgen/pipeline';
import type { Screen, ScreenManager } from './screenManager';

export class WorldGenScreen implements Screen {
  private static readonly PANEL_MARGIN_X = 80;
  private static readonly PANEL_MARGIN_Y = 56;
  private static readonly HEADER_HEIGHT = 46;

  private gameLoop: GameLoop | null = null;
  private seedStr = '424242';
  private worldNameStr = 'Generated World';
  private generating = false;
  private genError = '';
  private progressLabel = '';
  private generatedWorld: WorldFile | null = null;
  private exportSuccessLine = '';
  private backRect: { x: number; y: number; width: number; height: number } | null = null;
  private seedRect: { x: number; y: number; width: number; height: number } | null = null;
  private nameRect: { x: number; y: number; width: number; height: number } | null = null;
  private generateRect: { x: number; y: number; width: number; height: number } | null = null;
  private exportRect: { x: number; y: number; width: number; height: number } | null = null;
  private focusedField: 'seed' | 'name' | null = null;
  private hoveredGenerate = false;
  private hoveredExport = false;

  private progressUnsub: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.goBack();
      return;
    }
    if (this.generating) {
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      this.focusedField = this.focusedField === 'seed' ? 'name' : 'seed';
      return;
    }
    if (this.focusedField === 'seed') {
      if (event.code === 'Backspace') {
        event.preventDefault();
        this.seedStr = this.seedStr.slice(0, -1);
        return;
      }
      if (event.key.length === 1 && /[0-9-]/.test(event.key) && this.seedStr.length < 16) {
        this.seedStr += event.key;
      }
      return;
    }
    if (this.focusedField === 'name') {
      if (event.code === 'Backspace') {
        event.preventDefault();
        this.worldNameStr = this.worldNameStr.slice(0, -1);
        return;
      }
      if (event.key.length === 1 && this.worldNameStr.length < 40) {
        this.worldNameStr += event.key;
      }
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const p = this.getCanvasPoint(event);
    if (!p) return;
    if (this.backRect && this.inRect(p.x, p.y, this.backRect)) {
      this.goBack();
      return;
    }
    if (this.seedRect && this.inRect(p.x, p.y, this.seedRect)) {
      this.focusedField = 'seed';
      return;
    }
    if (this.nameRect && this.inRect(p.x, p.y, this.nameRect)) {
      this.focusedField = 'name';
      return;
    }
    this.focusedField = null;
    if (this.generateRect && this.inRect(p.x, p.y, this.generateRect) && !this.generating) {
      void this.runGeneration();
      return;
    }
    if (this.exportRect && this.inRect(p.x, p.y, this.exportRect) && this.generatedWorld && !this.generating) {
      this.runExport();
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const p = this.getCanvasPoint(event);
    if (!p) {
      this.hoveredGenerate = false;
      this.hoveredExport = false;
      return;
    }
    this.hoveredGenerate = !!(this.generateRect && this.inRect(p.x, p.y, this.generateRect));
    this.hoveredExport = !!(this.exportRect && this.inRect(p.x, p.y, this.exportRect));
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly screenManager: ScreenManager
  ) {}

  onEnter(): void {
    this.genError = '';
    this.progressLabel = '';
    this.exportSuccessLine = '';
    this.focusedField = 'seed';
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.gameLoop = new GameLoop({
      update: () => {},
      render: () => this.render(this.ctx)
    });
    this.gameLoop.start();
  }

  onExit(): void {
    this.progressUnsub?.();
    this.progressUnsub = null;
    this.gameLoop?.stop();
    this.gameLoop = null;
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const panelX = WorldGenScreen.PANEL_MARGIN_X;
    const panelY = WorldGenScreen.PANEL_MARGIN_Y;
    const panelW = this.canvas.width - WorldGenScreen.PANEL_MARGIN_X * 2;
    const panelH = this.canvas.height - WorldGenScreen.PANEL_MARGIN_Y * 2;
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + WorldGenScreen.HEADER_HEIGHT);
    ctx.lineTo(panelX + panelW, panelY + WorldGenScreen.HEADER_HEIGHT);
    ctx.stroke();

    this.backRect = { x: panelX + 18, y: panelY + 12, width: 90, height: 24 };
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "15px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('<- BACK', this.backRect.x, this.backRect.y + 2);
    ctx.textAlign = 'center';
    ctx.fillText('WORLD GENERATOR', panelX + panelW / 2, panelY + 13);

    const cx = panelX + 28;
    let y = panelY + WorldGenScreen.HEADER_HEIGHT + 20;
    ctx.textAlign = 'left';
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('SEED (integer)', cx, y);
    y += 22;
    this.seedRect = { x: cx, y, width: panelW - 56, height: 34 };
    ctx.strokeStyle = this.focusedField === 'seed' ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
    ctx.strokeRect(this.seedRect.x, this.seedRect.y, this.seedRect.width, this.seedRect.height);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText(this.seedStr || '(empty)', cx + 10, y + 9);
    y += 48;
    ctx.fillText('WORLD NAME', cx, y);
    y += 22;
    this.nameRect = { x: cx, y, width: panelW - 56, height: 34 };
    ctx.strokeStyle = this.focusedField === 'name' ? COLOURS.UI_ACCENT : COLOURS.UI_SECONDARY;
    ctx.strokeRect(this.nameRect.x, this.nameRect.y, this.nameRect.width, this.nameRect.height);
    ctx.fillText(this.worldNameStr || '(empty)', cx + 10, y + 9);
    y += 52;

    this.generateRect = { x: cx, y, width: 200, height: 40 };
    ctx.strokeStyle = this.hoveredGenerate ? COLOURS.UI_PRIMARY : COLOURS.UI_ACCENT;
    ctx.strokeRect(this.generateRect.x, this.generateRect.y, this.generateRect.width, this.generateRect.height);
    ctx.fillStyle = this.generating ? COLOURS.UI_SECONDARY : COLOURS.UI_PRIMARY;
    ctx.fillText(this.generating ? 'GENERATING…' : '[ GENERATE ]', cx + 14, y + 11);
    y += 52;

    if (this.progressLabel) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(this.progressLabel, cx, y);
      y += 22;
    }
    if (this.genError) {
      ctx.fillStyle = COLOURS.DANGER;
      ctx.font = "12px 'Courier New', monospace";
      const lines = this.wrapText(this.genError, Math.floor((panelW - 56) / 7.2));
      for (const line of lines.slice(0, 6)) {
        ctx.fillText(line, cx, y);
        y += 16;
      }
      y += 8;
    }

    this.exportRect = { x: cx, y, width: 220, height: 40 };
    const canExport = !!this.generatedWorld && !this.generating;
    ctx.strokeStyle = canExport ? (this.hoveredExport ? COLOURS.UI_PRIMARY : COLOURS.UI_ACCENT) : '#3a3a4a';
    ctx.strokeRect(this.exportRect.x, this.exportRect.y, this.exportRect.width, this.exportRect.height);
    ctx.fillStyle = canExport ? COLOURS.UI_PRIMARY : '#5a5a68';
    ctx.fillText('[ EXPORT JSON ]', cx + 18, y + 11);
    y += 52;

    if (this.exportSuccessLine) {
      ctx.fillStyle = COLOURS.SAFE;
      ctx.font = "13px 'Courier New', monospace";
      ctx.fillText(this.exportSuccessLine, cx, y);
    }

    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.fillText('Tab: switch field — Export runs validation before download', cx, panelY + panelH - 16);
  }

  private async runGeneration(): Promise<void> {
    this.generating = true;
    this.genError = '';
    this.generatedWorld = null;
    this.exportSuccessLine = '';
    this.progressLabel = '';
    const seed = Number.parseInt(this.seedStr, 10);
    if (!Number.isFinite(seed)) {
      this.genError = 'Enter a numeric seed.';
      this.generating = false;
      return;
    }
    const pipeline = new WorldGenPipeline();
    this.progressUnsub = pipeline.onProgress((ev) => {
      this.progressLabel = `Stage ${ev.stage}/${ev.total}: ${ev.stageName}`;
    });
    try {
      const world = await pipeline.run({
        seed,
        worldName: this.worldNameStr.trim() || 'Generated World'
      });
      this.generatedWorld = world;
    } catch (e) {
      this.genError = e instanceof Error ? e.message : 'World generation failed.';
    } finally {
      this.progressUnsub?.();
      this.progressUnsub = null;
      this.generating = false;
    }
  }

  private runExport(): void {
    const world = this.generatedWorld;
    if (!world) {
      return;
    }
    const safeName = (world.metadata.name || 'world').replace(/[^a-z0-9_-]+/gi, '_');
    const filename = `${safeName}_${world.metadata.seed}.json`;
    const result = exportValidatedWorldFile(world, (json) => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
    if (!result.ok) {
      this.exportSuccessLine = '';
      mountValidationErrorPanel({
        title: 'Cannot export world file',
        result,
        onDismiss: () => {}
      });
      return;
    }
    const stats = countWorldExportStats(world);
    this.exportSuccessLine = formatExportSuccessLine(stats);
  }

  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) {
      lines.push(cur);
    }
    return lines.length ? lines : [text];
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
}

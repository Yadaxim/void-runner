import { COLOURS, RADIATION_VIGNETTE_MAX_OPACITY } from '../constants';
import type { WorldState } from '../core/worldState';
import type { GridCoord } from '../types';
import type { Screen, ScreenManager } from './screenManager';

/** Full-grid galaxy map: factions, visited state, radiation overlay, hyperspace target selection (jump in Session 6). */
export class GalaxyMapScreen implements Screen {
  private cursor: GridCoord;
  private pulseMs = 0;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' || event.code === 'KeyK') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.worldState.setHyperspaceTargetCoord({ ...this.cursor });
      this.worldState.saveToLocalStorage();
      return;
    }
    if (event.code === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      this.worldState.setHyperspaceTargetCoord(null);
      this.worldState.saveToLocalStorage();
      return;
    }
    let dx = 0;
    let dy = 0;
    if (event.code === 'ArrowLeft') dx = -1;
    else if (event.code === 'ArrowRight') dx = 1;
    else if (event.code === 'ArrowUp') dy = 1;
    else if (event.code === 'ArrowDown') dy = -1;
    if (dx !== 0 || dy !== 0) {
      event.preventDefault();
      event.stopPropagation();
      const next = { x: this.cursor.x + dx, y: this.cursor.y + dy };
      if (this.worldState.isSectorCoordInGalaxyBounds(next)) {
        this.cursor = next;
      }
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const p = this.canvasPoint(event);
    if (!p) {
      return;
    }
    const cell = this.pickCell(p.x, p.y);
    if (cell) {
      this.cursor = cell;
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly worldState: WorldState,
    private readonly screenManager: ScreenManager
  ) {
    this.cursor = { ...this.worldState.getCurrentSectorCoord() };
  }

  onEnter(): void {
    this.cursor = { ...this.worldState.getCurrentSectorCoord() };
    window.addEventListener('keydown', this.onKeyDown, true);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
  }

  onExit(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
  }

  update(dt: number): void {
    this.pulseMs += dt * 1000;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 14, 0.96)';
    ctx.fillRect(0, 0, w, h);

    const margin = 48;
    const legendW = 220;
    const mapAreaW = w - margin * 2 - legendW - 16;
    const mapAreaH = h - margin * 2 - 56;
    const mapX = margin;
    const mapY = margin + 36;

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "20px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GALAXY MAP', margin, margin - 8);

    const gw = this.worldState.getGridWidth();
    const gh = this.worldState.getGridHeight();
    const hw = gw / 2;
    const hh = gh / 2;
    const gap = 1;
    const cellW = (mapAreaW - (gw - 1) * gap) / gw;
    const cellH = (mapAreaH - (gh - 1) * gap) / gh;
    const mapPixelW = gw * cellW + (gw - 1) * gap;
    const mapPixelH = gh * cellH + (gh - 1) * gap;

    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(mapX - 2, mapY - 2, mapPixelW + 4, mapPixelH + 4);

    for (let row = 0; row < gh; row += 1) {
      const sy = hh - 1 - row;
      for (let col = 0; col < gw; col += 1) {
        const sx = -hw + col;
        const coord: GridCoord = { x: sx, y: sy };
        const cx = mapX + col * (cellW + gap);
        const cy = mapY + row * (cellH + gap);
        this.drawCell(ctx, coord, cx, cy, cellW, cellH);
      }
    }

    const cur = this.worldState.getCurrentSectorCoord();
    this.drawCellOutline(ctx, cur, mapX, mapY, cellW, cellH, gap, hw, hh, COLOURS.UI_ACCENT, 2);

    const pulse = 0.65 + Math.sin(this.pulseMs * 0.006) * 0.35;
    ctx.save();
    ctx.globalAlpha = pulse;
    this.drawCellOutline(ctx, this.cursor, mapX, mapY, cellW, cellH, gap, hw, hh, COLOURS.CREDITS, 1.5);
    ctx.restore();

    const target = this.worldState.getHyperspaceTargetCoord();
    if (target) {
      this.drawCellOutline(ctx, target, mapX, mapY, cellW, cellH, gap, hw, hh, COLOURS.WARNING, 1.5, [6, 4]);
    }

    this.renderLegend(ctx, w - margin - legendW, mapY, legendW, mapAreaH);
    ctx.restore();
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    coord: GridCoord,
    x: number,
    y: number,
    cw: number,
    ch: number
  ): void {
    const sector = this.worldState.getSector(coord);
    const visited = this.worldState.isVisited(coord);
    const factionId = sector?.factionId ?? null;
    const base = factionId ? this.worldState.getFactionVisual(factionId).primaryColour : 'rgba(52, 58, 74, 0.95)';

    ctx.fillStyle = base;
    ctx.fillRect(x, y, cw, ch);

    if (!visited) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(x, y, cw, ch);
    }

    const ring = this.worldState.getRadiationIntensityAtCoord(coord);
    const fringe = sector?.inRadiationZone ? Math.max(ring, sector.radiationFringeIntensity * 0.4) : ring;
    if (fringe > 0) {
      const a = Math.min(RADIATION_VIGNETTE_MAX_OPACITY, 0.15 + fringe * 0.65);
      ctx.fillStyle = `rgba(255, 90, 40, ${a})`;
      ctx.fillRect(x, y, cw, ch);
    }
  }

  private drawCellOutline(
    ctx: CanvasRenderingContext2D,
    coord: GridCoord,
    mapX: number,
    mapY: number,
    cellW: number,
    cellH: number,
    gap: number,
    hw: number,
    hh: number,
    stroke: string,
    lineWidth: number,
    dash?: [number, number]
  ): void {
    const col = coord.x + hw;
    const row = hh - 1 - coord.y;
    if (col < 0 || col >= this.worldState.getGridWidth() || row < 0 || row >= this.worldState.getGridHeight()) {
      return;
    }
    const x = mapX + col * (cellW + gap) - 1;
    const y = mapY + row * (cellH + gap) - 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash ?? []);
    ctx.strokeRect(x, y, cellW + 2, cellH + 2);
    ctx.setLineDash([]);
  }

  private renderLegend(ctx: CanvasRenderingContext2D, lx: number, ly: number, lw: number, lh: number): void {
    ctx.fillStyle = 'rgba(12, 14, 24, 0.92)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeRect(lx, ly, lw, lh);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "13px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = ly + 12;
    const line = (s: string) => {
      ctx.fillText(s, lx + 10, y);
      y += 20;
    };
    line('Arrows: move cursor');
    line('Click: jump cursor');
    line('Enter: set hyperspace');
    line('      target (saved)');
    line('Backspace: clear target');
    line('K / Esc: close map');
    line('');
    line('— Legend —');
    line('Dim: unvisited');
    line('Tint: radiation');
    line('Cyan box: you are here');
    line('Gold pulse: cursor');
    line('Orange dash: jump target');
    y += 8;
    const cur = this.cursor;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.fillText(`Cursor  ${cur.x} : ${cur.y}`, lx + 10, y);
    y += 22;
    const t = this.worldState.getHyperspaceTargetCoord();
    ctx.fillText(t ? `Target  ${t.x} : ${t.y}` : 'Target  (none)', lx + 10, y);
    y += 28;
    ctx.fillStyle = COLOURS.WARNING;
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText('Hyperspace jump executes', lx + 10, y);
    y += 16;
    ctx.fillText('in a later build (fuel /', lx + 10, y);
    y += 16;
    ctx.fillText('range / cooldown).', lx + 10, y);
  }

  private close(): void {
    this.screenManager.pop();
  }

  private canvasPoint(event: MouseEvent): { x: number; y: number } | null {
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

  private pickCell(px: number, py: number): GridCoord | null {
    const margin = 48;
    const legendW = 220;
    const mapAreaW = this.canvas.width - margin * 2 - legendW - 16;
    const mapAreaH = this.canvas.height - margin * 2 - 56;
    const mapX = margin;
    const mapY = margin + 36;
    const gw = this.worldState.getGridWidth();
    const gh = this.worldState.getGridHeight();
    const hw = gw / 2;
    const hh = gh / 2;
    const gap = 1;
    const cellW = (mapAreaW - (gw - 1) * gap) / gw;
    const cellH = (mapAreaH - (gh - 1) * gap) / gh;
    const mapPixelW = gw * cellW + (gw - 1) * gap;
    const mapPixelH = gh * cellH + (gh - 1) * gap;
    if (px < mapX || py < mapY || px > mapX + mapPixelW || py > mapY + mapPixelH) {
      return null;
    }
    const relX = px - mapX;
    const relY = py - mapY;
    const col = Math.floor(relX / (cellW + gap));
    const row = Math.floor(relY / (cellH + gap));
    if (col < 0 || col >= gw || row < 0 || row >= gh) {
      return null;
    }
    if (relX - col * (cellW + gap) > cellW || relY - row * (cellH + gap) > cellH) {
      return null;
    }
    const sx = -hw + col;
    const sy = hh - 1 - row;
    return { x: sx, y: sy };
  }
}

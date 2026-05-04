import { COLOURS, RADIATION_VIGNETTE_MAX_OPACITY } from '../constants';
import type { WorldState } from '../core/worldState';
import type { GridCoord } from '../types';
import type { Screen, ScreenManager } from './screenManager';

interface MapLayout {
  mapAreaW: number;
  mapAreaH: number;
  gridOffsetX: number;
  gridOffsetY: number;
  cellSize: number;
  gap: number;
  gw: number;
  gh: number;
  hw: number;
  hh: number;
  mapPixelW: number;
  mapPixelH: number;
  legendX: number;
  legendY: number;
  legendW: number;
  legendH: number;
  margin: number;
  titleBand: number;
}

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

    const layout = this.computeMapLayout(w, h);
    const { gw, gh, hw, hh, gap, cellSize, gridOffsetX, gridOffsetY, mapPixelW, mapPixelH, margin, titleBand } =
      layout;

    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "20px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GALAXY MAP', margin, margin - 8);

    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.strokeRect(gridOffsetX - 2, gridOffsetY - 2, mapPixelW + 4, mapPixelH + 4);

    for (let row = 0; row < gh; row += 1) {
      const sy = hh - 1 - row;
      for (let col = 0; col < gw; col += 1) {
        const sx = -hw + col;
        const coord: GridCoord = { x: sx, y: sy };
        const cx = gridOffsetX + col * (cellSize + gap);
        const cy = gridOffsetY + row * (cellSize + gap);
        this.drawCell(ctx, coord, cx, cy, cellSize, cellSize);
      }
    }

    const cur = this.worldState.getCurrentSectorCoord();
    this.drawCellOutline(ctx, cur, layout, COLOURS.UI_ACCENT, 2);

    const pulse = 0.65 + Math.sin(this.pulseMs * 0.006) * 0.35;
    ctx.save();
    ctx.globalAlpha = pulse;
    this.drawCellOutline(ctx, this.cursor, layout, COLOURS.CREDITS, 1.5);
    ctx.restore();

    const target = this.worldState.getHyperspaceTargetCoord();
    if (target) {
      this.drawCellOutline(ctx, target, layout, COLOURS.WARNING, 1.5, [6, 4]);
    }

    this.renderLegendPanel(ctx, layout);
    this.renderSectorSummary(ctx, layout);
    ctx.restore();
  }

  private computeMapLayout(canvasW: number, canvasH: number): MapLayout {
    const margin = 48;
    const titleBand = 36;
    const legendW = 280;
    const gap = 1;
    const mapAreaW = canvasW - margin * 2 - legendW - 16;
    const mapAreaH = canvasH - margin * 2 - titleBand;
    const mapX = margin;
    const mapY = margin + titleBand;
    const gw = this.worldState.getGridWidth();
    const gh = this.worldState.getGridHeight();
    const hw = gw / 2;
    const hh = gh / 2;
    const cellSize = Math.floor(
      Math.min((mapAreaW - (gw - 1) * gap) / gw, (mapAreaH - (gh - 1) * gap) / gh)
    );
    const mapPixelW = gw * cellSize + (gw - 1) * gap;
    const mapPixelH = gh * cellSize + (gh - 1) * gap;
    const gridOffsetX = mapX + (mapAreaW - mapPixelW) / 2;
    const gridOffsetY = mapY + (mapAreaH - mapPixelH) / 2;
    return {
      mapAreaW,
      mapAreaH,
      gridOffsetX,
      gridOffsetY,
      cellSize,
      gap,
      gw,
      gh,
      hw,
      hh,
      mapPixelW,
      mapPixelH,
      legendX: canvasW - margin - legendW,
      legendY: mapY,
      legendW,
      legendH: mapAreaH,
      margin,
      titleBand
    };
  }

  private drawCell(ctx: CanvasRenderingContext2D, coord: GridCoord, x: number, y: number, cw: number, ch: number): void {
    const sector = this.worldState.getSector(coord);
    const visited = this.worldState.isVisited(coord);
    const landCount = sector?.landables.length ?? 0;
    const factionId = sector?.factionId ?? null;
    const base = factionId ? this.worldState.getFactionVisual(factionId).primaryColour : 'rgba(52, 58, 74, 0.95)';

    ctx.fillStyle = base;
    ctx.fillRect(x, y, cw, ch);

    if (visited && landCount === 0) {
      ctx.fillStyle = 'rgba(22, 28, 42, 0.55)';
      ctx.fillRect(x, y, cw, ch);
    }

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

    if (visited && landCount > 0) {
      this.drawLandableDots(ctx, x, y, cw, ch, landCount);
    }
  }

  /** Small interior dots so visited port density reads at galaxy scale. */
  private drawLandableDots(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cw: number,
    ch: number,
    count: number
  ): void {
    const n = Math.min(count, 9);
    const pad = Math.max(2, Math.min(cw, ch) * 0.12);
    const innerW = Math.max(1, cw - pad * 2);
    const innerH = Math.max(1, ch - pad * 2);
    const cols = n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    ctx.fillStyle = 'rgba(220, 235, 255, 0.85)';
    const radius = Math.max(1.2, Math.min(cw, ch) * 0.07);
    for (let i = 0; i < n; i += 1) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const px = x + pad + ((c + 0.5) / cols) * innerW;
      const py = y + pad + ((r + 0.5) / rows) * innerH;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCellOutline(
    ctx: CanvasRenderingContext2D,
    coord: GridCoord,
    layout: MapLayout,
    stroke: string,
    lineWidth: number,
    dash?: [number, number]
  ): void {
    const { cellSize, gap, hw, hh, gridOffsetX, gridOffsetY, gw, gh } = layout;
    const col = coord.x + hw;
    const row = hh - 1 - coord.y;
    if (col < 0 || col >= gw || row < 0 || row >= gh) {
      return;
    }
    const px = gridOffsetX + col * (cellSize + gap) - 1;
    const py = gridOffsetY + row * (cellSize + gap) - 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash ?? []);
    ctx.strokeRect(px, py, cellSize + 2, cellSize + 2);
    ctx.setLineDash([]);
  }

  private renderLegendPanel(ctx: CanvasRenderingContext2D, layout: MapLayout): void {
    const { legendX, legendY, legendW, legendH } = layout;
    const splitY = legendY + Math.min(200, Math.floor(legendH * 0.42));
    ctx.fillStyle = 'rgba(12, 14, 24, 0.92)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.fillRect(legendX, legendY, legendW, splitY - legendY);
    ctx.strokeRect(legendX, legendY, legendW, splitY - legendY);
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = legendY + 10;
    const line = (s: string) => {
      ctx.fillText(s, legendX + 8, y);
      y += 18;
    };
    line('Arrows: move cursor');
    line('Click: select sector');
    line('Enter: set hyperspace');
    line('        target (saved)');
    line('Backspace: clear target');
    line('K / Esc: close map');
    y += 6;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "11px 'Courier New', monospace";
    line('— Positions —');
    const you = this.worldState.getCurrentSectorCoord();
    ctx.fillStyle = COLOURS.UI_ACCENT;
    line(`You     ${you.x} : ${you.y}`);
    ctx.fillStyle = COLOURS.CREDITS;
    line(`Cursor  ${this.cursor.x} : ${this.cursor.y}`);
    const t = this.worldState.getHyperspaceTargetCoord();
    ctx.fillStyle = t ? COLOURS.WARNING : COLOURS.UI_SECONDARY;
    line(t ? `Target  ${t.x} : ${t.y}` : 'Target  (none)');
    y += 8;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    line('Square grid · dots = ports');
    line('(visited, max 9 shown)');
    y += 10;
    ctx.fillStyle = COLOURS.WARNING;
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillText('Jump in a later build', legendX + 8, y);
    y += 14;
    ctx.fillText('(fuel / range / CD).', legendX + 8, y);
  }

  private renderSectorSummary(ctx: CanvasRenderingContext2D, layout: MapLayout): void {
    const { legendX, legendY, legendW, legendH } = layout;
    const splitY = legendY + Math.min(200, Math.floor(legendH * 0.42));
    const bottomH = legendY + legendH - splitY;
    if (bottomH < 48) {
      return;
    }
    const sy = splitY;
    ctx.fillStyle = 'rgba(10, 12, 22, 0.94)';
    ctx.strokeStyle = COLOURS.UI_SECONDARY;
    ctx.fillRect(legendX, sy, legendW, bottomH);
    ctx.strokeRect(legendX, sy, legendW, bottomH);

    const sector = this.worldState.getSector(this.cursor);
    const c = this.cursor;
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "12px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = sy + 8;
    ctx.fillText('SELECTED SECTOR', legendX + 8, y);
    y += 20;
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText(`Coord  ${c.x} : ${c.y}`, legendX + 8, y);
    y += 18;
    if (!sector) {
      ctx.fillText('(no catalog entry)', legendX + 8, y);
      return;
    }
    const fac = sector.factionId ? this.worldState.getFaction(sector.factionId) : null;
    const facLine = fac ? fac.name : 'No controlling faction';
    ctx.fillText(fitSummaryLine(ctx, `Faction  ${facLine}`, legendW - 16), legendX + 8, y);
    y += 18;
    ctx.fillText(`Ports    ${sector.landables.length}`, legendX + 8, y);
    y += 16;
    if (sector.landables.length === 0) {
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText('— No landables —', legendX + 8, y);
      return;
    }
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.fillText('Landables:', legendX + 8, y);
    y += 16;
    const maxY = sy + bottomH - 10;
    const maxLines = Math.max(1, Math.floor((maxY - y) / 14));
    for (let i = 0; i < Math.min(sector.landables.length, maxLines); i += 1) {
      const name = sector.landables[i].name.toUpperCase();
      ctx.fillStyle = COLOURS.UI_SECONDARY;
      ctx.fillText(fitSummaryLine(ctx, `· ${name}`, legendW - 16), legendX + 8, y);
      y += 14;
    }
    if (sector.landables.length > maxLines) {
      ctx.fillStyle = COLOURS.WARNING;
      ctx.fillText(`+${sector.landables.length - maxLines} more`, legendX + 8, y);
    }
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
    const layout = this.computeMapLayout(this.canvas.width, this.canvas.height);
    const { gridOffsetX, gridOffsetY, cellSize, gap, gw, gh, hw, hh, mapPixelW, mapPixelH } = layout;
    if (px < gridOffsetX || py < gridOffsetY || px > gridOffsetX + mapPixelW || py > gridOffsetY + mapPixelH) {
      return null;
    }
    const relX = px - gridOffsetX;
    const relY = py - gridOffsetY;
    const col = Math.floor(relX / (cellSize + gap));
    const row = Math.floor(relY / (cellSize + gap));
    if (col < 0 || col >= gw || row < 0 || row >= gh) {
      return null;
    }
    if (relX - col * (cellSize + gap) > cellSize || relY - row * (cellSize + gap) > cellSize) {
      return null;
    }
    const sx = -hw + col;
    const sy = hh - 1 - row;
    return { x: sx, y: sy };
  }
}

function fitSummaryLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ell = '…';
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s.slice(0, -1)}${ell}`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s.slice(0, -1)}${ell}`;
}

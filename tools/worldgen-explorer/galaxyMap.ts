import type { GridCoord, MapLayerFlags, MapSectorView, MapViewData } from './types';
import { coordKey } from './types';

const COLOURS = {
  BG: 'rgba(4, 6, 14, 0.98)',
  UI_PRIMARY: '#e8e8f0',
  UI_SECONDARY: '#6060a0',
  CURSOR: '#ffd700',
  BASE: 'rgba(52, 58, 74, 0.95)',
  VOID: 'rgba(8, 10, 18, 0.98)',
  RADIATION: 'rgba(255, 90, 40,',
  NEBULA: 'rgba(120, 80, 220,',
  SHIMMER: 'rgba(180, 255, 220,',
  RUINS: 'rgba(200, 160, 80,',
  LANDABLE: 'rgba(220, 235, 255, 0.95)'
} as const;

interface MapLayout {
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
}

export class GalaxyMapView {
  cursor: GridCoord = { x: 0, y: 0 };
  private pulseMs = 0;
  private mapData: MapViewData | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getLayers: () => MapLayerFlags
  ) {
    this.resize();
  }

  setMapData(data: MapViewData | null): void {
    this.mapData = data;
    if (data && !data.sectors.has(coordKey(this.cursor))) {
      this.cursor = { x: 0, y: 0 };
    }
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  tick(dt: number): void {
    this.pulseMs += dt * 1000;
  }

  render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.fillStyle = COLOURS.BG;
    ctx.fillRect(0, 0, w, h);

    if (!this.mapData) {
      this.drawEmptyState(ctx, w, h);
      return;
    }

    const layout = this.computeLayout(w, h, this.mapData);
    this.drawHeader(ctx, w, this.mapData);
    this.drawGrid(ctx, layout, this.mapData);

    const pulse = 0.65 + Math.sin(this.pulseMs * 0.006) * 0.35;
    ctx.save();
    ctx.globalAlpha = pulse;
    this.drawCellOutline(ctx, this.cursor, layout, COLOURS.CURSOR, 2);
    ctx.restore();
  }

  pickCell(px: number, py: number): GridCoord | null {
    if (!this.mapData) return null;
    const layout = this.computeLayout(this.canvas.clientWidth, this.canvas.clientHeight, this.mapData);
    const { gridOffsetX, gridOffsetY, cellSize, gap, gw, gh, mapPixelW, mapPixelH } = layout;
    if (px < gridOffsetX || py < gridOffsetY || px > gridOffsetX + mapPixelW || py > gridOffsetY + mapPixelH) {
      return null;
    }
    const relX = px - gridOffsetX;
    const relY = py - gridOffsetY;
    const col = Math.floor(relX / (cellSize + gap));
    const row = Math.floor(relY / (cellSize + gap));
    if (col < 0 || col >= gw || row < 0 || row >= gh) return null;
    if (relX - col * (cellSize + gap) > cellSize || relY - row * (cellSize + gap) > cellSize) {
      return null;
    }
    const sx = -layout.hw + col;
    const sy = layout.hh - 1 - row;
    return { x: sx, y: sy };
  }

  moveCursor(dx: number, dy: number): void {
    if (!this.mapData) return;
    this.cursor = { x: this.cursor.x + dx, y: this.cursor.y + dy };
  }

  getSelectedSector(): MapSectorView | null {
    if (!this.mapData) return null;
    return this.mapData.sectors.get(coordKey(this.cursor)) ?? null;
  }

  private computeLayout(canvasW: number, canvasH: number, mapData: MapViewData): MapLayout {
    const margin = 16;
    const titleBand = 28;
    const bottomPad = 24;
    const gap = 1;
    const gw = mapData.gridWidth;
    const gh = mapData.gridHeight;
    const hw = Math.floor(gw / 2);
    const hh = Math.floor(gh / 2);
    const mapAreaW = canvasW - margin * 2;
    const mapAreaH = canvasH - margin * 2 - titleBand - bottomPad;
    const cellSize = Math.max(2, Math.floor(Math.min((mapAreaW - (gw - 1) * gap) / gw, (mapAreaH - (gh - 1) * gap) / gh)));
    const mapPixelW = gw * cellSize + (gw - 1) * gap;
    const mapPixelH = gh * cellSize + (gh - 1) * gap;
    return {
      gridOffsetX: margin + (mapAreaW - mapPixelW) / 2,
      gridOffsetY: margin + titleBand + (mapAreaH - mapPixelH) / 2,
      cellSize,
      gap,
      gw,
      gh,
      hw,
      hh,
      mapPixelW,
      mapPixelH
    };
  }

  private drawHeader(ctx: CanvasRenderingContext2D, w: number, mapData: MapViewData): void {
    ctx.fillStyle = COLOURS.UI_PRIMARY;
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('GALAXY MAP — DEBUG', w / 2, 8);
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillText(mapData.sourceLabel, w / 2, 24);
  }

  private drawEmptyState(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = COLOURS.UI_SECONDARY;
    ctx.font = "13px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Load a world JSON or run step 1', w / 2, h / 2 - 10);
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText('to populate the map', w / 2, h / 2 + 12);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, layout: MapLayout, mapData: MapViewData): void {
    const { gw, gh, hw, hh, gap, cellSize, gridOffsetX, gridOffsetY, mapPixelW, mapPixelH } = layout;
    const layers = this.getLayers();

    if (layers.grid) {
      ctx.strokeStyle = COLOURS.UI_SECONDARY;
      ctx.lineWidth = 1;
      ctx.strokeRect(gridOffsetX - 2, gridOffsetY - 2, mapPixelW + 4, mapPixelH + 4);
    }

    for (let row = 0; row < gh; row += 1) {
      const sy = hh - 1 - row;
      for (let col = 0; col < gw; col += 1) {
        const sx = -hw + col;
        const coord: GridCoord = { x: sx, y: sy };
        const cx = gridOffsetX + col * (cellSize + gap);
        const cy = gridOffsetY + row * (cellSize + gap);
        this.drawCell(ctx, layers, mapData, coord, cx, cy, cellSize);
      }
    }
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    layers: MapLayerFlags,
    mapData: MapViewData,
    coord: GridCoord,
    x: number,
    y: number,
    size: number
  ): void {
    const sector = mapData.sectors.get(coordKey(coord));

    ctx.fillStyle = COLOURS.BASE;
    ctx.fillRect(x, y, size, size);

    if (layers.structure && sector) {
      const w = sector.shapeWeight ?? 0;
      if (w <= 0.01) {
        ctx.fillStyle = COLOURS.VOID;
      } else {
        const t = Math.pow(w, 0.45);
        const tone = Math.floor(40 + t * 120);
        ctx.fillStyle = `rgba(${tone}, ${tone + 18}, ${tone + 55}, 0.98)`;
      }
      ctx.fillRect(x, y, size, size);
    }

    if (layers.factions && sector?.factionColour) {
      ctx.fillStyle = sector.factionColour;
      ctx.fillRect(x, y, size, size);
    }

    if (layers.radiation && sector && sector.radiation > 0) {
      const a = Math.min(0.75, 0.15 + sector.radiation * 0.65);
      ctx.fillStyle = `${COLOURS.RADIATION}${a})`;
      ctx.fillRect(x, y, size, size);
    }
    if (layers.nebula && sector?.hasNebula) {
      ctx.fillStyle = sector.nebulaColor ? `${sector.nebulaColor}55` : `${COLOURS.NEBULA}0.35)`;
      ctx.fillRect(x, y, size, size);
    }
    if (layers.shimmer && sector?.hasShimmer) {
      ctx.fillStyle = `${COLOURS.SHIMMER}0.4)`;
      ctx.fillRect(x, y, size, size);
    }
    if (layers.ruins && sector?.hasRuins) {
      ctx.fillStyle = `${COLOURS.RUINS}0.45)`;
      ctx.fillRect(x, y, size, size);
    }

    if (layers.landables && sector && sector.landableCount > 0) {
      this.drawLandableDots(ctx, x, y, size, sector.landableCount);
    }

    if (layers.grid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, size - 1), Math.max(0, size - 1));
    }

    if (layers.coords && size >= 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `${Math.max(5, Math.floor(size * 0.38))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${coord.x},${coord.y}`, x + size / 2, y + size / 2);
    }
  }

  private drawLandableDots(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, count: number): void {
    const radius = Math.max(1.5, size * 0.14);
    ctx.fillStyle = COLOURS.LANDABLE;
    ctx.strokeStyle = 'rgba(10, 20, 40, 0.8)';
    ctx.lineWidth = 1;
    if (count === 1) {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    const n = Math.min(count, 9);
    const pad = Math.max(2, size * 0.14);
    const cols = n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i += 1) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const px = x + pad + ((c + 0.5) / cols) * (size - pad * 2);
      const py = y + pad + ((r + 0.5) / rows) * (size - pad * 2);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawCellOutline(
    ctx: CanvasRenderingContext2D,
    coord: GridCoord,
    layout: MapLayout,
    stroke: string,
    lineWidth: number
  ): void {
    const { cellSize, gap, hw, hh, gridOffsetX, gridOffsetY, gw, gh } = layout;
    const col = coord.x + hw;
    const row = hh - 1 - coord.y;
    if (col < 0 || col >= gw || row < 0 || row >= gh) return;
    const px = gridOffsetX + col * (cellSize + gap) - 1;
    const py = gridOffsetY + row * (cellSize + gap) - 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(px, py, cellSize + 2, cellSize + 2);
  }
}

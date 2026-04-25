import { COLOURS } from '../constants';
import type { Landable } from '../types';
import type { Camera } from './camera';
import { BackgroundLayer } from './layers/backgroundLayer';
import { LandableLayer } from './layers/landableLayer';
import { ShipLayer } from './layers/shipLayer';
import { HudRenderer } from './ui/hudRenderer';
import type { ShipEntity } from '../simulation/shipEntity';

interface RenderPipelineState {
  playerShip: ShipEntity;
  otherShips: ShipEntity[];
  landables: Landable[];
  camera: Camera;
}

export class RenderPipeline {
  private backgroundLayer: BackgroundLayer;

  private landableLayer: LandableLayer;

  private shipLayer: ShipLayer;

  private hudRenderer: HudRenderer;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create 2D context');
    }

    this.backgroundLayer = new BackgroundLayer(ctx, canvas.width, canvas.height, 12345);
    this.landableLayer = new LandableLayer(ctx);
    this.shipLayer = new ShipLayer(ctx);
    this.hudRenderer = new HudRenderer(ctx);
  }

  render(state: RenderPipelineState): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.backgroundLayer.render(state.playerShip.state.position);
    this.landableLayer.render(state.landables, state.camera);
    this.shipLayer.render([state.playerShip, ...state.otherShips], state.camera);
    this.hudRenderer.render(state.playerShip);
  }
}

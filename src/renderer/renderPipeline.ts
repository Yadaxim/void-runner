import { COLOURS } from '../constants';
import type { WorldState } from '../core/worldState';
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
  landingCandidate: Landable | null;
  worldState: WorldState;
  dt: number;
}

export class RenderPipeline {
  private backgroundLayer: BackgroundLayer;

  private landableLayer: LandableLayer;

  private shipLayer: ShipLayer;

  private hudRenderer: HudRenderer;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    sectorSeed: number,
    nebulaConfig: { hasNebula: boolean; nebulaHue: number; nebulaIntensity: number }
  ) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create 2D context');
    }
    this.ctx = context;

    this.backgroundLayer = new BackgroundLayer(this.ctx, canvas.width, canvas.height, sectorSeed, nebulaConfig);
    this.landableLayer = new LandableLayer(this.ctx);
    this.shipLayer = new ShipLayer(this.ctx);
    this.hudRenderer = new HudRenderer(this.ctx);
  }

  setSectorContext(
    sectorSeed: number,
    nebulaConfig: { hasNebula: boolean; nebulaHue: number; nebulaIntensity: number }
  ): void {
    this.backgroundLayer = new BackgroundLayer(
      this.ctx,
      this.canvas.width,
      this.canvas.height,
      sectorSeed,
      nebulaConfig
    );
  }

  render(state: RenderPipelineState): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.fillStyle = COLOURS.SPACE_BLACK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.backgroundLayer.render(state.playerShip.state.position);
    this.landableLayer.render(
      state.landables,
      state.camera,
      state.landingCandidate,
      state.worldState,
      state.dt
    );
    this.shipLayer.render([state.playerShip, ...state.otherShips], state.camera);
    this.hudRenderer.render(state.playerShip, state.landingCandidate, state.worldState.getCurrentSectorCoord());
  }
}

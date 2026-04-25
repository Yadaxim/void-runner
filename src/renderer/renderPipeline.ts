import { COLOURS } from '../constants';
import type { WorldState } from '../core/worldState';
import type { Landable, WeaponFireKey } from '../types';
import type { Camera } from './camera';
import { BackgroundLayer } from './layers/backgroundLayer';
import { BulletLayer } from './layers/bulletLayer';
import { EffectsLayer } from './layers/effectsLayer';
import { LandableLayer } from './layers/landableLayer';
import { RadiationLayer } from './layers/radiationLayer';
import { ShipLayer } from './layers/shipLayer';
import { HudRenderer } from './ui/hudRenderer';
import { MinimapRenderer } from './ui/minimapRenderer';
import type { BulletEntity } from '../simulation/bulletEntity';
import type { Particle } from '../simulation/particleSystem';
import type { ShipEntity } from '../simulation/shipEntity';

interface RenderPipelineState {
  playerShip: ShipEntity;
  otherShips: ShipEntity[];
  landables: Landable[];
  bullets: BulletEntity[];
  particles: Particle[];
  camera: Camera;
  landingCandidate: Landable | null;
  shipTargetId: string | null;
  landableTargetId: string | null;
  heldFireKeys: Record<WeaponFireKey, boolean>;
  worldState: WorldState;
  dt: number;
  showBoundaryWarning: boolean;
  radiationIntensity: number;
  arrivalMessage: {
    title: string;
    landablesLine: string;
    alpha: number;
  } | null;
  destructionMessageAlpha: number;
}

export class RenderPipeline {
  private backgroundLayer: BackgroundLayer;

  private landableLayer: LandableLayer;
  private bulletLayer: BulletLayer;

  private shipLayer: ShipLayer;
  private effectsLayer: EffectsLayer;
  private radiationLayer: RadiationLayer;

  private hudRenderer: HudRenderer;
  private minimapRenderer: MinimapRenderer;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    sectorSeed: number,
    nebulaConfig: {
      hasNebula: boolean;
      nebulaHue: number;
      nebulaIntensity: number;
      starDensityMultiplier: number;
    }
  ) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create 2D context');
    }
    this.ctx = context;

    this.backgroundLayer = new BackgroundLayer(this.ctx, canvas.width, canvas.height, sectorSeed, nebulaConfig);
    this.landableLayer = new LandableLayer(this.ctx);
    this.bulletLayer = new BulletLayer(this.ctx);
    this.effectsLayer = new EffectsLayer(this.ctx);
    this.radiationLayer = new RadiationLayer(this.ctx, this.canvas);
    this.shipLayer = new ShipLayer(this.ctx);
    this.hudRenderer = new HudRenderer(this.ctx);
    this.minimapRenderer = new MinimapRenderer(this.ctx);
  }

  setSectorContext(
    sectorSeed: number,
    nebulaConfig: {
      hasNebula: boolean;
      nebulaHue: number;
      nebulaIntensity: number;
      starDensityMultiplier: number;
    }
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
    this.radiationLayer.render(state.radiationIntensity);
    this.landableLayer.render(
      state.landables,
      state.camera,
      state.landingCandidate,
      state.landableTargetId,
      state.worldState,
      state.dt
    );
    this.bulletLayer.render(state.bullets, state.camera);
    this.shipLayer.render(
      [state.playerShip, ...state.otherShips],
      state.camera,
      state.shipTargetId,
      state.worldState
    );
    this.effectsLayer.render(state.particles, state.camera);
    this.hudRenderer.render(
      state.playerShip,
      state.landingCandidate,
      state.worldState.getCurrentSectorCoord(),
      state.showBoundaryWarning,
      state.arrivalMessage,
      state.radiationIntensity,
      state.destructionMessageAlpha,
      state.shipTargetId
        ? (() => {
            const ship = state.otherShips.find((candidate) => candidate.state.id === state.shipTargetId) ?? null;
            if (!ship) return null;
            const hpRatio = ship.state.maxHP > 0 ? ship.state.currentHP / ship.state.maxHP : 0;
            return { name: ship.state.id.split('_').join(' ').toUpperCase(), hpRatio };
          })()
        : null,
      state.landableTargetId
        ? (() => {
            const landable = state.landables.find((candidate) => candidate.id === state.landableTargetId) ?? null;
            return landable ? { name: landable.name } : null;
          })()
        : null,
      state.playerShip.state.weaponLoadout,
      state.worldState,
      state.heldFireKeys
    );
    this.minimapRenderer.render(
      state.worldState,
      state.playerShip.state.position,
      state.landingCandidate,
      state.otherShips
    );
  }

  async playTransitionOut(ctx: CanvasRenderingContext2D, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const animate = (now: number): void => {
        const t = Math.min((now - start) / durationMs, 1);
        const radius = Math.hypot(ctx.canvas.width, ctx.canvas.height) * t;
        const gradient = ctx.createRadialGradient(
          ctx.canvas.width / 2,
          ctx.canvas.height / 2,
          0,
          ctx.canvas.width / 2,
          ctx.canvas.height / 2,
          Math.max(1, radius)
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, t + 0.2)})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = `rgba(255, 255, 255, ${t})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }

  async playTransitionIn(ctx: CanvasRenderingContext2D, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const animate = (now: number): void => {
        const t = Math.min((now - start) / durationMs, 1);
        const opacity = 1 - t;
        const radius = Math.hypot(ctx.canvas.width, ctx.canvas.height) * opacity;
        const gradient = ctx.createRadialGradient(
          ctx.canvas.width / 2,
          ctx.canvas.height / 2,
          0,
          ctx.canvas.width / 2,
          ctx.canvas.height / 2,
          Math.max(1, radius)
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, opacity)})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, opacity)})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }
}

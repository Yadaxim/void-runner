import type { BulletInstance, Landable, ShipState } from '../types';
import type { Camera } from './camera';
import { renderNebulae, renderStarLayer } from './layers/backgroundLayer';
import { renderLandableAtmosphereGlows, renderLandables } from './layers/landableLayer';
import { renderBulletTrails, renderBullets } from './layers/bulletLayer';
import { renderShipDamageParticles, renderShipEngineGlows, renderShipHulls } from './layers/shipLayer';
import { renderExplosionEffects } from './layers/effectsLayer';
import { renderHUD } from './ui/hudRenderer';
import { renderMinimap } from './ui/minimapRenderer';
import { STAR_SCROLL_FACTORS } from '../constants';

export interface RenderState {
  landables: Landable[];
  bullets: BulletInstance[];
  ships: ShipState[];
}

export function renderPipeline(ctx: CanvasRenderingContext2D, state: RenderState, camera: Camera): void {
  renderNebulae(ctx, camera);
  renderStarLayer(ctx, camera, { count: 300, scrollFactor: STAR_SCROLL_FACTORS[0] });
  renderStarLayer(ctx, camera, { count: 150, scrollFactor: STAR_SCROLL_FACTORS[1] });
  renderStarLayer(ctx, camera, { count: 60, scrollFactor: STAR_SCROLL_FACTORS[2] });
  renderStarLayer(ctx, camera, { count: 20, scrollFactor: STAR_SCROLL_FACTORS[3] });
  renderLandableAtmosphereGlows(ctx, state.landables, camera);
  renderLandables(ctx, state.landables, camera);
  renderBulletTrails(ctx, state.bullets, camera);
  renderBullets(ctx, state.bullets, camera);
  renderShipEngineGlows(ctx, state.ships, camera);
  renderShipHulls(ctx, state.ships, camera);
  renderShipDamageParticles(ctx, state.ships, camera);
  renderExplosionEffects(ctx, camera);
  renderHUD(ctx);
  renderMinimap(ctx);
}

import { RenderPipeline } from '../renderer/renderPipeline';
import type { WorldState } from '../core/worldState';
import { FlightScreen } from './flightScreen';
import type { ScreenManager } from './screenManager';

export function launchFlightScreen(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  screenManager: ScreenManager,
  worldState: WorldState
): FlightScreen {
  const currentSector = worldState.getCurrentSector();
  const pipeline = new RenderPipeline(canvas, currentSector.seed, {
    hasNebula: currentSector.ambientVisuals.hasNebula,
    nebulaHue: currentSector.ambientVisuals.nebulaHue,
    nebulaIntensity: currentSector.ambientVisuals.nebulaIntensity,
    starDensityMultiplier: currentSector.ambientVisuals.starDensityMultiplier
  });
  const flightScreen = new FlightScreen(canvas, pipeline, ctx, screenManager, worldState);
  screenManager.push(flightScreen);
  return flightScreen;
}

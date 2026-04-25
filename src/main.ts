import { COLOURS } from './constants';
import { WorldState } from './core/worldState';
import { ScreenManager } from './screens/screenManager';
import { FlightScreen } from './screens/flightScreen';
import { RenderPipeline } from './renderer/renderPipeline';
import { Vector2 } from './physics/vector2';
import type { ShipState, WorldFile } from './types';

const canvasElement = document.getElementById('gameCanvas');
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error('Expected #gameCanvas to exist');
}
const canvas = canvasElement;

const context = canvas.getContext('2d');
if (!context) {
  throw new Error('Expected 2D context');
}
const ctx = context;

const resizeCanvas = (): void => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

resizeCanvas();
window.addEventListener('resize', () => {
  resizeCanvas();
});

function renderLoading(): void {
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLOURS.UI_PRIMARY;
  ctx.font = "26px 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOADING...', canvas.width / 2, canvas.height / 2 - 28);
}

function renderLoadingProgress(label: string, progress: number): void {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const barWidth = Math.min(460, canvas.width * 0.6);
  const barHeight = 18;
  const barX = (canvas.width - barWidth) / 2;
  const barY = canvas.height / 2 + 6;

  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLOURS.UI_PRIMARY;
  ctx.font = "26px 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOADING...', canvas.width / 2, canvas.height / 2 - 42);
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = COLOURS.UI_SECONDARY;
  ctx.fillText(label.toUpperCase(), canvas.width / 2, canvas.height / 2 - 14);

  ctx.strokeStyle = COLOURS.UI_SECONDARY;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = COLOURS.UI_ACCENT;
  ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * clampedProgress, barHeight - 2);

  ctx.fillStyle = COLOURS.UI_PRIMARY;
  ctx.font = "13px 'Courier New', monospace";
  ctx.fillText(`${Math.round(clampedProgress * 100)}%`, canvas.width / 2, barY + barHeight + 20);
}

function renderLoadError(message: string): void {
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOURS.DANGER;
  ctx.font = "24px 'Courier New', monospace";
  ctx.fillText('FAILED TO LOAD WORLD', canvas.width / 2, canvas.height / 2 - 24);
  ctx.fillStyle = COLOURS.UI_SECONDARY;
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 6);
  ctx.fillText('Check the console for details.', canvas.width / 2, canvas.height / 2 + 30);
}

async function withTimeout<T>(promiseFactory: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await promiseFactory(controller.signal);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function loadWorld(signal: AbortSignal): Promise<WorldFile> {
  const worldUrl = new URL('testWorld.json', window.location.href);
  const response = await fetch(worldUrl, { signal });
  if (!response.ok) throw new Error(`Failed to load world file (${response.status})`);
  return response.json() as Promise<WorldFile>;
}

function createDefaultShipState(): ShipState {
  return {
    id: 'player',
    hullSpecId: 'fighter_mk1',
    factionId: null,
    position: Vector2.zero(),
    velocity: Vector2.zero(),
    angle: 0,
    angularVelocity: 0,
    currentHP: 100,
    maxHP: 100,
    fuel: 1000,
    maxFuel: 1000,
    credits: 1000,
    cargo: [],
    equipmentSlots: [],
    weaponLoadout: [],
    activeMissions: [],
    brain: null,
    memoryCards: [],
    activeCardId: null,
    activeMode: null,
    guardMode: false,
    fleetRole: 'lead',
    targets: {},
    isPlayerControlled: true,
    insuranceActive: true,
    lastLandedLandableId: null
  };
}

async function bootstrap(): Promise<void> {
  try {
    renderLoadingProgress('initializing', 0);

    renderLoadingProgress('requesting world file', 0.25);
    const worldFile = await withTimeout((signal) => loadWorld(signal), 10000);

    renderLoadingProgress('building world state', 0.55);
    const worldState =
      WorldState.loadFromLocalStorage(worldFile) ??
      new WorldState(worldFile, { x: 5, y: 5 }, createDefaultShipState());

    renderLoadingProgress('initializing flight systems', 0.8);
    const currentSector = worldState.getCurrentSector();
    const screenManager = new ScreenManager();
    const renderPipeline = new RenderPipeline(canvas, currentSector.seed, {
      hasNebula: currentSector.ambientVisuals.hasNebula,
      nebulaHue: currentSector.ambientVisuals.nebulaHue,
      nebulaIntensity: currentSector.ambientVisuals.nebulaIntensity
    });
    const flightScreen = new FlightScreen(canvas, renderPipeline, ctx, screenManager, worldState);

    renderLoadingProgress('launching', 1);
    screenManager.push(flightScreen);
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Timed out while loading testWorld.json'
        : error instanceof Error
          ? error.message
          : 'Unknown startup error';
    console.error('Bootstrap failed:', error);
    renderLoadError(message);
  }
}

void bootstrap();

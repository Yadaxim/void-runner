import { ScreenManager } from './screens/screenManager';
import { FlightScreen } from './screens/flightScreen';
import { RenderPipeline } from './renderer/renderPipeline';

const canvas = document.getElementById('gameCanvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected #gameCanvas to exist');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Expected 2D context');
}

const resizeCanvas = (): void => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};

resizeCanvas();
window.addEventListener('resize', () => {
  resizeCanvas();
});

const screenManager = new ScreenManager();
const renderPipeline = new RenderPipeline(canvas);
const flightScreen = new FlightScreen(canvas, renderPipeline, ctx, screenManager);
screenManager.push(flightScreen);

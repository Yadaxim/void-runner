import { ScreenManager } from './screens/screenManager';
import { MainMenuScreen } from './screens/mainMenuScreen';

function main(): void {
  const canvasElement = document.getElementById('gameCanvas');
  if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error('Expected #gameCanvas to exist');
  }
  const canvas = canvasElement;
  const context = canvas.getContext('2d');
  if (!context) {
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
  screenManager.push(new MainMenuScreen(canvas, context, screenManager));
}

main();
